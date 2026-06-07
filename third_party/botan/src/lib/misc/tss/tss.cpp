/*
* RTSS (threshold secret sharing)
* (C) 2009,2018,2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/tss.h>

#include <botan/exceptn.h>
#include <botan/hash.h>
#include <botan/hex.h>
#include <botan/rng.h>
#include <botan/internal/ct_utils.h>
#include <botan/internal/loadstor.h>

namespace Botan {

namespace {

const size_t RTSS_HEADER_SIZE = 20;

/**
* Constant-time multiplication in GF(2^8) mod 0x11B
*/
uint8_t tss_gf_mul(uint8_t x, uint8_t y) {
   uint8_t r = 0;
   for(size_t i = 0; i != 8; ++i) {
      r ^= CT::Mask<uint8_t>::expand(y & 1).if_set_return(x);
      x = (x << 1) ^ CT::Mask<uint8_t>::expand_top_bit(x).if_set_return(0x1B);
      y >>= 1;
   }
   return r;
}

/**
* Inversion in GF(2^8) via Fermat's little theorem.
*
* Returns 0 for input 0 - a case which should not occur in our usage.
*
* Really this does not need to be constant-time - we only use inversion when
* computing the Lagrange coefficients, which is derived entirely from public data.
*/
uint8_t tss_gf_inv(uint8_t x) {
   const uint8_t x2 = tss_gf_mul(x, x);
   const uint8_t x3 = tss_gf_mul(x2, x);
   const uint8_t x6 = tss_gf_mul(x3, x3);
   const uint8_t x12 = tss_gf_mul(x6, x6);
   const uint8_t x15 = tss_gf_mul(x12, x3);
   const uint8_t x30 = tss_gf_mul(x15, x15);
   const uint8_t x60 = tss_gf_mul(x30, x30);
   const uint8_t x120 = tss_gf_mul(x60, x60);
   const uint8_t x126 = tss_gf_mul(x120, x6);
   const uint8_t x127 = tss_gf_mul(x126, x);
   return tss_gf_mul(x127, x127);
}

uint8_t rtss_hash_id(std::string_view hash_name) {
   if(hash_name == "None") {
      return 0;
   } else if(hash_name == "SHA-1") {
      return 1;
   } else if(hash_name == "SHA-256") {
      return 2;
   } else {
      throw Invalid_Argument("RTSS only supports SHA-1 and SHA-256");
   }
}

std::unique_ptr<HashFunction> get_rtss_hash_by_id(uint8_t id) {
   if(id == 0) {
      return std::unique_ptr<HashFunction>();
   }
   if(id == 1) {
      return HashFunction::create_or_throw("SHA-1");
   } else if(id == 2) {
      return HashFunction::create_or_throw("SHA-256");
   } else {
      throw Decoding_Error("Unknown RTSS hash identifier");
   }
}

}  // namespace

RTSS_Share::RTSS_Share(std::string_view hex_input) {
   m_contents = hex_decode_locked(hex_input);
}

RTSS_Share::RTSS_Share(const uint8_t bin[], size_t len) {
   m_contents.assign(bin, bin + len);
}

uint8_t RTSS_Share::share_id() const {
   if(!initialized()) {
      throw Invalid_State("RTSS_Share::share_id not initialized");
   }

   if(m_contents.size() < RTSS_HEADER_SIZE + 1) {
      throw Decoding_Error("RTSS_Share::share_id invalid share data");
   }

   return m_contents[20];
}

std::string RTSS_Share::to_string() const {
   return hex_encode(m_contents.data(), m_contents.size());
}

std::vector<RTSS_Share> RTSS_Share::split(
   uint8_t M, uint8_t N, const uint8_t S[], uint16_t S_len, const uint8_t identifier[16], RandomNumberGenerator& rng) {
   return RTSS_Share::split(M, N, S, S_len, std::vector<uint8_t>(identifier, identifier + 16), "SHA-256", rng);
}

std::vector<RTSS_Share> RTSS_Share::split(uint8_t M,
                                          uint8_t N,
                                          const uint8_t S[],
                                          uint16_t S_len,
                                          const std::vector<uint8_t>& identifier,
                                          std::string_view hash_fn,
                                          RandomNumberGenerator& rng) {
   if(M <= 1 || N <= 1 || M > N || N >= 255) {
      throw Invalid_Argument("RTSS_Share::split: Invalid N or M");
   }

   if(identifier.size() > 16) {
      throw Invalid_Argument("RTSS_Share::split Invalid identifier size");
   }

   const uint8_t hash_id = rtss_hash_id(hash_fn);

   std::unique_ptr<HashFunction> hash;
   if(hash_id > 0) {
      hash = HashFunction::create_or_throw(hash_fn);
   }

   // secret = S || H(S)
   secure_vector<uint8_t> secret(S, S + S_len);
   if(hash) {
      secret += hash->process(S, S_len);
   }

   if(secret.size() >= 0xFFFE) {
      throw Encoding_Error("RTSS_Share::split secret too large for TSS format");
   }

   // +1 byte for the share ID
   const uint16_t share_len = static_cast<uint16_t>(secret.size() + 1);

   secure_vector<uint8_t> share_header(RTSS_HEADER_SIZE);
   copy_mem(share_header.data(), identifier.data(), identifier.size());
   share_header[16] = hash_id;
   share_header[17] = M;
   share_header[18] = get_byte<0>(share_len);
   share_header[19] = get_byte<1>(share_len);

   // Create RTSS header in each share
   std::vector<RTSS_Share> shares(N);

   for(uint8_t i = 0; i != N; ++i) {
      shares[i].m_contents.reserve(share_header.size() + share_len);
      shares[i].m_contents = share_header;
   }

   // Choose sequential values for X starting from 1
   for(uint8_t i = 0; i != N; ++i) {
      shares[i].m_contents.push_back(i + 1);
   }

   for(const uint8_t secret_byte : secret) {
      std::vector<uint8_t> coefficients(M - 1);
      rng.randomize(coefficients.data(), coefficients.size());

      for(uint8_t j = 0; j != N; ++j) {
         const uint8_t X = j + 1;

         uint8_t sum = secret_byte;
         uint8_t X_i = X;

         for(const uint8_t cb : coefficients) {
            sum ^= tss_gf_mul(X_i, cb);
            X_i = tss_gf_mul(X_i, X);
         }

         shares[j].m_contents.push_back(sum);
      }
   }

   return shares;
}

secure_vector<uint8_t> RTSS_Share::reconstruct(const std::vector<RTSS_Share>& shares) {
   if(shares.size() <= 1) {
      throw Decoding_Error("Insufficient shares to do TSS reconstruction");
   }

   for(size_t i = 0; i != shares.size(); ++i) {
      if(shares[i].size() < RTSS_HEADER_SIZE + 1) {
         throw Decoding_Error("Missing or malformed RTSS header");
      }

      if(shares[i].share_id() == 0) {
         throw Decoding_Error("Invalid (id = 0) RTSS share detected");
      }

      if(i > 0) {
         if(shares[i].size() != shares[0].size()) {
            throw Decoding_Error("Different sized RTSS shares detected");
         }

         if(!CT::is_equal(shares[0].m_contents.data(), shares[i].m_contents.data(), RTSS_HEADER_SIZE).as_bool()) {
            throw Decoding_Error("Different RTSS headers detected");
         }
      }
   }

   const uint8_t N = shares[0].m_contents[17];

   if(shares.size() < N) {
      throw Decoding_Error("Insufficient shares to do TSS reconstruction");
   }

   const uint16_t share_len = make_uint16(shares[0].m_contents[18], shares[0].m_contents[19]);

   const uint8_t hash_id = shares[0].m_contents[16];
   auto hash = get_rtss_hash_by_id(hash_id);
   const size_t hash_len = (hash ? hash->output_length() : 0);

   if(shares[0].size() != RTSS_HEADER_SIZE + share_len) {
      /*
      * This second (laxer) check accommodates a bug in TSS that was
      * fixed in 2.9.0 - previous versions used the length of the
      * *secret* here, instead of the length of the *share*, which is
      * precisely 1 + hash_len longer.
      */
      if(shares[0].size() <= RTSS_HEADER_SIZE + 1 + hash_len) {
         throw Decoding_Error("Bad RTSS length field in header");
      }
   }

   std::vector<uint8_t> V(shares.size());
   secure_vector<uint8_t> recovered;

   // Compute the Lagrange coefficients
   std::vector<uint8_t> lagrange_coeffs(shares.size());
   for(size_t k = 0; k != shares.size(); ++k) {
      uint8_t coeff = 1;
      for(size_t l = 0; l != shares.size(); ++l) {
         if(k == l) {
            continue;
         }
         const uint8_t share_k = shares[k].share_id();
         const uint8_t share_l = shares[l].share_id();
         if(share_k == share_l) {
            throw Decoding_Error("Duplicate shares found in RTSS recovery");
         }
         // We already verified this earlier in the function
         BOTAN_ASSERT_NOMSG(share_k > 0 && share_l > 0);
         const uint8_t div = tss_gf_mul(share_l, tss_gf_inv(share_k ^ share_l));
         coeff = tss_gf_mul(coeff, div);
      }
      lagrange_coeffs[k] = coeff;
   }

   for(size_t i = RTSS_HEADER_SIZE + 1; i != shares[0].size(); ++i) {
      for(size_t j = 0; j != V.size(); ++j) {
         V[j] = shares[j].m_contents[i];
      }

      /*
      * Interpolation step
      *
      * This is effectively a multi-scalar multiplication (aka sum-of-products)
      * where one of the inputs, namely the Lagrange coefficients, are public.
      * If optimizing this function further was useful, this would be the place
      * to start, for example by using Pippeneger's algorithm.
      */
      uint8_t r = 0;
      for(size_t k = 0; k != shares.size(); ++k) {
         r ^= tss_gf_mul(V[k], lagrange_coeffs[k]);
      }
      recovered.push_back(r);
   }

   if(hash) {
      if(recovered.size() < hash->output_length()) {
         throw Decoding_Error("RTSS recovered value too short to be valid");
      }

      const size_t secret_len = recovered.size() - hash->output_length();

      hash->update(recovered.data(), secret_len);
      secure_vector<uint8_t> hash_check = hash->final();

      if(!CT::is_equal(hash_check.data(), &recovered[secret_len], hash->output_length()).as_bool()) {
         throw Decoding_Error("RTSS hash check failed");
      }

      // remove the trailing hash value
      recovered.resize(secret_len);
   }

   return recovered;
}

}  // namespace Botan
