/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/mailnews/MimeHeaderParser.h"
#include "nspr.h"
#include "nsSMimeJSHelper.h"
#include "nsCOMPtr.h"
#include "nsMemory.h"
#include "nsStringGlue.h"
#include "nsIX509CertDB.h"
#include "nsIX509CertValidity.h"
#include "nsIServiceManager.h"
#include "nsServiceManagerUtils.h"
#include "nsCRTGlue.h"

using namespace mozilla::mailnews;

NS_IMPL_ISUPPORTS(nsSMimeJSHelper, nsISMimeJSHelper)

nsSMimeJSHelper::nsSMimeJSHelper()
{
}

nsSMimeJSHelper::~nsSMimeJSHelper()
{
}

NS_IMETHODIMP nsSMimeJSHelper::GetRecipientCertsInfo(
    nsIMsgCompFields *compFields,
    uint32_t *count,
    char16_t ***emailAddresses,
    int32_t **certVerification,
    char16_t ***certIssuedInfos,
    char16_t ***certExpiresInfos,
    nsIX509Cert ***certs,
    bool *canEncrypt)
{
  NS_ENSURE_ARG_POINTER(count);
  *count = 0;

  NS_ENSURE_ARG_POINTER(emailAddresses);
  NS_ENSURE_ARG_POINTER(certVerification);
  NS_ENSURE_ARG_POINTER(certIssuedInfos);
  NS_ENSURE_ARG_POINTER(certExpiresInfos);
  NS_ENSURE_ARG_POINTER(certs);
  NS_ENSURE_ARG_POINTER(canEncrypt);

  NS_ENSURE_ARG_POINTER(compFields);

  nsTArray<nsCString> mailboxes;
  nsresult rv = getMailboxList(compFields, mailboxes);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t mailbox_count = mailboxes.Length();

  nsCOMPtr<nsIX509CertDB> certdb = do_GetService(NS_X509CERTDB_CONTRACTID);

  *count = mailbox_count;
  *canEncrypt = false;
  rv = NS_OK;

  if (mailbox_count)
  {
    char16_t **outEA = static_cast<char16_t **>(moz_xmalloc(mailbox_count * sizeof(char16_t *)));
    int32_t *outCV = static_cast<int32_t *>(moz_xmalloc(mailbox_count * sizeof(int32_t)));
    char16_t **outCII = static_cast<char16_t **>(moz_xmalloc(mailbox_count * sizeof(char16_t *)));
    char16_t **outCEI = static_cast<char16_t **>(moz_xmalloc(mailbox_count * sizeof(char16_t *)));
    nsIX509Cert **outCerts = static_cast<nsIX509Cert **>(moz_xmalloc(mailbox_count * sizeof(nsIX509Cert *)));

    if (!outEA || !outCV || !outCII || !outCEI || !outCerts)
    {
      free(outEA);
      free(outCV);
      free(outCII);
      free(outCEI);
      free(outCerts);
      rv = NS_ERROR_OUT_OF_MEMORY;
    }
    else
    {
      char16_t **iEA = outEA;
      int32_t *iCV = outCV;
      char16_t **iCII = outCII;
      char16_t **iCEI = outCEI;
      nsIX509Cert **iCert = outCerts;

      bool found_blocker = false;
      bool memory_failure = false;

      for (uint32_t i = 0;
          i < mailbox_count;
          ++i, ++iEA, ++iCV, ++iCII, ++iCEI, ++iCert)
      {
        *iCert = nullptr;
        *iCV = 0;
        *iCII = nullptr;
        *iCEI = nullptr;

        if (memory_failure) {
          *iEA = nullptr;
          continue;
        }

        nsCString &email = mailboxes[i];
        *iEA = ToNewUnicode(NS_ConvertUTF8toUTF16(email));
        if (!*iEA) {
          memory_failure = true;
          continue;
        }

        nsCString email_lowercase;
        ToLowerCase(email, email_lowercase);

        nsCOMPtr<nsIX509Cert> cert;
        if (NS_SUCCEEDED(certdb->FindCertByEmailAddress(nullptr,
                           email_lowercase.get(), getter_AddRefs(cert))))
        {
          *iCert = cert;
          NS_ADDREF(*iCert);

          nsCOMPtr<nsIX509CertValidity> validity;
          rv = cert->GetValidity(getter_AddRefs(validity));

          if (NS_SUCCEEDED(rv)) {
            nsString id, ed;

            if (NS_SUCCEEDED(validity->GetNotBeforeLocalDay(id)))
            {
              *iCII = ToNewUnicode(id);
              if (!*iCII) {
                memory_failure = true;
                continue;
              }
            }

            if (NS_SUCCEEDED(validity->GetNotAfterLocalDay(ed)))
            {
              *iCEI = ToNewUnicode(ed);
              if (!*iCEI) {
                memory_failure = true;
                continue;
              }
            }
          }
        }
        else
        {
          found_blocker = true;
        }
      }

      if (memory_failure) {
        NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(mailbox_count, outEA);
        NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(mailbox_count, outCII);
        NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(mailbox_count, outCEI);
        NS_FREE_XPCOM_ISUPPORTS_POINTER_ARRAY(mailbox_count, outCerts);
        free(outCV);
        rv = NS_ERROR_OUT_OF_MEMORY;
      }
      else {
        if (mailbox_count > 0 && !found_blocker)
        {
          *canEncrypt = true;
        }

        *emailAddresses = outEA;
        *certVerification = outCV;
        *certIssuedInfos = outCII;
        *certExpiresInfos = outCEI;
        *certs = outCerts;
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsSMimeJSHelper::GetNoCertAddresses(
    nsIMsgCompFields *compFields,
    uint32_t *count,
    char16_t ***emailAddresses)
{
  NS_ENSURE_ARG_POINTER(count);
  *count = 0;

  NS_ENSURE_ARG_POINTER(emailAddresses);

  NS_ENSURE_ARG_POINTER(compFields);

  nsTArray<nsCString> mailboxes;
  nsresult rv = getMailboxList(compFields, mailboxes);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t mailbox_count = mailboxes.Length();

  if (!mailbox_count)
  {
    *count = 0;
    *emailAddresses = nullptr;
    return NS_OK;
  }

  nsCOMPtr<nsIX509CertDB> certdb = do_GetService(NS_X509CERTDB_CONTRACTID);

  uint32_t missing_count = 0;
  bool *haveCert = new bool[mailbox_count];
  if (!haveCert)
  {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  rv = NS_OK;

  if (mailbox_count)
  {
    for (uint32_t i = 0; i < mailbox_count; ++i)
    {
      haveCert[i] = false;

      nsCString email_lowercase;
      ToLowerCase(mailboxes[i], email_lowercase);

      nsCOMPtr<nsIX509Cert> cert;
      if (NS_SUCCEEDED(certdb->FindCertByEmailAddress(nullptr,
                         email_lowercase.get(), getter_AddRefs(cert))))
        haveCert[i] = true;

      if (!haveCert[i])
        ++missing_count;
    }
  }

  *count = missing_count;

  if (missing_count)
  {
    char16_t **outEA = static_cast<char16_t **>(moz_xmalloc(missing_count * sizeof(char16_t *)));
    if (!outEA )
    {
      rv = NS_ERROR_OUT_OF_MEMORY;
    }
    else
    {
      char16_t **iEA = outEA;

      bool memory_failure = false;

      for (uint32_t i = 0; i < mailbox_count; ++i)
      {
        if (!haveCert[i])
        {
          if (memory_failure) {
            *iEA = nullptr;
          }
          else {
            *iEA = ToNewUnicode(NS_ConvertUTF8toUTF16(mailboxes[i]));
            if (!*iEA) {
              memory_failure = true;
            }
          }
          ++iEA;
        }
      }

      if (memory_failure) {
        NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(missing_count, outEA);
        rv = NS_ERROR_OUT_OF_MEMORY;
      }
      else {
        *emailAddresses = outEA;
      }
    }
  }
  else
  {
    *emailAddresses = nullptr;
  }

  delete [] haveCert;
  return rv;
}

nsresult nsSMimeJSHelper::getMailboxList(nsIMsgCompFields *compFields,
    nsTArray<nsCString> &mailboxes)
{
  if (!compFields)
    return NS_ERROR_INVALID_ARG;

  nsresult res;
  nsString to, cc, bcc, ng;

  res = compFields->GetTo(to);
  if (NS_FAILED(res))
    return res;

  res = compFields->GetCc(cc);
  if (NS_FAILED(res))
    return res;

  res = compFields->GetBcc(bcc);
  if (NS_FAILED(res))
    return res;

  res = compFields->GetNewsgroups(ng);
  if (NS_FAILED(res))
    return res;

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

    if (!ng.IsEmpty())
      all_recipients.Append(NS_ConvertUTF16toUTF8(ng));

    ExtractEmails(EncodedHeader(all_recipients),
      UTF16ArrayAdapter<>(mailboxes));
  }

  return NS_OK;
}
