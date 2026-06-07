/*
* (C) 2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/internal/ctr.h>

#include <botan/assert.h>
#include <botan/internal/simd_4x32.h>

namespace Botan {

BOTAN_FN_ISA_SIMD_4X32
size_t CTR_BE::ctr_proc_bs16_ctr4_simd32(const uint8_t* in, uint8_t* out, size_t length) {
   BOTAN_ASSERT_NOMSG(m_pad.size() % 64 == 0);
   BOTAN_DEBUG_ASSERT(m_counter.size() == m_pad.size());

   const size_t pad_size = m_pad.size();
   if(length < pad_size) {
      return 0;
   }

   const size_t ctr_blocks = m_ctr_blocks;

   // Load the starting counter as big-endian 32-bit words.
   // Word 3 (bytes 12-15) contains the counter value in native form.
   const SIMD_4x32 starting_ctr = SIMD_4x32::load_be(m_counter.data());

   const uint32_t N = static_cast<uint32_t>(ctr_blocks);

   // Initialize 4 counter registers for 4-way unrolled processing
   SIMD_4x32 ctr0 = starting_ctr + SIMD_4x32(0, 0, 0, N);
   SIMD_4x32 ctr1 = starting_ctr + SIMD_4x32(0, 0, 0, N + 1);
   SIMD_4x32 ctr2 = starting_ctr + SIMD_4x32(0, 0, 0, N + 2);
   SIMD_4x32 ctr3 = starting_ctr + SIMD_4x32(0, 0, 0, N + 3);
   const SIMD_4x32 inc4 = SIMD_4x32(0, 0, 0, 4);

   const uint8_t* pad_buf = m_pad.data();
   uint8_t* ctr_buf = m_counter.data();

   const size_t ctr_block_quads = ctr_blocks / 4;

   size_t processed = 0;

   while(length >= pad_size) {
      for(size_t i = 0; i != ctr_block_quads; ++i) {
         const size_t off = i * 64;

         // Store and update the counter
         ctr0.store_be(ctr_buf + off);
         ctr1.store_be(ctr_buf + off + 16);
         ctr2.store_be(ctr_buf + off + 32);
         ctr3.store_be(ctr_buf + off + 48);
         ctr0 += inc4;
         ctr1 += inc4;
         ctr2 += inc4;
         ctr3 += inc4;

         // Load and XOR the pad with the input blocks
         auto p0 = SIMD_4x32::load_le(pad_buf + off);
         auto p1 = SIMD_4x32::load_le(pad_buf + off + 16);
         auto p2 = SIMD_4x32::load_le(pad_buf + off + 32);
         auto p3 = SIMD_4x32::load_le(pad_buf + off + 48);

         p0 ^= SIMD_4x32::load_le(in + off);
         p1 ^= SIMD_4x32::load_le(in + off + 16);
         p2 ^= SIMD_4x32::load_le(in + off + 32);
         p3 ^= SIMD_4x32::load_le(in + off + 48);

         p0.store_le(out + off);
         p1.store_le(out + off + 16);
         p2.store_le(out + off + 32);
         p3.store_le(out + off + 48);
      }

      in += pad_size;
      out += pad_size;
      length -= pad_size;
      processed += pad_size;

      // Regenerate the pad buffer
      m_cipher->encrypt_n(m_counter.data(), m_pad.data(), ctr_blocks);
   }

   return processed;
}

}  // namespace Botan
