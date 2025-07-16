/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMPORT_SRC_NSAPPLEMAILIMPORT_H_
#define COMM_MAILNEWS_IMPORT_SRC_NSAPPLEMAILIMPORT_H_

#include "nsIImportModule.h"
#include "nsCOMPtr.h"
#include "nsIStringBundle.h"
#include "nsIImportMail.h"

#define NS_APPLEMAILIMPL_CONTRACTID "@mozilla.org/import/import-appleMailImpl;1"

#define kAppleMailSupportsString "mail"

class nsIImportService;

class nsAppleMailImportModule : public nsIImportModule {
 public:
  nsAppleMailImportModule();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMPORTMODULE

 private:
  virtual ~nsAppleMailImportModule();

  nsCOMPtr<nsIStringBundle> mBundle;
};

class nsAppleMailImportMail : public nsIImportMail {
 public:
  nsAppleMailImportMail();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMPORTMAIL

  nsresult Initialize();

 private:
  virtual ~nsAppleMailImportMail();

  void FindAccountMailDirs(
      nsIFile* aRoot,
      nsTArray<RefPtr<nsIImportMailboxDescriptor>>& aMailboxDescs,
      nsIImportService* aImportService);
  nsresult FindMboxDirs(
      nsIFile* aFolder,
      nsTArray<RefPtr<nsIImportMailboxDescriptor>>& aMailboxDescs,
      nsIImportService* aImportService);
  nsresult AddMboxDir(
      nsIFile* aFolder,
      nsTArray<RefPtr<nsIImportMailboxDescriptor>>& aMailboxDescs,
      nsIImportService* aImportService);

  // aInfoString is the format to a "foo %s" string. It may be NULL if the error
  // string needs no such format.
  void ReportStatus(const char16_t* aErrorName, nsString& aName,
                    nsAString& aStream);
  static void SetLogs(const nsAString& success, const nsAString& error,
                      char16_t** aOutErrorLog, char16_t** aSuccessLog);

  nsCOMPtr<nsIStringBundle> mBundle;
  uint32_t mProgress;
  uint16_t mCurDepth;
};

#endif  // COMM_MAILNEWS_IMPORT_SRC_NSAPPLEMAILIMPORT_H_
