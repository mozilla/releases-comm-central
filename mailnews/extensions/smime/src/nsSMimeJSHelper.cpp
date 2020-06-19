/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/mailnews/MimeHeaderParser.h"
#include "nspr.h"
#include "nsSMimeJSHelper.h"
#include "nsMsgComposeSecure.h"
#include "nsMsgCompCID.h"
#include "nsCOMPtr.h"
#include "nsMemory.h"
#include "nsString.h"
#include "nsIX509CertDB.h"
#include "nsIX509CertValidity.h"
#include "nsServiceManagerUtils.h"
#include "nsCRTGlue.h"

using namespace mozilla::mailnews;

NS_IMPL_ISUPPORTS(nsSMimeJSHelper, nsISMimeJSHelper)

nsSMimeJSHelper::nsSMimeJSHelper() {}

nsSMimeJSHelper::~nsSMimeJSHelper() {}

NS_IMETHODIMP nsSMimeJSHelper::GetRecipientCertsInfo(
    nsIMsgCompFields* compFields, nsTArray<nsString>& emailAddresses,
    nsTArray<nsString>& certIssuedInfos, nsTArray<nsString>& certExpiresInfos,
    nsTArray<RefPtr<nsIX509Cert>>& certs, bool* canEncrypt) {
  NS_ENSURE_ARG_POINTER(canEncrypt);

  nsTArray<nsCString> mailboxes;
  nsresult rv = getMailboxList(compFields, mailboxes);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t mailbox_count = mailboxes.Length();

  emailAddresses.ClearAndRetainStorage();
  certIssuedInfos.ClearAndRetainStorage();
  certExpiresInfos.ClearAndRetainStorage();
  certs.ClearAndRetainStorage();
  emailAddresses.SetCapacity(mailbox_count);
  certIssuedInfos.SetCapacity(mailbox_count);
  certExpiresInfos.SetCapacity(mailbox_count);
  certs.SetCapacity(mailbox_count);

  nsCOMPtr<nsIX509CertDB> certdb = do_GetService(NS_X509CERTDB_CONTRACTID);

  *canEncrypt = true;
  rv = NS_OK;

  nsCOMPtr<nsIMsgComposeSecure> composeSecure =
      do_CreateInstance(NS_MSGCOMPOSESECURE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < mailbox_count; ++i) {
    const nsCString& email = mailboxes[i];
    nsCOMPtr<nsIX509Cert> cert;
    nsString certIssuedInfo;
    nsString certExpiresInfo;

    nsCString email_lowercase;
    ToLowerCase(email, email_lowercase);

    if (NS_SUCCEEDED(composeSecure->FindCertByEmailAddress(
            email_lowercase, false, getter_AddRefs(cert)))) {
      nsCOMPtr<nsIX509CertValidity> validity;
      rv = cert->GetValidity(getter_AddRefs(validity));
      if (NS_SUCCEEDED(rv)) {
        validity->GetNotBeforeLocalDay(certIssuedInfo);
        validity->GetNotAfterLocalDay(certExpiresInfo);
      }
    } else {
      *canEncrypt = false;
    }
    emailAddresses.AppendElement(NS_ConvertUTF8toUTF16(email));
    certIssuedInfos.AppendElement(certIssuedInfo);
    certExpiresInfos.AppendElement(certExpiresInfo);
    certs.AppendElement(cert);
  }
  return NS_OK;
}

NS_IMETHODIMP nsSMimeJSHelper::GetNoCertAddresses(
    nsIMsgCompFields* compFields, nsTArray<nsString>& emailAddresses) {
  NS_ENSURE_ARG_POINTER(compFields);
  emailAddresses.ClearAndRetainStorage();

  nsTArray<nsCString> mailboxes;
  nsresult rv = getMailboxList(compFields, mailboxes);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t mailbox_count = mailboxes.Length();

  if (!mailbox_count) {
    return NS_OK;
  }

  emailAddresses.SetCapacity(mailbox_count);

  nsCOMPtr<nsIMsgComposeSecure> composeSecure =
      do_CreateInstance(NS_MSGCOMPOSESECURE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < mailbox_count; ++i) {
    nsCString email_lowercase;
    ToLowerCase(mailboxes[i], email_lowercase);

    nsCOMPtr<nsIX509Cert> cert;
    if (NS_FAILED(composeSecure->FindCertByEmailAddress(
            email_lowercase, true, getter_AddRefs(cert)))) {
      // No cert found for this address.
      emailAddresses.AppendElement(NS_ConvertUTF8toUTF16(mailboxes[i]));
    }
  }

  return NS_OK;
}

nsresult nsSMimeJSHelper::getMailboxList(nsIMsgCompFields* compFields,
                                         nsTArray<nsCString>& mailboxes) {
  if (!compFields) return NS_ERROR_INVALID_ARG;

  nsresult res;
  nsString to, cc, bcc, ng;

  res = compFields->GetTo(to);
  if (NS_FAILED(res)) return res;

  res = compFields->GetCc(cc);
  if (NS_FAILED(res)) return res;

  res = compFields->GetBcc(bcc);
  if (NS_FAILED(res)) return res;

  res = compFields->GetNewsgroups(ng);
  if (NS_FAILED(res)) return res;

  {
    nsCString all_recipients;

    if (!to.IsEmpty()) {
      all_recipients.Append(NS_ConvertUTF16toUTF8(to));
      all_recipients.Append(',');
    }

    if (!cc.IsEmpty()) {
      all_recipients.Append(NS_ConvertUTF16toUTF8(cc));
      all_recipients.Append(',');
    }

    if (!bcc.IsEmpty()) {
      all_recipients.Append(NS_ConvertUTF16toUTF8(bcc));
      all_recipients.Append(',');
    }

    if (!ng.IsEmpty()) all_recipients.Append(NS_ConvertUTF16toUTF8(ng));

    ExtractEmails(EncodedHeader(all_recipients),
                  UTF16ArrayAdapter<>(mailboxes));
  }

  return NS_OK;
}
