/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
  Outlook (Win32) import mail and addressbook interfaces
*/
#include "nscore.h"
#include "nsString.h"
#include "nsLocalFile.h"
#include "nsMsgUtils.h"
#include "nsIImportService.h"
#include "nsOutlookImport.h"
#include "nsIImportService.h"
#include "nsIImportMail.h"
#include "nsIImportMailboxDescriptor.h"
#include "nsIImportGeneric.h"
#include "nsIImportAddressBooks.h"
#include "nsIImportABDescriptor.h"
#include "nsXPCOM.h"
#include "nsISupportsPrimitives.h"
#include "nsIAbDirectory.h"
#include "nsOutlookSettings.h"
#include "nsTextFormatter.h"
#include "nsOutlookStringBundle.h"
#include "ImportDebug.h"

#include "nsOutlookMail.h"

#include "MapiApi.h"

class ImportOutlookMailImpl : public nsIImportMail {
 public:
  ImportOutlookMailImpl();

  static nsresult Create(nsIImportMail** aImport);

  // nsISupports interface
  NS_DECL_THREADSAFE_ISUPPORTS

  // nsIImportmail interface

  NS_IMETHOD GetDefaultLocation(nsIFile** location);

  NS_IMETHOD FindMailboxes(nsIFile* location,
                           nsTArray<RefPtr<nsIImportMailboxDescriptor>>& boxes);

  NS_IMETHOD ImportMailbox(nsIImportMailboxDescriptor* source,
                           nsIMsgFolder* dstFolder, char16_t** pErrorLog,
                           char16_t** pSuccessLog, bool* fatalError);

  /* unsigned long GetImportProgress (); */
  NS_IMETHOD GetImportProgress(uint32_t* _retval);

  NS_IMETHOD TranslateFolderName(const nsAString& aFolderName,
                                 nsAString& _retval);

 public:
  static void ReportSuccess(nsString& name, int32_t count, nsString* pStream);
  static void ReportError(int32_t errorNum, nsString& name, nsString* pStream);
  static void AddLinebreak(nsString* pStream);
  static void SetLogs(nsString& success, nsString& error, char16_t** pError,
                      char16_t** pSuccess);

 private:
  virtual ~ImportOutlookMailImpl();
  nsOutlookMail m_mail;
  uint32_t m_bytesDone;
};

class ImportOutlookAddressImpl : public nsIImportAddressBooks {
 public:
  ImportOutlookAddressImpl();

  static nsresult Create(nsIImportAddressBooks** aImport);

  // nsISupports interface
  NS_DECL_THREADSAFE_ISUPPORTS

  // nsIImportAddressBooks interface

  NS_IMETHOD GetSupportsMultiple(bool* _retval) {
    *_retval = true;
    return NS_OK;
  }

  NS_IMETHOD GetAutoFind(char16_t** description, bool* _retval);

  NS_IMETHOD GetDefaultLocation(nsIFile** location) { return NS_ERROR_FAILURE; }

  NS_IMETHOD FindAddressBooks(nsIFile* location,
                              nsTArray<RefPtr<nsIImportABDescriptor>>& books);

  NS_IMETHOD ImportAddressBook(nsIImportABDescriptor* source,
                               nsIAbDirectory* destination,
                               nsISupports* aSupportService,
                               char16_t** errorLog, char16_t** successLog,
                               bool* fatalError);

  NS_IMETHOD GetImportProgress(uint32_t* _retval);

 private:
  virtual ~ImportOutlookAddressImpl();
  void ReportSuccess(nsString& name, nsString* pStream);

 private:
  uint32_t m_msgCount;
  uint32_t m_msgTotal;
  nsOutlookMail m_address;
};
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////

nsOutlookImport::nsOutlookImport() {
  IMPORT_LOG0("nsOutlookImport Module Created\n");

  nsOutlookStringBundle::GetStringBundle();
}

nsOutlookImport::~nsOutlookImport() {
  IMPORT_LOG0("nsOutlookImport Module Deleted\n");
}

NS_IMPL_ISUPPORTS(nsOutlookImport, nsIImportModule)

NS_IMETHODIMP nsOutlookImport::GetImportInterface(const char* pImportType,
                                                  nsISupports** ppInterface) {
  NS_ASSERTION(pImportType != nullptr, "null ptr");
  if (!pImportType) return NS_ERROR_NULL_POINTER;
  NS_ASSERTION(ppInterface != nullptr, "null ptr");
  if (!ppInterface) return NS_ERROR_NULL_POINTER;

  *ppInterface = nullptr;
  nsresult rv;
  if (!strcmp(pImportType, "mail")) {
    // create the nsIImportMail interface and return it!
    nsCOMPtr<nsIImportMail> pMail;
    nsCOMPtr<nsIImportGeneric> pGeneric;
    rv = ImportOutlookMailImpl::Create(getter_AddRefs(pMail));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIImportService> impSvc(
          do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
      if (NS_SUCCEEDED(rv)) {
        rv = impSvc->CreateNewGenericMail(getter_AddRefs(pGeneric));
        if (NS_SUCCEEDED(rv)) {
          pGeneric->SetData("mailInterface", pMail);
          nsString name;
          nsOutlookStringBundle::GetStringByID(OUTLOOKIMPORT_NAME, name);
          nsCOMPtr<nsISupportsString> nameString(
              do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID, &rv));
          if (NS_SUCCEEDED(rv)) {
            nameString->SetData(name);
            pGeneric->SetData("name", nameString);
            nsCOMPtr<nsISupports> pInterface(do_QueryInterface(pGeneric));
            pInterface.forget(ppInterface);
          }
        }
      }
    }
    return rv;
  }

  if (!strcmp(pImportType, "addressbook")) {
    // create the nsIImportAddressBook interface and return it!
    nsCOMPtr<nsIImportAddressBooks> pAddress;
    nsCOMPtr<nsIImportGeneric> pGeneric;
    rv = ImportOutlookAddressImpl::Create(getter_AddRefs(pAddress));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIImportService> impSvc(
          do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
      if (NS_SUCCEEDED(rv)) {
        rv = impSvc->CreateNewGenericAddressBooks(getter_AddRefs(pGeneric));
        if (NS_SUCCEEDED(rv)) {
          pGeneric->SetData("addressInterface", pAddress);
          nsCOMPtr<nsISupports> pInterface(do_QueryInterface(pGeneric));
          pInterface.forget(ppInterface);
        }
      }
    }
    return rv;
  }

  if (!strcmp(pImportType, "settings")) {
    nsCOMPtr<nsIImportSettings> pSettings;
    rv = nsOutlookSettings::Create(getter_AddRefs(pSettings));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsISupports> pInterface(do_QueryInterface(pSettings));
      pInterface.forget(ppInterface);
    }
    return rv;
  }

  return NS_ERROR_NOT_AVAILABLE;
}

/////////////////////////////////////////////////////////////////////////////////
nsresult ImportOutlookMailImpl::Create(nsIImportMail** aImport) {
  NS_ENSURE_ARG_POINTER(aImport);
  NS_ADDREF(*aImport = new ImportOutlookMailImpl());
  return NS_OK;
}

ImportOutlookMailImpl::ImportOutlookMailImpl() {
  nsOutlookCompose::CreateIdentity();
}

ImportOutlookMailImpl::~ImportOutlookMailImpl() {
  nsOutlookCompose::ReleaseIdentity();
}

NS_IMPL_ISUPPORTS(ImportOutlookMailImpl, nsIImportMail)

NS_IMETHODIMP ImportOutlookMailImpl::GetDefaultLocation(nsIFile** ppLoc) {
  NS_ASSERTION(ppLoc != nullptr, "null ptr");
  if (!ppLoc) return NS_ERROR_NULL_POINTER;

  *ppLoc = nullptr;
  // We need to verify here that we can get the mail, if true then
  // return a dummy location, otherwise return no location
  CMapiApi mapi;
  if (!mapi.Initialize()) return NS_OK;
  if (!mapi.LogOn()) return NS_OK;

  CMapiFolderList store;
  if (!mapi.IterateStores(store)) return NS_OK;

  if (store.GetSize() == 0) return NS_OK;

  nsCOMPtr<nsIFile> resultFile = new nsLocalFile();
  resultFile.forget(ppLoc);

  return NS_OK;
}

NS_IMETHODIMP ImportOutlookMailImpl::FindMailboxes(
    nsIFile* pLoc, nsTArray<RefPtr<nsIImportMailboxDescriptor>>& boxes) {
  NS_ASSERTION(pLoc != nullptr, "null ptr");
  if (!pLoc) return NS_ERROR_NULL_POINTER;
  return m_mail.GetMailFolders(boxes);
}

void ImportOutlookMailImpl::AddLinebreak(nsString* pStream) {
  if (pStream) pStream->Append(char16_t('\n'));
}

void ImportOutlookMailImpl::ReportSuccess(nsString& name, int32_t count,
                                          nsString* pStream) {
  if (!pStream) return;
  // load the success string
  char16_t* pFmt =
      nsOutlookStringBundle::GetStringByID(OUTLOOKIMPORT_MAILBOX_SUCCESS);
  nsString pText;
  nsTextFormatter::ssprintf(pText, pFmt, name.get(), count);
  pStream->Append(pText);
  nsOutlookStringBundle::FreeString(pFmt);
  AddLinebreak(pStream);
}

void ImportOutlookMailImpl::ReportError(int32_t errorNum, nsString& name,
                                        nsString* pStream) {
  if (!pStream) return;
  // load the error string
  char16_t* pFmt = nsOutlookStringBundle::GetStringByID(errorNum);
  nsString pText;
  nsTextFormatter::ssprintf(pText, pFmt, name.get());
  pStream->Append(pText);
  nsOutlookStringBundle::FreeString(pFmt);
  AddLinebreak(pStream);
}

void ImportOutlookMailImpl::SetLogs(nsString& success, nsString& error,
                                    char16_t** pError, char16_t** pSuccess) {
  if (pError) *pError = ToNewUnicode(error);
  if (pSuccess) *pSuccess = ToNewUnicode(success);
}

NS_IMETHODIMP
ImportOutlookMailImpl::ImportMailbox(nsIImportMailboxDescriptor* pSource,
                                     nsIMsgFolder* dstFolder,
                                     char16_t** pErrorLog,
                                     char16_t** pSuccessLog, bool* fatalError) {
  NS_ENSURE_ARG_POINTER(pSource);
  NS_ENSURE_ARG_POINTER(dstFolder);
  NS_ENSURE_ARG_POINTER(fatalError);

  nsString success;
  nsString error;
  bool abort = false;
  nsString name;
  char16_t* pName;
  if (NS_SUCCEEDED(pSource->GetDisplayName(&pName))) {
    name = pName;
    free(pName);
  }

  uint32_t mailSize = 0;
  pSource->GetSize(&mailSize);
  if (mailSize == 0) {
    ReportSuccess(name, 0, &success);
    SetLogs(success, error, pErrorLog, pSuccessLog);
    return NS_OK;
  }

  uint32_t index = 0;
  pSource->GetIdentifier(&index);
  int32_t msgCount = 0;
  nsresult rv = NS_OK;

  m_bytesDone = 0;

  rv = m_mail.ImportMailbox(&m_bytesDone, &abort, (int32_t)index, name.get(),
                            dstFolder, &msgCount);

  if (NS_SUCCEEDED(rv))
    ReportSuccess(name, msgCount, &success);
  else
    ReportError(OUTLOOKIMPORT_MAILBOX_CONVERTERROR, name, &error);

  SetLogs(success, error, pErrorLog, pSuccessLog);

  return rv;
}

NS_IMETHODIMP ImportOutlookMailImpl::GetImportProgress(uint32_t* pDoneSoFar) {
  NS_ASSERTION(pDoneSoFar != nullptr, "null ptr");
  if (!pDoneSoFar) return NS_ERROR_NULL_POINTER;

  *pDoneSoFar = m_bytesDone;
  return NS_OK;
}

NS_IMETHODIMP ImportOutlookMailImpl::TranslateFolderName(
    const nsAString& aFolderName, nsAString& _retval) {
  if (aFolderName.LowerCaseEqualsLiteral("deleted items"))
    _retval = NS_LITERAL_STRING_FROM_CSTRING(kDestTrashFolderName);
  else if (aFolderName.LowerCaseEqualsLiteral("sent items"))
    _retval = NS_LITERAL_STRING_FROM_CSTRING(kDestSentFolderName);
  else if (aFolderName.LowerCaseEqualsLiteral("outbox"))
    _retval = NS_LITERAL_STRING_FROM_CSTRING(kDestUnsentMessagesFolderName);
  else
    _retval = aFolderName;
  return NS_OK;
}

nsresult ImportOutlookAddressImpl::Create(nsIImportAddressBooks** aImport) {
  NS_ENSURE_ARG_POINTER(aImport);
  NS_ADDREF(*aImport = new ImportOutlookAddressImpl());
  return NS_OK;
}

ImportOutlookAddressImpl::ImportOutlookAddressImpl() {
  m_msgCount = 0;
  m_msgTotal = 0;
}

ImportOutlookAddressImpl::~ImportOutlookAddressImpl() {}

NS_IMPL_ISUPPORTS(ImportOutlookAddressImpl, nsIImportAddressBooks)

NS_IMETHODIMP ImportOutlookAddressImpl::GetAutoFind(char16_t** description,
                                                    bool* _retval) {
  NS_ASSERTION(description != nullptr, "null ptr");
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!description || !_retval) return NS_ERROR_NULL_POINTER;

  *_retval = true;
  nsString str;
  nsOutlookStringBundle::GetStringByID(OUTLOOKIMPORT_ADDRNAME, str);
  *description = ToNewUnicode(str);
  return NS_OK;
}

NS_IMETHODIMP ImportOutlookAddressImpl::FindAddressBooks(
    nsIFile* location, nsTArray<RefPtr<nsIImportABDescriptor>>& books) {
  return m_address.GetAddressBooks(books);
}

NS_IMETHODIMP ImportOutlookAddressImpl::ImportAddressBook(
    nsIImportABDescriptor* source, nsIAbDirectory* destination,
    nsISupports* aSupportService, char16_t** pErrorLog, char16_t** pSuccessLog,
    bool* fatalError) {
  m_msgCount = 0;
  m_msgTotal = 0;
  NS_ASSERTION(source != nullptr, "null ptr");
  NS_ASSERTION(destination != nullptr, "null ptr");
  NS_ASSERTION(fatalError != nullptr, "null ptr");

  nsString success;
  nsString error;
  if (!source || !destination || !fatalError) {
    IMPORT_LOG0("*** Bad param passed to outlook address import\n");
    nsOutlookStringBundle::GetStringByID(OUTLOOKIMPORT_ADDRESS_BADPARAM, error);
    if (fatalError) *fatalError = true;
    ImportOutlookMailImpl::SetLogs(success, error, pErrorLog, pSuccessLog);
    return NS_ERROR_NULL_POINTER;
  }

  nsString name;
  source->GetPreferredName(name);

  uint32_t id;
  if (NS_FAILED(source->GetIdentifier(&id))) {
    ImportOutlookMailImpl::ReportError(OUTLOOKIMPORT_ADDRESS_BADSOURCEFILE,
                                       name, &error);
    ImportOutlookMailImpl::SetLogs(success, error, pErrorLog, pSuccessLog);
    return NS_ERROR_FAILURE;
  }

  nsresult rv = NS_OK;
  rv = m_address.ImportAddresses(&m_msgCount, &m_msgTotal, name.get(), id,
                                 destination, error);
  if (NS_SUCCEEDED(rv) && error.IsEmpty())
    ReportSuccess(name, &success);
  else
    ImportOutlookMailImpl::ReportError(OUTLOOKIMPORT_ADDRESS_CONVERTERROR, name,
                                       &error);

  ImportOutlookMailImpl::SetLogs(success, error, pErrorLog, pSuccessLog);
  IMPORT_LOG0("*** Returning from outlook address import\n");
  return NS_OK;
}

NS_IMETHODIMP ImportOutlookAddressImpl::GetImportProgress(uint32_t* _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  uint32_t result = m_msgCount;
  if (m_msgTotal) {
    result *= 100;
    result /= m_msgTotal;
  } else
    result = 0;

  if (result > 100) result = 100;

  *_retval = result;

  return NS_OK;
}

void ImportOutlookAddressImpl::ReportSuccess(nsString& name,
                                             nsString* pStream) {
  if (!pStream) return;
  // load the success string
  char16_t* pFmt =
      nsOutlookStringBundle::GetStringByID(OUTLOOKIMPORT_ADDRESS_SUCCESS);
  nsString pText;
  nsTextFormatter::ssprintf(pText, pFmt, name.get());
  pStream->Append(pText);
  nsOutlookStringBundle::FreeString(pFmt);
  ImportOutlookMailImpl::AddLinebreak(pStream);
}
