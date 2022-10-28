/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Mork import addressbook interfaces
 */

#include "MorkImport.h"

#include "nsCOMPtr.h"
#include "nsIImportService.h"
#include "nsIImportGeneric.h"
#include "nsIImportAddressBooks.h"
#include "nsIImportABDescriptor.h"
#include "nsIImportFieldMap.h"
#include "nsImportStringBundle.h"
#include "nsIComponentManager.h"
#include "nsIAbDirectory.h"
#include "nsAddrDatabase.h"
#include "nsInterfaceHashtable.h"
#include "nsHashKeys.h"

static const char kRowIDProperty[] = "DbRowID";

class MorkImportAddressImpl final : public nsIImportAddressBooks {
 public:
  explicit MorkImportAddressImpl(nsIStringBundle* aStringBundle);

  static nsresult Create(nsIImportAddressBooks** aImport,
                         nsIStringBundle* aStringBundle);

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMPORTADDRESSBOOKS

 private:
  ~MorkImportAddressImpl() {}
  nsCOMPtr<nsIFile> mFileLocation;
  nsCOMPtr<nsIStringBundle> mStringBundle;
};

MorkImport::MorkImport() {
  nsImportStringBundle::GetStringBundle(
      "chrome://messenger/locale/morkImportMsgs.properties",
      getter_AddRefs(mStringBundle));
}

MorkImport::~MorkImport() {}

NS_IMPL_ISUPPORTS(MorkImport, nsIImportModule)

NS_IMETHODIMP MorkImport::GetName(char16_t** name) {
  NS_ENSURE_ARG_POINTER(name);
  *name =
      nsImportStringBundle::GetStringByName("morkImportName", mStringBundle);
  return NS_OK;
}

NS_IMETHODIMP MorkImport::GetDescription(char16_t** description) {
  NS_ENSURE_ARG_POINTER(description);
  *description = nsImportStringBundle::GetStringByName("morkImportDescription",
                                                       mStringBundle);
  return NS_OK;
}

NS_IMETHODIMP MorkImport::GetSupports(char** supports) {
  NS_ENSURE_ARG_POINTER(supports);
  *supports = strdup(NS_IMPORT_ADDRESS_STR);
  return NS_OK;
}

NS_IMETHODIMP MorkImport::GetSupportsUpgrade(bool* upgrade) {
  NS_ENSURE_ARG_POINTER(upgrade);
  *upgrade = false;
  return NS_OK;
}

NS_IMETHODIMP MorkImport::GetImportInterface(const char* importType,
                                             nsISupports** interface) {
  NS_ENSURE_ARG_POINTER(importType);
  NS_ENSURE_ARG_POINTER(interface);

  *interface = nullptr;
  nsresult rv;

  if (strcmp(importType, "addressbook")) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  nsCOMPtr<nsIImportAddressBooks> pAddress;
  nsCOMPtr<nsIImportGeneric> pGeneric;
  rv = MorkImportAddressImpl::Create(getter_AddRefs(pAddress), mStringBundle);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImportService> impSvc(
      do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = impSvc->CreateNewGenericAddressBooks(getter_AddRefs(pGeneric));
  NS_ENSURE_SUCCESS(rv, rv);
  pGeneric->SetData("addressInterface", pAddress);
  nsCOMPtr<nsISupports> pInterface(do_QueryInterface(pGeneric));
  pInterface.forget(interface);

  return NS_OK;
}

/////////////////////////////////////////////////////////////////////////////////

nsresult MorkImportAddressImpl::Create(nsIImportAddressBooks** aImport,
                                       nsIStringBundle* aStringBundle) {
  NS_ENSURE_ARG_POINTER(aImport);
  NS_ADDREF(*aImport = new MorkImportAddressImpl(aStringBundle));
  return NS_OK;
}

MorkImportAddressImpl::MorkImportAddressImpl(nsIStringBundle* aStringBundle)
    : mStringBundle(aStringBundle) {}

NS_IMPL_ISUPPORTS(MorkImportAddressImpl, nsIImportAddressBooks)

NS_IMETHODIMP MorkImportAddressImpl::GetSupportsMultiple(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = false;
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::GetAutoFind(char16_t** addrDescription,
                                                 bool* _retval) {
  NS_ENSURE_ARG_POINTER(addrDescription);
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = false;
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::GetNeedsFieldMap(nsIFile* aLocation,
                                                      bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = false;
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::GetDefaultLocation(nsIFile** ppLoc,
                                                        bool* found,
                                                        bool* userVerify) {
  NS_ENSURE_ARG_POINTER(ppLoc);
  NS_ENSURE_ARG_POINTER(found);
  NS_ENSURE_ARG_POINTER(userVerify);

  *ppLoc = nullptr;
  *found = false;
  *userVerify = true;
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::FindAddressBooks(
    nsIFile* pLoc, nsTArray<RefPtr<nsIImportABDescriptor>>& books) {
  NS_ENSURE_ARG_POINTER(pLoc);

  books.Clear();
  bool exists = false;
  nsresult rv = pLoc->Exists(&exists);
  if (NS_FAILED(rv) || !exists) return NS_ERROR_FAILURE;

  bool isFile = false;
  rv = pLoc->IsFile(&isFile);
  if (NS_FAILED(rv) || !isFile) return NS_ERROR_FAILURE;

  mFileLocation = pLoc;

  /* Build an address book descriptor based on the file passed in! */
  nsString name;
  rv = mFileLocation->GetLeafName(name);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t idx = name.RFindChar('.');
  if ((idx != -1) && (idx > 0) && ((name.Length() - idx - 1) < 5)) {
    name.SetLength(idx);
  }

  nsCOMPtr<nsIImportABDescriptor> desc;

  nsCOMPtr<nsIImportService> impSvc(
      do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = impSvc->CreateNewABDescriptor(getter_AddRefs(desc));
  NS_ENSURE_SUCCESS(rv, rv);

  int64_t sz = 0;
  pLoc->GetFileSize(&sz);
  desc->SetPreferredName(name);
  desc->SetSize((uint32_t)sz);
  desc->SetAbFile(mFileLocation);
  books.AppendElement(desc);
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::InitFieldMap(nsIImportFieldMap* fieldMap) {
  return NS_OK;
}

NS_IMETHODIMP
MorkImportAddressImpl::ImportAddressBook(
    nsIImportABDescriptor* pSource, nsIAbDirectory* pDestination,
    nsIImportFieldMap* fieldMap, nsISupports* aSupportService,
    char16_t** pErrorLog, char16_t** pSuccessLog, bool* fatalError) {
  NS_ENSURE_ARG_POINTER(pSource);
  NS_ENSURE_ARG_POINTER(pDestination);
  NS_ENSURE_ARG_POINTER(fatalError);

  nsCOMPtr<nsIFile> oldFile;
  pSource->GetAbFile(getter_AddRefs(oldFile));

  nsresult rv = ReadMABToDirectory(oldFile, pDestination);

  *pSuccessLog =
      nsImportStringBundle::GetStringByName("morkImportSuccess", mStringBundle);
  return rv;
}

nsresult ReadMABToDirectory(nsIFile* oldFile, nsIAbDirectory* newDirectory) {
  nsresult rv;

  nsAddrDatabase database = nsAddrDatabase();
  database.SetDbPath(oldFile);
  database.OpenMDB(oldFile, false);

  nsInterfaceHashtable<nsUint32HashKey, nsIAbCard> cardMap;

  nsCOMPtr<nsISimpleEnumerator> enumerator;
  database.EnumerateCards(getter_AddRefs(enumerator));

  nsCOMPtr<nsISupports> supports;
  nsCOMPtr<nsIAbCard> card;
  bool isMailList;
  while (NS_SUCCEEDED(enumerator->GetNext(getter_AddRefs(supports))) &&
         supports) {
    card = do_QueryInterface(supports);

    card->GetIsMailList(&isMailList);
    if (isMailList) {
      continue;
    }

    uint32_t rowId;
    card->GetPropertyAsUint32(kRowIDProperty, &rowId);
    cardMap.InsertOrUpdate(rowId, card);

    nsIAbCard* outCard;
    newDirectory->AddCard(card, &outCard);
  }

  database.EnumerateCards(getter_AddRefs(enumerator));

  while (NS_SUCCEEDED(enumerator->GetNext(getter_AddRefs(supports))) &&
         supports) {
    card = do_QueryInterface(supports);
    card->GetIsMailList(&isMailList);

    if (!isMailList) {
      continue;
    }

    nsCOMPtr<nsIAbDirectory> mailList =
        do_CreateInstance("@mozilla.org/addressbook/directoryproperty;1");
    mailList->SetIsMailList(true);

    nsAutoString listName;
    card->GetDisplayName(listName);
    mailList->SetDirName(listName);

    nsAutoString nickName;
    rv = card->GetPropertyAsAString("NickName", nickName);
    if (NS_SUCCEEDED(rv)) {
      mailList->SetListNickName(nickName);
    }

    nsAutoString description;
    rv = card->GetPropertyAsAString("Notes", description);
    if (NS_SUCCEEDED(rv)) {
      mailList->SetDescription(description);
    }

    nsIAbDirectory* outList;
    rv = newDirectory->AddMailList(mailList, &outList);
    if (NS_FAILED(rv)) {
      continue;
    }

    uint32_t listRowId;
    card->GetPropertyAsUint32(kRowIDProperty, &listRowId);

    nsCOMPtr<nsISimpleEnumerator> listEnumerator;
    database.EnumerateListAddresses(listRowId, getter_AddRefs(listEnumerator));

    nsCOMPtr<nsISupports> listSupports;
    nsCOMPtr<nsIAbCard> listCard;
    while (
        NS_SUCCEEDED(listEnumerator->GetNext(getter_AddRefs(listSupports))) &&
        listSupports) {
      listCard = do_QueryInterface(listSupports);

      uint32_t rowId;
      listCard->GetPropertyAsUint32(kRowIDProperty, &rowId);
      cardMap.Get(rowId, getter_AddRefs(listCard));

      nsIAbCard* outCard;
      outList->AddCard(listCard, &outCard);
    }
  }

  database.ForceClosed();
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::GetImportProgress(uint32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = 0;
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::SetSampleLocation(nsIFile* pLocation) {
  NS_ENSURE_ARG_POINTER(pLocation);
  return NS_OK;
}

NS_IMETHODIMP MorkImportAddressImpl::GetSampleData(int32_t index, bool* pFound,
                                                   char16_t** pStr) {
  return NS_OK;
}

NS_IMPL_ISUPPORTS(nsImportABFromMab, nsIImportABFile)

nsImportABFromMab::nsImportABFromMab() {}

NS_IMETHODIMP
nsImportABFromMab::ReadFileToDirectory(nsIFile* sourceFile,
                                       nsIAbDirectory* targetDirectory) {
  return ReadMABToDirectory(sourceFile, targetDirectory);
}
