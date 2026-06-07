/*
* (C) 2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/internal/aria.h>

#include <botan/mem_ops.h>
#include <botan/internal/isa_extn.h>
#include <botan/internal/simd_4x32.h>
#include <botan/internal/simd_hwaes.h>

namespace Botan {

namespace ARIA_HWAES {

namespace {

// ARIA S1 is just the AES sbox
BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 aria_s1(SIMD_4x32 v) {
   return hw_aes_sbox(v);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 aria_s2(SIMD_4x32 v) {
   constexpr uint64_t AFF_S2 = gfni_matrix(R"(
      0 1 0 1 0 1 1 1
      0 0 1 1 1 1 1 1
      1 1 1 0 1 1 0 1
      1 1 0 0 0 0 1 1
      0 1 0 0 0 0 1 1
      1 1 0 0 1 1 1 0
      0 1 1 0 0 0 1 1
      1 1 1 1 0 1 1 0)");

   constexpr auto POST_S2 = Gf2AffineTransformation::post_sbox(AFF_S2, 0xE2);
   return POST_S2.affine_transform(hw_aes_sbox(v));
}

// ARIA X1 is just the AES inverse sbox
BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 aria_x1(SIMD_4x32 v) {
   return hw_aes_inv_sbox(v);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 aria_x2(SIMD_4x32 v) {
   constexpr uint64_t AFF_X2 = gfni_matrix(R"(
      0 0 0 1 1 0 0 0
      0 0 1 0 0 1 1 0
      0 0 0 0 1 0 1 0
      1 1 1 0 0 0 1 1
      1 1 1 0 1 1 0 0
      0 1 1 0 1 0 1 1
      1 0 1 1 1 1 0 1
      1 0 0 1 0 0 1 1)");
   constexpr auto PRE_X2D = Gf2AffineTransformation::post_inv_sbox(AFF_X2, 0x2C);

   return hw_aes_inv_sbox(PRE_X2D.affine_transform(v));
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 aria_fo_m(SIMD_4x32 x) {
   return x.rotl<8>() ^ x.rotl<16>() ^ x.rotl<24>();
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 aria_fe_m(SIMD_4x32 x) {
   return x ^ x.rotl<8>() ^ x.rotl<24>();
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES void aria_mix(SIMD_4x32& B0, SIMD_4x32& B1, SIMD_4x32& B2, SIMD_4x32& B3) {
   B1 ^= B2;
   B2 ^= B3;
   B0 ^= B1;
   B3 ^= B1;
   B2 ^= B0;
   B1 ^= B2;
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 swap_abcd_badc(SIMD_4x32 x) {
   const auto shuf = SIMD_4x32(0x02030001, 0x06070405, 0x0A0B0809, 0x0E0F0C0D);
   return SIMD_4x32::byte_shuffle(x, shuf);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES SIMD_4x32 byte_transpose(SIMD_4x32 v) {
   const SIMD_4x32 tbl(0x0C080400, 0x0D090501, 0x0E0A0602, 0x0F0B0703);
   return SIMD_4x32::byte_shuffle(v, tbl);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES void aria_fo_sbox(SIMD_4x32& B0, SIMD_4x32& B1, SIMD_4x32& B2, SIMD_4x32& B3) {
   B0 = byte_transpose(B0);
   B1 = byte_transpose(B1);
   B2 = byte_transpose(B2);
   B3 = byte_transpose(B3);
   SIMD_4x32::transpose(B0, B1, B2, B3);

   B3 = aria_s1(B3);
   B2 = aria_s2(B2);
   B1 = aria_x1(B1);
   B0 = aria_x2(B0);

   SIMD_4x32::transpose(B0, B1, B2, B3);
   B0 = byte_transpose(B0);
   B1 = byte_transpose(B1);
   B2 = byte_transpose(B2);
   B3 = byte_transpose(B3);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES void aria_fe_sbox(SIMD_4x32& B0, SIMD_4x32& B1, SIMD_4x32& B2, SIMD_4x32& B3) {
   B0 = byte_transpose(B0);
   B1 = byte_transpose(B1);
   B2 = byte_transpose(B2);
   B3 = byte_transpose(B3);
   SIMD_4x32::transpose(B0, B1, B2, B3);

   B3 = aria_x1(B3);
   B2 = aria_x2(B2);
   B1 = aria_s1(B1);
   B0 = aria_s2(B0);

   SIMD_4x32::transpose(B0, B1, B2, B3);
   B0 = byte_transpose(B0);
   B1 = byte_transpose(B1);
   B2 = byte_transpose(B2);
   B3 = byte_transpose(B3);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES void aria_fo(SIMD_4x32& B0, SIMD_4x32& B1, SIMD_4x32& B2, SIMD_4x32& B3) {
   aria_fo_sbox(B0, B1, B2, B3);

   B0 = aria_fo_m(B0);
   B1 = aria_fo_m(B1);
   B2 = aria_fo_m(B2);
   B3 = aria_fo_m(B3);

   aria_mix(B0, B1, B2, B3);

   B1 = swap_abcd_badc(B1);
   B2 = B2.rotl<16>();
   B3 = B3.bswap();

   aria_mix(B0, B1, B2, B3);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_HWAES void aria_fe(SIMD_4x32& B0, SIMD_4x32& B1, SIMD_4x32& B2, SIMD_4x32& B3) {
   aria_fe_sbox(B0, B1, B2, B3);

   B0 = aria_fe_m(B0);
   B1 = aria_fe_m(B1);
   B2 = aria_fe_m(B2);
   B3 = aria_fe_m(B3);

   aria_mix(B0, B1, B2, B3);

   B3 = swap_abcd_badc(B3);
   B0 = B0.rotl<16>();
   B1 = B1.bswap();

   aria_mix(B0, B1, B2, B3);
}

BOTAN_FN_ISA_HWAES void transform_4(const uint8_t in[], uint8_t out[], std::span<const uint32_t> KS) {
   const size_t ROUNDS = (KS.size() / 4) - 1;

   auto B0 = SIMD_4x32::load_be(in);
   auto B1 = SIMD_4x32::load_be(in + 16);
   auto B2 = SIMD_4x32::load_be(in + 32);
   auto B3 = SIMD_4x32::load_be(in + 48);

   SIMD_4x32::transpose(B0, B1, B2, B3);

   for(size_t r = 0; r != ROUNDS; r += 2) {
      B0 ^= SIMD_4x32::splat(KS[4 * r]);
      B1 ^= SIMD_4x32::splat(KS[4 * r + 1]);
      B2 ^= SIMD_4x32::splat(KS[4 * r + 2]);
      B3 ^= SIMD_4x32::splat(KS[4 * r + 3]);

      aria_fo(B0, B1, B2, B3);

      B0 ^= SIMD_4x32::splat(KS[4 * r + 4]);
      B1 ^= SIMD_4x32::splat(KS[4 * r + 5]);
      B2 ^= SIMD_4x32::splat(KS[4 * r + 6]);
      B3 ^= SIMD_4x32::splat(KS[4 * r + 7]);

      if(r != ROUNDS - 2) {
         aria_fe(B0, B1, B2, B3);
      }
   }

   // Last half-round: FE sbox only
   aria_fe_sbox(B0, B1, B2, B3);

   B0 ^= SIMD_4x32::splat(KS[4 * ROUNDS]);
   B1 ^= SIMD_4x32::splat(KS[4 * ROUNDS + 1]);
   B2 ^= SIMD_4x32::splat(KS[4 * ROUNDS + 2]);
   B3 ^= SIMD_4x32::splat(KS[4 * ROUNDS + 3]);

   SIMD_4x32::transpose(B0, B1, B2, B3);

   B0.store_be(out);
   B1.store_be(out + 16);
   B2.store_be(out + 32);
   B3.store_be(out + 48);
}

void BOTAN_FN_ISA_HWAES aria_transform(const uint8_t in[], uint8_t out[], size_t blocks, std::span<const uint32_t> KS) {
   while(blocks >= 4) {
      transform_4(in, out, KS);
      in += 4 * 16;
      out += 4 * 16;
      blocks -= 4;
   }

   if(blocks > 0) {
      uint8_t ibuf[4 * 16] = {0};
      uint8_t obuf[4 * 16] = {0};
      copy_mem(ibuf, in, blocks * 16);
      transform_4(ibuf, obuf, KS);
      copy_mem(out, obuf, blocks * 16);
   }
}

}  // namespace

}  // namespace ARIA_HWAES

void BOTAN_FN_ISA_HWAES ARIA_128::aria_hwaes_encrypt(const uint8_t in[], uint8_t out[], size_t blocks) const {
   ARIA_HWAES::aria_transform(in, out, blocks, m_ERK);
}

void BOTAN_FN_ISA_HWAES ARIA_128::aria_hwaes_decrypt(const uint8_t in[], uint8_t out[], size_t blocks) const {
   ARIA_HWAES::aria_transform(in, out, blocks, m_DRK);
}

void BOTAN_FN_ISA_HWAES ARIA_192::aria_hwaes_encrypt(const uint8_t in[], uint8_t out[], size_t blocks) const {
   ARIA_HWAES::aria_transform(in, out, blocks, m_ERK);
}

void BOTAN_FN_ISA_HWAES ARIA_192::aria_hwaes_decrypt(const uint8_t in[], uint8_t out[], size_t blocks) const {
   ARIA_HWAES::aria_transform(in, out, blocks, m_DRK);
}

void BOTAN_FN_ISA_HWAES ARIA_256::aria_hwaes_encrypt(const uint8_t in[], uint8_t out[], size_t blocks) const {
   ARIA_HWAES::aria_transform(in, out, blocks, m_ERK);
}

void BOTAN_FN_ISA_HWAES ARIA_256::aria_hwaes_decrypt(const uint8_t in[], uint8_t out[], size_t blocks) const {
   ARIA_HWAES::aria_transform(in, out, blocks, m_DRK);
}

}  // namespace Botan
