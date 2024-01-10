/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __nsMsgAppCore_h
#define __nsMsgAppCore_h

#include "nscore.h"
#include "nsIMessenger.h"
#include "nsCOMPtr.h"
#include "nsITransactionManager.h"
#include "nsIFile.h"
#include "nsIDocShell.h"
#include "nsString.h"
#include "nsIStringBundle.h"
#include "nsIFile.h"
#include "nsIFilePicker.h"
#include "nsWeakReference.h"
#include "mozIDOMWindow.h"
#include "nsTArray.h"
#include "nsIMsgStatusFeedback.h"

class nsSaveAllAttachmentsState;

class nsMessenger : public nsIMessenger, public nsSupportsWeakReference {
  using PathString = mozilla::PathString;

 public:
  nsMessenger();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMESSENGER

  nsresult Alert(const char* stringName);

  nsresult SaveAttachment(nsIFile* file, const nsACString& unescapedUrl,
                          const nsACString& messageUri,
                          const nsACString& contentType,
                          nsSaveAllAttachmentsState* saveState,
                          nsIUrlListener* aListener);
  nsresult PromptIfFileExists(nsIFile* file);
  nsresult DetachAttachments(const nsTArray<nsCString>& aContentTypeArray,
                             const nsTArray<nsCString>& aUrlArray,
                             const nsTArray<nsCString>& aDisplayNameArray,
                             const nsTArray<nsCString>& aMessageUriArray,
                             nsTArray<nsCString>* saveFileUris,
                             nsIUrlListener* aListener,
                             bool withoutWarning = false);
  nsresult SaveAllAttachments(const nsTArray<nsCString>& contentTypeArray,
                              const nsTArray<nsCString>& urlArray,
                              const nsTArray<nsCString>& displayNameArray,
                              const nsTArray<nsCString>& messageUriArray,
                              bool detaching,
                              nsIUrlListener* aListener = nullptr);
  nsresult SaveOneAttachment(const nsACString& aContentType,
                             const nsACString& aURL,
                             const nsACString& aDisplayName,
                             const nsACString& aMessageUri, bool detaching);

 protected:
  virtual ~nsMessenger();

  void GetString(const nsString& aStringName, nsString& stringValue);
  nsresult InitStringBundle();
  nsresult PromptIfDeleteAttachments(
      bool saveFirst, const nsTArray<nsCString>& displayNameArray);

 private:
  nsresult GetLastSaveDirectory(nsIFile** aLastSaveAsDir);
  // if aLocalFile is a dir, we use it.  otherwise, we use the parent of
  // aLocalFile.
  nsresult SetLastSaveDirectory(nsIFile* aLocalFile);

  nsresult AdjustFileIfNameTooLong(nsIFile* aFile);

  nsresult GetSaveAsFile(const nsAString& aMsgFilename,
                         int32_t* aSaveAsFileType, nsIFile** aSaveAsFile);

  nsresult GetSaveToDir(nsIFile** aSaveToDir);
  nsresult ShowPicker(nsIFilePicker* aPicker,
                      nsIFilePicker::ResultCode* aResult);

  class nsFilePickerShownCallback : public nsIFilePickerShownCallback {
    virtual ~nsFilePickerShownCallback() {}

   public:
    nsFilePickerShownCallback();
    NS_DECL_ISUPPORTS

    NS_IMETHOD Done(nsIFilePicker::ResultCode aResult) override;

   public:
    bool mPickerDone;
    nsIFilePicker::ResultCode mResult;
  };

  nsString mId;
  nsCOMPtr<nsITransactionManager> mTxnMgr;

  /* rhp - need this to drive message display */
  nsCOMPtr<mozIDOMWindowProxy> mWindow;
  nsCOMPtr<nsIMsgWindow> mMsgWindow;
  nsCOMPtr<nsIDocShell> mDocShell;

  // String bundles...
  nsCOMPtr<nsIStringBundle> mStringBundle;

  nsCOMPtr<nsISupports> mSearchContext;
};

#define NS_MESSENGER_CID                             \
  { /* f436a174-e2c0-4955-9afe-e3feb68aee56 */       \
    0xf436a174, 0xe2c0, 0x4955, {                    \
      0x9a, 0xfe, 0xe3, 0xfe, 0xb6, 0x8a, 0xee, 0x56 \
    }                                                \
  }

#endif
