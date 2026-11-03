/*
 * XMSS WOTS Parameters
 * Describes a signature method for XMSS Winternitz One Time Signatures,
 * as defined in:
 * [1] XMSS: Extended Hash-Based Signatures,
 *     Request for Comments: 8391
 *     Release: May 2018.
 *     https://datatracker.ietf.org/doc/rfc8391/
 *
 * (C) 2016,2017,2018 Matthias Gierlings
 *     2026 Jack Lloyd
 *
 * Botan is released under the Simplified BSD License (see license.txt)
 **/

#include <botan/xmss_parameters.h>

#include <botan/assert.h>
#include <botan/exceptn.h>

namespace Botan {

XMSS_WOTS_Parameters XMSS_WOTS_Parameters::from_hash_len(ots_algorithm_t id, size_t hash_len) {
   BOTAN_ASSERT_NOMSG(hash_len == 24 || hash_len == 32 || hash_len == 64);
   const size_t len1 = 2 * hash_len;
   // Theoretically this is a computed parameter based on the hash length and the Winternitz parameter
   // We always use W=16, so len2 = 3 is correct for all hash lengths between 18 and 270 bytes.
   const size_t len2 = 3;
   return XMSS_WOTS_Parameters(id, hash_len, len1 + len2, len1, len2);
}

XMSS_WOTS_Parameters XMSS_WOTS_Parameters::from_id(ots_algorithm_t id) {
   switch(id) {
      case WOTSP_SHA2_256:
         return XMSS_WOTS_Parameters::from_hash_len(WOTSP_SHA2_256, 32);

      case WOTSP_SHA2_512:
         return XMSS_WOTS_Parameters::from_hash_len(WOTSP_SHA2_512, 64);

      case WOTSP_SHAKE_256:
         return XMSS_WOTS_Parameters::from_hash_len(WOTSP_SHAKE_256, 32);

      case WOTSP_SHAKE_512:
         return XMSS_WOTS_Parameters::from_hash_len(WOTSP_SHAKE_512, 64);

      case WOTSP_SHA2_192:
         return XMSS_WOTS_Parameters::from_hash_len(WOTSP_SHA2_192, 24);

      case WOTSP_SHAKE_256_256:
         return XMSS_WOTS_Parameters::from_hash_len(WOTSP_SHAKE_256_256, 32);

      case WOTSP_SHAKE_256_192:
         return XMSS_WOTS_Parameters::from_hash_len(WOTSP_SHAKE_256_192, 24);

      default:
         throw Not_Implemented("Algorithm id does not match any known XMSS WOTS algorithm id.");
   }
}

}  // namespace Botan
