/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Mork import addressbook interfaces
 */

#include "MorkImport.h"

#include "nsIComponentManager.h"
#include "nsIAbDirectory.h"
#include "nsAddrDatabase.h"
#include "nsInterfaceHashtable.h"
#include "nsHashKeys.h"

static const char kRowIDProperty[] = "DbRowID";

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

NS_IMPL_ISUPPORTS(nsImportABFromMab, nsIImportABFile)

nsImportABFromMab::nsImportABFromMab() {}

NS_IMETHODIMP
nsImportABFromMab::ReadFileToDirectory(nsIFile* sourceFile,
                                       nsIAbDirectory* targetDirectory) {
  return ReadMABToDirectory(sourceFile, targetDirectory);
}
