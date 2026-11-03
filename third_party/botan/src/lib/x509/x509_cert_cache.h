/*
* (C) 2026 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#ifndef BOTAN_X509_CERT_CACHE_H_
#define BOTAN_X509_CERT_CACHE_H_

#include <botan/x509cert.h>

#include <botan/mutex.h>
#include <array>
#include <cstring>
#include <span>
#include <unordered_map>

namespace Botan {

class HashFunction;

/**
* A cache for X.509 certificates
*
* This is primarily useful for system certificate stores (Windows, macOS)
* where repeated lookups via native APIs return raw DER bytes that must
* be parsed each time. The cache deduplicates these by keying on the
* SHA-256 hash of the DER encoding.
*/
class X509_Certificate_Cache final {
   public:
      /**
      * @param max_entries maximum number of certificates to cache.
      *        When the cache is full, an entry is evicted to make room.
      *        If 0, caching is disabled entirely.
      */
      explicit X509_Certificate_Cache(size_t max_entries = 64);

      /**
      * Look up a certificate by its DER encoding, or parse and cache it.
      *
      * If a certificate with the same DER encoding (by SHA-256 hash) is
      * already in the cache, returns a (cheap, shared_ptr-backed) copy.
      * Otherwise, parses the DER encoding into an X509_Certificate,
      * inserts it into the cache, and returns it.
      *
      * If the cache was constructed with max_entries == 0, always parses
      * and never caches.
      *
      * @param encoding DER-encoded certificate
      * @return the cached or newly parsed certificate
      * @throws Decoding_Error if the encoding is not a valid certificate
      */
      X509_Certificate find_or_insert(std::span<const uint8_t> encoding);

   private:
      class DER_Hash final {
         public:
            static constexpr size_t LEN = 32;

            auto operator<=>(const DER_Hash&) const = default;

            size_t hash() const noexcept {
               size_t h = 0;
               std::memcpy(&h, m_hash.data(), sizeof(h));
               return h;
            }

         private:
            DER_Hash() : m_hash{} {}

            friend class X509_Certificate_Cache;
            std::array<uint8_t, LEN> m_hash;
      };

      struct DER_Hash_Fn {
            size_t operator()(const DER_Hash& h) const noexcept { return h.hash(); }
      };

      size_t m_max_entries;
      mutex_type m_mutex;
      std::unordered_map<DER_Hash, X509_Certificate, DER_Hash_Fn> m_cache;
};

}  // namespace Botan

#endif
