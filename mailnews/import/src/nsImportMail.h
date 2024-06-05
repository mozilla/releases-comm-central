/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMPtr.h"
#include "nsIImportMail.h"
#include "nsIImportGeneric.h"
#include "nsString.h"
#include "nsIMsgFolder.h"
#include "nsIStringBundle.h"

#define IMPORT_MSGS_URL "chrome://messenger/locale/importMsgs.properties"

class ImportThreadData;

class nsImportGenericMail : public nsIImportGeneric {
 public:
  nsImportGenericMail();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMPORTGENERIC

 private:
  virtual ~nsImportGenericMail();
  bool CreateFolder(nsIMsgFolder** ppFolder);
  void GetDefaultMailboxes(void);
  void GetDefaultLocation(void);
  void GetDefaultDestination(void);
  void GetMailboxName(uint32_t index, nsISupportsString* pStr);

 public:
  static void SetLogs(nsString& success, nsString& error,
                      nsISupportsString* pSuccess, nsISupportsString* pError);
  static void ReportError(int32_t id, const char16_t* pName, nsString* pStream,
                          nsIStringBundle* aBundle);

 private:
  nsString m_pName;  // module name that created this interface
  nsCOMPtr<nsIMsgFolder> m_pDestFolder;
  bool m_deleteDestFolder;
  bool m_createdFolder;
  nsCOMPtr<nsIFile> m_pSrcLocation;
  bool m_gotLocation;
  bool m_gotDefaultMailboxes;
  nsCOMPtr<nsIImportMail> m_pInterface;
  nsTArray<RefPtr<nsIImportMailboxDescriptor>> m_mailboxes;
  nsCOMPtr<nsISupportsString> m_pSuccessLog;
  nsCOMPtr<nsISupportsString> m_pErrorLog;
  uint32_t m_totalSize;
  bool m_doImport;
  ImportThreadData* m_pThreadData;
  bool m_performingMigration;
  nsCOMPtr<nsIStringBundle> m_stringBundle;
};

class ImportThreadData {
 public:
  bool driverAlive;
  bool threadAlive;
  bool abort;
  bool fatalError;
  uint32_t currentTotal;
  uint32_t currentSize;
  nsCOMPtr<nsIMsgFolder> destRoot;
  bool ownsDestRoot;
  nsTArray<RefPtr<nsIImportMailboxDescriptor>> boxes;
  nsCOMPtr<nsIImportMail> mailImport;
  nsCOMPtr<nsISupportsString> successLog;
  nsCOMPtr<nsISupportsString> errorLog;
  uint32_t currentMailbox;
  bool performingMigration;
  nsCOMPtr<nsIStringBundle> stringBundle;

  ImportThreadData();
  ~ImportThreadData();
  void DriverDelete();
  void ThreadDelete();
  void DriverAbort();
};
