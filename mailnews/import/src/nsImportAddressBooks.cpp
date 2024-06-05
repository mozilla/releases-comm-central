/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsImportAddressBooks.h"

#include "plstr.h"
#include "nsIImportService.h"
#include "nsISupportsPrimitives.h"
#include "nsIImportABDescriptor.h"
#include "nsIAbManager.h"
#include "nsImportStringBundle.h"
#include "nsTextFormatter.h"
#include "msgCore.h"
#include "ImportDebug.h"

static void ImportAddressThread(void* stuff);

nsresult NS_NewGenericAddressBooks(nsIImportGeneric** aImportGeneric) {
  NS_ASSERTION(aImportGeneric != nullptr, "null ptr");
  if (!aImportGeneric) return NS_ERROR_NULL_POINTER;

  RefPtr<nsImportGenericAddressBooks> pGen = new nsImportGenericAddressBooks();
  return pGen->QueryInterface(NS_GET_IID(nsIImportGeneric),
                              (void**)aImportGeneric);
}

nsImportGenericAddressBooks::nsImportGenericAddressBooks() {
  m_totalSize = 0;
  m_doImport = false;
  m_pThreadData = nullptr;

  m_autoFind = false;
  m_description = nullptr;
  m_gotLocation = false;

  nsImportStringBundle::GetStringBundle(IMPORT_MSGS_URL,
                                        getter_AddRefs(m_stringBundle));
}

nsImportGenericAddressBooks::~nsImportGenericAddressBooks() {
  if (m_description) free(m_description);
}

NS_IMPL_ISUPPORTS(nsImportGenericAddressBooks, nsIImportGeneric)

NS_IMETHODIMP nsImportGenericAddressBooks::GetData(const char* dataId,
                                                   nsISupports** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  nsresult rv;
  *_retval = nullptr;
  if (!PL_strcasecmp(dataId, "addressInterface")) {
    NS_IF_ADDREF(*_retval = m_pInterface);
  }

  if (!PL_strcasecmp(dataId, "addressLocation")) {
    if (!m_pLocation) GetDefaultLocation();
    NS_IF_ADDREF(*_retval = m_pLocation);
  }

  if (!PL_strcasecmp(dataId, "addressDestination")) {
    if (!m_pDestinationUri.IsEmpty()) {
      nsCOMPtr<nsISupportsCString> abString =
          do_CreateInstance(NS_SUPPORTS_CSTRING_CONTRACTID, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      abString->SetData(m_pDestinationUri);
      abString.forget(_retval);
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsImportGenericAddressBooks::SetData(const char* dataId,
                                                   nsISupports* item) {
  NS_ASSERTION(dataId != nullptr, "null ptr");
  if (!dataId) return NS_ERROR_NULL_POINTER;

  if (!PL_strcasecmp(dataId, "addressInterface")) {
    m_pInterface = nullptr;
    if (item) m_pInterface = do_QueryInterface(item);
  }

  if (!PL_strcasecmp(dataId, "addressLocation")) {
    m_pLocation = nullptr;

    if (item) {
      nsresult rv;
      m_pLocation = do_QueryInterface(item, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  if (!PL_strcasecmp(dataId, "addressDestination")) {
    if (item) {
      nsCOMPtr<nsISupportsCString> abString = do_QueryInterface(item);
      if (abString) {
        abString->GetData(m_pDestinationUri);
      }
    }
  }

  return NS_OK;
}

void nsImportGenericAddressBooks::GetDefaultLocation(void) {
  if (!m_pInterface) return;

  if ((m_pLocation && m_gotLocation) || m_autoFind) return;

  if (m_description) free(m_description);
  m_description = nullptr;
  m_pInterface->GetAutoFind(&m_description, &m_autoFind);
  m_gotLocation = true;
  if (m_autoFind) {
    return;
  }

  if (!m_pLocation) {
    m_pInterface->GetDefaultLocation(getter_AddRefs(m_pLocation));
  }
}

void nsImportGenericAddressBooks::GetDefaultBooks(void) {
  if (!m_pInterface) return;

  if (!m_pLocation && !m_autoFind) return;

  nsresult rv = m_pInterface->FindAddressBooks(m_pLocation, m_Books);
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error: FindAddressBooks failed\n");
  }
}

NS_IMETHODIMP nsImportGenericAddressBooks::WantsProgress(bool* _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  NS_ENSURE_ARG_POINTER(_retval);

  GetDefaultLocation();
  GetDefaultBooks();

  bool result = false;
  uint32_t totalSize = 0;

  for (nsIImportABDescriptor* book : m_Books) {
    bool doImport = false;
    nsresult rv = book->GetImport(&doImport);
    if (NS_SUCCEEDED(rv) && doImport) {
      uint32_t size = 0;
      (void)book->GetSize(&size);
      result = true;
      totalSize += size;
    }
  }
  m_totalSize = totalSize;
  m_doImport = result;

  *_retval = result;

  return NS_OK;
}

void nsImportGenericAddressBooks::SetLogs(nsString& success, nsString& error,
                                          nsISupportsString* pSuccess,
                                          nsISupportsString* pError) {
  nsAutoString str;
  if (pSuccess) {
    pSuccess->GetData(str);
    str.Append(success);
    pSuccess->SetData(success);
  }
  if (pError) {
    pError->GetData(str);
    str.Append(error);
    pError->SetData(error);
  }
}

already_AddRefed<nsIAbDirectory> GetAddressBookFromUri(const char* pUri) {
  if (!pUri) return nullptr;

  nsCOMPtr<nsIAbManager> abManager = do_GetService("@mozilla.org/abmanager;1");
  if (!abManager) return nullptr;

  nsCOMPtr<nsIAbDirectory> directory;
  abManager->GetDirectory(nsDependentCString(pUri), getter_AddRefs(directory));
  if (!directory) return nullptr;

  return directory.forget();
}

already_AddRefed<nsIAbDirectory> GetAddressBook(nsString name, bool makeNew) {
  if (!makeNew) {
    // FIXME: How do I get the list of address books and look for a
    // specific name.  Major bogosity!
    // For now, assume we didn't find anything with that name
  }

  IMPORT_LOG0("In GetAddressBook\n");

  nsresult rv;
  nsCOMPtr<nsIAbDirectory> directory;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString dirPrefId;
    rv = abManager->NewAddressBook(name, EmptyCString(),
                                   nsIAbManager::JS_DIRECTORY_TYPE,
                                   EmptyCString(), dirPrefId);
    if (NS_SUCCEEDED(rv)) {
      rv = abManager->GetDirectoryFromId(dirPrefId, getter_AddRefs(directory));
    }
  }

  return directory.forget();
}

NS_IMETHODIMP nsImportGenericAddressBooks::BeginImport(
    nsISupportsString* successLog, nsISupportsString* errorLog, bool* _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  nsString success;
  nsString error;

  if (!m_doImport) {
    *_retval = true;
    nsImportStringBundle::GetStringByID(IMPORT_NO_ADDRBOOKS, m_stringBundle,
                                        success);
    SetLogs(success, error, successLog, errorLog);
    return NS_OK;
  }

  if (!m_pInterface) {
    nsImportStringBundle::GetStringByID(IMPORT_ERROR_AB_NOTINITIALIZED,
                                        m_stringBundle, error);
    SetLogs(success, error, successLog, errorLog);
    *_retval = false;
    return NS_OK;
  }

  m_pSuccessLog = successLog;
  m_pErrorLog = errorLog;

  // create the info need to drive address book import. We're
  // not going to create a new thread for this since address books
  // don't tend to be large, and import is rare.
  m_pThreadData = new AddressThreadData();
  m_pThreadData->books = m_Books.Clone();
  m_pThreadData->addressImport = m_pInterface;
  m_pThreadData->errorLog = m_pErrorLog;
  m_pThreadData->successLog = m_pSuccessLog;
  m_pThreadData->pDestinationUri = m_pDestinationUri;

  // Create/obtain any address books that we need here, so that we don't need
  // to do so inside the import thread which would just proxy the create
  // operations back to the main thread anyway.
  nsCOMPtr<nsIAbDirectory> db;
  if (!m_pDestinationUri.IsEmpty()) {
    db = GetAddressBookFromUri(m_pDestinationUri.get());
  }
  for (nsIImportABDescriptor* book : m_Books) {
    if (!db) {
      nsString name;
      book->GetPreferredName(name);
      db = GetAddressBook(name, true);
    }
    m_DBs.AppendObject(db);
  }
  m_pThreadData->dBs = &m_DBs;

  m_pThreadData->stringBundle = m_stringBundle;

  nsresult rv;
  m_pThreadData->ldifService =
      do_GetService("@mozilla.org/addressbook/abldifservice;1", &rv);

  ImportAddressThread(m_pThreadData);
  delete m_pThreadData;
  m_pThreadData = nullptr;
  *_retval = true;

  return NS_OK;
}

NS_IMETHODIMP nsImportGenericAddressBooks::ContinueImport(bool* _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  *_retval = true;
  if (m_pThreadData) {
    if (m_pThreadData->fatalError) *_retval = false;
  }

  return NS_OK;
}

NS_IMETHODIMP nsImportGenericAddressBooks::GetProgress(int32_t* _retval) {
  // This returns the progress from the the currently
  // running import mail or import address book thread.
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  if (!m_pThreadData || !(m_pThreadData->threadAlive)) {
    *_retval = 100;
    return NS_OK;
  }

  uint32_t sz = 0;
  if (m_pThreadData->currentSize && m_pInterface) {
    if (NS_FAILED(m_pInterface->GetImportProgress(&sz))) sz = 0;
  }

  if (m_totalSize)
    *_retval = ((m_pThreadData->currentTotal + sz) * 100) / m_totalSize;
  else
    *_retval = 0;

  // never return less than 5 so it looks like we are doing something!
  if (*_retval < 5) *_retval = 5;

  // as long as the thread is alive don't return completely
  // done.
  if (*_retval > 99) *_retval = 99;

  return NS_OK;
}

NS_IMETHODIMP nsImportGenericAddressBooks::CancelImport(void) {
  if (m_pThreadData) {
    m_pThreadData->abort = true;
    m_pThreadData = nullptr;
  }

  return NS_OK;
}

AddressThreadData::AddressThreadData() {
  fatalError = false;
  driverAlive = true;
  threadAlive = true;
  abort = false;
  currentTotal = 0;
  currentSize = 0;
}

AddressThreadData::~AddressThreadData() {}

void nsImportGenericAddressBooks::ReportError(const char16_t* pName,
                                              nsString* pStream,
                                              nsIStringBundle* aBundle) {
  if (!pStream) return;
  // load the error string
  char16_t* pFmt =
      nsImportStringBundle::GetStringByID(IMPORT_ERROR_GETABOOK, aBundle);
  nsString pText;
  nsTextFormatter::ssprintf(pText, pFmt, pName);
  pStream->Append(pText);
  free(pFmt);
  pStream->AppendLiteral(MSG_LINEBREAK);
}

static void ImportAddressThread(void* stuff) {
  IMPORT_LOG0("In Begin ImportAddressThread\n");

  AddressThreadData* pData = (AddressThreadData*)stuff;

  nsString success;
  nsString error;

  uint32_t count = pData->books.Length();
  for (uint32_t i = 0; (i < count) && !(pData->abort); i++) {
    nsIImportABDescriptor* book = pData->books[i];

    uint32_t size = 0;
    bool doImport = false;
    nsresult rv = book->GetImport(&doImport);
    if (NS_SUCCEEDED(rv) && doImport) rv = book->GetSize(&size);

    if (NS_SUCCEEDED(rv) && size && doImport) {
      nsString name;
      book->GetPreferredName(name);

      nsCOMPtr<nsIAbDirectory> db = pData->dBs->ObjectAt(i);

      bool fatalError = false;
      pData->currentSize = size;
      if (db) {
        char16_t* pSuccess = nullptr;
        char16_t* pError = nullptr;

        rv = pData->addressImport->ImportAddressBook(
            book, db, pData->ldifService, &pError, &pSuccess, &fatalError);
        if (NS_SUCCEEDED(rv) && pSuccess) {
          success.Append(pSuccess);
          free(pSuccess);
        }
        if (pError) {
          error.Append(pError);
          free(pError);
        }
      } else {
        nsImportGenericAddressBooks::ReportError(name.get(), &error,
                                                 pData->stringBundle);
      }

      pData->currentSize = 0;
      pData->currentTotal += size;

      if (fatalError) {
        pData->fatalError = true;
        break;
      }
    }
  }

  nsImportGenericAddressBooks::SetLogs(success, error, pData->successLog,
                                       pData->errorLog);

  if (pData->abort || pData->fatalError) {
    // FIXME: do what is necessary to get rid of what has been imported so far.
    // Nothing if we went into an existing address book!  Otherwise, delete
    // the ones we created?
  }
}
