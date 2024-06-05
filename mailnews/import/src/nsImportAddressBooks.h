/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMPtr.h"
#include "nsIImportAddressBooks.h"
#include "nsIImportGeneric.h"
#include "nsString.h"
#include "nsIFile.h"
#include "nsIAbDirectory.h"
#include "nsIAbLDIFService.h"
#include "nsIStringBundle.h"
#include "nsTArray.h"
#include "nsCOMArray.h"

class AddressThreadData;

class nsImportGenericAddressBooks : public nsIImportGeneric {
 public:
  nsImportGenericAddressBooks();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMPORTGENERIC

 private:
  virtual ~nsImportGenericAddressBooks();
  void GetDefaultLocation(void);
  void GetDefaultBooks(void);

 public:
  static void SetLogs(nsString& success, nsString& error,
                      nsISupportsString* pSuccess, nsISupportsString* pError);
  static void ReportError(const char16_t* pName, nsString* pStream,
                          nsIStringBundle* aBundle);

 private:
  nsCOMPtr<nsIImportAddressBooks> m_pInterface;
  nsTArray<RefPtr<nsIImportABDescriptor>> m_Books;
  nsCOMArray<nsIAbDirectory> m_DBs;
  nsCOMPtr<nsIFile> m_pLocation;
  bool m_autoFind;
  char16_t* m_description;
  bool m_gotLocation;
  nsCOMPtr<nsISupportsString> m_pSuccessLog;
  nsCOMPtr<nsISupportsString> m_pErrorLog;
  uint32_t m_totalSize;
  bool m_doImport;
  AddressThreadData* m_pThreadData;
  nsCString m_pDestinationUri;
  nsCOMPtr<nsIStringBundle> m_stringBundle;
};

class AddressThreadData {
 public:
  bool driverAlive;
  bool threadAlive;
  bool abort;
  bool fatalError;
  uint32_t currentTotal;
  uint32_t currentSize;
  nsTArray<RefPtr<nsIImportABDescriptor>> books;
  nsCOMArray<nsIAbDirectory>* dBs;
  nsCOMPtr<nsIAbLDIFService> ldifService;
  nsCOMPtr<nsIImportAddressBooks> addressImport;
  nsCOMPtr<nsISupportsString> successLog;
  nsCOMPtr<nsISupportsString> errorLog;
  nsCString pDestinationUri;
  nsCOMPtr<nsIStringBundle> stringBundle;

  AddressThreadData();
  ~AddressThreadData();
};
