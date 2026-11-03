/*
 * XMSS WOTS Public and Private Key
 *
 * A Winternitz One Time Signature public/private key for use with
 * Extended Hash-Based Signatures.
 *
 * (C) 2016,2017,2018 Matthias Gierlings
 *     2023           René Meusel - Rohde & Schwarz Cybersecurity
 *     2026 Jack Lloyd
 *
 * Botan is released under the Simplified BSD License (see license.txt)
 **/

#include <botan/internal/xmss_wots.h>

#include <botan/mem_ops.h>
#include <botan/internal/concat_util.h>
#include <botan/internal/xmss_address.h>
#include <botan/internal/xmss_hash.h>
#include <botan/internal/xmss_tools.h>

namespace Botan {

namespace {

/**
* Algorithm 1 (base_w) followed by the WOTS+ checksum, as used by the
* signing and verification routines in RFC 8391. The result is a single
* buffer of length params.len() holding the len_1 base-w digits of the
* message followed by the len_2 base-w digits of the checksum.
*/
secure_vector<uint8_t> base_w_with_checksum(const XMSS_WOTS_Parameters& params, std::span<const uint8_t> input) {
   const size_t len_1 = params.len_1();
   const size_t len_2 = params.len_2();
   const size_t lg_w = params.lg_w();
   const uint8_t mask = static_cast<uint8_t>(params.wots_parameter() - 1);

   BOTAN_ASSERT_NOMSG(input.size() * 8 >= len_1 * lg_w);

   secure_vector<uint8_t> result(len_1 + len_2);

   size_t in = 0;
   size_t total = 0;
   size_t bits = 0;
   for(size_t i = 0; i < len_1; ++i) {
      if(bits == 0) {
         total = input[in++];
         bits = 8;
      }
      bits -= lg_w;
      result[i] = static_cast<uint8_t>((total >> bits) & mask);
   }

   size_t csum = 0;
   for(size_t i = 0; i < len_1; ++i) {
      csum += params.wots_parameter() - 1 - result[i];
   }

   for(size_t i = 0; i < len_2; ++i) {
      const size_t shift = lg_w * (len_2 - 1 - i);
      result[len_1 + i] = static_cast<uint8_t>((csum >> shift) & mask);
   }

   return result;
}

/**
 * Algorithm 2: Chaining Function.
 *
 * Takes an n-byte input string and transforms it into a the function
 * result iterating the cryptographic hash function "F" steps times on
 * the input x using the outputs of the PRNG "G".
 *
 * This overload is used in multithreaded scenarios, where it is
 * required to provide separate instances of XMSS_Hash to each
 * thread.
 *
 * @param params      The WOTS parameters to use
 * @param[out] result An n-byte input string, that will be transformed into
 *                    the chaining function result.
 * @param start_idx The start index.
 * @param steps A number of steps.
 * @param adrs An OTS Hash Address.
 * @param seed A seed.
 * @param hash Instance of XMSS_Hash, that may only by the thread
 *             executing chain.
 **/
void chain(const XMSS_WOTS_Parameters& params,
           secure_vector<uint8_t>& result,
           size_t start_idx,
           size_t steps,
           XMSS_Address adrs,
           std::span<const uint8_t> seed,
           XMSS_Hash& hash) {
   BOTAN_ASSERT_NOMSG(result.size() == hash.output_length());
   BOTAN_ASSERT_NOMSG(start_idx + steps < params.wots_parameter());
   secure_vector<uint8_t> prf_output(hash.output_length());

   // Note that RFC 8391 defines this algorithm recursively (building up the
   // iterations before any calculation) using 'steps' as the iterator and a
   // recursion base with 'steps == 0'.
   // Instead, we implement it iteratively using 'i' as iterator. This makes
   // 'adrs.set_hash_address(i)' equivalent to 'ADRS.setHashAddress(i + s - 1)'.
   for(size_t i = start_idx; i < (start_idx + steps) && i < params.wots_parameter(); i++) {
      adrs.set_hash_address(static_cast<uint32_t>(i));

      // Calculate tmp XOR bitmask
      adrs.set_key_mask_mode(XMSS_Address::Key_Mask::Mask_Mode);
      hash.prf(prf_output, seed, adrs.bytes());
      xor_buf(result.data(), prf_output.data(), result.size());

      // Calculate key
      adrs.set_key_mask_mode(XMSS_Address::Key_Mask::Key_Mode);

      // Calculate f(key, tmp XOR bitmask)
      hash.prf(prf_output, seed, adrs.bytes());
      hash.f(result, prf_output, result);
   }
}

}  // namespace

XMSS_WOTS_PublicKey::XMSS_WOTS_PublicKey(XMSS_WOTS_Parameters params,
                                         std::span<const uint8_t> public_seed,
                                         const XMSS_WOTS_PrivateKey& private_key,
                                         XMSS_Address adrs,
                                         XMSS_Hash& hash) :
      XMSS_WOTS_Base(params, private_key.key_data()) {
   for(size_t i = 0; i < m_params.len(); ++i) {
      adrs.set_chain_address(static_cast<uint32_t>(i));
      chain(m_params, m_key_data[i], 0, m_params.wots_parameter() - 1, adrs, public_seed, hash);
   }
}

XMSS_WOTS_PublicKey::XMSS_WOTS_PublicKey(XMSS_WOTS_Parameters params,
                                         std::span<const uint8_t> public_seed,
                                         wots_keysig_t signature,
                                         const secure_vector<uint8_t>& msg,
                                         XMSS_Address adrs,
                                         XMSS_Hash& hash) :
      XMSS_WOTS_Base(params, std::move(signature)) {
   const secure_vector<uint8_t> msg_digest = base_w_with_checksum(m_params, msg);

   for(size_t i = 0; i < m_params.len(); i++) {
      adrs.set_chain_address(static_cast<uint32_t>(i));
      chain(m_params,
            m_key_data[i],
            msg_digest[i],
            m_params.wots_parameter() - 1 - msg_digest[i],
            adrs,
            public_seed,
            hash);
   }
}

wots_keysig_t XMSS_WOTS_PrivateKey::sign(const secure_vector<uint8_t>& msg,
                                         std::span<const uint8_t> public_seed,
                                         XMSS_Address adrs,
                                         XMSS_Hash& hash) {
   const secure_vector<uint8_t> msg_digest = base_w_with_checksum(m_params, msg);
   auto sig = this->key_data();

   for(size_t i = 0; i < m_params.len(); i++) {
      adrs.set_chain_address(static_cast<uint32_t>(i));
      chain(m_params, sig[i], 0, msg_digest[i], adrs, public_seed, hash);
   }

   return sig;
}

XMSS_WOTS_PrivateKey::XMSS_WOTS_PrivateKey(XMSS_WOTS_Parameters params,
                                           std::span<const uint8_t> public_seed,
                                           std::span<const uint8_t> private_seed,
                                           XMSS_Address adrs,
                                           XMSS_Hash& hash) :
      XMSS_WOTS_Base(params) {
   m_key_data.resize(m_params.len());
   for(size_t i = 0; i < m_params.len(); ++i) {
      adrs.set_chain_address(static_cast<uint32_t>(i));
      const auto data = concat<std::vector<uint8_t>>(public_seed, adrs.bytes());
      hash.prf_keygen(m_key_data[i], private_seed, data);
   }
}

// Constructor for legacy XMSS_PrivateKeys
XMSS_WOTS_PrivateKey::XMSS_WOTS_PrivateKey(XMSS_WOTS_Parameters params,
                                           std::span<const uint8_t> private_seed,
                                           XMSS_Address adrs,
                                           XMSS_Hash& hash) :
      XMSS_WOTS_Base(params) {
   m_key_data.resize(m_params.len());

   secure_vector<uint8_t> r;
   hash.prf(r, private_seed, adrs.bytes());

   for(size_t i = 0; i < m_params.len(); ++i) {
      xmss_concat<size_t>(m_key_data[i], i, 32);
      hash.prf(m_key_data[i], r, m_key_data[i]);
   }
}

}  // namespace Botan
