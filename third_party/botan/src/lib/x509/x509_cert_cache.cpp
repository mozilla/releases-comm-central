/*
* (C) 2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/internal/x509_cert_cache.h>

#include <botan/hash.h>

namespace Botan {

X509_Certificate_Cache::X509_Certificate_Cache(size_t max_entries) : m_max_entries(max_entries) {}

X509_Certificate X509_Certificate_Cache::find_or_insert(std::span<const uint8_t> encoding) {
   if(m_max_entries == 0) {
      return X509_Certificate(encoding);
   }

   // Hash the DER
   auto sha256 = HashFunction::create_or_throw("SHA-256");
   DER_Hash hash;
   sha256->update(encoding);
   sha256->final(hash.m_hash);

   // Check for a cache hit
   {
      const lock_guard_type<mutex_type> lock(m_mutex);
      if(auto it = m_cache.find(hash); it != m_cache.end()) {
         return it->second;
      }
   }

   // Deserialize the certificate
   X509_Certificate cert(encoding);

   // Lock again
   const lock_guard_type<mutex_type> lock(m_mutex);

   // Check for a cache hit (possibly racing with another thread)
   if(auto it = m_cache.find(hash); it != m_cache.end()) {
      return it->second;
   }

   // Evict if required
   //
   // Effectively this is just a random drop, might make sense to add LRU here
   while(m_cache.size() >= m_max_entries) {
      m_cache.erase(m_cache.begin());
   }

   // Add the newly deserialized cert to the cache
   auto it = m_cache.emplace(hash, std::move(cert)).first;
   return it->second;
}

}  // namespace Botan
