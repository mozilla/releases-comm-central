/*
 * XMSS Parameters
 * Describes a signature method for XMSS, as defined in:
 * [1] XMSS: Extended Hash-Based Signatures,
 *     Request for Comments: 8391
 *     Release: May 2018.
 *     https://datatracker.ietf.org/doc/rfc8391/
 *
 * (C) 2016,2017,2018 Matthias Gierlings
 *
 * Botan is released under the Simplified BSD License (see license.txt)
 **/

#include <botan/xmss_parameters.h>

#include <botan/assert.h>
#include <botan/exceptn.h>
#include <botan/internal/fmt.h>

namespace Botan {

XMSS_Parameters::xmss_algorithm_t XMSS_Parameters::xmss_id_from_string(std::string_view param_set) {
   if(param_set == "XMSS-SHA2_10_256") {
      return XMSS_SHA2_10_256;
   }
   if(param_set == "XMSS-SHA2_16_256") {
      return XMSS_SHA2_16_256;
   }
   if(param_set == "XMSS-SHA2_20_256") {
      return XMSS_SHA2_20_256;
   }
   if(param_set == "XMSS-SHA2_10_512") {
      return XMSS_SHA2_10_512;
   }
   if(param_set == "XMSS-SHA2_16_512") {
      return XMSS_SHA2_16_512;
   }
   if(param_set == "XMSS-SHA2_20_512") {
      return XMSS_SHA2_20_512;
   }
   if(param_set == "XMSS-SHAKE_10_256") {
      return XMSS_SHAKE_10_256;
   }
   if(param_set == "XMSS-SHAKE_16_256") {
      return XMSS_SHAKE_16_256;
   }
   if(param_set == "XMSS-SHAKE_20_256") {
      return XMSS_SHAKE_20_256;
   }
   if(param_set == "XMSS-SHAKE_10_512") {
      return XMSS_SHAKE_10_512;
   }
   if(param_set == "XMSS-SHAKE_16_512") {
      return XMSS_SHAKE_16_512;
   }
   if(param_set == "XMSS-SHAKE_20_512") {
      return XMSS_SHAKE_20_512;
   }
   if(param_set == "XMSS-SHA2_10_192") {
      return XMSS_SHA2_10_192;
   }
   if(param_set == "XMSS-SHA2_16_192") {
      return XMSS_SHA2_16_192;
   }
   if(param_set == "XMSS-SHA2_20_192") {
      return XMSS_SHA2_20_192;
   }
   if(param_set == "XMSS-SHAKE256_10_256") {
      return XMSS_SHAKE256_10_256;
   }
   if(param_set == "XMSS-SHAKE256_16_256") {
      return XMSS_SHAKE256_16_256;
   }
   if(param_set == "XMSS-SHAKE256_20_256") {
      return XMSS_SHAKE256_20_256;
   }
   if(param_set == "XMSS-SHAKE256_10_192") {
      return XMSS_SHAKE256_10_192;
   }
   if(param_set == "XMSS-SHAKE256_16_192") {
      return XMSS_SHAKE256_16_192;
   }
   if(param_set == "XMSS-SHAKE256_20_192") {
      return XMSS_SHAKE256_20_192;
   }

   throw Lookup_Error(fmt("Unknown XMSS algorithm param '{}'", param_set));
}

std::string_view XMSS_Parameters::hash_function_name() const {
   switch(m_oid) {
      case XMSS_SHA2_10_256:
      case XMSS_SHA2_16_256:
      case XMSS_SHA2_20_256:
         return "SHA-256";

      case XMSS_SHA2_10_512:
      case XMSS_SHA2_16_512:
      case XMSS_SHA2_20_512:
         return "SHA-512";

      case XMSS_SHAKE_10_256:
      case XMSS_SHAKE_16_256:
      case XMSS_SHAKE_20_256:
         return "SHAKE-128(256)";

      case XMSS_SHAKE_10_512:
      case XMSS_SHAKE_16_512:
      case XMSS_SHAKE_20_512:
         return "SHAKE-256(512)";

      case XMSS_SHA2_10_192:
      case XMSS_SHA2_16_192:
      case XMSS_SHA2_20_192:
         return "Truncated(SHA-256,192)";

      case XMSS_SHAKE256_10_256:
      case XMSS_SHAKE256_16_256:
      case XMSS_SHAKE256_20_256:
         return "SHAKE-256(256)";

      case XMSS_SHAKE256_10_192:
      case XMSS_SHAKE256_16_192:
      case XMSS_SHAKE256_20_192:
         return "SHAKE-256(192)";

      default:
         BOTAN_ASSERT_UNREACHABLE();
   }
}

std::string_view XMSS_Parameters::name() const {
   switch(m_oid) {
      case XMSS_SHA2_10_256:
         return "XMSS-SHA2_10_256";

      case XMSS_SHA2_16_256:
         return "XMSS-SHA2_16_256";

      case XMSS_SHA2_20_256:
         return "XMSS-SHA2_20_256";

      case XMSS_SHA2_10_512:
         return "XMSS-SHA2_10_512";

      case XMSS_SHA2_16_512:
         return "XMSS-SHA2_16_512";

      case XMSS_SHA2_20_512:
         return "XMSS-SHA2_20_512";

      case XMSS_SHAKE_10_256:
         return "XMSS-SHAKE_10_256";

      case XMSS_SHAKE_16_256:
         return "XMSS-SHAKE_16_256";

      case XMSS_SHAKE_20_256:
         return "XMSS-SHAKE_20_256";

      case XMSS_SHAKE_10_512:
         return "XMSS-SHAKE_10_512";

      case XMSS_SHAKE_16_512:
         return "XMSS-SHAKE_16_512";

      case XMSS_SHAKE_20_512:
         return "XMSS-SHAKE_20_512";

      case XMSS_SHA2_10_192:
         return "XMSS-SHA2_10_192";

      case XMSS_SHA2_16_192:
         return "XMSS-SHA2_16_192";

      case XMSS_SHA2_20_192:
         return "XMSS-SHA2_20_192";

      case XMSS_SHAKE256_10_256:
         return "XMSS-SHAKE256_10_256";

      case XMSS_SHAKE256_16_256:
         return "XMSS-SHAKE256_16_256";

      case XMSS_SHAKE256_20_256:
         return "XMSS-SHAKE256_20_256";

      case XMSS_SHAKE256_10_192:
         return "XMSS-SHAKE256_10_192";

      case XMSS_SHAKE256_16_192:
         return "XMSS-SHAKE256_16_192";

      case XMSS_SHAKE256_20_192:
         return "XMSS-SHAKE256_20_192";

      default:
         BOTAN_ASSERT_UNREACHABLE();
   }
}

// NOLINTBEGIN(*-member-init)
XMSS_Parameters::XMSS_Parameters(std::string_view algo_name) {
   *this = XMSS_Parameters::from_name(algo_name);
}

XMSS_Parameters::XMSS_Parameters(xmss_algorithm_t oid) {
   *this = XMSS_Parameters::from_id(oid);
}

// NOLINTEND(*-member-init)

XMSS_Parameters XMSS_Parameters::from_name(std::string_view param_set) {
   return XMSS_Parameters::from_id(XMSS_Parameters::xmss_id_from_string(param_set));
}

XMSS_Parameters XMSS_Parameters::from_id(xmss_algorithm_t oid) {
   switch(oid) {
      case XMSS_SHA2_10_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_256, 32, 32, 10, 67);

      case XMSS_SHA2_16_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_256, 32, 32, 16, 67);

      case XMSS_SHA2_20_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_256, 32, 32, 20, 67);

      case XMSS_SHA2_10_512:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_512, 64, 64, 10, 131);

      case XMSS_SHA2_16_512:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_512, 64, 64, 16, 131);

      case XMSS_SHA2_20_512:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_512, 64, 64, 20, 131);

      case XMSS_SHAKE_10_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256, 32, 32, 10, 67);

      case XMSS_SHAKE_16_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256, 32, 32, 16, 67);

      case XMSS_SHAKE_20_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256, 32, 32, 20, 67);

      case XMSS_SHAKE_10_512:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_512, 64, 64, 10, 131);

      case XMSS_SHAKE_16_512:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_512, 64, 64, 16, 131);

      case XMSS_SHAKE_20_512:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_512, 64, 64, 20, 131);

      case XMSS_SHA2_10_192:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_192, 24, 4, 10, 51);

      case XMSS_SHA2_16_192:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_192, 24, 4, 16, 51);

      case XMSS_SHA2_20_192:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHA2_192, 24, 4, 20, 51);

      case XMSS_SHAKE256_10_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256_256, 32, 32, 10, 67);

      case XMSS_SHAKE256_16_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256_256, 32, 32, 16, 67);

      case XMSS_SHAKE256_20_256:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256_256, 32, 32, 20, 67);

      case XMSS_SHAKE256_10_192:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256_192, 24, 4, 10, 51);

      case XMSS_SHAKE256_16_192:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256_192, 24, 4, 16, 51);

      case XMSS_SHAKE256_20_192:
         return XMSS_Parameters(oid, XMSS_WOTS_Parameters::ots_algorithm_t::WOTSP_SHAKE_256_192, 24, 4, 20, 51);

      default:
         throw Not_Implemented("Algorithm id does not match any known XMSS algorithm id:" + std::to_string(oid));
   }
}

}  // namespace Botan
