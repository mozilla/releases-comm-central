/**
* (C) 2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/argon2.h>

#include <botan/internal/isa_extn.h>
#include <botan/internal/simd_8x64.h>

namespace Botan {

namespace {

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512 void blamka_G(SIMD_8x64& A, SIMD_8x64& B, SIMD_8x64& C, SIMD_8x64& D) {
   A += B + SIMD_8x64::mul2_32(A, B);
   D ^= A;
   D = D.rotr<32>();

   C += D + SIMD_8x64::mul2_32(C, D);
   B ^= C;
   B = B.rotr<24>();

   A += B + SIMD_8x64::mul2_32(A, B);
   D ^= A;
   D = D.rotr<16>();

   C += D + SIMD_8x64::mul2_32(C, D);
   B ^= C;
   B = B.rotr<63>();
}

BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512 void blamka_R(SIMD_8x64& A, SIMD_8x64& B, SIMD_8x64& C, SIMD_8x64& D) {
   blamka_G(A, B, C, D);

   SIMD_8x64::twist(B, C, D);
   blamka_G(A, B, C, D);
   SIMD_8x64::untwist(B, C, D);
}

}  // namespace

BOTAN_FN_ISA_AVX512 void Argon2::blamka_avx512(uint64_t N[128], uint64_t T[128]) {
   for(size_t i = 0; i != 8; i += 2) {
      SIMD_8x64 A = SIMD_8x64::load_le4(
         &N[16 * i + 4 * 0], &N[16 * i + 4 * 0 + 2], &N[16 * (i + 1) + 4 * 0], &N[16 * (i + 1) + 4 * 0 + 2]);
      SIMD_8x64 B = SIMD_8x64::load_le4(
         &N[16 * i + 4 * 1], &N[16 * i + 4 * 1 + 2], &N[16 * (i + 1) + 4 * 1], &N[16 * (i + 1) + 4 * 1 + 2]);
      SIMD_8x64 C = SIMD_8x64::load_le4(
         &N[16 * i + 4 * 2], &N[16 * i + 4 * 2 + 2], &N[16 * (i + 1) + 4 * 2], &N[16 * (i + 1) + 4 * 2 + 2]);
      SIMD_8x64 D = SIMD_8x64::load_le4(
         &N[16 * i + 4 * 3], &N[16 * i + 4 * 3 + 2], &N[16 * (i + 1) + 4 * 3], &N[16 * (i + 1) + 4 * 3 + 2]);

      blamka_R(A, B, C, D);

      A.store_le4(&T[16 * i + 4 * 0], &T[16 * i + 4 * 0 + 2], &T[16 * (i + 1) + 4 * 0], &T[16 * (i + 1) + 4 * 0 + 2]);
      B.store_le4(&T[16 * i + 4 * 1], &T[16 * i + 4 * 1 + 2], &T[16 * (i + 1) + 4 * 1], &T[16 * (i + 1) + 4 * 1 + 2]);
      C.store_le4(&T[16 * i + 4 * 2], &T[16 * i + 4 * 2 + 2], &T[16 * (i + 1) + 4 * 2], &T[16 * (i + 1) + 4 * 2 + 2]);
      D.store_le4(&T[16 * i + 4 * 3], &T[16 * i + 4 * 3 + 2], &T[16 * (i + 1) + 4 * 3], &T[16 * (i + 1) + 4 * 3 + 2]);
   }

   for(size_t i = 0; i != 8; i += 2) {
      SIMD_8x64 A = SIMD_8x64::load_le4(
         &T[2 * i + 32 * 0], &T[2 * i + 32 * 0 + 16], &T[2 * (i + 1) + 32 * 0], &T[2 * (i + 1) + 32 * 0 + 16]);
      SIMD_8x64 B = SIMD_8x64::load_le4(
         &T[2 * i + 32 * 1], &T[2 * i + 32 * 1 + 16], &T[2 * (i + 1) + 32 * 1], &T[2 * (i + 1) + 32 * 1 + 16]);
      SIMD_8x64 C = SIMD_8x64::load_le4(
         &T[2 * i + 32 * 2], &T[2 * i + 32 * 2 + 16], &T[2 * (i + 1) + 32 * 2], &T[2 * (i + 1) + 32 * 2 + 16]);
      SIMD_8x64 D = SIMD_8x64::load_le4(
         &T[2 * i + 32 * 3], &T[2 * i + 32 * 3 + 16], &T[2 * (i + 1) + 32 * 3], &T[2 * (i + 1) + 32 * 3 + 16]);

      blamka_R(A, B, C, D);

      A.store_le4(&T[2 * i + 32 * 0], &T[2 * i + 32 * 0 + 16], &T[2 * (i + 1) + 32 * 0], &T[2 * (i + 1) + 32 * 0 + 16]);
      B.store_le4(&T[2 * i + 32 * 1], &T[2 * i + 32 * 1 + 16], &T[2 * (i + 1) + 32 * 1], &T[2 * (i + 1) + 32 * 1 + 16]);
      C.store_le4(&T[2 * i + 32 * 2], &T[2 * i + 32 * 2 + 16], &T[2 * (i + 1) + 32 * 2], &T[2 * (i + 1) + 32 * 2 + 16]);
      D.store_le4(&T[2 * i + 32 * 3], &T[2 * i + 32 * 3 + 16], &T[2 * (i + 1) + 32 * 3], &T[2 * (i + 1) + 32 * 3 + 16]);
   }

   for(size_t i = 0; i != 128 / 8; ++i) {
      SIMD_8x64 n = SIMD_8x64::load_le(&N[8 * i]);
      n ^= SIMD_8x64::load_le(&T[8 * i]);
      n.store_le(&N[8 * i]);
   }
}

}  // namespace Botan
