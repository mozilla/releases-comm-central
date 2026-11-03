/*
* Certificate Store
* (C) 1999-2021,2026 Jack Lloyd
* (C) 2018-2019 Patrik Fiedler, Tim Oesterreich
* (C) 2021      René Meusel
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#include <botan/certstor_windows.h>

#include <botan/assert.h>
#include <botan/ber_dec.h>
#include <botan/hash.h>
#include <botan/mutex.h>
#include <botan/pkix_types.h>
#include <botan/internal/fmt.h>
#include <botan/internal/x509_cert_cache.h>
#include <algorithm>
#include <array>
#include <functional>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#define NOMINMAX 1
#define _WINSOCKAPI_  // stop windows.h including winsock.h
#include <windows.h>

#include <wincrypt.h>

namespace Botan {
namespace {

constexpr std::array<const char*, 2> cert_store_names{"Root", "CA"};

/**
 * RAII wrapper for PCCERT_CONTEXT used as iteration state in
 * CertFindCertificateInStore / CertEnumCertificatesInStore loops.
 *
 * The Windows API takes ownership of the previous context when the next one
 * is requested: passing a non-null PCCERT_CONTEXT as the iteration state
 * causes the API to free it and return a new one. This wrapper takes care of
 * freeing the trailing context after the loop ends or on early return.
 */
class Cert_Context final {
   public:
      Cert_Context() : m_ctx(nullptr) {}

      ~Cert_Context() {
         if(m_ctx != nullptr) {
            CertFreeCertificateContext(m_ctx);
         }
      }

      Cert_Context(const Cert_Context&) = delete;
      Cert_Context(Cert_Context&&) = delete;
      Cert_Context& operator=(const Cert_Context&) = delete;
      Cert_Context& operator=(Cert_Context&&) = delete;

      bool assign(PCCERT_CONTEXT ctx) {
         m_ctx = ctx;
         return m_ctx != nullptr;
      }

      PCCERT_CONTEXT get() const { return m_ctx; }

      PCCERT_CONTEXT operator->() const { return m_ctx; }

   private:
      PCCERT_CONTEXT m_ctx;
};

/**
 * Iterate every certificate returned by a Windows API walk function across
 * a sequence of already-open stores. The walk function is called with the
 * current store and the previously returned context; returning nullptr ends
 * the current store and advances to the next. The final non-null context is
 * owned by this object and freed on destruction or on the terminating walk
 * call that returns nullptr.
 */
class Cert_Enumerator final {
   public:
      using Next_Fn = std::function<PCCERT_CONTEXT(HCERTSTORE, PCCERT_CONTEXT)>;

      Cert_Enumerator(std::span<const HCERTSTORE> stores, Next_Fn fn) : m_stores(stores), m_get_next(std::move(fn)) {}

      Cert_Enumerator(const Cert_Enumerator&) = delete;
      Cert_Enumerator(Cert_Enumerator&&) = delete;
      Cert_Enumerator& operator=(const Cert_Enumerator&) = delete;
      Cert_Enumerator& operator=(Cert_Enumerator&&) = delete;
      ~Cert_Enumerator() = default;

      PCCERT_CONTEXT next() {
         while(m_store_idx < m_stores.size()) {
            if(m_ctx.assign(m_get_next(m_stores[m_store_idx], m_ctx.get()))) {
               return m_ctx.get();
            }
            // The Windows API freed the previous context when it returned
            // nullptr, so m_ctx now holds null and we can start the next
            // store with a null prev.
            ++m_store_idx;
         }
         return nullptr;
      }

   private:
      std::span<const HCERTSTORE> m_stores;
      Next_Fn m_get_next;
      size_t m_store_idx = 0;
      Cert_Context m_ctx;
};

/**
 * A 20-byte SHA-1 hash of a certificate's SubjectPublicKey, suitable for use
 * as a key in an unordered associative container.
 */
class Pubkey_SHA1 final {
   public:
      static constexpr size_t LEN = 20;

      explicit Pubkey_SHA1(std::span<const uint8_t> bytes) {
         BOTAN_ARG_CHECK(bytes.size() == LEN, "invalid SHA-1 pubkey hash length");
         std::copy(bytes.begin(), bytes.end(), m_hash.begin());
      }

      static Pubkey_SHA1 compute(HashFunction& sha1, std::span<const uint8_t> data) {
         Pubkey_SHA1 result;
         sha1.update(data);
         sha1.final(result.m_hash);
         return result;
      }

      auto operator<=>(const Pubkey_SHA1&) const = default;

      size_t hash() const noexcept {
         size_t h = 0;
         std::memcpy(&h, m_hash.data(), sizeof(h));
         return h;
      }

   private:
      Pubkey_SHA1() = default;
      std::array<uint8_t, LEN> m_hash = {};
};

struct Pubkey_SHA1_Hasher {
      size_t operator()(const Pubkey_SHA1& h) const noexcept { return h.hash(); }
};

}  // namespace

/**
 * Pimpl for Certificate_Store_Windows.
 */
class Certificate_Store_Windows_Impl final {
   public:
      // This cache size is arbitrary but probably is sufficient so that the vast
      // majority of accesses hit the cache
      static constexpr size_t SystemStore_CertCacheSize = 128;

      Certificate_Store_Windows_Impl() : m_cert_cache(SystemStore_CertCacheSize) {
         for(const auto* cert_store_name : cert_store_names) {
            auto* store = CertOpenSystemStoreA(0, cert_store_name);
            if(store == nullptr) {
               const auto err = ::GetLastError();
               close_stores();
               throw System_Error(fmt("Failed to open Windows certificate store '{}'", cert_store_name), err);
            }

            CertControlStore(store, 0, CERT_STORE_CTRL_AUTO_RESYNC, nullptr);

            m_stores.push_back(store);
         }
      }

      ~Certificate_Store_Windows_Impl() { close_stores(); }

      Certificate_Store_Windows_Impl(const Certificate_Store_Windows_Impl&) = delete;
      Certificate_Store_Windows_Impl(Certificate_Store_Windows_Impl&&) = delete;
      Certificate_Store_Windows_Impl& operator=(const Certificate_Store_Windows_Impl&) = delete;
      Certificate_Store_Windows_Impl& operator=(Certificate_Store_Windows_Impl&&) = delete;

      std::optional<X509_Certificate> find_cert(const X509_DN& subject_dn, const std::vector<uint8_t>& key_id) {
         const lock_guard_type<mutex_type> lock(m_mutex);

         const auto certs = find_cert_by_dn_and_key_id(subject_dn, key_id, true);
         if(certs.empty()) {
            return std::nullopt;
         }
         return certs.front();
      }

      std::vector<X509_Certificate> find_all_certs(const X509_DN& subject_dn, const std::vector<uint8_t>& key_id) {
         const lock_guard_type<mutex_type> lock(m_mutex);

         return find_cert_by_dn_and_key_id(subject_dn, key_id, false);
      }

      std::optional<X509_Certificate> find_cert_by_pubkey_sha1(const std::vector<uint8_t>& key_hash) {
         if(key_hash.size() != Pubkey_SHA1::LEN) {
            throw Invalid_Argument("Certificate_Store_Windows::find_cert_by_pubkey_sha1 invalid hash");
         }

         const Pubkey_SHA1 target(key_hash);

         const lock_guard_type<mutex_type> lock(m_mutex);

         if(const auto hit = m_sha1_pubkey_to_cert.find(target); hit != m_sha1_pubkey_to_cert.end()) {
            return hit->second;
         }

         // Upper bound the cache, random eviction based on the hashes
         while(m_sha1_pubkey_to_cert.size() >= 1024) {
            m_sha1_pubkey_to_cert.erase(m_sha1_pubkey_to_cert.begin());
         }

         auto sha1 = HashFunction::create_or_throw("SHA-1");

         Cert_Enumerator enumerator(
            m_stores, [](HCERTSTORE store, PCCERT_CONTEXT prev) { return CertEnumCertificatesInStore(store, prev); });

         while(const auto* ctx = enumerator.next()) {
            const auto pubkey_blob = ctx->pCertInfo->SubjectPublicKeyInfo.PublicKey;
            const auto candidate =
               Pubkey_SHA1::compute(*sha1, {static_cast<uint8_t*>(pubkey_blob.pbData), pubkey_blob.cbData});

            if(candidate == target) {
               auto result = materialize(ctx->pbCertEncoded, ctx->cbCertEncoded);
               m_sha1_pubkey_to_cert.emplace(target, result);
               return result;
            }
         }

         // insert a negative query result into the cache
         m_sha1_pubkey_to_cert.emplace(target, std::nullopt);
         return std::nullopt;
      }

      std::optional<X509_Certificate> find_cert_by_issuer_dn_and_serial_number(const X509_DN& issuer_dn,
                                                                               std::span<const uint8_t> serial_number) {
         const lock_guard_type<mutex_type> lock(m_mutex);

         const std::vector<uint8_t> dn_data = issuer_dn.BER_encode();

         const _CRYPTOAPI_BLOB blob{
            .cbData = static_cast<DWORD>(dn_data.size()),
            .pbData = const_cast<BYTE*>(dn_data.data()),
         };

         auto filter = [&](const X509_Certificate& cert) {
            return std::ranges::equal(cert.serial_number(), serial_number);
         };

         const auto certs = search_cert_stores(blob, CERT_FIND_ISSUER_NAME, filter, true);
         if(certs.empty()) {
            return std::nullopt;
         }
         return certs.front();
      }

      bool contains(const X509_Certificate& cert) {
         const auto cert_sha1 = cert.certificate_data_sha1();
         const auto cert_sha256 = cert.certificate_data_sha256();

         const CRYPT_HASH_BLOB sha1_blob{
            .cbData = static_cast<DWORD>(cert_sha1.size()),
            .pbData = const_cast<BYTE*>(cert_sha1.data()),
         };

         const lock_guard_type<mutex_type> lock(m_mutex);

         Cert_Enumerator enumerator(m_stores, [&sha1_blob](HCERTSTORE store, PCCERT_CONTEXT prev) {
            return CertFindCertificateInStore(
               store, X509_ASN_ENCODING | PKCS_7_ASN_ENCODING, 0, CERT_FIND_SHA1_HASH, &sha1_blob, prev);
         });

         while(const auto* ctx = enumerator.next()) {
            const auto found = materialize(ctx->pbCertEncoded, ctx->cbCertEncoded);
            if(std::ranges::equal(found.certificate_data_sha256(), cert_sha256)) {
               return true;
            }
         }

         return false;
      }

      std::vector<X509_DN> all_subjects() {
         const lock_guard_type<mutex_type> lock(m_mutex);

         std::vector<X509_DN> subject_dns;

         Cert_Enumerator enumerator(
            m_stores, [](HCERTSTORE store, PCCERT_CONTEXT prev) { return CertEnumCertificatesInStore(store, prev); });

         while(const auto* ctx = enumerator.next()) {
            BER_Decoder dec(ctx->pCertInfo->Subject.pbData, ctx->pCertInfo->Subject.cbData);
            X509_DN dn;
            dn.decode_from(dec);
            subject_dns.emplace_back(std::move(dn));
         }

         return subject_dns;
      }

   private:
      void close_stores() {
         for(auto* store : m_stores) {
            CertCloseStore(store, 0);
         }
         m_stores.clear();
      }

      X509_Certificate materialize(const BYTE* der, DWORD len) { return m_cert_cache.find_or_insert({der, len}); }

      // Caller must hold m_mutex.
      std::vector<X509_Certificate> find_cert_by_dn_and_key_id(const X509_DN& subject_dn,
                                                               const std::vector<uint8_t>& key_id,
                                                               bool return_on_first_found) {
         _CRYPTOAPI_BLOB blob{};
         DWORD find_type = 0;
         std::vector<uint8_t> dn_data;  // has to live until search completes

         // if key_id is available, prefer searching that, as it should be "more unique" than the subject DN
         if(key_id.empty()) {
            find_type = CERT_FIND_SUBJECT_NAME;
            dn_data = subject_dn.DER_encode();
            blob.cbData = static_cast<DWORD>(dn_data.size());
            blob.pbData = reinterpret_cast<BYTE*>(dn_data.data());
         } else {
            find_type = CERT_FIND_KEY_IDENTIFIER;
            blob.cbData = static_cast<DWORD>(key_id.size());
            blob.pbData = const_cast<BYTE*>(key_id.data());
         }

         auto filter = [&](const X509_Certificate& cert) { return key_id.empty() || cert.subject_dn() == subject_dn; };

         return search_cert_stores(blob, find_type, filter, return_on_first_found);
      }

      // Caller must hold m_mutex.
      std::vector<X509_Certificate> search_cert_stores(const _CRYPTOAPI_BLOB& blob,
                                                       DWORD find_type,
                                                       const std::function<bool(const X509_Certificate&)>& filter,
                                                       bool return_on_first_found) {
         std::vector<X509_Certificate> certs;
         std::unordered_set<X509_Certificate::Tag, X509_Certificate::TagHash> seen;

         Cert_Enumerator enumerator(m_stores, [&blob, find_type](HCERTSTORE store, PCCERT_CONTEXT prev) {
            return CertFindCertificateInStore(
               store, X509_ASN_ENCODING | PKCS_7_ASN_ENCODING, 0, find_type, &blob, prev);
         });

         while(const auto* ctx = enumerator.next()) {
            auto cert = materialize(ctx->pbCertEncoded, ctx->cbCertEncoded);
            if(!seen.insert(cert.tag()).second) {
               continue;
            }
            if(filter(cert)) {
               certs.push_back(std::move(cert));
               if(return_on_first_found) {
                  break;
               }
            }
         }

         return certs;
      }

      mutex_type m_mutex;
      std::vector<HCERTSTORE> m_stores;
      std::unordered_map<Pubkey_SHA1, std::optional<X509_Certificate>, Pubkey_SHA1_Hasher> m_sha1_pubkey_to_cert;
      X509_Certificate_Cache m_cert_cache;
};

Certificate_Store_Windows::Certificate_Store_Windows() : m_impl(std::make_shared<Certificate_Store_Windows_Impl>()) {}

std::vector<X509_DN> Certificate_Store_Windows::all_subjects() const {
   return m_impl->all_subjects();
}

std::optional<X509_Certificate> Certificate_Store_Windows::find_cert(const X509_DN& subject_dn,
                                                                     const std::vector<uint8_t>& key_id) const {
   return m_impl->find_cert(subject_dn, key_id);
}

std::vector<X509_Certificate> Certificate_Store_Windows::find_all_certs(const X509_DN& subject_dn,
                                                                        const std::vector<uint8_t>& key_id) const {
   return m_impl->find_all_certs(subject_dn, key_id);
}

std::optional<X509_Certificate> Certificate_Store_Windows::find_cert_by_pubkey_sha1(
   const std::vector<uint8_t>& key_hash) const {
   return m_impl->find_cert_by_pubkey_sha1(key_hash);
}

std::optional<X509_Certificate> Certificate_Store_Windows::find_cert_by_raw_subject_dn_sha256(
   const std::vector<uint8_t>& subject_hash) const {
   BOTAN_UNUSED(subject_hash);
   throw Not_Implemented("Certificate_Store_Windows::find_cert_by_raw_subject_dn_sha256");
}

std::optional<X509_Certificate> Certificate_Store_Windows::find_cert_by_issuer_dn_and_serial_number(
   const X509_DN& issuer_dn, std::span<const uint8_t> serial_number) const {
   return m_impl->find_cert_by_issuer_dn_and_serial_number(issuer_dn, serial_number);
}

std::optional<X509_CRL> Certificate_Store_Windows::find_crl_for(const X509_Certificate& subject) const {
   // TODO: this could be implemented by using the CertFindCRLInStore function
   BOTAN_UNUSED(subject);
   return std::nullopt;
}

bool Certificate_Store_Windows::contains(const X509_Certificate& cert) const {
   return m_impl->contains(cert);
}

}  // namespace Botan
