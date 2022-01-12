/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCertPicker.h"

#include "MainThreadUtils.h"
#include "ScopedNSSTypes.h"
#include "cert.h"
#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsICertPickDialogs.h"
#include "nsIDialogParamBlock.h"
#include "nsIInterfaceRequestor.h"
#include "nsIX509CertValidity.h"
#include "nsMemory.h"
#include "nsMsgComposeSecure.h"
#include "nsNSSCertificate.h"
#include "nsNSSComponent.h"
#include "nsNSSDialogHelper.h"
#include "nsNSSHelper.h"
#include "nsNSSCertHelper.h"
#include "nsReadableUtils.h"
#include "nsComponentManagerUtils.h"  // for do_CreateInstance
#include "nsString.h"
#include "mozpkix/pkixtypes.h"

using namespace mozilla;

MOZ_TYPE_SPECIFIC_UNIQUE_PTR_TEMPLATE(UniqueCERTCertNicknames,
                                      CERTCertNicknames, CERT_FreeNicknames)

CERTCertNicknames* getNSSCertNicknamesFromCertList(
    const UniqueCERTCertList& certList) {
  nsAutoString expiredString, notYetValidString;
  nsAutoString expiredStringLeadingSpace, notYetValidStringLeadingSpace;

  GetPIPNSSBundleString("NicknameExpired", expiredString);
  GetPIPNSSBundleString("NicknameNotYetValid", notYetValidString);

  expiredStringLeadingSpace.Append(' ');
  expiredStringLeadingSpace.Append(expiredString);

  notYetValidStringLeadingSpace.Append(' ');
  notYetValidStringLeadingSpace.Append(notYetValidString);

  NS_ConvertUTF16toUTF8 aUtf8ExpiredString(expiredStringLeadingSpace);
  NS_ConvertUTF16toUTF8 aUtf8NotYetValidString(notYetValidStringLeadingSpace);

  return CERT_NicknameStringsFromCertList(
      certList.get(), const_cast<char*>(aUtf8ExpiredString.get()),
      const_cast<char*>(aUtf8NotYetValidString.get()));
}

nsresult FormatUIStrings(nsIX509Cert* cert, const nsAutoString& nickname,
                         nsAutoString& nickWithSerial, nsAutoString& details) {
  if (!NS_IsMainThread()) {
    NS_ERROR("nsNSSCertificate::FormatUIStrings called off the main thread");
    return NS_ERROR_NOT_SAME_THREAD;
  }

  RefPtr<nsMsgComposeSecure> mcs = new nsMsgComposeSecure;
  if (!mcs) {
    return NS_ERROR_FAILURE;
  }

  nsAutoString info;
  nsAutoString temp1;

  nickWithSerial.Append(nickname);

  if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertInfoIssuedFor", info))) {
    details.Append(info);
    details.Append(char16_t(' '));
    if (NS_SUCCEEDED(cert->GetSubjectName(temp1)) && !temp1.IsEmpty()) {
      details.Append(temp1);
    }
    details.Append(char16_t('\n'));
  }

  if (NS_SUCCEEDED(cert->GetSerialNumber(temp1)) && !temp1.IsEmpty()) {
    details.AppendLiteral("  ");
    if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertDumpSerialNo", info))) {
      details.Append(info);
      details.AppendLiteral(": ");
    }
    details.Append(temp1);

    nickWithSerial.AppendLiteral(" [");
    nickWithSerial.Append(temp1);
    nickWithSerial.Append(char16_t(']'));

    details.Append(char16_t('\n'));
  }

  nsCOMPtr<nsIX509CertValidity> validity;
  nsresult rv = cert->GetValidity(getter_AddRefs(validity));
  if (NS_SUCCEEDED(rv) && validity) {
    details.AppendLiteral("  ");
    if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertInfoValid", info))) {
      details.Append(info);
    }

    if (NS_SUCCEEDED(validity->GetNotBeforeLocalTime(temp1)) &&
        !temp1.IsEmpty()) {
      details.Append(char16_t(' '));
      if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertInfoFrom", info))) {
        details.Append(info);
        details.Append(char16_t(' '));
      }
      details.Append(temp1);
    }

    if (NS_SUCCEEDED(validity->GetNotAfterLocalTime(temp1)) &&
        !temp1.IsEmpty()) {
      details.Append(char16_t(' '));
      if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertInfoTo", info))) {
        details.Append(info);
        details.Append(char16_t(' '));
      }
      details.Append(temp1);
    }

    details.Append(char16_t('\n'));
  }

  UniqueCERTCertificate nssCert(cert->GetCert());
  if (!nssCert) {
    return NS_ERROR_FAILURE;
  }

  nsAutoString firstEmail;
  const char* aWalkAddr;
  for (aWalkAddr = CERT_GetFirstEmailAddress(nssCert.get()); aWalkAddr;
       aWalkAddr = CERT_GetNextEmailAddress(nssCert.get(), aWalkAddr)) {
    NS_ConvertUTF8toUTF16 email(aWalkAddr);
    if (email.IsEmpty()) continue;

    if (firstEmail.IsEmpty()) {
      // If the first email address from the subject DN is also present
      // in the subjectAltName extension, GetEmailAddresses() will return
      // it twice (as received from NSS). Remember the first address so that
      // we can filter out duplicates later on.
      firstEmail = email;

      details.AppendLiteral("  ");
      if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertInfoEmail", info))) {
        details.Append(info);
        details.AppendLiteral(": ");
      }
      details.Append(email);
    } else {
      // Append current address if it's different from the first one.
      if (!firstEmail.Equals(email)) {
        details.AppendLiteral(", ");
        details.Append(email);
      }
    }
  }

  if (!firstEmail.IsEmpty()) {
    // We got at least one email address, so we want a newline
    details.Append(char16_t('\n'));
  }

  if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertInfoIssuedBy", info))) {
    details.Append(info);
    details.Append(char16_t(' '));

    if (NS_SUCCEEDED(cert->GetIssuerName(temp1)) && !temp1.IsEmpty()) {
      details.Append(temp1);
    }

    details.Append(char16_t('\n'));
  }

  if (NS_SUCCEEDED(mcs->GetSMIMEBundleString(u"CertInfoStoredIn", info))) {
    details.Append(info);
    details.Append(char16_t(' '));

    if (NS_SUCCEEDED(cert->GetTokenName(temp1)) && !temp1.IsEmpty()) {
      details.Append(temp1);
    }
  }

  // the above produces the following output:
  //
  //   Issued to: $subjectName
  //   Serial number: $serialNumber
  //   Valid from: $starting_date to $expiration_date
  //   Certificate Key usage: $usages
  //   Email: $address(es)
  //   Issued by: $issuerName
  //   Stored in: $token

  return rv;
}

NS_IMPL_ISUPPORTS(nsCertPicker, nsICertPickDialogs, nsIUserCertPicker)

nsCertPicker::nsCertPicker() {}

nsCertPicker::~nsCertPicker() {}

nsresult nsCertPicker::Init() {
  nsresult rv;
  nsCOMPtr<nsISupports> psm = do_GetService("@mozilla.org/psm;1", &rv);
  return rv;
}

NS_IMETHODIMP
nsCertPicker::PickCertificate(nsIInterfaceRequestor* ctx,
                              const nsTArray<nsString>& certNickList,
                              const nsTArray<nsString>& certDetailsList,
                              int32_t* selectedIndex, bool* canceled) {
  nsresult rv;
  uint32_t i;
  MOZ_ASSERT(certNickList.Length() == certDetailsList.Length());
  const uint32_t count = certNickList.Length();

  *canceled = false;

  nsCOMPtr<nsIDialogParamBlock> block =
      do_CreateInstance(NS_DIALOGPARAMBLOCK_CONTRACTID);
  if (!block) return NS_ERROR_FAILURE;

  block->SetNumberStrings(1 + count * 2);

  for (i = 0; i < count; i++) {
    rv = block->SetString(i, ToNewUnicode(certNickList[i]));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  for (i = 0; i < count; i++) {
    rv = block->SetString(i + count, ToNewUnicode(certDetailsList[i]));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = block->SetInt(0, count);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = block->SetInt(1, *selectedIndex);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = nsNSSDialogHelper::openDialog(
      nullptr, "chrome://messenger/content/certpicker.xhtml", block);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t status;

  rv = block->GetInt(0, &status);
  NS_ENSURE_SUCCESS(rv, rv);

  *canceled = (status == 0) ? true : false;
  if (!*canceled) {
    rv = block->GetInt(1, selectedIndex);
  }
  return rv;
}

NS_IMETHODIMP nsCertPicker::PickByUsage(nsIInterfaceRequestor* ctx,
                                        const char16_t* selectedNickname,
                                        int32_t certUsage, bool allowInvalid,
                                        bool allowDuplicateNicknames,
                                        const nsAString& emailAddress,
                                        bool* canceled, nsIX509Cert** _retval) {
  int32_t selectedIndex = -1;
  bool selectionFound = false;
  CERTCertListNode* node = nullptr;
  nsresult rv = NS_OK;

  {
    // Iterate over all certs. This assures that user is logged in to all
    // hardware tokens.
    nsCOMPtr<nsIInterfaceRequestor> ctx = new PipUIContext();
    UniqueCERTCertList allcerts(PK11_ListCerts(PK11CertListUnique, ctx));
  }

  /* find all user certs that are valid for the specified usage */
  /* note that we are allowing expired certs in this list */
  UniqueCERTCertList certList(CERT_FindUserCertsByUsage(
      CERT_GetDefaultCertDB(), (SECCertUsage)certUsage,
      !allowDuplicateNicknames, !allowInvalid, ctx));
  if (!certList) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  /* if a (non-empty) emailAddress argument is supplied to PickByUsage, */
  /* remove non-matching certificates from the candidate list */

  if (!emailAddress.IsEmpty()) {
    node = CERT_LIST_HEAD(certList);
    while (!CERT_LIST_END(node, certList)) {
      /* if the cert has at least one e-mail address, check if suitable */
      if (CERT_GetFirstEmailAddress(node->cert)) {
        RefPtr<nsNSSCertificate> tempCert(nsNSSCertificate::Create(node->cert));
        bool match = false;
        rv = tempCert->ContainsEmailAddress(emailAddress, &match);
        if (NS_FAILED(rv)) {
          return rv;
        }
        if (!match) {
          /* doesn't contain the specified address, so remove from the list */
          CERTCertListNode* freenode = node;
          node = CERT_LIST_NEXT(node);
          CERT_RemoveCertListNode(freenode);
          continue;
        }
      }
      node = CERT_LIST_NEXT(node);
    }
  }

  UniqueCERTCertNicknames nicknames(getNSSCertNicknamesFromCertList(certList));
  if (!nicknames) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  nsTArray<nsString> certNicknameList(nicknames->numnicknames);
  nsTArray<nsString> certDetailsList(nicknames->numnicknames);

  int32_t CertsToUse;

  for (CertsToUse = 0, node = CERT_LIST_HEAD(certList.get());
       !CERT_LIST_END(node, certList.get()) &&
       CertsToUse < nicknames->numnicknames;
       node = CERT_LIST_NEXT(node)) {
    RefPtr<nsNSSCertificate> tempCert(nsNSSCertificate::Create(node->cert));

    if (tempCert) {
      nsAutoString i_nickname(
          NS_ConvertUTF8toUTF16(nicknames->nicknames[CertsToUse]));
      nsAutoString nickWithSerial;
      nsAutoString details;

      if (!selectionFound) {
        /* for the case when selectedNickname refers to a bare nickname */
        if (i_nickname == nsDependentString(selectedNickname)) {
          selectedIndex = CertsToUse;
          selectionFound = true;
        }
      }

      if (NS_SUCCEEDED(
              FormatUIStrings(tempCert, i_nickname, nickWithSerial, details))) {
        certNicknameList.AppendElement(nickWithSerial);
        certDetailsList.AppendElement(details);
        if (!selectionFound) {
          /* for the case when selectedNickname refers to nickname + serial */
          if (nickWithSerial == nsDependentString(selectedNickname)) {
            selectedIndex = CertsToUse;
            selectionFound = true;
          }
        }
      } else {
        // Placeholder, to keep the indexes valid.
        certNicknameList.AppendElement(u""_ns);
        certDetailsList.AppendElement(u""_ns);
      }

      ++CertsToUse;
    }
  }

  if (certNicknameList.IsEmpty()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  nsCOMPtr<nsICertPickDialogs> dialogs;
  rv = getNSSDialogs(getter_AddRefs(dialogs), NS_GET_IID(nsICertPickDialogs),
                     NS_CERTPICKDIALOGS_CONTRACTID);

  if (NS_SUCCEEDED(rv)) {
    // Show the cert picker dialog and get the index of the selected cert.
    rv = dialogs->PickCertificate(ctx, certNicknameList, certDetailsList,
                                  &selectedIndex, canceled);
  }

  if (NS_SUCCEEDED(rv) && !*canceled) {
    int32_t i;
    for (i = 0, node = CERT_LIST_HEAD(certList); !CERT_LIST_END(node, certList);
         ++i, node = CERT_LIST_NEXT(node)) {
      if (i == selectedIndex) {
        RefPtr<nsNSSCertificate> cert = nsNSSCertificate::Create(node->cert);
        if (!cert) {
          rv = NS_ERROR_OUT_OF_MEMORY;
          break;
        }

        cert.forget(_retval);
        break;
      }
    }
  }

  return rv;
}
