/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsAbOutlookDirectory.h"
#include "nsAbWinHelper.h"

#include "nsString.h"
#include "nsAbDirectoryQuery.h"
#include "nsIAbBooleanExpression.h"
#include "nsIAbManager.h"
#include "nsAbQueryStringToExpression.h"
#include "nsEnumeratorUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "mozilla/ErrorNames.h"
#include "mozilla/Logging.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsCRTGlue.h"
#include "nsArrayUtils.h"
#include "nsMsgUtils.h"
#include "nsQueryObject.h"
#include "mozilla/Services.h"
#include "nsIObserverService.h"
#include "mozilla/JSONStringWriteFuncs.h"

#define PRINT_TO_CONSOLE 0
#if PRINT_TO_CONSOLE
#  define PRINTF(args) printf args
#else
static mozilla::LazyLogModule gAbOutlookDirectoryLog("AbOutlookDirectory");
#  define PRINTF(args) \
    MOZ_LOG(gAbOutlookDirectoryLog, mozilla::LogLevel::Debug, args)
#endif

nsAbOutlookDirectory::nsAbOutlookDirectory(void)
    : nsAbDirProperty(),
      mDirEntry(nullptr),
      mCurrentQueryId(0),
      mSearchContext(-1) {
  mDirEntry = new nsMapiEntry;
}

nsAbOutlookDirectory::~nsAbOutlookDirectory(void) {
  if (mDirEntry) {
    delete mDirEntry;
  }
}

NS_IMPL_ISUPPORTS_INHERITED(nsAbOutlookDirectory, nsAbDirProperty,
                            nsIAbDirectoryQuery, nsIAbDirSearchListener)

NS_IMETHODIMP nsAbOutlookDirectory::Init(const char* aUri) {
  nsresult rv = nsAbDirProperty::Init(aUri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString entry;
  makeEntryIdFromURI(kOutlookDirectoryScheme, mURI.get(), entry);
  nsAbWinHelperGuard mapiAddBook;
  nsAutoString unichars;
  ULONG objectType = 0;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  mDirEntry->Assign(entry);
  if (!mapiAddBook->GetPropertyLong(*mDirEntry, PR_OBJECT_TYPE, objectType)) {
    PRINTF(("Cannot get type.\n"));
    return NS_ERROR_FAILURE;
  }
  if (!mapiAddBook->GetPropertyUString(*mDirEntry, PR_DISPLAY_NAME_W,
                                       unichars)) {
    PRINTF(("Cannot get name.\n"));
    return NS_ERROR_FAILURE;
  }

  m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  mCardList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (objectType == MAPI_DISTLIST) {
    m_IsMailList = true;
    SetDirName(unichars);
    // For a mailing list, we get all the cards into our member variable.
    rv = GetCards(m_AddressList, nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    m_IsMailList = false;
    if (unichars.IsEmpty()) {
      SetDirName(u"Outlook"_ns);
    } else {
      SetDirName(unichars);
    }
    // First, get the mailing lists, then the cards.
    rv = GetNodes(m_AddressList);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = GetCards(mCardList, nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

// nsIAbDirectory methods

NS_IMETHODIMP nsAbOutlookDirectory::GetDirType(int32_t* aDirType) {
  NS_ENSURE_ARG_POINTER(aDirType);
  *aDirType = nsIAbManager::MAPI_DIRECTORY_TYPE;
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::GetURI(nsACString& aURI) {
  if (mURI.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;

  aURI = mURI;
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::GetChildNodes(
    nsTArray<RefPtr<nsIAbDirectory>>& aNodes) {
  aNodes.Clear();
  // Mailing lists don't have childnodes.
  if (m_IsMailList || !m_AddressList) {
    return NS_OK;
  }

  uint32_t count = 0;
  nsresult rv = m_AddressList->GetLength(&count);
  NS_ENSURE_SUCCESS(rv, rv);
  aNodes.SetCapacity(count);
  for (uint32_t i = 0; i < count; i++) {
    nsCOMPtr<nsIAbDirectory> dir = do_QueryElementAt(m_AddressList, i, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    aNodes.AppendElement(&*dir);
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::GetChildCardCount(uint32_t* aCount) {
  nsIMutableArray* srcCards = m_IsMailList ? m_AddressList : mCardList;
  NS_ENSURE_STATE(srcCards);
  return srcCards->GetLength(aCount);
}

NS_IMETHODIMP nsAbOutlookDirectory::GetChildCards(
    nsTArray<RefPtr<nsIAbCard>>& aCards) {
  aCards.Clear();

  // Not a search, so just return the appropriate list of items.
  nsIMutableArray* srcCards = m_IsMailList ? m_AddressList : mCardList;
  NS_ENSURE_STATE(srcCards);
  uint32_t count = 0;
  nsresult rv = srcCards->GetLength(&count);
  NS_ENSURE_SUCCESS(rv, rv);
  aCards.SetCapacity(count);
  for (uint32_t i = 0; i < count; i++) {
    nsCOMPtr<nsIAbCard> card = do_QueryElementAt(srcCards, i, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    aCards.AppendElement(&*card);
  }
  return NS_OK;
}

// This is an exact copy of nsAbOSXDirectory::HasCard().
NS_IMETHODIMP nsAbOutlookDirectory::HasCard(nsIAbCard* aCard, bool* aHasCard) {
  NS_ENSURE_ARG_POINTER(aCard);
  NS_ENSURE_ARG_POINTER(aHasCard);

  nsresult rv = NS_OK;
  uint32_t index;
  if (m_IsMailList) {
    if (m_AddressList) rv = m_AddressList->IndexOf(0, aCard, &index);
  } else if (mCardList)
    rv = mCardList->IndexOf(0, aCard, &index);

  *aHasCard = NS_SUCCEEDED(rv);

  return NS_OK;
}

// This is an exact copy of nsAbOSXDirectory::HasDirectory().
NS_IMETHODIMP nsAbOutlookDirectory::HasDirectory(nsIAbDirectory* aDirectory,
                                                 bool* aHasDirectory) {
  NS_ENSURE_ARG_POINTER(aDirectory);
  NS_ENSURE_ARG_POINTER(aHasDirectory);

  *aHasDirectory = false;

  uint32_t pos;
  if (m_AddressList &&
      NS_SUCCEEDED(m_AddressList->IndexOf(0, aDirectory, &pos)))
    *aHasDirectory = true;

  return NS_OK;
}

// This is an exact copy of nsAbOSXDirectory::CardForEmailAddress().
NS_IMETHODIMP
nsAbOutlookDirectory::CardForEmailAddress(const nsACString& aEmailAddress,
                                          nsIAbCard** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = nullptr;

  if (aEmailAddress.IsEmpty()) return NS_OK;

  nsIMutableArray* list = m_IsMailList ? m_AddressList : mCardList;

  if (!list) return NS_OK;

  uint32_t length;
  nsresult rv = list->GetLength(&length);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbCard> card;

  for (uint32_t i = 0; i < length && !*aResult; ++i) {
    card = do_QueryElementAt(list, i, &rv);
    if (NS_SUCCEEDED(rv)) {
      bool hasEmailAddress = false;

      rv = card->HasEmailAddress(aEmailAddress, &hasEmailAddress);
      if (NS_SUCCEEDED(rv) && hasEmailAddress) NS_IF_ADDREF(*aResult = card);
    }
  }
  return NS_OK;
}

nsresult nsAbOutlookDirectory::ExtractCardEntry(nsIAbCard* aCard,
                                                nsCString& aEntry) {
  aEntry.Truncate();

  nsCString uri;
  aCard->GetPropertyAsAUTF8String("OutlookEntryURI", uri);

  // If we don't have a URI, uri will be empty. makeEntryIdFromURI doesn't set
  // aEntry to anything if uri is empty, so it will be truncated, allowing us
  // to accept cards not initialized by us.
  makeEntryIdFromURI(kOutlookCardScheme, uri.get(), aEntry);
  return NS_OK;
}

nsresult nsAbOutlookDirectory::ExtractDirectoryEntry(nsIAbDirectory* aDirectory,
                                                     nsCString& aEntry) {
  aEntry.Truncate();
  nsCString uri;
  nsresult rv = aDirectory->GetURI(uri);
  NS_ENSURE_SUCCESS(rv, rv);

  makeEntryIdFromURI(kOutlookDirectoryScheme, uri.get(), aEntry);

  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::DeleteCards(
    const nsTArray<RefPtr<nsIAbCard>>& aCards) {
  nsresult retCode = NS_OK;
  nsAbWinHelperGuard mapiAddBook;

  if (!mapiAddBook->IsOK()) {
    return NS_ERROR_FAILURE;
  }

  nsAutoCString cardEntryString;
  nsMapiEntry cardEntry;

  for (auto card : aCards) {
    retCode = ExtractCardEntry(card, cardEntryString);
    if (NS_SUCCEEDED(retCode) && !cardEntryString.IsEmpty()) {
      cardEntry.Assign(cardEntryString);
      bool success = false;
      if (m_IsMailList) {
        nsAutoCString uri(mURI);
        // Trim off the mailing list entry ID from the mailing list URI
        // to get the top-level directory entry ID.
        nsAutoCString topEntryString;
        int32_t slashPos = uri.RFindChar('/');
        uri.SetLength(slashPos);
        makeEntryIdFromURI(kOutlookDirectoryScheme, uri.get(), topEntryString);
        nsMapiEntry topDirEntry;
        topDirEntry.Assign(topEntryString);
        success =
            mapiAddBook->DeleteEntryfromDL(topDirEntry, *mDirEntry, cardEntry);
      } else {
        success = mapiAddBook->DeleteEntry(*mDirEntry, cardEntry);
      }
      if (!success) {
        PRINTF(("Cannot delete card %s.\n", cardEntryString.get()));
      } else {
        if (m_IsMailList) {
          // It appears that removing a card from a mailing list makes
          // our list go stale, so refresh it.
          m_AddressList->Clear();
          GetCards(m_AddressList, nullptr);
        } else if (mCardList) {
          uint32_t pos;
          if (NS_SUCCEEDED(mCardList->IndexOf(0, card, &pos)))
            mCardList->RemoveElementAt(pos);
        }
        retCode = NotifyItemDeletion(card, true);
        NS_ENSURE_SUCCESS(retCode, retCode);

        card->SetDirectoryUID(EmptyCString());
      }
    } else {
      PRINTF(("Card doesn't belong in this directory.\n"));
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::DeleteDirectory(
    nsIAbDirectory* aDirectory) {
  if (!aDirectory) {
    return NS_ERROR_NULL_POINTER;
  }
  nsresult retCode = NS_OK;
  nsAbWinHelperGuard mapiAddBook;
  nsAutoCString dirEntryString;

  if (!mapiAddBook->IsOK()) {
    return NS_ERROR_FAILURE;
  }
  retCode = ExtractDirectoryEntry(aDirectory, dirEntryString);
  if (NS_SUCCEEDED(retCode) && !dirEntryString.IsEmpty()) {
    nsMapiEntry directoryEntry;

    directoryEntry.Assign(dirEntryString);
    if (!mapiAddBook->DeleteEntry(*mDirEntry, directoryEntry)) {
      PRINTF(("Cannot delete directory %s.\n", dirEntryString.get()));
    } else {
      uint32_t pos;
      if (m_AddressList &&
          NS_SUCCEEDED(m_AddressList->IndexOf(0, aDirectory, &pos)))
        m_AddressList->RemoveElementAt(pos);

      // Iterate over the cards of the directory to find the one
      // representing the mailing list and also remove it.
      if (mCardList) {
        nsAutoCString listUID;
        aDirectory->GetUID(listUID);

        uint32_t nbCards = 0;
        nsresult rv = mCardList->GetLength(&nbCards);
        NS_ENSURE_SUCCESS(rv, rv);
        for (uint32_t i = 0; i < nbCards; i++) {
          nsCOMPtr<nsIAbCard> card = do_QueryElementAt(mCardList, i, &rv);
          NS_ENSURE_SUCCESS(rv, rv);
          nsAutoCString cardUID;
          rv = card->GetUID(cardUID);
          NS_ENSURE_SUCCESS(rv, rv);
          if (cardUID.Equals(listUID)) {
            mCardList->RemoveElementAt(i);
            break;
          }
        }
      }
      retCode = NotifyItemDeletion(aDirectory, false);
      NS_ENSURE_SUCCESS(retCode, retCode);
    }
  } else {
    PRINTF(("Directory doesn't belong to this folder.\n"));
  }
  return retCode;
}

NS_IMETHODIMP nsAbOutlookDirectory::AddCard(nsIAbCard* aCard,
                                            nsIAbCard** aNewCard) {
  NS_ENSURE_ARG_POINTER(aCard);
  NS_ENSURE_ARG_POINTER(aNewCard);

  *aNewCard = nullptr;
  nsresult retCode = NS_OK;
  nsAbWinHelperGuard mapiAddBook;
  nsMapiEntry newEntry;
  nsAutoCString cardEntryString;
  bool isNewCard = false;
  nsCOMPtr<nsIAbDirectory> topDir;

  if (!mapiAddBook->IsOK()) {
    return NS_ERROR_FAILURE;
  }

  nsAutoCString ourUID;
  if (!m_IsMailList) {
    // We're not dealing with a mailing list, so just create a new entry.
    if (!mapiAddBook->CreateEntry(*mDirEntry, newEntry)) {
      return NS_ERROR_FAILURE;
    }
    isNewCard = true;
    GetUID(ourUID);
  } else {
    nsAutoCString dirURI(mURI);
    // Trim off the mailing list entry ID from the mailing list URI
    // to get the top-level directory entry ID.
    nsAutoCString topEntryString;
    int32_t slashPos = dirURI.RFindChar('/');
    dirURI.SetLength(slashPos);
    makeEntryIdFromURI(kOutlookDirectoryScheme, dirURI.get(), topEntryString);
    nsMapiEntry topDirEntry;
    topDirEntry.Assign(topEntryString);

    // Add a card to a mailing list. We distinguish two cases:
    // If there is already an Outlook card, we can just add it.
    // If none exists, we need to create it first. Outlook has an option
    // that allows a creation of a mailing list member solely in the list
    // but we don't support this for now to avoid more MAPI complication.
    retCode = ExtractCardEntry(aCard, cardEntryString);
    if (NS_SUCCEEDED(retCode) && !cardEntryString.IsEmpty()) {
      newEntry.Assign(cardEntryString);
    } else {
      if (!mapiAddBook->CreateEntry(topDirEntry, newEntry)) {
        return NS_ERROR_FAILURE;
      }
      isNewCard = true;
    }
    nsAutoString display;
    nsAutoString email;
    aCard->GetDisplayName(display);
    aCard->GetPrimaryEmail(email);
    if (!mapiAddBook->AddEntryToDL(topDirEntry, *mDirEntry, newEntry,
                                   display.get(), email.get())) {
      return NS_ERROR_FAILURE;
    }
    // The UID of the card is the top directory's UID.
    nsCOMPtr<nsIAbManager> abManager(
        do_GetService("@mozilla.org/abmanager;1", &retCode));
    NS_ENSURE_SUCCESS(retCode, retCode);
    retCode = abManager->GetDirectory(dirURI, getter_AddRefs(topDir));
    NS_ENSURE_SUCCESS(retCode, retCode);
    topDir->GetUID(ourUID);
  }

  newEntry.ToString(cardEntryString);
  nsAutoCString cardURI(kOutlookCardScheme);
  cardURI.Append(cardEntryString);

  nsCOMPtr<nsIAbCard> newCard;
  retCode = OutlookCardForURI(cardURI, getter_AddRefs(newCard));
  NS_ENSURE_SUCCESS(retCode, retCode);

  // Make sure the card has a UID before setting its directory UID.
  // This is a bit of a hack. If we get the UID of the card before setting its
  // directory UID, we can avoid an unwanted `ModifyCard()` call inside
  // `nsAbCardProperty::SetUID()`.
  nsCString dummy;
  newCard->GetUID(dummy);
  newCard->SetDirectoryUID(ourUID);

  if (isNewCard) {
    retCode = newCard->Copy(aCard);
    NS_ENSURE_SUCCESS(retCode, retCode);

    // Set a decent display name of the card. This needs to be set
    // on the card and not on the related contact via `SetPropertiesUString()`.
    nsAutoString displayName;
    newCard->GetDisplayName(displayName);
    mapiAddBook->SetPropertyUString(newEntry, PR_DISPLAY_NAME_W,
                                    displayName.get());

    if (m_IsMailList) {
      // Observed behavior for a new card in a mailing list is that
      // Outlook returns __MailUser__ as first name. That value was
      // previously set as display name when creating the bare card.
      nsAutoString firstName;
      newCard->GetFirstName(firstName);
      if (StringBeginsWith(firstName,
                           NS_LITERAL_STRING_FROM_CSTRING(kDummyDisplayName))) {
        newCard->SetFirstName(EmptyString());
      }
    }

    retCode = ModifyCardInternal(newCard, true);
    NS_ENSURE_SUCCESS(retCode, retCode);
  }

  if (m_IsMailList) {
    m_AddressList->AppendElement(newCard);
    if (isNewCard) {
      // Add the new card to the cards of the top directory as well.
      nsAbOutlookDirectory* topDirOL =
          static_cast<nsAbOutlookDirectory*>(topDir.get());
      topDirOL->mCardList->AppendElement(newCard);
    }
  } else {
    mCardList->AppendElement(newCard);
  }

  NotifyItemAddition(newCard, true);

  newCard.forget(aNewCard);
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::DropCard(nsIAbCard* aData,
                                             bool needToCopyCard) {
  nsCOMPtr<nsIAbCard> addedCard;
  return AddCard(aData, getter_AddRefs(addedCard));
}

NS_IMETHODIMP nsAbOutlookDirectory::AddMailList(nsIAbDirectory* aMailList,
                                                nsIAbDirectory** addedList) {
  NS_ENSURE_ARG_POINTER(aMailList);
  NS_ENSURE_ARG_POINTER(addedList);
  if (m_IsMailList) return NS_OK;

  nsAbWinHelperGuard mapiAddBook;
  nsMapiEntry newEntry;
  nsAutoCString newEntryString;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  nsAutoString name;
  nsresult rv = aMailList->GetDirName(name);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!mapiAddBook->CreateDistList(*mDirEntry, newEntry, name.get()))
    return NS_ERROR_FAILURE;

  newEntry.ToString(newEntryString);
  nsAutoCString uri(mURI);
  nsAutoCString topEntryString;
  makeEntryIdFromURI(kOutlookDirectoryScheme, uri.get(), topEntryString);
  uri.Append('/');
  uri.Append(newEntryString);

  RefPtr<nsAbOutlookDirectory> directory = new nsAbOutlookDirectory;

  // We will later need the URI of the parent directory, so store it here.
  directory->mParentEntryId = topEntryString;

  // Light-weight initialisation. `nsAbOutlookDirectory::Init()` will get
  // the object type wrong since we don't have cards yet and scan for cards
  // which we don't have yet.
  rv = directory->nsAbDirProperty::Init(uri.get());
  NS_ENSURE_SUCCESS(rv, rv);
  directory->mDirEntry->Assign(newEntryString);
  directory->m_IsMailList = true;
  directory->m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirectory> newList = do_QueryObject(directory);

  rv = newList->CopyMailList(aMailList);
  NS_ENSURE_SUCCESS(rv, rv);

  // Also create a card to match the list.
  // That needs to happen before the notification.
  nsAutoCString cardURI(kOutlookCardScheme);
  cardURI.Append(newEntryString);
  nsCOMPtr<nsIAbCard> newCard =
      do_CreateInstance("@mozilla.org/addressbook/cardproperty;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  newCard->SetPropertyAsAUTF8String("OutlookEntryURI", cardURI);

  // This is a bit of a hack. If we set the UID of the card before setting its
  // directory UID, we can avoid an unwanted `ModifyCard()` call inside
  // `nsAbCardProperty::SetUID()`.
  nsAutoCString listUID;
  newList->GetUID(listUID);
  newCard->SetUID(listUID);
  nsAutoCString ourUID;
  GetUID(ourUID);
  newCard->SetDirectoryUID(ourUID);
  newCard->SetIsMailList(true);
  newCard->SetMailListURI(uri.get());
  newCard->SetDisplayName(name);
  newCard->SetLastName(name);

  mCardList->AppendElement(newCard);
  m_AddressList->AppendElement(newList);

  NotifyItemAddition(newList, false);

  newList.forget(addedList);
  return rv;
}

NS_IMETHODIMP nsAbOutlookDirectory::EditMailListToDatabase(
    nsIAbCard* listCard) {
  nsresult rv;
  nsString name;
  nsAbWinHelperGuard mapiAddBook;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  rv = GetDirName(name);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!mapiAddBook->SetPropertyUString(*mDirEntry, PR_DISPLAY_NAME_W,
                                       name.get()))
    return NS_ERROR_FAILURE;

  // Iterate over the cards of the parent directory to find the one
  // representing the mailing list and also change its name.
  nsAutoCString uri(mURI);
  // Trim off the mailing list entry ID from the mailing list URI
  // to get the top-level directory entry ID.
  nsAutoCString topEntryString;
  int32_t slashPos = uri.RFindChar('/');
  uri.SetLength(slashPos);
  nsCOMPtr<nsIAbManager> abManager(
      do_GetService("@mozilla.org/abmanager;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIAbDirectory> parent;
  rv = abManager->GetDirectory(uri, getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString listUID;
  GetUID(listUID);

  uint32_t nbCards = 0;
  nsAbOutlookDirectory* olDir =
      static_cast<nsAbOutlookDirectory*>(parent.get());
  rv = olDir->mCardList->GetLength(&nbCards);
  NS_ENSURE_SUCCESS(rv, rv);
  for (uint32_t i = 0; i < nbCards; i++) {
    nsCOMPtr<nsIAbCard> card = do_QueryElementAt(olDir->mCardList, i, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString cardUID;
    rv = card->GetUID(cardUID);
    NS_ENSURE_SUCCESS(rv, rv);
    if (cardUID.Equals(listUID)) {
      card->SetDisplayName(name);
      break;
    }
  }

  nsAutoCString dirUID;
  if (listCard) {
    // For mailing list cards, we use the UID of the top level directory.
    listCard->GetDirectoryUID(dirUID);
    NotifyItemModification(listCard, true, dirUID.get());
  }
  nsCOMPtr<nsIAbDirectory> dir = do_QueryObject(this);
  // Use the UID of the parent.
  parent->GetUID(dirUID);
  NotifyItemModification(dir, false, dirUID.get());
  return NS_OK;
}

static nsresult FindPrimaryEmailCondition(nsIAbBooleanExpression* aLevel,
                                          nsAString& value) {
  if (!aLevel) {
    return NS_ERROR_NULL_POINTER;
  }
  nsresult retCode = NS_OK;
  nsTArray<RefPtr<nsISupports>> expressions;

  retCode = aLevel->GetExpressions(expressions);
  NS_ENSURE_SUCCESS(retCode, retCode);

  for (uint32_t i = 0; i < expressions.Length(); ++i) {
    RefPtr<nsIAbBooleanConditionString> condition =
        do_QueryObject(expressions[i], &retCode);
    if (NS_SUCCEEDED(retCode)) {
      nsCString name;
      retCode = condition->GetName(getter_Copies(name));
      NS_ENSURE_SUCCESS(retCode, retCode);
      if (name.EqualsLiteral("PrimaryEmail")) {
        // We found a leaf in the boolean expression tree that compares
        // "PrimaryEmail". So return the value and be done.
        retCode = condition->GetValue(getter_Copies(value));
        return retCode;
      }
      continue;
    }

    RefPtr<nsIAbBooleanExpression> subExpression =
        do_QueryObject(expressions[i], &retCode);
    if (NS_SUCCEEDED(retCode)) {
      // Recurse into the sub-tree.
      retCode = FindPrimaryEmailCondition(subExpression, value);
      // If we found our leaf there, we're done.
      if (NS_SUCCEEDED(retCode)) return retCode;
    }
  }
  return NS_ERROR_UNEXPECTED;
}

static nsresult GetConditionValue(nsIAbDirectoryQueryArguments* aArguments,
                                  nsAString& value) {
  if (!aArguments) {
    return NS_ERROR_NULL_POINTER;
  }
  nsresult retCode = NS_OK;

  nsCOMPtr<nsISupports> supports;
  retCode = aArguments->GetExpression(getter_AddRefs(supports));
  NS_ENSURE_SUCCESS(retCode, retCode);
  nsCOMPtr<nsIAbBooleanExpression> booleanQuery =
      do_QueryInterface(supports, &retCode);
  NS_ENSURE_SUCCESS(retCode, retCode);

  // Outlook can only query the PR_ANR property. So get its value from the
  // PrimaryEmail condition.
  retCode = FindPrimaryEmailCondition(booleanQuery, value);
  return retCode;
}

NS_IMETHODIMP nsAbOutlookDirectory::DoQuery(
    nsIAbDirectory* aDirectory, nsIAbDirectoryQueryArguments* aArguments,
    nsIAbDirSearchListener* aListener, int32_t aResultLimit, int32_t aTimeout,
    int32_t* aReturnValue) {
  if (!aArguments || !aListener || !aReturnValue) {
    return NS_ERROR_NULL_POINTER;
  }

  // The only thing we can search here is PR_ANR. All other properties are
  // skipped. Note that PR_ANR also searches in the recipient's name and
  // e-mail address.
  // https://docs.microsoft.com/en-us/office/client-developer/outlook/mapi/address-book-restrictions
  // states:
  // Ambiguous name restrictions are property restrictions using the PR_ANR
  // property to match recipient names with entries in address book containers.

  SRestriction restriction;
  SPropValue val;
  restriction.rt = RES_PROPERTY;
  restriction.res.resProperty.relop = RELOP_EQ;
  restriction.res.resProperty.ulPropTag = PR_ANR_W;
  restriction.res.resProperty.lpProp = &val;
  restriction.res.resProperty.lpProp->ulPropTag = PR_ANR_W;

  nsAutoString value;
  nsresult rv = GetConditionValue(aArguments, value);
  NS_ENSURE_SUCCESS(rv, rv);
  restriction.res.resProperty.lpProp->Value.lpszW = value.get();

  rv = ExecuteQuery(&restriction, aListener, aResultLimit);
  NS_ENSURE_SUCCESS(rv, rv);

  *aReturnValue = ++mCurrentQueryId;

  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::StopQuery(int32_t aContext) {
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::Search(const nsAString& query,
                                           const nsAString& searchString,
                                           nsIAbDirSearchListener* listener) {
  nsresult retCode = NS_OK;

  // Note the following: We get a rather complicated query passed here from
  // preference mail.addr_book.quicksearchquery.format.
  // Outlook address book search only allows search by PR_ANR, which is a fuzzy
  // Ambiguous Name Restriction search.

  retCode = StopSearch();
  NS_ENSURE_SUCCESS(retCode, retCode);

  nsCOMPtr<nsIAbBooleanExpression> expression;

  nsCOMPtr<nsIAbDirectoryQueryArguments> arguments = do_CreateInstance(
      "@mozilla.org/addressbook/directory/query-arguments;1", &retCode);
  NS_ENSURE_SUCCESS(retCode, retCode);

  retCode = nsAbQueryStringToExpression::Convert(NS_ConvertUTF16toUTF8(query),
                                                 getter_AddRefs(expression));
  NS_ENSURE_SUCCESS(retCode, retCode);
  retCode = arguments->SetExpression(expression);
  NS_ENSURE_SUCCESS(retCode, retCode);

  retCode = arguments->SetQuerySubDirectories(true);
  NS_ENSURE_SUCCESS(retCode, retCode);

  return DoQuery(this, arguments, listener, -1, 0, &mSearchContext);
}

nsresult nsAbOutlookDirectory::StopSearch(void) {
  return StopQuery(mSearchContext);
}

// nsIAbDirSearchListener
NS_IMETHODIMP nsAbOutlookDirectory::OnSearchFinished(
    nsresult status, bool complete, nsITransportSecurityInfo* secInfo,
    nsACString const& location) {
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::OnSearchFoundCard(nsIAbCard* aCard) {
  mCardList->AppendElement(aCard);
  return NS_OK;
}

nsresult nsAbOutlookDirectory::ExecuteQuery(SRestriction* aRestriction,
                                            nsIAbDirSearchListener* aListener,
                                            int32_t aResultLimit)

{
  if (!aListener) return NS_ERROR_NULL_POINTER;

  nsresult retCode = NS_OK;

  nsCOMPtr<nsIMutableArray> resultsArray(
      do_CreateInstance(NS_ARRAY_CONTRACTID, &retCode));
  NS_ENSURE_SUCCESS(retCode, retCode);

  retCode = GetCards(resultsArray, aRestriction);
  NS_ENSURE_SUCCESS(retCode, retCode);

  uint32_t nbResults = 0;
  retCode = resultsArray->GetLength(&nbResults);
  NS_ENSURE_SUCCESS(retCode, retCode);

  if (aResultLimit > 0 && nbResults > static_cast<uint32_t>(aResultLimit)) {
    nbResults = static_cast<uint32_t>(aResultLimit);
  }

  uint32_t i = 0;
  nsCOMPtr<nsIAbCard> card;

  for (i = 0; i < nbResults; ++i) {
    card = do_QueryElementAt(resultsArray, i, &retCode);
    NS_ENSURE_SUCCESS(retCode, retCode);

    aListener->OnSearchFoundCard(card);
  }

  aListener->OnSearchFinished(NS_OK, true, nullptr, ""_ns);
  return retCode;
}

// This function expects the aCards array to already be created.
nsresult nsAbOutlookDirectory::GetCards(nsIMutableArray* aCards,
                                        SRestriction* aRestriction) {
  nsAbWinHelperGuard mapiAddBook;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  nsMapiEntryArray cardEntries;
  LPSRestriction restriction = (LPSRestriction)aRestriction;

  if (!mapiAddBook->GetCards(*mDirEntry, restriction, cardEntries)) {
    PRINTF(("Cannot get cards.\n"));
    return NS_ERROR_FAILURE;
  }

  nsresult rv;
  nsAutoCString ourUID;
  if (m_IsMailList) {
    // Look up the parent directory (top-level directory) in the
    // AddrBookManager. That relies on the fact that the top-level
    // directory is already in its map before being initialised.
    nsCOMPtr<nsIAbManager> abManager(
        do_GetService("@mozilla.org/abmanager;1", &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString dirURI(kOutlookDirectoryScheme);
    dirURI.Append(mParentEntryId);
    nsCOMPtr<nsIAbDirectory> owningDir;
    rv = abManager->GetDirectory(dirURI, getter_AddRefs(owningDir));
    NS_ENSURE_SUCCESS(rv, rv);
    owningDir->GetUID(ourUID);
  } else {
    GetUID(ourUID);
  }

  rv = NS_OK;

  for (ULONG card = 0; card < cardEntries.mNbEntries; ++card) {
    nsAutoCString cardEntryString;
    nsAutoCString cardURI(kOutlookCardScheme);
    nsCOMPtr<nsIAbCard> childCard;
    cardEntries.mEntries[card].ToString(cardEntryString);
    cardURI.Append(cardEntryString);

    rv = OutlookCardForURI(cardURI, getter_AddRefs(childCard));
    NS_ENSURE_SUCCESS(rv, rv);
    // Make sure the card has a UID before setting its directory UID.
    // This is a bit of a hack. If we get the UID of the card before setting its
    // directory UID, we can avoid an unwanted `ModifyCard()` call inside
    // `nsAbCardProperty::SetUID()`.
    nsCString dummy;
    childCard->GetUID(dummy);
    childCard->SetDirectoryUID(ourUID);

    aCards->AppendElement(childCard);
  }
  return rv;
}

nsresult nsAbOutlookDirectory::GetNodes(nsIMutableArray* aNodes) {
  NS_ENSURE_ARG_POINTER(aNodes);

  nsAbWinHelperGuard mapiAddBook;
  nsMapiEntryArray nodeEntries;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  if (!mapiAddBook->GetNodes(*mDirEntry, nodeEntries)) {
    PRINTF(("Cannot get nodes.\n"));
    return NS_ERROR_FAILURE;
  }

  nsresult rv = NS_OK;

  nsCOMPtr<nsIAbManager> abManager(
      do_GetService("@mozilla.org/abmanager;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString topEntryString;
  mDirEntry->ToString(topEntryString);

  for (ULONG node = 0; node < nodeEntries.mNbEntries; ++node) {
    nsAutoCString dirEntryString;
    nsAutoCString uri(kOutlookDirectoryScheme);
    uri.Append(topEntryString);
    uri.Append('/');
    nodeEntries.mEntries[node].ToString(dirEntryString);
    uri.Append(dirEntryString);

    RefPtr<nsAbOutlookDirectory> directory = new nsAbOutlookDirectory;

    // We will later need the URI of the parent directory, so store it here.
    directory->mParentEntryId = topEntryString;
    directory->Init(uri.get());

    nsCOMPtr<nsIAbDirectory> dir = do_QueryObject(directory);
    aNodes->AppendElement(dir);
  }
  return rv;
}

nsresult nsAbOutlookDirectory::commonNotification(
    nsISupports* aItem, const char* aTopic, const char* aNotificationUID) {
  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();

  // `dirUID` needs to stay in scope until the end of the function.
  nsAutoCString dirUID;
  if (!aNotificationUID) {
    // Use the UID of the directory.
    GetUID(dirUID);
    aNotificationUID = dirUID.get();
  }

  observerService->NotifyObservers(
      aItem, aTopic, NS_ConvertUTF8toUTF16(aNotificationUID).get());
  return NS_OK;
}

nsresult nsAbOutlookDirectory::NotifyItemDeletion(
    nsISupports* aItem, bool aIsCard, const char* aNotificationUID) {
  const char* topic;
  if (aIsCard) {
    topic = m_IsMailList ? "addrbook-list-member-removed"
                         : "addrbook-contact-deleted";
  } else {
    topic = "addrbook-list-deleted";
  }
  return commonNotification(aItem, topic, aNotificationUID);
}

nsresult nsAbOutlookDirectory::NotifyItemAddition(
    nsISupports* aItem, bool aIsCard, const char* aNotificationUID) {
  const char* topic;
  if (aIsCard) {
    topic = m_IsMailList ? "addrbook-list-member-added"
                         : "addrbook-contact-created";
  } else {
    topic = "addrbook-list-created";
  }
  return commonNotification(aItem, topic, aNotificationUID);
}

nsresult nsAbOutlookDirectory::NotifyItemModification(
    nsISupports* aItem, bool aIsCard, const char* aNotificationUID) {
  return commonNotification(
      aItem, aIsCard ? "addrbook-contact-updated" : "addrbook-list-updated",
      aNotificationUID);
}

nsresult nsAbOutlookDirectory::NotifyCardPropertyChanges(nsIAbCard* aOld,
                                                         nsIAbCard* aNew) {
  mozilla::JSONStringWriteFunc<nsCString> jsonString;
  mozilla::JSONWriter w(jsonString);
  w.Start();
  w.StartObjectElement();
  bool somethingChanged = false;
  for (uint32_t i = 0; i < sizeof(CardStringProperties) / sizeof(char*); i++) {
    nsAutoCString oldValue;
    nsAutoCString newValue;
    aOld->GetPropertyAsAUTF8String(CardStringProperties[i], oldValue);
    aNew->GetPropertyAsAUTF8String(CardStringProperties[i], newValue);

    if (!oldValue.Equals(newValue)) {
      somethingChanged = true;
      w.StartObjectProperty(mozilla::MakeStringSpan(CardStringProperties[i]));
      if (oldValue.IsEmpty()) {
        w.NullProperty("oldValue");
      } else {
        w.StringProperty("oldValue", mozilla::MakeStringSpan(oldValue.get()));
      }
      if (newValue.IsEmpty()) {
        w.NullProperty("newValue");
      } else {
        w.StringProperty("newValue", mozilla::MakeStringSpan(newValue.get()));
      }
      w.EndObject();
    }
  }

  for (uint32_t i = 0; i < sizeof(CardIntProperties) / sizeof(char*); i++) {
    uint32_t oldValue = 0;
    uint32_t newValue = 0;
    aOld->GetPropertyAsUint32(CardIntProperties[i], &oldValue);
    aNew->GetPropertyAsUint32(CardIntProperties[i], &newValue);

    if (oldValue != newValue) {
      somethingChanged = true;
      w.StartObjectProperty(mozilla::MakeStringSpan(CardIntProperties[i]));
      if (oldValue == 0) {
        w.NullProperty("oldValue");
      } else {
        w.IntProperty("oldValue", oldValue);
      }
      if (newValue == 0) {
        w.NullProperty("newValue");
      } else {
        w.IntProperty("newValue", newValue);
      }
      w.EndObject();
    }
  }
  w.EndObject();
  w.End();

#if PRINT_TO_CONSOLE
  printf("%s", jsonString.StringCRef().get());
#endif

  if (somethingChanged) {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    observerService->NotifyObservers(
        aNew, "addrbook-contact-properties-updated",
        NS_ConvertUTF8toUTF16(jsonString.StringCRef()).get());
  }
  return NS_OK;
}

static void UnicodeToWord(const char16_t* aUnicode, WORD& aWord) {
  aWord = 0;
  if (aUnicode == nullptr || *aUnicode == 0) {
    return;
  }
  nsresult errorCode = NS_OK;
  nsAutoString unichar(aUnicode);

  aWord = static_cast<WORD>(unichar.ToInteger(&errorCode));
  if (NS_FAILED(errorCode)) {
    nsAutoCString name;
    mozilla::GetErrorName(errorCode, name);
    PRINTF(("Error conversion string %S: %s.\n", (wchar_t*)(unichar.get()),
            name.get()));
  }
}

#define PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST "mail.addr_book.lastnamefirst"

NS_IMETHODIMP nsAbOutlookDirectory::ModifyCard(nsIAbCard* aModifiedCard) {
  return ModifyCardInternal(aModifiedCard, false);
}

nsresult nsAbOutlookDirectory::ModifyCardInternal(nsIAbCard* aModifiedCard,
                                                  bool aIsAddition) {
  NS_ENSURE_ARG_POINTER(aModifiedCard);

  nsString* properties = nullptr;
  nsAutoString utility;
  nsAbWinHelperGuard mapiAddBook;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  nsCString cardEntryString;
  nsresult retCode = ExtractCardEntry(aModifiedCard, cardEntryString);
  NS_ENSURE_SUCCESS(retCode, retCode);
  // If we don't have the card entry, we can't work.
  if (cardEntryString.IsEmpty()) return NS_ERROR_FAILURE;

  nsMapiEntry cardEntry;
  cardEntry.Assign(cardEntryString);

  // Get the existing card.
  nsCString uri;
  nsCOMPtr<nsIAbCard> oldCard;
  aModifiedCard->GetPropertyAsAUTF8String("OutlookEntryURI", uri);
  // If the following fails, we didn't get the old card, not fatal.
  OutlookCardForURI(uri, getter_AddRefs(oldCard));

  // First, all the standard properties in one go
  properties = new nsString[index_LastProp];
  if (!properties) {
    return NS_ERROR_OUT_OF_MEMORY;
  }
  aModifiedCard->GetFirstName(properties[index_FirstName]);
  aModifiedCard->GetLastName(properties[index_LastName]);
  // This triple search for something to put in the name
  // is because in the case of a mailing list edition in
  // Mozilla, the display name will not be provided, and
  // MAPI doesn't allow that, so we fall back on an optional
  // name, and when all fails, on the email address.
  aModifiedCard->GetDisplayName(properties[index_DisplayName]);
  if (properties[index_DisplayName].IsEmpty()) {
    nsresult rv;
    nsCOMPtr<nsIPrefBranch> prefBranch =
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    int32_t format;
    rv = prefBranch->GetIntPref(PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST, &format);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = aModifiedCard->GenerateName(format, nullptr,
                                     properties[index_DisplayName]);
    NS_ENSURE_SUCCESS(rv, rv);

    if (properties[index_DisplayName].IsEmpty()) {
      aModifiedCard->GetPrimaryEmail(properties[index_DisplayName]);
    }
  }

  nsMapiEntry dirEntry;
  if (m_IsMailList) {
    nsAutoCString uri(mURI);
    // Trim off the mailing list entry ID from the mailing list URI
    // to get the top-level directory entry ID.
    nsAutoCString topEntryString;
    int32_t slashPos = uri.RFindChar('/');
    uri.SetLength(slashPos);
    makeEntryIdFromURI(kOutlookDirectoryScheme, uri.get(), topEntryString);
    dirEntry.Assign(topEntryString);
  } else {
    dirEntry.Assign(mDirEntry->mByteCount, mDirEntry->mEntryId);
  }

  aModifiedCard->SetDisplayName(properties[index_DisplayName]);
  aModifiedCard->GetPropertyAsAString(kNicknameProperty,
                                      properties[index_NickName]);
  aModifiedCard->GetPropertyAsAString(kWorkPhoneProperty,
                                      properties[index_WorkPhoneNumber]);
  aModifiedCard->GetPropertyAsAString(kHomePhoneProperty,
                                      properties[index_HomePhoneNumber]);
  aModifiedCard->GetPropertyAsAString(kFaxProperty,
                                      properties[index_WorkFaxNumber]);
  aModifiedCard->GetPropertyAsAString(kPagerProperty,
                                      properties[index_PagerNumber]);
  aModifiedCard->GetPropertyAsAString(kCellularProperty,
                                      properties[index_MobileNumber]);
  aModifiedCard->GetPropertyAsAString(kHomeCityProperty,
                                      properties[index_HomeCity]);
  aModifiedCard->GetPropertyAsAString(kHomeStateProperty,
                                      properties[index_HomeState]);
  aModifiedCard->GetPropertyAsAString(kHomeZipCodeProperty,
                                      properties[index_HomeZip]);
  aModifiedCard->GetPropertyAsAString(kHomeCountryProperty,
                                      properties[index_HomeCountry]);
  aModifiedCard->GetPropertyAsAString(kWorkCityProperty,
                                      properties[index_WorkCity]);
  aModifiedCard->GetPropertyAsAString(kWorkStateProperty,
                                      properties[index_WorkState]);
  aModifiedCard->GetPropertyAsAString(kWorkZipCodeProperty,
                                      properties[index_WorkZip]);
  aModifiedCard->GetPropertyAsAString(kWorkCountryProperty,
                                      properties[index_WorkCountry]);
  aModifiedCard->GetPropertyAsAString(kJobTitleProperty,
                                      properties[index_JobTitle]);
  aModifiedCard->GetPropertyAsAString(kDepartmentProperty,
                                      properties[index_Department]);
  aModifiedCard->GetPropertyAsAString(kCompanyProperty,
                                      properties[index_Company]);
  aModifiedCard->GetPropertyAsAString(kWorkWebPageProperty,
                                      properties[index_WorkWebPage]);
  aModifiedCard->GetPropertyAsAString(kHomeWebPageProperty,
                                      properties[index_HomeWebPage]);
  aModifiedCard->GetPropertyAsAString(kNotesProperty, properties[index_Notes]);
  if (!mapiAddBook->SetPropertiesUString(dirEntry, cardEntry,
                                         OutlookCardMAPIProps, index_LastProp,
                                         properties)) {
    PRINTF(("Cannot set general properties.\n"));
  }

  delete[] properties;
  nsString unichar;
  nsString unichar2;
  WORD year = 0;
  WORD month = 0;
  WORD day = 0;

  aModifiedCard->GetPrimaryEmail(unichar);
  if (!mapiAddBook->SetPropertyUString(cardEntry, PR_EMAIL_ADDRESS_W,
                                       unichar.get())) {
    PRINTF(("Cannot set primary email.\n"));
  }
  aModifiedCard->GetPropertyAsAString(kHomeAddressProperty, unichar);
  aModifiedCard->GetPropertyAsAString(kHomeAddress2Property, unichar2);

  utility.Assign(unichar.get());
  if (!utility.IsEmpty()) utility.AppendLiteral("\r\n");

  utility.Append(unichar2.get());
  if (!mapiAddBook->SetPropertyUString(cardEntry, PR_HOME_ADDRESS_STREET_W,
                                       utility.get())) {
    PRINTF(("Cannot set home address.\n"));
  }

  unichar.Truncate();
  aModifiedCard->GetPropertyAsAString(kWorkAddressProperty, unichar);
  unichar2.Truncate();
  aModifiedCard->GetPropertyAsAString(kWorkAddress2Property, unichar2);

  utility.Assign(unichar.get());
  if (!utility.IsEmpty()) utility.AppendLiteral("\r\n");

  utility.Append(unichar2.get());
  if (!mapiAddBook->SetPropertyUString(cardEntry, PR_BUSINESS_ADDRESS_STREET_W,
                                       utility.get())) {
    PRINTF(("Cannot set work address.\n"));
  }

  unichar.Truncate();
  aModifiedCard->GetPropertyAsAString(kBirthYearProperty, unichar);
  UnicodeToWord(unichar.get(), year);
  unichar.Truncate();
  aModifiedCard->GetPropertyAsAString(kBirthMonthProperty, unichar);
  UnicodeToWord(unichar.get(), month);
  unichar.Truncate();
  aModifiedCard->GetPropertyAsAString(kBirthDayProperty, unichar);
  UnicodeToWord(unichar.get(), day);
  if (!mapiAddBook->SetPropertyDate(dirEntry, cardEntry, true, PR_BIRTHDAY,
                                    year, month, day)) {
    PRINTF(("Cannot set date.\n"));
  }

  if (!aIsAddition) {
    NotifyItemModification(aModifiedCard, true);
    if (oldCard) NotifyCardPropertyChanges(oldCard, aModifiedCard);
  }

  return retCode;
}

static void splitString(nsString& aSource, nsString& aTarget) {
  aTarget.Truncate();
  int32_t offset = aSource.FindChar('\n');

  if (offset >= 0) {
    const char16_t* source = aSource.get() + offset + 1;
    while (*source) {
      if (*source == '\n' || *source == '\r')
        aTarget.Append(char16_t(' '));
      else
        aTarget.Append(*source);
      ++source;
    }
    int32_t offsetCR = aSource.FindChar('\r');
    aSource.SetLength(offsetCR >= 0 ? offsetCR : offset);
  }
}

nsresult nsAbOutlookDirectory::OutlookCardForURI(const nsACString& aUri,
                                                 nsIAbCard** newCard) {
  NS_ENSURE_ARG_POINTER(newCard);

  nsAutoCString cardEntryString;
  makeEntryIdFromURI(kOutlookCardScheme, PromiseFlatCString(aUri).get(),
                     cardEntryString);

  nsAbWinHelperGuard mapiAddBook;
  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  nsresult rv;
  nsCOMPtr<nsIAbCard> card =
      do_CreateInstance("@mozilla.org/addressbook/cardproperty;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  card->SetPropertyAsAUTF8String("OutlookEntryURI", aUri);

  nsMapiEntry cardEntry;
  cardEntry.Assign(cardEntryString);

  nsString unichars[index_LastProp];
  bool success[index_LastProp];

  nsMapiEntry dirEntry;
  if (m_IsMailList) {
    nsAutoCString uri(mURI);
    // Trim off the mailing list entry ID from the mailing list URI
    // to get the top-level directory entry ID.
    nsAutoCString topEntryString;
    int32_t slashPos = uri.RFindChar('/');
    uri.SetLength(slashPos);
    makeEntryIdFromURI(kOutlookDirectoryScheme, uri.get(), topEntryString);
    dirEntry.Assign(topEntryString);
  } else {
    dirEntry.Assign(mDirEntry->mByteCount, mDirEntry->mEntryId);
  }

  if (mapiAddBook->GetPropertiesUString(dirEntry, cardEntry,
                                        OutlookCardMAPIProps, index_LastProp,
                                        unichars, success)) {
    if (success[index_FirstName]) card->SetFirstName(unichars[index_FirstName]);
    if (success[index_LastName]) card->SetLastName(unichars[index_LastName]);
    if (success[index_DisplayName])
      card->SetDisplayName(unichars[index_DisplayName]);

#define SETPROP(name, index) \
  if (success[index]) card->SetPropertyAsAString(name, unichars[index])
    SETPROP(kNicknameProperty, index_NickName);
    SETPROP(kWorkPhoneProperty, index_WorkPhoneNumber);
    SETPROP(kHomePhoneProperty, index_HomePhoneNumber);
    SETPROP(kFaxProperty, index_WorkFaxNumber);
    SETPROP(kPagerProperty, index_PagerNumber);
    SETPROP(kCellularProperty, index_MobileNumber);
    SETPROP(kHomeCityProperty, index_HomeCity);
    SETPROP(kHomeStateProperty, index_HomeState);
    SETPROP(kHomeZipCodeProperty, index_HomeZip);
    SETPROP(kHomeCountryProperty, index_HomeCountry);
    SETPROP(kWorkCityProperty, index_WorkCity);
    SETPROP(kWorkStateProperty, index_WorkState);
    SETPROP(kWorkZipCodeProperty, index_WorkZip);
    SETPROP(kWorkCountryProperty, index_WorkCountry);
    SETPROP(kJobTitleProperty, index_JobTitle);
    SETPROP(kDepartmentProperty, index_Department);
    SETPROP(kCompanyProperty, index_Company);
    SETPROP(kWorkWebPageProperty, index_WorkWebPage);
    SETPROP(kHomeWebPageProperty, index_HomeWebPage);
    SETPROP(kNotesProperty, index_Notes);
  }

  ULONG cardType = 0;
  if (mapiAddBook->GetPropertyLong(cardEntry, PR_OBJECT_TYPE, cardType)) {
    card->SetIsMailList(cardType == MAPI_DISTLIST);
    if (cardType == MAPI_DISTLIST) {
      nsCString dirEntryString;
      mDirEntry->ToString(dirEntryString);
      nsAutoCString uri(kOutlookDirectoryScheme);
      uri.Append(dirEntryString);
      uri.Append('/');
      nsCString originalUID;
      AlignListEntryStringAndGetUID(cardEntryString, originalUID);
      uri.Append(cardEntryString);
      card->SetMailListURI(uri.get());
      if (!originalUID.IsEmpty()) card->SetUID(originalUID);

      // In case the display is by "First Last" or "Last, First", give the card
      // a name, otherwise nothing is displayed.
      if (success[index_DisplayName])
        card->SetLastName(unichars[index_DisplayName]);
    }
  }

  nsAutoString unichar;
  nsAutoString unicharBis;
  if (mapiAddBook->GetPropertyUString(cardEntry, PR_EMAIL_ADDRESS_W, unichar)) {
    card->SetPrimaryEmail(unichar);
  }
  if (mapiAddBook->GetPropertyUString(cardEntry, PR_HOME_ADDRESS_STREET_W,
                                      unichar)) {
    splitString(unichar, unicharBis);
    card->SetPropertyAsAString(kHomeAddressProperty, unichar);
    card->SetPropertyAsAString(kHomeAddress2Property, unicharBis);
  }
  if (mapiAddBook->GetPropertyUString(cardEntry, PR_BUSINESS_ADDRESS_STREET_W,
                                      unichar)) {
    splitString(unichar, unicharBis);
    card->SetPropertyAsAString(kWorkAddressProperty, unichar);
    card->SetPropertyAsAString(kWorkAddress2Property, unicharBis);
  }

  WORD year = 0, month = 0, day = 0;
  if (mapiAddBook->GetPropertyDate(dirEntry, cardEntry, true, PR_BIRTHDAY, year,
                                   month, day)) {
    card->SetPropertyAsUint32(kBirthYearProperty, year);
    card->SetPropertyAsUint32(kBirthMonthProperty, month);
    card->SetPropertyAsUint32(kBirthDayProperty, day);
  }

  card.forget(newCard);
  return NS_OK;
}

void nsAbOutlookDirectory::AlignListEntryStringAndGetUID(
    nsCString& aEntryString, nsCString& aOriginalUID) {
  // Sadly when scanning for cards and finding a distribution list, the
  // entry ID is different to the entry ID returned when scanning the top level
  // directory for distribution lists. We make the adjustment here.
  // We also retrieve the original UID from the mailing list.
  nsAbWinHelperGuard mapiAddBook;
  if (!mapiAddBook->IsOK()) return;

  uint32_t nbLists = 0;
  nsresult rv = m_AddressList->GetLength(&nbLists);
  NS_ENSURE_SUCCESS_VOID(rv);
  for (uint32_t i = 0; i < nbLists; i++) {
    nsCOMPtr<nsIAbDirectory> list = do_QueryElementAt(m_AddressList, i, &rv);
    NS_ENSURE_SUCCESS_VOID(rv);

    // Get URI and extract entry ID.
    nsAutoCString listURI;
    list->GetURI(listURI);
    int ind = listURI.RFindChar('/');
    listURI = Substring(listURI, ind + 1);

    if (aEntryString.Equals(listURI)) {
      list->GetUID(aOriginalUID);
      return;
    }
    if (mapiAddBook->CompareEntryIDs(aEntryString, listURI)) {
      PRINTF(("Entry ID for mailing list replaced:\nWas: %s\nNow: %s\n",
              aEntryString.get(), listURI.get()));
      aEntryString = listURI;
      list->GetUID(aOriginalUID);
      return;
    }
  }
  PRINTF(("Entry ID for mailing list not found.\n"));
}
