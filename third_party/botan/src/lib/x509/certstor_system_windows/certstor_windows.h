/*
* Certificate Store
* (C) 1999-2019 Jack Lloyd
* (C) 2019      Patrick Schmidt
* (C) 2021      René Meusel
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#ifndef BOTAN_CERT_STORE_SYSTEM_WINDOWS_H_
#define BOTAN_CERT_STORE_SYSTEM_WINDOWS_H_

#include <botan/certstor.h>
#include <memory>

// Use Certificate_Store_System instead
BOTAN_FUTURE_INTERNAL_HEADER(certstor_windows.h)

namespace Botan {

class Certificate_Store_Windows_Impl;

/**
* Certificate Store that is backed by the system trust store on Windows.
*/
class BOTAN_PUBLIC_API(2, 11) Certificate_Store_Windows final : public Certificate_Store {
   public:
      Certificate_Store_Windows();

      Certificate_Store_Windows(const Certificate_Store_Windows&) = default;
      Certificate_Store_Windows(Certificate_Store_Windows&&) = default;
      Certificate_Store_Windows& operator=(const Certificate_Store_Windows&) = default;
      Certificate_Store_Windows& operator=(Certificate_Store_Windows&&) = default;

      /**
      * @return DNs for all certificates managed by the store
      */
      std::vector<X509_DN> all_subjects() const override;

      /**
      * Find a certificate by Subject DN and (optionally) key identifier
      * @return the first certificate that matches
      */
      std::optional<X509_Certificate> find_cert(const X509_DN& subject_dn,
                                                const std::vector<uint8_t>& key_id) const override;

      /**
      * Find all certificates with a given Subject DN.
      * Subject DN and even the key identifier might not be unique.
      */
      std::vector<X509_Certificate> find_all_certs(const X509_DN& subject_dn,
                                                   const std::vector<uint8_t>& key_id) const override;

      /**
      * Find a certificate by searching for one with a matching SHA-1 hash of
      * public key.
      * @return a matching certificate or nullptr otherwise
      */
      std::optional<X509_Certificate> find_cert_by_pubkey_sha1(const std::vector<uint8_t>& key_hash) const override;

      /**
       * @throws Not_Implemented as this is not possible in the Windows system cert API
       */
      std::optional<X509_Certificate> find_cert_by_raw_subject_dn_sha256(
         const std::vector<uint8_t>& subject_hash) const override;

      std::optional<X509_Certificate> find_cert_by_issuer_dn_and_serial_number(
         const X509_DN& issuer_dn, std::span<const uint8_t> serial_number) const override;

      /**
       * Not Yet Implemented
       * @return nullptr;
       */
      std::optional<X509_CRL> find_crl_for(const X509_Certificate& subject) const override;

      bool contains(const X509_Certificate& cert) const override;

   private:
      std::shared_ptr<Certificate_Store_Windows_Impl> m_impl;
};

}  // namespace Botan

#endif
