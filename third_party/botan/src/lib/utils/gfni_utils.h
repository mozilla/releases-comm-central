/*
* (C) 2024 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#ifndef BOTAN_SIMD_GFNI_UTILS_H_
#define BOTAN_SIMD_GFNI_UTILS_H_

#include <botan/types.h>
#include <stdexcept>
#include <string_view>

namespace Botan {

// Helper for defining GFNI constants
consteval uint64_t gfni_matrix(std::string_view s) {
   uint64_t matrix = 0;
   size_t bit_cnt = 0;
   uint8_t row = 0;

   for(const char c : s) {
      if(c == ' ' || c == '\n') {
         continue;
      }
      if(c != '0' && c != '1') {
         throw std::runtime_error("gfni_matrix: invalid bit value");
      }

      if(c == '1') {
         row |= 0x80 >> (7 - bit_cnt % 8);
      }
      bit_cnt++;

      if(bit_cnt % 8 == 0) {
         matrix <<= 8;
         matrix |= row;
         row = 0;
      }
   }

   if(bit_cnt != 64) {
      throw std::runtime_error("gfni_matrix: invalid bit count");
   }

   return matrix;
}

}  // namespace Botan

#endif
