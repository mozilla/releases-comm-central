/*
 * XMSS Signature
 * (C) 2016,2017,2018 Matthias Gierlings
 *
 * Botan is released under the Simplified BSD License (see license.txt)
 **/

#include <botan/internal/xmss_signature.h>
#include <iterator>

namespace Botan {

XMSS_Signature::XMSS_Signature(XMSS_Parameters::xmss_algorithm_t oid, std::span<const uint8_t> raw_sig) :
      m_leaf_idx(0), m_randomness(0, 0x00) {
   const auto params = XMSS_Parameters::from_id(oid);

   if(raw_sig.size() != (params.len() + params.tree_height() + 1) * params.element_size() + sizeof(uint32_t)) {
      throw Decoding_Error("XMSS signature size invalid.");
   }

   for(size_t i = 0; i < 4; i++) {
      m_leaf_idx = ((m_leaf_idx << 8) | raw_sig[i]);
   }

   if(m_leaf_idx >= params.total_number_of_signatures()) {
      throw Decoding_Error("XMSS signature leaf index out of bounds.");
   }

   auto begin = raw_sig.begin() + sizeof(uint32_t);
   auto end = begin + params.element_size();
   std::copy(begin, end, std::back_inserter(m_randomness));

   for(size_t i = 0; i < params.len(); i++) {
      begin = end;
      end = begin + params.element_size();
      m_tree_sig.ots_signature.push_back(secure_vector<uint8_t>(0));
      m_tree_sig.ots_signature.back().reserve(params.element_size());
      std::copy(begin, end, std::back_inserter(m_tree_sig.ots_signature.back()));
   }

   for(size_t i = 0; i < params.tree_height(); i++) {
      begin = end;
      end = begin + params.element_size();
      m_tree_sig.authentication_path.push_back(secure_vector<uint8_t>(0));
      m_tree_sig.authentication_path.back().reserve(params.element_size());
      std::copy(begin, end, std::back_inserter(m_tree_sig.authentication_path.back()));
   }
}

std::vector<uint8_t> XMSS_Signature::bytes() const {
   std::vector<uint8_t> result{static_cast<uint8_t>(m_leaf_idx >> 24U),
                               static_cast<uint8_t>(m_leaf_idx >> 16U),
                               static_cast<uint8_t>(m_leaf_idx >> 8U),
                               static_cast<uint8_t>(m_leaf_idx)};

   std::copy(m_randomness.begin(), m_randomness.end(), std::back_inserter(result));

   for(const auto& sig : tree().ots_signature) {
      std::copy(sig.begin(), sig.end(), std::back_inserter(result));
   }

   for(const auto& auth : tree().authentication_path) {
      std::copy(auth.begin(), auth.end(), std::back_inserter(result));
   }
   return result;
}

}  // namespace Botan
