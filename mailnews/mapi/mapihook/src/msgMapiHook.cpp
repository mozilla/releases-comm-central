/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#define MAPI_STARTUP_ARG "/MAPIStartUp"

#include <mapidefs.h>
#include <mapi.h>
#include <direct.h>
#include "nsCOMPtr.h"
#include "nsISupports.h"
#include "nsIPromptService.h"
#include "nsIAppShellService.h"
#include "mozIDOMWindow.h"
#include "nsIMsgAccountManager.h"
#include "nsIStringBundle.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsString.h"
#include "nsUnicharUtils.h"
#include "nsNativeCharsetUtils.h"
#include "nsIMsgAttachment.h"
#include "nsIMsgCompFields.h"
#include "nsIMsgComposeParams.h"
#include "nsIMsgCompose.h"
#include "nsIMsgSend.h"
#include "nsIMsgComposeService.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsLocalFile.h"
#include "msgMapi.h"
#include "msgMapiHook.h"
#include "msgMapiSupport.h"
#include "msgMapiMain.h"
#include "nsThreadUtils.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/ReentrantMonitor.h"
#include "mozilla/Components.h"
#include "nsEmbedCID.h"
#include "mozilla/ErrorNames.h"
#include "mozilla/Logging.h"
#include "mozilla/SpinEventLoopUntil.h"

using namespace mozilla::dom;

extern mozilla::LazyLogModule MAPI;  // defined in msgMapiImp.cpp

class MAPISendListener : public nsIMsgSendListener,
                         public mozilla::ReentrantMonitor {
 public:
  MAPISendListener()
      : ReentrantMonitor("MAPISendListener monitor"), m_done(false) {}

  // nsISupports interface
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_IMETHOD OnStartSending(const char* aMsgID, uint32_t aMsgSize) {
    return NS_OK;
  }

  NS_IMETHOD OnSendProgress(const char* aMsgID, uint32_t aProgress,
                            uint32_t aProgressMax) {
    return NS_OK;
  }

  NS_IMETHOD OnStatus(const char* aMsgID, const char16_t* aMsg) {
    return NS_OK;
  }

  NS_IMETHOD OnStopSending(const char* aMsgID, nsresult aStatus,
                           const char16_t* aMsg, nsIFile* returnFile) {
    mozilla::ReentrantMonitorAutoEnter mon(*this);
    m_done = true;
    NotifyAll();
    return NS_OK;
  }

  NS_IMETHOD OnTransportSecurityError(const char* msgID, nsresult status,
                                      nsITransportSecurityInfo* secInfo,
                                      nsACString const& location) {
    return NS_OK;
  }

  NS_IMETHOD OnSendNotPerformed(const char* aMsgID, nsresult aStatus) {
    return OnStopSending(aMsgID, aStatus, nullptr, nullptr);
  }

  NS_IMETHOD OnGetDraftFolderURI(const char* aMsgID,
                                 const nsACString& aFolderURI) {
    return NS_OK;
  }

  bool IsDone() { return m_done; }

 private:
  bool m_done;
  virtual ~MAPISendListener() {}
};

NS_IMPL_ISUPPORTS(MAPISendListener, nsIMsgSendListener)

bool nsMapiHook::isMapiService = false;

void nsMapiHook::CleanUp() {
  // This routine will be fully implemented in future
  // to cleanup mapi related stuff inside mozilla code.
}

bool nsMapiHook::DisplayLoginDialog(bool aLogin, char16_t** aUsername,
                                    char16_t** aPassword) {
  nsresult rv;
  bool btnResult = false;

  nsCOMPtr<nsIPromptService> dlgService(
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv));
  if (NS_SUCCEEDED(rv) && dlgService) {
    nsCOMPtr<nsIStringBundleService> bundleService =
        mozilla::components::StringBundle::Service();
    if (!bundleService) return false;

    nsCOMPtr<nsIStringBundle> bundle;
    rv = bundleService->CreateBundle(MAPI_PROPERTIES_CHROME,
                                     getter_AddRefs(bundle));
    if (NS_FAILED(rv) || !bundle) return false;

    nsCOMPtr<nsIStringBundle> brandBundle;
    rv =
        bundleService->CreateBundle("chrome://branding/locale/brand.properties",
                                    getter_AddRefs(brandBundle));
    if (NS_FAILED(rv)) return false;

    nsString brandName;
    rv = brandBundle->GetStringFromName("brandFullName", brandName);
    if (NS_FAILED(rv)) return false;

    nsString loginTitle;
    AutoTArray<nsString, 1> brandStrings = {brandName};
    rv = bundle->FormatStringFromName("loginTitle", brandStrings, loginTitle);
    if (NS_FAILED(rv)) return false;

    if (aLogin) {
      nsString loginText;
      rv = bundle->GetStringFromName("loginTextwithName", loginText);
      if (NS_FAILED(rv) || loginText.IsEmpty()) return false;

      rv = dlgService->PromptUsernameAndPassword(nullptr, loginTitle.get(),
                                                 loginText.get(), aUsername,
                                                 aPassword, &btnResult);
    } else {
      // nsString loginString;
      nsString loginText;
      AutoTArray<nsString, 1> userNameStrings = {nsDependentString(*aUsername)};
      rv =
          bundle->FormatStringFromName("loginText", userNameStrings, loginText);
      if (NS_FAILED(rv)) return false;

      rv = dlgService->PromptPassword(nullptr, loginTitle.get(),
                                      loginText.get(), aPassword, &btnResult);
    }
  }

  return btnResult;
}

bool nsMapiHook::VerifyUserName(const nsCString& aUsername, nsCString& aIdKey) {
  nsresult rv;

  if (aUsername.IsEmpty()) return false;

  nsCOMPtr<nsIMsgAccountManager> accountManager(
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv));
  if (NS_FAILED(rv)) return false;
  nsTArray<RefPtr<nsIMsgIdentity>> identities;
  rv = accountManager->GetAllIdentities(identities);
  if (NS_FAILED(rv)) return false;

  for (auto thisIdentity : identities) {
    if (thisIdentity) {
      nsCString email;
      rv = thisIdentity->GetEmail(email);
      if (NS_FAILED(rv)) continue;

      // get the username from the email and compare with the username
      int32_t index = email.FindChar('@');
      if (index != -1) email.SetLength(index);

      if (aUsername.Equals(email))
        return NS_SUCCEEDED(thisIdentity->GetKey(aIdKey));
    }
  }

  return false;
}

bool nsMapiHook::IsBlindSendAllowed() {
  bool enabled = false;
  bool warn = true;
  nsCOMPtr<nsIPrefBranch> prefBranch = do_GetService(NS_PREFSERVICE_CONTRACTID);
  if (prefBranch) {
    prefBranch->GetBoolPref(PREF_MAPI_WARN_PRIOR_TO_BLIND_SEND, &warn);
    prefBranch->GetBoolPref(PREF_MAPI_BLIND_SEND_ENABLED, &enabled);
  }
  if (!enabled) return false;

  if (!warn) return true;  // Everything is okay.

  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  if (!bundleService) return false;

  nsCOMPtr<nsIStringBundle> bundle;
  rv = bundleService->CreateBundle(MAPI_PROPERTIES_CHROME,
                                   getter_AddRefs(bundle));
  if (NS_FAILED(rv) || !bundle) return false;

  nsString warningMsg;
  rv = bundle->GetStringFromName("mapiBlindSendWarning", warningMsg);
  if (NS_FAILED(rv)) return false;

  nsString dontShowAgainMessage;
  rv = bundle->GetStringFromName("mapiBlindSendDontShowAgain",
                                 dontShowAgainMessage);
  if (NS_FAILED(rv)) return false;

  nsCOMPtr<nsIPromptService> dlgService(
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv) || !dlgService) return false;

  bool continueToWarn = true;
  bool okayToContinue = false;
  dlgService->ConfirmCheck(nullptr, nullptr, warningMsg.get(),
                           dontShowAgainMessage.get(), &continueToWarn,
                           &okayToContinue);

  if (!continueToWarn && okayToContinue && prefBranch)
    prefBranch->SetBoolPref(PREF_MAPI_WARN_PRIOR_TO_BLIND_SEND, false);

  return okayToContinue;
}

// this is used for Send without UI
nsresult nsMapiHook::BlindSendMail(unsigned long aSession,
                                   nsIMsgCompFields* aCompFields) {
  nsresult rv = NS_OK;

  if (!IsBlindSendAllowed()) return NS_ERROR_FAILURE;

  // smtp password and Logged in used IdKey from MapiConfig (session obj)
  nsMAPIConfiguration* pMapiConfig =
      nsMAPIConfiguration::GetMAPIConfiguration();
  if (!pMapiConfig) return NS_ERROR_FAILURE;  // get the singleton obj
  char16_t* password = pMapiConfig->GetPassword(aSession);

  // Id key
  nsCString MsgIdKey;
  pMapiConfig->GetIdKey(aSession, MsgIdKey);

  // get the MsgIdentity for the above key using AccountManager
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1");
  if (NS_FAILED(rv) || (!accountManager)) return rv;

  nsCOMPtr<nsIMsgIdentity> pMsgId;
  rv = accountManager->GetIdentity(MsgIdKey, getter_AddRefs(pMsgId));
  if (NS_FAILED(rv)) return rv;

  // create a send listener to get back the send status
  RefPtr<MAPISendListener> sendListener = new MAPISendListener;

  // create the compose params object
  nsCOMPtr<nsIMsgComposeParams> pMsgComposeParams(
      do_CreateInstance("@mozilla.org/messengercompose/composeparams;1", &rv));
  if (NS_FAILED(rv) || (!pMsgComposeParams)) return rv;

  // populate the compose params
  bool forcePlainText;
  aCompFields->GetForcePlainText(&forcePlainText);
  pMsgComposeParams->SetType(nsIMsgCompType::New);
  pMsgComposeParams->SetFormat(forcePlainText ? nsIMsgCompFormat::PlainText
                                              : nsIMsgCompFormat::HTML);
  pMsgComposeParams->SetIdentity(pMsgId);
  pMsgComposeParams->SetComposeFields(aCompFields);
  pMsgComposeParams->SetSendListener(sendListener);
  if (password) pMsgComposeParams->SetSmtpPassword(nsDependentString(password));

  // create the nsIMsgCompose object to send the object
  nsCOMPtr<nsIMsgCompose> pMsgCompose(
      do_CreateInstance("@mozilla.org/messengercompose/compose;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = pMsgCompose->Initialize(pMsgComposeParams, nullptr, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  // If we're in offline mode, we'll need to queue it for later.
  RefPtr<Promise> promise;
  rv = pMsgCompose->SendMsg(WeAreOffline() ? nsIMsgSend::nsMsgQueueForLater
                                           : nsIMsgSend::nsMsgDeliverNow,
                            pMsgId, nullptr, nullptr, nullptr,
                            getter_AddRefs(promise));
  NS_ENSURE_SUCCESS(rv, rv);

  // When offline, the message is saved to Outbox and OnStopSending won't be
  // called.
  if (WeAreOffline()) return NS_OK;

  // Wait for OnStopSending to be called.
  mozilla::SpinEventLoopUntil("nsIMsgCompose::SendMsg is async"_ns,
                              [=]() { return sendListener->IsDone(); });

  return rv;
}

nsresult nsMapiHook::HandleAttachments(nsIMsgCompFields* aCompFields,
                                       int32_t aFileCount,
                                       lpnsMapiFileDesc aFiles, bool aIsUTF8) {
  nsresult rv = NS_OK;
  // Do nothing if there are no files to process.
  if (!aFiles || aFileCount <= 0) return NS_OK;

  nsAutoCString Attachments;
  nsAutoCString TempFiles;

  nsCOMPtr<nsIFile> pFile = new nsLocalFile();
  nsCOMPtr<nsIFile> pTempDir = new nsLocalFile();

  for (int i = 0; i < aFileCount; i++) {
    if (aFiles[i].lpszPathName) {
      // check if attachment exists
      if (!aIsUTF8) {
        rv = pFile->InitWithNativePath(
            nsDependentCString(aFiles[i].lpszPathName));
        NS_ENSURE_SUCCESS(rv, rv);
      } else {
        rv = pFile->InitWithPath(NS_ConvertUTF8toUTF16(aFiles[i].lpszPathName));
        NS_ENSURE_SUCCESS(rv, rv);
      }

      bool bExist;
      rv = pFile->Exists(&bExist);
      MOZ_LOG(
          MAPI, mozilla::LogLevel::Debug,
          ("nsMapiHook::HandleAttachments: filename: %s path: %s exists = %s\n",
           (const char*)aFiles[i].lpszFileName,
           (const char*)aFiles[i].lpszPathName, bExist ? "true" : "false"));
      if (NS_FAILED(rv) || (!bExist)) return NS_ERROR_FILE_NOT_FOUND;

      // Temp Directory
      nsCOMPtr<nsIFile> pTempDir;
      NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(pTempDir));

      // create a new sub directory called moz_mapi underneath the temp
      // directory
      pTempDir->AppendRelativePath(u"moz_mapi"_ns);
      pTempDir->Exists(&bExist);
      if (!bExist) {
        rv = pTempDir->Create(nsIFile::DIRECTORY_TYPE, 777);
        if (NS_FAILED(rv)) return rv;
      }

      // rename or copy the existing temp file with the real file name

      nsAutoString leafName;
      // convert to Unicode using Platform charset
      // leafName already contains a unicode leafName from lpszPathName. If we
      // were given a value for lpszFileName, use it. Otherwise stick with
      // leafName
      if (aFiles[i].lpszFileName) {
        nsAutoString wholeFileName;
        if (!aIsUTF8)
          NS_CopyNativeToUnicode(nsDependentCString(aFiles[i].lpszFileName),
                                 wholeFileName);
        else
          wholeFileName.Append(NS_ConvertUTF8toUTF16(aFiles[i].lpszFileName));
        // need to find the last '\' and find the leafname from that.
        int32_t lastSlash = wholeFileName.RFindChar(char16_t('\\'));
        if (lastSlash != kNotFound)
          leafName.Assign(Substring(wholeFileName, lastSlash + 1));
        else
          leafName.Assign(wholeFileName);
      } else
        pFile->GetLeafName(leafName);

      nsCOMPtr<nsIMsgAttachment> attachment =
          do_CreateInstance("@mozilla.org/messengercompose/attachment;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      attachment->SetName(leafName);

      nsCOMPtr<nsIFile> pTempFile;
      rv = pTempDir->Clone(getter_AddRefs(pTempFile));
      if (NS_FAILED(rv) || !pTempFile) return rv;

      pTempFile->Append(leafName);
      pTempFile->Exists(&bExist);
      if (bExist) {
        rv = pTempFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0777);
        NS_ENSURE_SUCCESS(rv, rv);
        pTempFile->Remove(false);  // remove so we can copy over it.
        pTempFile->GetLeafName(leafName);
      }
      // copy the file to its new location and file name
      pFile->CopyTo(pTempDir, leafName);
      // point pFile to the new location of the attachment
      pFile->InitWithFile(pTempDir);
      pFile->Append(leafName);

      // create MsgCompose attachment object
      attachment->SetTemporary(
          true);  // this one is a temp file so set the flag for MsgCompose

      // now set the attachment object
      nsAutoCString pURL;
      NS_GetURLSpecFromFile(pFile, pURL);
      attachment->SetUrl(pURL);

      // set the file size
      int64_t fileSize;
      pFile->GetFileSize(&fileSize);
      attachment->SetSize(fileSize);

      // add the attachment
      rv = aCompFields->AddAttachment(attachment);
      if (NS_FAILED(rv)) {
        nsAutoCString name;
        mozilla::GetErrorName(rv, name);
        MOZ_LOG(MAPI, mozilla::LogLevel::Debug,
                ("nsMapiHook::HandleAttachments: AddAttachment rv =  %s\n",
                 name.get()));
      }
    }
  }
  return rv;
}

nsresult nsMapiHook::HandleAttachmentsW(nsIMsgCompFields* aCompFields,
                                        int32_t aFileCount,
                                        lpnsMapiFileDescW aFiles) {
  nsresult rv = NS_OK;
  // Do nothing if there are no files to process.
  if (!aFiles || aFileCount <= 0) return NS_OK;

  nsAutoCString Attachments;
  nsAutoCString TempFiles;

  nsCOMPtr<nsIFile> pFile = new nsLocalFile();
  nsCOMPtr<nsIFile> pTempDir = new nsLocalFile();

  for (int i = 0; i < aFileCount; i++) {
    if (aFiles[i].lpszPathName) {
      // Check if attachment exists.
      rv = pFile->InitWithPath(nsDependentString(aFiles[i].lpszPathName));
      NS_ENSURE_SUCCESS(rv, rv);

      bool bExist;
      rv = pFile->Exists(&bExist);
      MOZ_LOG(MAPI, mozilla::LogLevel::Debug,
              ("nsMapiHook::HandleAttachmentsW: filename: %s path: %s exists = "
               "%s \n",
               NS_ConvertUTF16toUTF8(aFiles[i].lpszFileName).get(),
               NS_ConvertUTF16toUTF8(aFiles[i].lpszPathName).get(),
               bExist ? "true" : "false"));
      if (NS_FAILED(rv) || (!bExist)) return NS_ERROR_FILE_NOT_FOUND;

      // Temp Directory.
      nsCOMPtr<nsIFile> pTempDir;
      NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(pTempDir));

      // Create a new sub directory called moz_mapi underneath the temp
      // directory.
      pTempDir->AppendRelativePath(u"moz_mapi"_ns);
      pTempDir->Exists(&bExist);
      if (!bExist) {
        rv = pTempDir->Create(nsIFile::DIRECTORY_TYPE, 777);
        if (NS_FAILED(rv)) return rv;
      }

      // Rename or copy the existing temp file with the real file name.

      nsAutoString leafName;
      // leafName already contains a unicode leafName from lpszPathName. If we
      // were given a value for lpszFileName, use it. Otherwise stick with
      // leafName.
      if (aFiles[i].lpszFileName) {
        nsAutoString wholeFileName(aFiles[i].lpszFileName);
        // Need to find the last '\' and find the leafname from that.
        int32_t lastSlash = wholeFileName.RFindChar(char16_t('\\'));
        if (lastSlash != kNotFound)
          leafName.Assign(Substring(wholeFileName, lastSlash + 1));
        else
          leafName.Assign(wholeFileName);
      } else
        pFile->GetLeafName(leafName);

      nsCOMPtr<nsIMsgAttachment> attachment =
          do_CreateInstance("@mozilla.org/messengercompose/attachment;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      attachment->SetName(leafName);

      nsCOMPtr<nsIFile> pTempFile;
      rv = pTempDir->Clone(getter_AddRefs(pTempFile));
      if (NS_FAILED(rv) || !pTempFile) return rv;

      pTempFile->Append(leafName);
      pTempFile->Exists(&bExist);
      if (bExist) {
        rv = pTempFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0777);
        NS_ENSURE_SUCCESS(rv, rv);
        pTempFile->Remove(false);  // remove so we can copy over it.
        pTempFile->GetLeafName(leafName);
      }
      // Copy the file to its new location and file name.
      pFile->CopyTo(pTempDir, leafName);
      // Point pFile to the new location of the attachment.
      pFile->InitWithFile(pTempDir);
      pFile->Append(leafName);

      // Create MsgCompose attachment object.
      attachment->SetTemporary(
          true);  // this one is a temp file so set the flag for MsgCompose

      // Now set the attachment object.
      nsAutoCString pURL;
      NS_GetURLSpecFromFile(pFile, pURL);
      attachment->SetUrl(pURL);

      // Set the file size.
      int64_t fileSize;
      pFile->GetFileSize(&fileSize);
      attachment->SetSize(fileSize);

      // Add the attachment.
      rv = aCompFields->AddAttachment(attachment);
      if (NS_FAILED(rv)) {
        nsAutoCString name;
        mozilla::GetErrorName(rv, name);
        MOZ_LOG(MAPI, mozilla::LogLevel::Debug,
                ("nsMapiHook::HandleAttachmentsW: AddAttachment rv =  %s\n",
                 name.get()));
      }
    }
  }
  return rv;
}

// this is used to convert non Unicode data and then populate comp fields
nsresult nsMapiHook::PopulateCompFieldsWithConversion(
    lpnsMapiMessage aMessage, nsIMsgCompFields* aCompFields) {
  bool isUTF8 = aMessage->ulReserved == CP_UTF8;

  if (aMessage->lpOriginator && aMessage->lpOriginator->lpszAddress) {
    nsAutoString From;
    if (!isUTF8)
      From.Append(NS_ConvertASCIItoUTF16(aMessage->lpOriginator->lpszAddress));
    else
      From.Append(NS_ConvertUTF8toUTF16(aMessage->lpOriginator->lpszAddress));
    aCompFields->SetFrom(From);
  }

  nsAutoString To;
  nsAutoString Cc;
  nsAutoString Bcc;
  constexpr auto Comma = u","_ns;
  if (aMessage->lpRecips) {
    for (int i = 0; i < (int)aMessage->nRecipCount; i++) {
      if (aMessage->lpRecips[i].lpszAddress || aMessage->lpRecips[i].lpszName) {
        const char* addressWithoutType = (aMessage->lpRecips[i].lpszAddress)
                                             ? aMessage->lpRecips[i].lpszAddress
                                             : aMessage->lpRecips[i].lpszName;
        if (!PL_strncasecmp(addressWithoutType, "SMTP:", 5))
          addressWithoutType += 5;

        switch (aMessage->lpRecips[i].ulRecipClass) {
          case MAPI_TO:
            if (!To.IsEmpty()) To += Comma;
            if (!isUTF8)
              To.Append(NS_ConvertASCIItoUTF16(addressWithoutType));
            else
              To.Append(NS_ConvertUTF8toUTF16(addressWithoutType));
            break;

          case MAPI_CC:
            if (!Cc.IsEmpty()) Cc += Comma;
            if (!isUTF8)
              Cc.Append(NS_ConvertASCIItoUTF16(addressWithoutType));
            else
              Cc.Append(NS_ConvertUTF8toUTF16(addressWithoutType));
            break;

          case MAPI_BCC:
            if (!Bcc.IsEmpty()) Bcc += Comma;
            if (!isUTF8)
              Bcc.Append(NS_ConvertASCIItoUTF16(addressWithoutType));
            else
              Bcc.Append(NS_ConvertUTF8toUTF16(addressWithoutType));
            break;
        }
      }
    }
  }

  // set To, Cc, Bcc
  aCompFields->SetTo(To);
  aCompFields->SetCc(Cc);
  aCompFields->SetBcc(Bcc);

  MOZ_LOG(MAPI, mozilla::LogLevel::Debug,
          ("to: %s cc: %s bcc: %s \n", NS_ConvertUTF16toUTF8(To).get(),
           NS_ConvertUTF16toUTF8(Cc).get(), NS_ConvertUTF16toUTF8(Bcc).get()));

  // set subject
  nsresult rv = NS_OK;
  if (aMessage->lpszSubject) {
    nsAutoString Subject;
    if (!isUTF8)
      rv = NS_CopyNativeToUnicode(nsDependentCString(aMessage->lpszSubject),
                                  Subject);
    else
      Subject.Append(NS_ConvertUTF8toUTF16(aMessage->lpszSubject));
    if (NS_FAILED(rv)) return rv;
    aCompFields->SetSubject(Subject);
  }

  // handle attachments as File URL
  rv = HandleAttachments(aCompFields, aMessage->nFileCount, aMessage->lpFiles,
                         isUTF8);
  if (NS_FAILED(rv)) return rv;

  // set body
  if (aMessage->lpszNoteText) {
    nsAutoString Body;
    if (!isUTF8)
      rv = NS_CopyNativeToUnicode(nsDependentCString(aMessage->lpszNoteText),
                                  Body);
    else
      Body.Append(NS_ConvertUTF8toUTF16(aMessage->lpszNoteText));
    if (NS_FAILED(rv)) return rv;
    if (Body.IsEmpty() || Body.Last() != '\n') Body.AppendLiteral(CRLF);

    // This is needed when Simple MAPI is used without a compose window.
    // See bug 1366196.
    if (Body.Find(u"<html>") == kNotFound) aCompFields->SetForcePlainText(true);

    rv = aCompFields->SetBody(Body);
  } else {
    // No body: Assume that we can do plaintext. This will trigger the default
    // compose format in ShowComposerWindow().
    aCompFields->SetForcePlainText(true);
  }

#ifdef RAJIV_DEBUG
  // testing what all was set in CompFields
  printf("To : %S \n", To.get());
  printf("CC : %S \n", Cc.get());
  printf("BCC : %S \n", Bcc.get());
#endif

  return rv;
}

// This is used to populate comp fields with UTF-16 data from MAPISendMailW
// function.
nsresult nsMapiHook::PopulateCompFieldsW(lpnsMapiMessageW aMessage,
                                         nsIMsgCompFields* aCompFields) {
  if (aMessage->lpOriginator && aMessage->lpOriginator->lpszAddress)
    aCompFields->SetFrom(
        nsDependentString(aMessage->lpOriginator->lpszAddress));

  nsAutoString To;
  nsAutoString Cc;
  nsAutoString Bcc;

  constexpr auto Comma = u","_ns;

  if (aMessage->lpRecips) {
    for (int i = 0; i < (int)aMessage->nRecipCount; i++) {
      if (aMessage->lpRecips[i].lpszAddress || aMessage->lpRecips[i].lpszName) {
        const wchar_t* addressWithoutType =
            (aMessage->lpRecips[i].lpszAddress)
                ? aMessage->lpRecips[i].lpszAddress
                : aMessage->lpRecips[i].lpszName;
        if (_wcsnicmp(addressWithoutType, L"SMTP:", 5) == 0)
          addressWithoutType += 5;
        switch (aMessage->lpRecips[i].ulRecipClass) {
          case MAPI_TO:
            if (!To.IsEmpty()) To += Comma;
            To.Append(nsDependentString(addressWithoutType));
            break;

          case MAPI_CC:
            if (!Cc.IsEmpty()) Cc += Comma;
            Cc.Append(nsDependentString(addressWithoutType));
            break;

          case MAPI_BCC:
            if (!Bcc.IsEmpty()) Bcc += Comma;
            Bcc.Append(nsDependentString(addressWithoutType));
            break;
        }
      }
    }
  }

  MOZ_LOG(MAPI, mozilla::LogLevel::Debug,
          ("to: %s cc: %s bcc: %s \n", NS_ConvertUTF16toUTF8(To).get(),
           NS_ConvertUTF16toUTF8(Cc).get(), NS_ConvertUTF16toUTF8(Bcc).get()));
  // set To, Cc, Bcc
  aCompFields->SetTo(To);
  aCompFields->SetCc(Cc);
  aCompFields->SetBcc(Bcc);

  // Set subject.
  if (aMessage->lpszSubject)
    aCompFields->SetSubject(nsDependentString(aMessage->lpszSubject));

  // handle attachments as File URL
  nsresult rv =
      HandleAttachmentsW(aCompFields, aMessage->nFileCount, aMessage->lpFiles);
  if (NS_FAILED(rv)) return rv;

  // Set body.
  if (aMessage->lpszNoteText) {
    nsString Body(aMessage->lpszNoteText);
    if (Body.IsEmpty() || Body.Last() != '\n') Body.AppendLiteral(CRLF);

    // This is needed when Simple MAPI is used without a compose window.
    // See bug 1366196.
    if (Body.Find(u"<html>") == kNotFound) aCompFields->SetForcePlainText(true);

    rv = aCompFields->SetBody(Body);
  } else {
    // No body: Assume that we can do plaintext. This will trigger the default
    // compose format in ShowComposerWindow().
    aCompFields->SetForcePlainText(true);
  }
  return rv;
}

// this is used to populate the docs as attachments in the Comp fields for Send
// Documents
nsresult nsMapiHook::PopulateCompFieldsForSendDocs(
    nsIMsgCompFields* aCompFields, ULONG aFlags, LPSTR aDelimChar,
    LPSTR aFilePaths) {
  nsAutoCString strDelimChars;
  nsAutoCString strFilePaths;
  nsresult rv = NS_OK;
  bool bExist;

  if (aDelimChar) strDelimChars.Assign(aDelimChar);
  if (aFilePaths) strFilePaths.Assign(aFilePaths);

  // check for comma in filename
  if (strDelimChars.FindChar(',') ==
      kNotFound)  // if comma is not in the delimiter specified by user
  {
    if (strFilePaths.FindChar(',') !=
        kNotFound)  // if comma found in filenames return error
      return NS_ERROR_FILE_INVALID_PATH;
  }

  nsCString Attachments;

  // only 1 file is to be sent, no delim specified
  if (strDelimChars.IsEmpty()) strDelimChars.Assign(';');

  int32_t offset = 0;
  int32_t FilePathsLen = strFilePaths.Length();
  if (FilePathsLen) {
    nsAutoString Subject;

    // multiple files to be sent, delim specified
    nsCOMPtr<nsIFile> pFile = new nsLocalFile();

    char* newFilePaths = (char*)strFilePaths.get();
    while (offset != kNotFound) {
      // Temp Directory
      nsCOMPtr<nsIFile> pTempDir;
      NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(pTempDir));

      // if not already existing, create another temp dir for mapi within Win
      // temp dir this is windows only so we can do "\\"
      pTempDir->AppendRelativePath(u"moz_mapi"_ns);
      pTempDir->Exists(&bExist);
      if (!bExist) {
        rv = pTempDir->Create(nsIFile::DIRECTORY_TYPE, 777);
        if (NS_FAILED(rv)) return rv;
      }

      nsAutoCString RemainingPaths;
      RemainingPaths.Assign(newFilePaths);
      offset = RemainingPaths.Find(strDelimChars);
      if (offset != kNotFound) {
        RemainingPaths.SetLength(offset);
        if ((offset + (int32_t)strDelimChars.Length()) < FilePathsLen)
          newFilePaths += offset + strDelimChars.Length();
        else
          offset = kNotFound;
        FilePathsLen -= offset + strDelimChars.Length();
      }

      if (RemainingPaths[1] != ':' && RemainingPaths[1] != '\\') {
        char cwd[MAX_PATH];
        if (_getdcwd(_getdrive(), cwd, MAX_PATH)) {
          nsAutoCString cwdStr;
          cwdStr.Assign(cwd);
          cwdStr.Append('\\');
          RemainingPaths.Insert(cwdStr, 0);
        }
      }

      rv = pFile->InitWithNativePath(RemainingPaths);
      NS_ENSURE_SUCCESS(rv, rv);

      rv = pFile->Exists(&bExist);
      if (NS_FAILED(rv) || (!bExist)) return NS_ERROR_FILE_NOT_FOUND;

      // filename of the file attachment
      nsAutoString leafName;
      pFile->GetLeafName(leafName);
      if (NS_FAILED(rv) || leafName.IsEmpty()) return rv;

      if (!Subject.IsEmpty()) Subject.AppendLiteral(", ");
      Subject += leafName;

      // create MsgCompose attachment object
      nsCOMPtr<nsIMsgAttachment> attachment =
          do_CreateInstance("@mozilla.org/messengercompose/attachment;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);

      nsDependentString fileNameNative(leafName.get());
      rv = pFile->CopyTo(pTempDir, fileNameNative);
      if (NS_FAILED(rv)) return rv;

      // now turn pTempDir into a full file path to the temp file
      pTempDir->Append(fileNameNative);

      // this one is a temp file so set the flag for MsgCompose
      attachment->SetTemporary(true);

      // now set the attachment object
      nsAutoCString pURL;
      NS_GetURLSpecFromFile(pTempDir, pURL);
      attachment->SetUrl(pURL);

      // set the file size
      int64_t fileSize;
      pFile->GetFileSize(&fileSize);
      attachment->SetSize(fileSize);

      // add the attachment
      rv = aCompFields->AddAttachment(attachment);
      if (NS_FAILED(rv)) return rv;
    }

    rv = aCompFields->SetBody(Subject);
  }

  return rv;
}

// this used for Send with UI
nsresult nsMapiHook::ShowComposerWindow(unsigned long aSession,
                                        nsIMsgCompFields* aCompFields) {
  nsresult rv = NS_OK;

  // create a send listener to get back the send status
  RefPtr<MAPISendListener> sendListener = new MAPISendListener;

  // create the compose params object
  nsCOMPtr<nsIMsgComposeParams> pMsgComposeParams(
      do_CreateInstance("@mozilla.org/messengercompose/composeparams;1", &rv));
  if (NS_FAILED(rv) || (!pMsgComposeParams)) return rv;

  // If we found HTML, compose in HTML.
  bool forcePlainText;
  aCompFields->GetForcePlainText(&forcePlainText);
  pMsgComposeParams->SetFormat(forcePlainText ? nsIMsgCompFormat::Default
                                              : nsIMsgCompFormat::HTML);

  // populate the compose params
  pMsgComposeParams->SetType(nsIMsgCompType::New);

  // Never force to plain text, the default format will take care of that.
  // Undo the forcing that happened in
  // PopulateCompFields/PopulateCompFieldsWithConversion. See bug 1095629 and
  // bug 1366196.
  aCompFields->SetForcePlainText(false);
  pMsgComposeParams->SetComposeFields(aCompFields);
  pMsgComposeParams->SetSendListener(sendListener);

  /** get the nsIMsgComposeService object to open the compose window **/
  nsCOMPtr<nsIMsgComposeService> compService =
      do_GetService("@mozilla.org/messengercompose;1");
  if (NS_FAILED(rv) || (!compService)) return rv;

  rv = compService->OpenComposeWindowWithParams(nullptr, pMsgComposeParams);
  if (NS_FAILED(rv)) return rv;

  return rv;
}
