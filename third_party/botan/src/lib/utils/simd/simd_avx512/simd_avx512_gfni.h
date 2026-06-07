/*
* (C) 2024 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#ifndef BOTAN_SIMD_AVX512_GFNI_H_
#define BOTAN_SIMD_AVX512_GFNI_H_

#include <botan/internal/simd_avx512.h>

#include <botan/internal/gfni_utils.h>
#include <botan/internal/isa_extn.h>

namespace Botan {

template <uint64_t A, uint8_t B>
BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI SIMD_16x32 gf2p8affine(const SIMD_16x32& x) {
   return SIMD_16x32(_mm512_gf2p8affine_epi64_epi8(x.raw(), _mm512_set1_epi64(A), B));
}

template <uint64_t A, uint8_t B>
BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX512_GFNI SIMD_16x32 gf2p8affineinv(const SIMD_16x32& x) {
   return SIMD_16x32(_mm512_gf2p8affineinv_epi64_epi8(x.raw(), _mm512_set1_epi64(A), B));
}

}  // namespace Botan

#endif
