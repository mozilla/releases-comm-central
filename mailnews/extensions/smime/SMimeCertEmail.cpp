/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SMimeCertEmail.h"

#include "ScopedNSSTypes.h"
#include "cert.h"
#include "mozilla/ScopeExit.h"
#include "nsIX509Cert.h"
#include "nsString.h"
#include "nsTArray.h"
#include "secasn1t.h"
#include "secerr.h"

namespace mozilla::mailnews {

static void AppendItem(const SECItem& item, nsTArray<nsCString>& addresses) {
  if (item.len) {
    addresses.AppendElement(nsDependentCSubstring(
        reinterpret_cast<const char*>(item.data), item.len));
  }
}

static void AppendSubjectAltNameAddresses(SECItem& altNameExtension,
                                          nsTArray<nsCString>& addresses) {
  UniquePLArenaPool arena(PORT_NewArena(DER_DEFAULT_CHUNKSIZE));
  if (!arena) {
    return;
  }
  CERTGeneralName* first =
      CERT_DecodeAltNameExtension(arena.get(), &altNameExtension);
  if (!first) {
    return;
  }
  CERTGeneralName* current = first;
  do {
    if (current->type == certRFC822Name) {
      AppendItem(current->name.other, addresses);
    }
    current = CERT_GetNextGeneralName(current);
  } while (current && current != first);
}

static void AppendSubjectAddresses(const CERTName& subject,
                                   nsTArray<nsCString>& addresses) {
  if (!subject.rdns) {
    return;
  }
  for (CERTRDN** rdn = subject.rdns; *rdn; ++rdn) {
    if (!(*rdn)->avas) {
      continue;
    }
    for (CERTAVA** ava = (*rdn)->avas; *ava; ++ava) {
      if (CERT_GetAVATag(*ava) != SEC_OID_PKCS9_EMAIL_ADDRESS ||
          (*ava)->value.len == 0 ||
          (*ava)->value.data[0] != SEC_ASN1_IA5_STRING) {
        continue;
      }
      UniqueSECItem value(CERT_DecodeAVAValue(&(*ava)->value));
      if (value) {
        AppendItem(*value, addresses);
      }
    }
  }
}

void GetSMimeCertEmailAddresses(CERTCertificate* cert,
                                nsTArray<nsCString>& addresses) {
  addresses.Clear();
  if (!cert) {
    return;
  }

  SECItem altNameExtension = {siBuffer, nullptr, 0};
  if (CERT_FindCertExtension(cert, SEC_OID_X509_SUBJECT_ALT_NAME,
                             &altNameExtension) == SECSuccess) {
    auto freeExtension =
        MakeScopeExit([&] { SECITEM_FreeItem(&altNameExtension, PR_FALSE); });
    AppendSubjectAltNameAddresses(altNameExtension, addresses);
    return;
  }
  if (PORT_GetError() == SEC_ERROR_EXTENSION_NOT_FOUND) {
    AppendSubjectAddresses(cert->subject, addresses);
  }
}

bool SMimeCertHasEmailAddress(CERTCertificate* cert, const nsACString& email) {
  if (email.IsEmpty()) {
    return false;
  }
  nsTArray<nsCString> addresses;
  GetSMimeCertEmailAddresses(cert, addresses);
  for (const nsCString& address : addresses) {
    if (address.Equals(email, nsCaseInsensitiveCStringComparator)) {
      return true;
    }
  }
  return false;
}

bool SMimeCertHasEmailAddress(nsIX509Cert* cert, const nsACString& email) {
  if (!cert) {
    return false;
  }
  UniqueCERTCertificate nssCert(cert->GetCert());
  return SMimeCertHasEmailAddress(nssCert.get(), email);
}

}  // namespace mozilla::mailnews
