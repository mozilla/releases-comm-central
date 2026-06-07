/*
* (C) 2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/internal/seed.h>

#include <botan/mem_ops.h>
#include <botan/internal/isa_extn.h>
#include <botan/internal/simd_avx512_gfni.h>

namespace Botan {

namespace SEED_AVX512_GFNI {

namespace {

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI SIMD_16x32 seed_g(const SIMD_16x32& X) {
   /*
   * SEED's two sboxes are both based on inversions in GF(2^8) modulo the polynomial
   * x^8+x^6+x^5+x+1 (0x163), followed by different affine transforms.
   *
   * GFNI uses AES's field (modulo 0x11B) so the pre-inversion matrix is a field isomorphism
   * that maps the inputs into the AES field. The post-inversion matrices then apply map
   * back to SEED's field and apply the appropriate linear transform.
   */

   // Field isomorphism from SEED's field to AES field
   constexpr uint64_t seed_pre_a = gfni_matrix(R"(
      1 1 0 1 0 0 0 0
      0 0 1 1 0 0 1 1
      0 0 0 0 1 1 0 1
      0 1 1 1 0 1 0 0
      0 1 1 0 1 0 0 0
      0 0 0 1 1 0 0 0
      0 0 1 1 1 1 0 0
      0 0 0 0 1 1 1 0
   )");

   // Field isomorphism from AES->SEED multiplied by S0's affine matrix
   constexpr uint64_t seed_s0_post_a = gfni_matrix(R"(
      0 1 0 1 1 0 0 1
      0 0 1 1 1 0 1 0
      1 0 0 0 1 1 1 0
      1 1 0 0 1 0 0 1
      0 1 0 1 1 0 1 1
      1 1 1 1 1 0 1 1
      0 0 1 1 0 1 0 1
      0 0 0 1 0 1 1 1
   )");

   // Field isomorphism from AES->SEED multiplied by S1's affine matrix
   constexpr uint64_t seed_s1_post_a = gfni_matrix(R"(
      0 0 1 1 0 1 1 0
      0 1 1 0 0 0 1 0
      0 1 0 1 1 0 1 1
      0 0 0 0 0 0 1 1
      1 1 0 1 0 0 0 0
      0 1 0 0 1 0 1 1
      1 1 1 0 1 0 1 1
      1 1 1 1 0 0 0 1
   )");

   constexpr uint8_t seed_s0_post_c = 0xA9;
   constexpr uint8_t seed_s1_post_c = 0x38;

   // Compute S0(x) and S1(x) for all bytes
   const auto pre = gf2p8affine<seed_pre_a, 0x00>(X);
   const auto s0 = gf2p8affineinv<seed_s0_post_a, seed_s0_post_c>(pre);
   const auto s1 = gf2p8affineinv<seed_s1_post_a, seed_s1_post_c>(pre);

   // Blend S0/S1 outputs by alternating bytes
   constexpr uint64_t blend_mask = 0xAAAAAAAAAAAAAAAA;  // 0b1010....
   const auto sbox = SIMD_16x32(_mm512_mask_blend_epi8(blend_mask, s0.raw(), s1.raw()));

   // Linear mixing layer
   const auto M0 = SIMD_16x32::splat(0x3FCFF3FC);
   const auto M1 = SIMD_16x32::splat(0xFC3FCFF3);
   const auto M2 = SIMD_16x32::splat(0xF3FC3FCF);
   const auto M3 = SIMD_16x32::splat(0xCFF3FC3F);

   // Masks for broadcasting each byte across the 32 bit word that contains it

   // clang-format off
   alignas(64) constexpr uint8_t SHUF_BYTE0[64] = {
      0, 0, 0, 0, 4, 4, 4, 4, 8, 8, 8, 8, 12, 12, 12, 12,
      0, 0, 0, 0, 4, 4, 4, 4, 8, 8, 8, 8, 12, 12, 12, 12,
      0, 0, 0, 0, 4, 4, 4, 4, 8, 8, 8, 8, 12, 12, 12, 12,
      0, 0, 0, 0, 4, 4, 4, 4, 8, 8, 8, 8, 12, 12, 12, 12,
   };
   alignas(64) constexpr uint8_t SHUF_BYTE1[64] = {
      1, 1, 1, 1, 5, 5, 5, 5, 9, 9, 9, 9, 13, 13, 13, 13,
      1, 1, 1, 1, 5, 5, 5, 5, 9, 9, 9, 9, 13, 13, 13, 13,
      1, 1, 1, 1, 5, 5, 5, 5, 9, 9, 9, 9, 13, 13, 13, 13,
      1, 1, 1, 1, 5, 5, 5, 5, 9, 9, 9, 9, 13, 13, 13, 13,
   };
   alignas(64) constexpr uint8_t SHUF_BYTE2[64] = {
      2, 2, 2, 2, 6, 6, 6, 6, 10, 10, 10, 10, 14, 14, 14, 14,
      2, 2, 2, 2, 6, 6, 6, 6, 10, 10, 10, 10, 14, 14, 14, 14,
      2, 2, 2, 2, 6, 6, 6, 6, 10, 10, 10, 10, 14, 14, 14, 14,
      2, 2, 2, 2, 6, 6, 6, 6, 10, 10, 10, 10, 14, 14, 14, 14,
   };
   alignas(64) constexpr uint8_t SHUF_BYTE3[64] = {
      3, 3, 3, 3, 7, 7, 7, 7, 11, 11, 11, 11, 15, 15, 15, 15,
      3, 3, 3, 3, 7, 7, 7, 7, 11, 11, 11, 11, 15, 15, 15, 15,
      3, 3, 3, 3, 7, 7, 7, 7, 11, 11, 11, 11, 15, 15, 15, 15,
      3, 3, 3, 3, 7, 7, 7, 7, 11, 11, 11, 11, 15, 15, 15, 15,
   };
   // clang-format on

   const auto b0 = SIMD_16x32(_mm512_shuffle_epi8(sbox.raw(), _mm512_load_si512(SHUF_BYTE0)));
   const auto b1 = SIMD_16x32(_mm512_shuffle_epi8(sbox.raw(), _mm512_load_si512(SHUF_BYTE1)));
   const auto b2 = SIMD_16x32(_mm512_shuffle_epi8(sbox.raw(), _mm512_load_si512(SHUF_BYTE2)));
   const auto b3 = SIMD_16x32(_mm512_shuffle_epi8(sbox.raw(), _mm512_load_si512(SHUF_BYTE3)));

   // Return (b0 & M0) ^ (b1 & M1) ^ (b2 & M2) ^ (b3 & M3)
   // ternlogd 0x78 is a ^ (b & c)
   auto result = SIMD_16x32(b0) & M0;
   result = SIMD_16x32::ternary_fn<0x78>(result, b1, M1);
   result = SIMD_16x32::ternary_fn<0x78>(result, b2, M2);
   result = SIMD_16x32::ternary_fn<0x78>(result, b3, M3);

   return SIMD_16x32(result);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI void seed_round(
   SIMD_16x32& B0, SIMD_16x32& B1, SIMD_16x32& B2, SIMD_16x32& B3, uint32_t K0, uint32_t K1, uint32_t K2, uint32_t K3) {
   auto T0 = B2 ^ SIMD_16x32::splat(K0);
   auto T1 = seed_g(B2 ^ B3 ^ SIMD_16x32::splat(K1));
   T0 = seed_g(T1 + T0);
   T1 = seed_g(T1 + T0);
   B1 ^= T1;
   B0 ^= T0 + T1;

   T0 = B0 ^ SIMD_16x32::splat(K2);
   T1 = seed_g(B0 ^ B1 ^ SIMD_16x32::splat(K3));
   T0 = seed_g(T1 + T0);
   T1 = seed_g(T1 + T0);
   B3 ^= T1;
   B2 ^= T0 + T1;
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI void encrypt(const uint8_t ptext[16 * 4 * 4],
                                                         uint8_t ctext[16 * 4 * 4],
                                                         std::span<const uint32_t> RK) {
   SIMD_16x32 B0 = SIMD_16x32::load_be(ptext + 16 * 4 * 0);
   SIMD_16x32 B1 = SIMD_16x32::load_be(ptext + 16 * 4 * 1);
   SIMD_16x32 B2 = SIMD_16x32::load_be(ptext + 16 * 4 * 2);
   SIMD_16x32 B3 = SIMD_16x32::load_be(ptext + 16 * 4 * 3);

   SIMD_16x32::transpose(B0, B1, B2, B3);

   for(size_t j = 0; j != 8; ++j) {
      const uint32_t K0 = RK[4 * j];
      const uint32_t K1 = RK[4 * j + 1];
      const uint32_t K2 = RK[4 * j + 2];
      const uint32_t K3 = RK[4 * j + 3];

      seed_round(B0, B1, B2, B3, K0, K1, K2, K3);
   }

   // Output order is B2, B3, B0, B1
   SIMD_16x32::transpose(B2, B3, B0, B1);
   B2.store_be(ctext + 16 * 4 * 0);
   B3.store_be(ctext + 16 * 4 * 1);
   B0.store_be(ctext + 16 * 4 * 2);
   B1.store_be(ctext + 16 * 4 * 3);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI void decrypt(const uint8_t ctext[16 * 4 * 4],
                                                         uint8_t ptext[16 * 4 * 4],
                                                         std::span<const uint32_t> RK) {
   SIMD_16x32 B0 = SIMD_16x32::load_be(ctext + 16 * 4 * 0);
   SIMD_16x32 B1 = SIMD_16x32::load_be(ctext + 16 * 4 * 1);
   SIMD_16x32 B2 = SIMD_16x32::load_be(ctext + 16 * 4 * 2);
   SIMD_16x32 B3 = SIMD_16x32::load_be(ctext + 16 * 4 * 3);

   SIMD_16x32::transpose(B0, B1, B2, B3);

   for(size_t j = 0; j != 8; ++j) {
      const uint32_t K0 = RK[30 - 4 * j];
      const uint32_t K1 = RK[31 - 4 * j];
      const uint32_t K2 = RK[28 - 4 * j];
      const uint32_t K3 = RK[29 - 4 * j];

      seed_round(B0, B1, B2, B3, K0, K1, K2, K3);
   }

   SIMD_16x32::transpose(B2, B3, B0, B1);
   B2.store_be(ptext + 16 * 4 * 0);
   B3.store_be(ptext + 16 * 4 * 1);
   B0.store_be(ptext + 16 * 4 * 2);
   B1.store_be(ptext + 16 * 4 * 3);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI void encrypt_x2(const uint8_t ptext[32 * 4 * 4],
                                                            uint8_t ctext[32 * 4 * 4],
                                                            std::span<const uint32_t> RK) {
   SIMD_16x32 B0 = SIMD_16x32::load_be(ptext + 16 * 4 * 0);
   SIMD_16x32 B1 = SIMD_16x32::load_be(ptext + 16 * 4 * 1);
   SIMD_16x32 B2 = SIMD_16x32::load_be(ptext + 16 * 4 * 2);
   SIMD_16x32 B3 = SIMD_16x32::load_be(ptext + 16 * 4 * 3);

   SIMD_16x32 B4 = SIMD_16x32::load_be(ptext + 16 * 4 * 4);
   SIMD_16x32 B5 = SIMD_16x32::load_be(ptext + 16 * 4 * 5);
   SIMD_16x32 B6 = SIMD_16x32::load_be(ptext + 16 * 4 * 6);
   SIMD_16x32 B7 = SIMD_16x32::load_be(ptext + 16 * 4 * 7);

   SIMD_16x32::transpose(B0, B1, B2, B3);
   SIMD_16x32::transpose(B4, B5, B6, B7);

   for(size_t j = 0; j != 8; ++j) {
      const uint32_t K0 = RK[4 * j];
      const uint32_t K1 = RK[4 * j + 1];
      const uint32_t K2 = RK[4 * j + 2];
      const uint32_t K3 = RK[4 * j + 3];

      seed_round(B0, B1, B2, B3, K0, K1, K2, K3);
      seed_round(B4, B5, B6, B7, K0, K1, K2, K3);
   }

   SIMD_16x32::transpose(B2, B3, B0, B1);
   SIMD_16x32::transpose(B6, B7, B4, B5);

   B2.store_be(ctext + 16 * 4 * 0);
   B3.store_be(ctext + 16 * 4 * 1);
   B0.store_be(ctext + 16 * 4 * 2);
   B1.store_be(ctext + 16 * 4 * 3);

   B6.store_be(ctext + 16 * 4 * 4);
   B7.store_be(ctext + 16 * 4 * 5);
   B4.store_be(ctext + 16 * 4 * 6);
   B5.store_be(ctext + 16 * 4 * 7);
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI void decrypt_x2(const uint8_t ctext[32 * 4 * 4],
                                                            uint8_t ptext[32 * 4 * 4],
                                                            std::span<const uint32_t> RK) {
   SIMD_16x32 B0 = SIMD_16x32::load_be(ctext + 16 * 4 * 0);
   SIMD_16x32 B1 = SIMD_16x32::load_be(ctext + 16 * 4 * 1);
   SIMD_16x32 B2 = SIMD_16x32::load_be(ctext + 16 * 4 * 2);
   SIMD_16x32 B3 = SIMD_16x32::load_be(ctext + 16 * 4 * 3);

   SIMD_16x32 B4 = SIMD_16x32::load_be(ctext + 16 * 4 * 4);
   SIMD_16x32 B5 = SIMD_16x32::load_be(ctext + 16 * 4 * 5);
   SIMD_16x32 B6 = SIMD_16x32::load_be(ctext + 16 * 4 * 6);
   SIMD_16x32 B7 = SIMD_16x32::load_be(ctext + 16 * 4 * 7);

   SIMD_16x32::transpose(B0, B1, B2, B3);
   SIMD_16x32::transpose(B4, B5, B6, B7);

   for(size_t j = 0; j != 8; ++j) {
      const uint32_t K0 = RK[30 - 4 * j];
      const uint32_t K1 = RK[31 - 4 * j];
      const uint32_t K2 = RK[28 - 4 * j];
      const uint32_t K3 = RK[29 - 4 * j];

      seed_round(B0, B1, B2, B3, K0, K1, K2, K3);
      seed_round(B4, B5, B6, B7, K0, K1, K2, K3);
   }

   SIMD_16x32::transpose(B2, B3, B0, B1);
   SIMD_16x32::transpose(B6, B7, B4, B5);

   B2.store_be(ptext + 16 * 4 * 0);
   B3.store_be(ptext + 16 * 4 * 1);
   B0.store_be(ptext + 16 * 4 * 2);
   B1.store_be(ptext + 16 * 4 * 3);

   B6.store_be(ptext + 16 * 4 * 4);
   B7.store_be(ptext + 16 * 4 * 5);
   B4.store_be(ptext + 16 * 4 * 6);
   B5.store_be(ptext + 16 * 4 * 7);
}

}  // namespace

}  // namespace SEED_AVX512_GFNI

void BOTAN_FN_ISA_AVX512_GFNI SEED::avx512_gfni_encrypt(const uint8_t ptext[], uint8_t ctext[], size_t blocks) const {
   while(blocks >= 32) {
      SEED_AVX512_GFNI::encrypt_x2(ptext, ctext, m_K);
      ptext += 16 * 32;
      ctext += 16 * 32;
      blocks -= 32;
   }

   while(blocks >= 16) {
      SEED_AVX512_GFNI::encrypt(ptext, ctext, m_K);
      ptext += 16 * 16;
      ctext += 16 * 16;
      blocks -= 16;
   }

   if(blocks > 0) {
      BOTAN_ASSERT_NOMSG(blocks < 16);
      uint8_t pbuf[16 * 16] = {0};
      uint8_t cbuf[16 * 16] = {0};
      copy_mem(pbuf, ptext, blocks * 16);
      SEED_AVX512_GFNI::encrypt(pbuf, cbuf, m_K);
      copy_mem(ctext, cbuf, blocks * 16);
   }
}

void BOTAN_FN_ISA_AVX512_GFNI SEED::avx512_gfni_decrypt(const uint8_t ctext[], uint8_t ptext[], size_t blocks) const {
   while(blocks >= 32) {
      SEED_AVX512_GFNI::decrypt_x2(ctext, ptext, m_K);
      ptext += 16 * 32;
      ctext += 16 * 32;
      blocks -= 32;
   }

   while(blocks >= 16) {
      SEED_AVX512_GFNI::decrypt(ctext, ptext, m_K);
      ptext += 16 * 16;
      ctext += 16 * 16;
      blocks -= 16;
   }

   if(blocks > 0) {
      BOTAN_ASSERT_NOMSG(blocks < 16);
      uint8_t pbuf[16 * 16] = {0};
      uint8_t cbuf[16 * 16] = {0};
      copy_mem(cbuf, ctext, blocks * 16);
      SEED_AVX512_GFNI::decrypt(cbuf, pbuf, m_K);
      copy_mem(ptext, pbuf, blocks * 16);
   }
}

}  // namespace Botan
