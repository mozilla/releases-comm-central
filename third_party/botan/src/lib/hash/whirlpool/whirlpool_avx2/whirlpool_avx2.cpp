/*
* (C) 2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/internal/whirlpool.h>

#include <botan/internal/isa_extn.h>
#include <immintrin.h>

namespace Botan {

namespace WhirlpoolAVX2 {

namespace {

// NOLINTBEGIN(portability-simd-intrinsics)

class WhirlpoolState final {
   public:
      BOTAN_FN_ISA_AVX2
      WhirlpoolState() : m_lo(_mm256_setzero_si256()), m_hi(_mm256_setzero_si256()) {}

      BOTAN_FN_ISA_AVX2
      WhirlpoolState(__m256i lo, __m256i hi) : m_lo(lo), m_hi(hi) {}

      WhirlpoolState(const WhirlpoolState& other) = default;
      WhirlpoolState(WhirlpoolState&& other) = default;
      WhirlpoolState& operator=(const WhirlpoolState& other) = default;
      WhirlpoolState& operator=(WhirlpoolState&& other) = default;
      ~WhirlpoolState() = default;

      BOTAN_FN_ISA_AVX2
      static WhirlpoolState load_bytes(const uint8_t src[64]) {
         return WhirlpoolState(_mm256_loadu_si256(reinterpret_cast<const __m256i*>(src)),
                               _mm256_loadu_si256(reinterpret_cast<const __m256i*>(src + 32)));
      }

      BOTAN_FN_ISA_AVX2
      static WhirlpoolState load_be(const uint64_t src[8]) {
         return WhirlpoolState(_mm256_loadu_si256(reinterpret_cast<const __m256i*>(src)),
                               _mm256_loadu_si256(reinterpret_cast<const __m256i*>(src + 4)))
            .bswap();
      }

      BOTAN_FN_ISA_AVX2
      void store_be(uint64_t dst[8]) const {
         auto s = bswap();
         _mm256_storeu_si256(reinterpret_cast<__m256i*>(dst), s.m_lo);
         _mm256_storeu_si256(reinterpret_cast<__m256i*>(dst + 4), s.m_hi);
      }

      BOTAN_FN_ISA_AVX2
      inline friend WhirlpoolState operator^(WhirlpoolState a, WhirlpoolState b) {
         return WhirlpoolState(_mm256_xor_si256(a.m_lo, b.m_lo), _mm256_xor_si256(a.m_hi, b.m_hi));
      }

      BOTAN_FN_ISA_AVX2
      inline friend WhirlpoolState operator^(WhirlpoolState a, uint64_t rc) {
         return WhirlpoolState(_mm256_xor_si256(a.m_lo, _mm256_set_epi64x(0, 0, 0, rc)), a.m_hi);
      }

      BOTAN_FN_ISA_AVX2
      inline WhirlpoolState& operator^=(WhirlpoolState other) {
         m_lo = _mm256_xor_si256(m_lo, other.m_lo);
         m_hi = _mm256_xor_si256(m_hi, other.m_hi);
         return *this;
      }

      BOTAN_FN_ISA_AVX2
      inline WhirlpoolState sub_bytes() const { return WhirlpoolState(sub_bytes(m_lo), sub_bytes(m_hi)); }

      BOTAN_FN_ISA_AVX2
      inline WhirlpoolState shift_columns() const {
         /*
         * This is a lot more complicated than the AVX-512 version since first we have
         * the state split between two registers and also AVX2 permutes are much weaker
         * than AVX512's due to mostly only working on 128 bit lanes
         */

         constexpr char non = -1;

         const auto sc0 = _mm_setr_epi8(0x0, non, non, non, non, non, non, 0xF, 0x8, 0x1, non, non, non, non, non, non);
         const auto sc1 = _mm_setr_epi8(non, 0x9, 0x2, non, non, non, non, non, non, non, 0xA, 0x3, non, non, non, non);
         const auto sc2 = _mm_setr_epi8(non, non, non, 0xB, 0x4, non, non, non, non, non, non, non, 0xC, 0x5, non, non);
         const auto sc3 = _mm_setr_epi8(non, non, non, non, non, 0xD, 0x6, non, non, non, non, non, non, non, 0xE, 0x7);

         const auto idx_same_lane = _mm256_broadcastsi128_si256(sc0);
         const auto idx_other_half = _mm256_broadcastsi128_si256(sc2);
         const auto idx_other_lane = _mm256_set_m128i(sc1, sc3);
         const auto idx_other_both = _mm256_set_m128i(sc3, sc1);

         // Swap the two lanes within the registers so we can get at the values we need via in-lane shuffles
         const auto r_lo = _mm256_permute2x128_si256(m_lo, m_lo, 0x01);
         const auto r_hi = _mm256_permute2x128_si256(m_hi, m_hi, 0x01);

         /*
         * Compute the shift column output by shuffling all 4 input lanes (lo[0], lo[1], hi[0], hi[1])
         * to select out the values we want from each source lane, placing them in the
         * index we want, and OR each into the result.
         */
         __m256i new_lo = _mm256_shuffle_epi8(m_lo, idx_same_lane);
         new_lo = _mm256_or_si256(new_lo, _mm256_shuffle_epi8(r_lo, idx_other_lane));
         new_lo = _mm256_or_si256(new_lo, _mm256_shuffle_epi8(m_hi, idx_other_half));
         new_lo = _mm256_or_si256(new_lo, _mm256_shuffle_epi8(r_hi, idx_other_both));

         // Same as above just with hi/lo swapped
         __m256i new_hi = _mm256_shuffle_epi8(m_hi, idx_same_lane);
         new_hi = _mm256_or_si256(new_hi, _mm256_shuffle_epi8(r_hi, idx_other_lane));
         new_hi = _mm256_or_si256(new_hi, _mm256_shuffle_epi8(m_lo, idx_other_half));
         new_hi = _mm256_or_si256(new_hi, _mm256_shuffle_epi8(r_lo, idx_other_both));

         return WhirlpoolState(new_lo, new_hi);
      }

      BOTAN_FN_ISA_AVX2
      BOTAN_FORCE_INLINE WhirlpoolState mix_rows() const { return WhirlpoolState(mix_rows(m_lo), mix_rows(m_hi)); }

      BOTAN_FN_ISA_AVX2
      BOTAN_FORCE_INLINE WhirlpoolState round() const { return sub_bytes().shift_columns().mix_rows(); }

   private:
      BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX2 static __m256i sub_bytes(__m256i v) {
         const auto Ebox =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(1, 11, 9, 12, 13, 6, 15, 3, 14, 8, 7, 4, 10, 2, 5, 0));
         const auto Eibox =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(15, 0, 13, 7, 11, 14, 5, 10, 9, 2, 12, 1, 3, 4, 8, 6));
         const auto Rbox =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(7, 12, 11, 13, 14, 4, 9, 15, 6, 3, 8, 10, 2, 5, 1, 0));

         const auto lo_mask = _mm256_set1_epi8(0x0F);

         const auto lo_nib = _mm256_and_si256(v, lo_mask);
         const auto hi_nib = _mm256_and_si256(_mm256_srli_epi16(v, 4), lo_mask);

         const auto L = _mm256_shuffle_epi8(Ebox, hi_nib);
         const auto R = _mm256_shuffle_epi8(Eibox, lo_nib);
         const auto T = _mm256_shuffle_epi8(Rbox, _mm256_xor_si256(L, R));

         const auto out_hi = _mm256_shuffle_epi8(Ebox, _mm256_xor_si256(L, T));
         const auto out_lo = _mm256_shuffle_epi8(Eibox, _mm256_xor_si256(R, T));

         return _mm256_or_si256(_mm256_slli_epi16(out_hi, 4), out_lo);
      }

      BOTAN_FORCE_INLINE BOTAN_FN_ISA_AVX2 static __m256i mix_rows(__m256i v) {
         // Shuffles for 64-bit rotations
         const auto rot1 =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(7, 0, 1, 2, 3, 4, 5, 6, 15, 8, 9, 10, 11, 12, 13, 14));
         const auto rot2 =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(6, 7, 0, 1, 2, 3, 4, 5, 14, 15, 8, 9, 10, 11, 12, 13));
         const auto rot3 =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(5, 6, 7, 0, 1, 2, 3, 4, 13, 14, 15, 8, 9, 10, 11, 12));
         const auto rot4 =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(4, 5, 6, 7, 0, 1, 2, 3, 12, 13, 14, 15, 8, 9, 10, 11));
         const auto rot5 =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(3, 4, 5, 6, 7, 0, 1, 2, 11, 12, 13, 14, 15, 8, 9, 10));
         const auto rot6 =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(2, 3, 4, 5, 6, 7, 0, 1, 10, 11, 12, 13, 14, 15, 8, 9));
         const auto rot7 =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(1, 2, 3, 4, 5, 6, 7, 0, 9, 10, 11, 12, 13, 14, 15, 8));

         const auto x2 = xtime(v);
         const auto x4 = xtime(x2);
         const auto x8 = xtime(x4);
         const auto x5 = _mm256_xor_si256(x4, v);
         const auto x9 = _mm256_xor_si256(x8, v);

         const auto t01 = _mm256_xor_si256(v, _mm256_shuffle_epi8(v, rot1));
         const auto t23 = _mm256_xor_si256(_mm256_shuffle_epi8(x4, rot2), _mm256_shuffle_epi8(v, rot3));
         const auto t45 = _mm256_xor_si256(_mm256_shuffle_epi8(x8, rot4), _mm256_shuffle_epi8(x5, rot5));
         const auto t67 = _mm256_xor_si256(_mm256_shuffle_epi8(x2, rot6), _mm256_shuffle_epi8(x9, rot7));

         return _mm256_xor_si256(_mm256_xor_si256(t01, t23), _mm256_xor_si256(t45, t67));
      }

      BOTAN_FN_ISA_AVX2
      WhirlpoolState bswap() const {
         // 64-bit byteswap
         const auto tbl =
            _mm256_broadcastsi128_si256(_mm_setr_epi8(7, 6, 5, 4, 3, 2, 1, 0, 15, 14, 13, 12, 11, 10, 9, 8));

         return WhirlpoolState(_mm256_shuffle_epi8(m_lo, tbl), _mm256_shuffle_epi8(m_hi, tbl));
      }

      BOTAN_FN_ISA_AVX2
      static __m256i xtime(__m256i a) {
         const auto poly = _mm256_set1_epi8(0x1D);
         const auto shifted = _mm256_add_epi8(a, a);  // shifted = a << 1
         // blendv uses the top bit of the mask argument (a) to select between the inputs
         return _mm256_blendv_epi8(shifted, _mm256_xor_si256(shifted, poly), a);
      }

      __m256i m_lo;
      __m256i m_hi;
};

// NOLINTEND(portability-simd-intrinsics)

}  // namespace

}  // namespace WhirlpoolAVX2

BOTAN_FN_ISA_AVX2
void Whirlpool::compress_n_avx2(digest_type& digest, std::span<const uint8_t> input, size_t blocks) {
   using WhirlpoolAVX2::WhirlpoolState;

   auto H = WhirlpoolState::load_be(digest.data());

   for(size_t i = 0; i != blocks; ++i) {
      const auto M = WhirlpoolState::load_bytes(input.data() + i * 64);

      auto K = H;
      H ^= M;
      auto B = H;  // B = M ^ K

      K = K.round() ^ 0x4F01B887E8C62318;
      B = B.round() ^ K;

      K = K.round() ^ 0x52916F79F5D2A636;
      B = B.round() ^ K;

      K = K.round() ^ 0x357B0CA38E9BBC60;
      B = B.round() ^ K;

      K = K.round() ^ 0x57FE4B2EC2D7E01D;
      B = B.round() ^ K;

      K = K.round() ^ 0xDA4AF09FE5377715;
      B = B.round() ^ K;

      K = K.round() ^ 0x856BA0B10A29C958;
      B = B.round() ^ K;

      K = K.round() ^ 0x67053ECBF4105DBD;
      B = B.round() ^ K;

      K = K.round() ^ 0xD8957DA78B4127E4;
      B = B.round() ^ K;

      K = K.round() ^ 0x9E4717DD667CEEFB;
      B = B.round() ^ K;

      K = K.round() ^ 0x33835AAD07BF2DCA;
      B = B.round() ^ K;

      H ^= B;
   }

   H.store_be(digest.data());
}

}  // namespace Botan
