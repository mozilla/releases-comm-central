/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_EXTENSIONS_SMIME_SMIMECERTEMAIL_H_
#define COMM_MAILNEWS_EXTENSIONS_SMIME_SMIMECERTEMAIL_H_

#include "nsStringFwd.h"
#include "nsTArrayForwardDeclare.h"

class nsIX509Cert;
typedef struct CERTCertificateStr CERTCertificate;

namespace mozilla::mailnews {

/**
 * Gets the certificate's e-mail addresses that mozilla::pkix checks against
 * rfc822Name name constraints: the rfc822Name entries of the subjectAltName
 * extension or, only when there is no subjectAltName extension, the PKCS #9
 * emailAddress attributes of the subject. Other addresses NSS reports for the
 * certificate (RFC 1274 mail attributes, addresses inside directoryName
 * entries, or subject addresses of a certificate that has a subjectAltName)
 * are not covered by the name constraints of the issuing CAs, so they must not
 * be treated as the certificate's identity.
 */
void GetSMimeCertEmailAddresses(CERTCertificate* cert,
                                nsTArray<nsCString>& addresses);
bool SMimeCertHasEmailAddress(CERTCertificate* cert, const nsACString& email);
bool SMimeCertHasEmailAddress(nsIX509Cert* cert, const nsACString& email);

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_EXTENSIONS_SMIME_SMIMECERTEMAIL_H_
