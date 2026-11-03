/*
 * TLS 1.3 Preshared Key Container
 * (C) 2023 Jack Lloyd
 *     2023 Fabian Albert, René Meusel - Rohde & Schwarz Cybersecurity
 *
 * Botan is released under the Simplified BSD License (see license.txt)
 */

#ifndef BOTAN_TLS_EXTERNAL_PSK_H_
#define BOTAN_TLS_EXTERNAL_PSK_H_

#include <botan/secmem.h>
#include <string>
#include <string_view>

namespace Botan::TLS {

/**
 * This is an externally provided PreSharedKey along with its identity, master
 * secret and (in case of TLS 1.3) a pre-provisioned Pseudo Random Function.
 */
class BOTAN_PUBLIC_API(3, 2) ExternalPSK final {
   public:
      ExternalPSK(const ExternalPSK&) = delete;
      ExternalPSK& operator=(const ExternalPSK&) = delete;
      ExternalPSK(ExternalPSK&&) = default;
      ExternalPSK& operator=(ExternalPSK&&) = default;
      ~ExternalPSK() = default;

      ExternalPSK(std::string_view identity, std::string_view prf_algo, secure_vector<uint8_t> psk) :
            m_identity(identity), m_prf_algo(prf_algo), m_master_secret(std::move(psk)), m_is_imported(false) {}

      ExternalPSK(std::string_view identity, std::string_view prf_algo, secure_vector<uint8_t> psk, bool imported) :
            m_identity(identity), m_prf_algo(prf_algo), m_master_secret(std::move(psk)), m_is_imported(imported) {}

      /**
       * Identity (e.g. username of the PSK owner) of the preshared key.
       * Despite the std::string return type, this may or may not be a
       * human-readable/printable string.
       */
      const std::string& identity() const { return m_identity; }

      /**
       * Returns the master secret by moving it out of this object. Do not call
       * this method more than once.
       */
      secure_vector<uint8_t> extract_master_secret();

      /**
       * External preshared keys in TLS 1.3 must be provisioned with a
       * pseudo-random function (typically SHA-256 or the like). This is
       * needed to calculate/verify the PSK binder values in the client hello.
       */
      const std::string& prf_algo() const { return m_prf_algo; }

      /**
       * Returns true if this PSK was derived using the PSK importer
       * mechanism from RFC 9258. Imported PSKs use the "imp binder"
       * label for binder computation instead of "ext binder".
       */
      bool is_imported() const { return m_is_imported; }

   private:
      std::string m_identity;
      std::string m_prf_algo;
      secure_vector<uint8_t> m_master_secret;
      bool m_is_imported;
};

}  // namespace Botan::TLS

#endif
