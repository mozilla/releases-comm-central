/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMESSENGER_H_
#define COMM_MAILNEWS_BASE_SRC_NSMESSENGER_H_

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

class nsMessenger : public nsIMessenger, public nsSupportsWeakReference {
  using PathString = mozilla::PathString;

 public:
  nsMessenger();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMESSENGER

  nsresult Alert(const char* stringName);

  nsresult PromptIfFileExists(nsIFile* file);

 protected:
  virtual ~nsMessenger();

  void GetString(const nsString& aStringName, nsString& stringValue);
  nsresult InitStringBundle();

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

#endif  // COMM_MAILNEWS_BASE_SRC_NSMESSENGER_H_
