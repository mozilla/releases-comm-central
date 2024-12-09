/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbOSXDirectory.h"
#include "nsAbOSXCard.h"
#include "nsAbOSXUtils.h"
#include "nsAbQueryStringToExpression.h"
#include "nsCOMArray.h"
#include "nsEnumeratorUtils.h"
#include "nsIAbDirectoryQueryProxy.h"
#include "nsIAbManager.h"
#include "nsObjCExceptions.h"
#include "nsServiceManagerUtils.h"
#include "nsIMutableArray.h"
#include "nsArrayUtils.h"
#include "nsIAbBooleanExpression.h"
#include "nsComponentManagerUtils.h"
#include "nsISimpleEnumerator.h"

#include <AddressBook/AddressBook.h>

#define kABDeletedRecords \
  (kABDeletedRecords ? kABDeletedRecords : @"ABDeletedRecords")
#define kABUpdatedRecords \
  (kABUpdatedRecords ? kABUpdatedRecords : @"ABUpdatedRecords")
#define kABInsertedRecords \
  (kABInsertedRecords ? kABInsertedRecords : @"ABInsertedRecords")

static nsresult GetOrCreateGroup(NSString* aUid, nsIAbDirectory** aResult) {
  NS_ASSERTION(aUid, "No UID for group!.");

  nsAutoCString uri(NS_ABOSXDIRECTORY_URI_PREFIX);
  AppendToCString(aUid, uri);

  nsresult rv;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirectory> directory;
  rv = abManager->GetDirectory(uri, getter_AddRefs(directory));
  NS_ENSURE_SUCCESS(rv, rv);

  NS_IF_ADDREF(*aResult = directory);
  return NS_OK;
}

static nsresult GetCard(ABRecord* aRecord, nsIAbCard** aResult,
                        nsIAbOSXDirectory* osxDirectory) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  NSString* uid = [aRecord uniqueId];
  NS_ASSERTION(uid, "No UID for card!.");
  if (!uid) return NS_ERROR_FAILURE;

  nsAutoCString uri(NS_ABOSXCARD_URI_PREFIX);
  AppendToCString(uid, uri);
  nsCOMPtr<nsIAbOSXCard> osxCard;
  nsresult rv = osxDirectory->GetCardByUri(uri, getter_AddRefs(osxCard));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbCard> card = do_QueryInterface(osxCard, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_IF_ADDREF(*aResult = card);
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

static nsresult CreateCard(ABRecord* aRecord, nsIAbCard** aResult) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  NSString* uid = [aRecord uniqueId];
  NS_ASSERTION(uid, "No UID for card!.");
  if (!uid) return NS_ERROR_FAILURE;

  nsresult rv;
  nsCOMPtr<nsIAbOSXCard> osxCard = do_CreateInstance(
      "@mozilla.org/addressbook/directory;1?type=moz-abosxcard", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString uri(NS_ABOSXCARD_URI_PREFIX);
  AppendToCString(uid, uri);

  rv = osxCard->Init(uri.get());
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbCard> card = do_QueryInterface(osxCard, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_IF_ADDREF(*aResult = card);
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

static nsresult Sync(NSString* aUid) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  ABAddressBook* addressBook = [ABAddressBook sharedAddressBook];
  ABRecord* card = [addressBook recordForUniqueId:aUid];
  if ([card isKindOfClass:[ABGroup class]]) {
    nsCOMPtr<nsIAbDirectory> directory;
    GetOrCreateGroup(aUid, getter_AddRefs(directory));
    nsCOMPtr<nsIAbOSXDirectory> osxDirectory = do_QueryInterface(directory);

    if (osxDirectory) {
      osxDirectory->Update();
    }
  } else {
    nsCOMPtr<nsIAbCard> abCard;
    nsresult rv;

    nsCOMPtr<nsIAbManager> abManager =
        do_GetService("@mozilla.org/abmanager;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbDirectory> directory;
    rv = abManager->GetDirectory(
        nsLiteralCString(NS_ABOSXDIRECTORY_URI_PREFIX "/"),
        getter_AddRefs(directory));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbOSXDirectory> osxDirectory =
        do_QueryInterface(directory, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = GetCard(card, getter_AddRefs(abCard), osxDirectory);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbOSXCard> osxCard = do_QueryInterface(abCard);
    osxCard->Update(true);
  }
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

@interface ABChangedMonitor : NSObject
- (void)ABChanged:(NSNotification*)aNotification;
@end

@implementation ABChangedMonitor
- (void)ABChanged:(NSNotification*)aNotification {
  NSDictionary* changes = [aNotification userInfo];

  nsresult rv;
  NSArray* inserted = [changes objectForKey:kABInsertedRecords];

  if (inserted) {
    nsCOMPtr<nsIAbManager> abManager =
        do_GetService("@mozilla.org/abmanager;1", &rv);
    NS_ENSURE_SUCCESS_VOID(rv);

    nsCOMPtr<nsIAbDirectory> directory;
    rv = abManager->GetDirectory(
        nsLiteralCString(NS_ABOSXDIRECTORY_URI_PREFIX "/"),
        getter_AddRefs(directory));
    NS_ENSURE_SUCCESS_VOID(rv);

    nsCOMPtr<nsIAbOSXDirectory> osxDirectory =
        do_QueryInterface(directory, &rv);
    NS_ENSURE_SUCCESS_VOID(rv);

    unsigned int i, count = [inserted count];
    for (i = 0; i < count; ++i) {
      ABAddressBook* addressBook = [ABAddressBook sharedAddressBook];
      ABRecord* card =
          [addressBook recordForUniqueId:[inserted objectAtIndex:i]];
      if ([card isKindOfClass:[ABGroup class]]) {
        nsCOMPtr<nsIAbDirectory> directory;
        GetOrCreateGroup([inserted objectAtIndex:i], getter_AddRefs(directory));

        rv = osxDirectory->AssertDirectory(abManager, directory);
        NS_ENSURE_SUCCESS_VOID(rv);
      } else {
        nsCOMPtr<nsIAbCard> abCard;
        // Construct a card
        nsresult rv = CreateCard(card, getter_AddRefs(abCard));
        NS_ENSURE_SUCCESS_VOID(rv);
        rv = osxDirectory->AssertCard(abManager, abCard);
        NS_ENSURE_SUCCESS_VOID(rv);
      }
    }
  }

  NSArray* updated = [changes objectForKey:kABUpdatedRecords];
  if (updated) {
    unsigned int i, count = [updated count];
    for (i = 0; i < count; ++i) {
      NSString* uid = [updated objectAtIndex:i];
      Sync(uid);
    }
  }

  NSArray* deleted = [changes objectForKey:kABDeletedRecords];
  if (deleted) {
    nsCOMPtr<nsIAbManager> abManager =
        do_GetService("@mozilla.org/abmanager;1", &rv);
    NS_ENSURE_SUCCESS_VOID(rv);

    nsCOMPtr<nsIAbDirectory> directory;
    rv = abManager->GetDirectory(
        nsLiteralCString(NS_ABOSXDIRECTORY_URI_PREFIX "/"),
        getter_AddRefs(directory));
    NS_ENSURE_SUCCESS_VOID(rv);

    nsCOMPtr<nsIAbOSXDirectory> osxDirectory =
        do_QueryInterface(directory, &rv);
    NS_ENSURE_SUCCESS_VOID(rv);

    unsigned int i, count = [deleted count];
    for (i = 0; i < count; ++i) {
      NSString* deletedUid = [deleted objectAtIndex:i];

      nsAutoCString uid;
      AppendToCString(deletedUid, uid);

      rv = osxDirectory->DeleteUid(uid);
      NS_ENSURE_SUCCESS_VOID(rv);
    }
  }

  if (!inserted && !updated && !deleted) {
    // XXX This is supposed to mean "everything was updated", but we get
    //     this whenever something has changed, so not sure what to do.
  }
}
@end

static uint32_t sObserverCount = 0;
static ABChangedMonitor* sObserver = nullptr;

nsAbOSXDirectory::nsAbOSXDirectory() {}

nsAbOSXDirectory::~nsAbOSXDirectory() {
  if (--sObserverCount == 0) {
    [[NSNotificationCenter defaultCenter] removeObserver:sObserver];
    [sObserver release];
  }
}

NS_IMPL_ISUPPORTS_INHERITED(nsAbOSXDirectory, nsAbDirProperty,
                            nsIAbOSXDirectory)

NS_IMETHODIMP
nsAbOSXDirectory::Init(const char* aUri) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  nsresult rv;
  rv = nsAbDirProperty::Init(aUri);
  NS_ENSURE_SUCCESS(rv, rv);

  ABAddressBook* addressBook = [ABAddressBook sharedAddressBook];
  if (sObserverCount == 0) {
    sObserver = [[ABChangedMonitor alloc] init];
    [[NSNotificationCenter defaultCenter]
        addObserver:(ABChangedMonitor*)sObserver
           selector:@selector(ABChanged:)
               name:kABDatabaseChangedExternallyNotification
             object:nil];
  }
  ++sObserverCount;

  NSArray* cards;
  nsCOMPtr<nsIMutableArray> cardList;
  bool isRootOSXDirectory = false;

  if (mURI.Length() <= sizeof(NS_ABOSXDIRECTORY_URI_PREFIX)) {
    isRootOSXDirectory = true;

    m_DirPrefId.AssignLiteral("ldap_2.servers.osx");

    cards = [[addressBook people]
        arrayByAddingObjectsFromArray:[addressBook groups]];
    if (!mCardList)
      mCardList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    else
      rv = mCardList->Clear();
    NS_ENSURE_SUCCESS(rv, rv);

    cardList = mCardList;
  } else {
    nsAutoCString uid(
        Substring(mURI, sizeof(NS_ABOSXDIRECTORY_URI_PREFIX) - 1));
    ABRecord* card = [addressBook
        recordForUniqueId:[NSString stringWithUTF8String:uid.get()]];
    NS_ASSERTION([card isKindOfClass:[ABGroup class]], "Huh.");

    m_IsMailList = true;
    AppendToString([card valueForProperty:kABGroupNameProperty], m_ListDirName);

    ABGroup* group = (ABGroup*)[addressBook
        recordForUniqueId:[NSString
                              stringWithUTF8String:nsAutoCString(
                                                       Substring(mURI, 21))
                                                       .get()]];
    cards = [[group members] arrayByAddingObjectsFromArray:[group subgroups]];

    if (!m_AddressList)
      m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    else
      rv = m_AddressList->Clear();
    NS_ENSURE_SUCCESS(rv, rv);

    cardList = m_AddressList;
  }

  unsigned int nbCards = [cards count];
  nsCOMPtr<nsIAbCard> card;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbOSXDirectory> rootOSXDirectory;
  if (!isRootOSXDirectory) {
    rv = GetRootOSXDirectory(getter_AddRefs(rootOSXDirectory));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  for (unsigned int i = 0; i < nbCards; ++i) {
    // If we're a Group, it's likely that the cards we're going
    // to create were already created in the root nsAbOSXDirectory,
    if (!isRootOSXDirectory)
      rv = GetCard([cards objectAtIndex:i], getter_AddRefs(card),
                   rootOSXDirectory);
    else {
      // If we're not a Group, that means we're the root nsAbOSXDirectory,
      // which means we have to create the cards from scratch.
      rv = CreateCard([cards objectAtIndex:i], getter_AddRefs(card));
    }

    NS_ENSURE_SUCCESS(rv, rv);

    // We're going to want to tell the AB Manager that we've added some cards
    // so that they show up in the address book views.
    AssertCard(abManager, card);
  }

  if (isRootOSXDirectory) {
    AssertChildNodes();
  }

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsAbOSXDirectory::GetURI(nsACString& aURI) {
  if (mURI.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;

  aURI = mURI;
  return NS_OK;
}

NS_IMETHODIMP
nsAbOSXDirectory::GetReadOnly(bool* aReadOnly) {
  NS_ENSURE_ARG_POINTER(aReadOnly);

  *aReadOnly = true;
  return NS_OK;
}

static bool CheckRedundantCards(nsIAbManager* aManager,
                                nsIAbDirectory* aDirectory, nsIAbCard* aCard,
                                NSMutableArray* aCardList) {
  nsresult rv;
  nsCOMPtr<nsIAbOSXCard> osxCard = do_QueryInterface(aCard, &rv);
  NS_ENSURE_SUCCESS(rv, false);

  nsAutoCString uri;
  rv = osxCard->GetURI(uri);
  NS_ENSURE_SUCCESS(rv, false);
  NSString* uid = [NSString stringWithUTF8String:(uri.get() + 21)];

  unsigned int i, count = [aCardList count];
  for (i = 0; i < count; ++i) {
    if ([[[aCardList objectAtIndex:i] uniqueId] isEqualToString:uid]) {
      [aCardList removeObjectAtIndex:i];
      break;
    }
  }

  if (i == count) {
    return true;
  }

  return false;
}

nsresult nsAbOSXDirectory::GetRootOSXDirectory(nsIAbOSXDirectory** aResult) {
  if (!mCacheTopLevelOSXAb) {
    // Attempt to get card from the toplevel directories
    nsresult rv;
    nsCOMPtr<nsIAbManager> abManager =
        do_GetService("@mozilla.org/abmanager;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbDirectory> directory;
    rv = abManager->GetDirectory(
        nsLiteralCString(NS_ABOSXDIRECTORY_URI_PREFIX "/"),
        getter_AddRefs(directory));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbOSXDirectory> osxDirectory =
        do_QueryInterface(directory, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    mCacheTopLevelOSXAb = osxDirectory;
  }

  NS_IF_ADDREF(*aResult = mCacheTopLevelOSXAb);
  return NS_OK;
}

nsresult nsAbOSXDirectory::Update() {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  nsresult rv;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  ABAddressBook* addressBook = [ABAddressBook sharedAddressBook];
  // Due to the horrible way the address book code works wrt mailing lists
  // we have to use a different list depending on what we are. This pointer
  // holds a reference to that list.
  nsIMutableArray* cardList;
  NSArray *groups, *cards;
  if (m_IsMailList) {
    ABGroup* group = (ABGroup*)[addressBook
        recordForUniqueId:[NSString
                              stringWithUTF8String:nsAutoCString(
                                                       Substring(mURI, 21))
                                                       .get()]];
    groups = nil;
    cards = [[group members] arrayByAddingObjectsFromArray:[group subgroups]];

    if (!m_AddressList) {
      m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
    }
    // For mailing lists, store the cards in m_AddressList
    cardList = m_AddressList;
  } else {
    groups = [addressBook groups];
    cards = [[addressBook people] arrayByAddingObjectsFromArray:groups];

    if (!mCardList) {
      mCardList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
    }
    // For directories, store the cards in mCardList
    cardList = mCardList;
  }

  NSMutableArray* mutableArray = [NSMutableArray arrayWithArray:cards];
  uint32_t addressCount;
  rv = cardList->GetLength(&addressCount);
  NS_ENSURE_SUCCESS(rv, rv);

  while (addressCount--) {
    nsCOMPtr<nsIAbCard> card(do_QueryElementAt(cardList, addressCount, &rv));
    if (NS_FAILED(rv)) break;

    if (CheckRedundantCards(abManager, this, card, mutableArray))
      cardList->RemoveElementAt(addressCount);
  }

  NSEnumerator* enumerator = [mutableArray objectEnumerator];
  ABRecord* card;
  nsCOMPtr<nsIAbCard> abCard;
  nsCOMPtr<nsIAbOSXDirectory> rootOSXDirectory;
  rv = GetRootOSXDirectory(getter_AddRefs(rootOSXDirectory));
  NS_ENSURE_SUCCESS(rv, rv);

  while ((card = [enumerator nextObject])) {
    rv = GetCard(card, getter_AddRefs(abCard), rootOSXDirectory);
    if (NS_FAILED(rv)) rv = CreateCard(card, getter_AddRefs(abCard));
    NS_ENSURE_SUCCESS(rv, rv);
    AssertCard(abManager, abCard);
  }

  card = (ABRecord*)[addressBook
      recordForUniqueId:[NSString stringWithUTF8String:nsAutoCString(
                                                           Substring(mURI, 21))
                                                           .get()]];
  NSString* stringValue = [card valueForProperty:kABGroupNameProperty];
  if (![stringValue isEqualToString:WrapString(m_ListDirName)]) {
    nsAutoString oldValue(m_ListDirName);
    AssignToString(stringValue, m_ListDirName);
  }

  if (groups) {
    mutableArray = [NSMutableArray arrayWithArray:groups];
    nsCOMPtr<nsIAbDirectory> directory;
    // It is ok to use m_AddressList here as only top-level directories have
    // groups, and they will be in m_AddressList
    if (m_AddressList) {
      rv = m_AddressList->GetLength(&addressCount);
      NS_ENSURE_SUCCESS(rv, rv);

      while (addressCount--) {
        directory = do_QueryElementAt(m_AddressList, addressCount, &rv);
        if (NS_FAILED(rv)) continue;

        nsAutoCString uri;
        directory->GetURI(uri);
        uri.Cut(0, 21);
        NSString* uid = [NSString stringWithUTF8String:uri.get()];

        unsigned int j, arrayCount = [mutableArray count];
        for (j = 0; j < arrayCount; ++j) {
          if ([[[mutableArray objectAtIndex:j] uniqueId] isEqualToString:uid]) {
            [mutableArray removeObjectAtIndex:j];
            break;
          }
        }

        if (j == arrayCount) {
          UnassertDirectory(abManager, directory);
        }
      }
    }

    enumerator = [mutableArray objectEnumerator];
    while ((card = [enumerator nextObject])) {
      rv = GetOrCreateGroup([card uniqueId], getter_AddRefs(directory));
      NS_ENSURE_SUCCESS(rv, rv);

      AssertDirectory(abManager, directory);
    }
  }

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

nsresult nsAbOSXDirectory::AssertChildNodes() {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  // Mailing lists can't have childnodes.
  if (m_IsMailList) {
    return NS_OK;
  }

  nsresult rv;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  NSArray* groups = [[ABAddressBook sharedAddressBook] groups];

  unsigned int i, count = [groups count];

  if (count > 0 && !m_AddressList) {
    m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIAbDirectory> directory;
  for (i = 0; i < count; ++i) {
    rv = GetOrCreateGroup([[groups objectAtIndex:i] uniqueId],
                          getter_AddRefs(directory));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = AssertDirectory(abManager, directory);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

nsresult nsAbOSXDirectory::AssertDirectory(nsIAbManager* aManager,
                                           nsIAbDirectory* aDirectory) {
  uint32_t pos;
  if (m_AddressList &&
      NS_SUCCEEDED(m_AddressList->IndexOf(0, aDirectory, &pos)))
    // We already have this directory, so no point in adding it again.
    return NS_OK;

  nsresult rv;
  if (!m_AddressList) {
    m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = m_AddressList->AppendElement(aDirectory);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult nsAbOSXDirectory::AssertCard(nsIAbManager* aManager,
                                      nsIAbCard* aCard) {
  nsAutoCString ourUID;
  GetUID(ourUID);
  aCard->SetDirectoryUID(ourUID);

  nsresult rv = m_IsMailList ? m_AddressList->AppendElement(aCard)
                             : mCardList->AppendElement(aCard);
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the card's URI and add it to our card store
  nsCOMPtr<nsIAbOSXCard> osxCard = do_QueryInterface(aCard, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString uri;
  rv = osxCard->GetURI(uri);

  nsCOMPtr<nsIAbOSXCard> retrievedCard;
  if (!mCardStore.Get(uri, getter_AddRefs(retrievedCard)))
    mCardStore.InsertOrUpdate(uri, osxCard);

  return NS_OK;
}

nsresult nsAbOSXDirectory::UnassertCard(nsIAbManager* aManager,
                                        nsIAbCard* aCard,
                                        nsIMutableArray* aCardList) {
  uint32_t pos;
  if (NS_SUCCEEDED(aCardList->IndexOf(0, aCard, &pos))) {
    nsresult rv = aCardList->RemoveElementAt(pos);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

nsresult nsAbOSXDirectory::UnassertDirectory(nsIAbManager* aManager,
                                             nsIAbDirectory* aDirectory) {
  NS_ENSURE_TRUE(m_AddressList, NS_ERROR_NULL_POINTER);

  uint32_t pos;
  if (NS_SUCCEEDED(m_AddressList->IndexOf(0, aDirectory, &pos))) {
    nsresult rv = m_AddressList->RemoveElementAt(pos);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbOSXDirectory::GetChildNodes(
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

NS_IMETHODIMP
nsAbOSXDirectory::GetChildCardCount(uint32_t* aCount) {
  nsIMutableArray* srcCards = m_IsMailList ? m_AddressList : mCardList;
  return srcCards->GetLength(aCount);
}

NS_IMETHODIMP
nsAbOSXDirectory::GetChildCards(nsTArray<RefPtr<nsIAbCard>>& aCards) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;
  aCards.Clear();

  // Not a search, so just return the appropriate list of items.
  nsIMutableArray* srcCards = m_IsMailList ? m_AddressList : mCardList;
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
  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

/* Recursive method that searches for a child card by URI.  If it cannot find
 * it within this directory, it checks all subfolders.
 */
NS_IMETHODIMP
nsAbOSXDirectory::GetCardByUri(const nsACString& aUri, nsIAbOSXCard** aResult) {
  nsCOMPtr<nsIAbOSXCard> osxCard;

  // Base Case
  if (mCardStore.Get(aUri, getter_AddRefs(osxCard))) {
    NS_IF_ADDREF(*aResult = osxCard);
    return NS_OK;
  }
  // Search children
  nsTArray<RefPtr<nsIAbDirectory>> children;
  nsresult rv = this->GetChildNodes(children);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIAbDirectory* dir : children) {
    nsCOMPtr<nsIAbOSXDirectory> childDirectory = do_QueryInterface(dir, &rv);
    if (NS_SUCCEEDED(rv)) {
      rv = childDirectory->GetCardByUri(aUri, getter_AddRefs(osxCard));
      if (NS_SUCCEEDED(rv)) {
        NS_IF_ADDREF(*aResult = osxCard);
        return NS_OK;
      }
    }
  }
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsAbOSXDirectory::GetCardFromProperty(const char* aProperty,
                                      const nsACString& aValue,
                                      bool aCaseSensitive,
                                      nsIAbCard** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = nullptr;

  if (aValue.IsEmpty()) return NS_OK;

  nsIMutableArray* list = m_IsMailList ? m_AddressList : mCardList;

  if (!list) return NS_OK;

  uint32_t length;
  nsresult rv = list->GetLength(&length);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbCard> card;
  nsAutoCString cardValue;

  for (uint32_t i = 0; i < length && !*aResult; ++i) {
    card = do_QueryElementAt(list, i, &rv);
    if (NS_SUCCEEDED(rv)) {
      rv = card->GetPropertyAsAUTF8String(aProperty, cardValue);
      if (NS_SUCCEEDED(rv)) {
        bool equal =
            aCaseSensitive
                ? cardValue.Equals(aValue)
                : cardValue.Equals(aValue, nsCaseInsensitiveCStringComparator);
        if (equal) NS_IF_ADDREF(*aResult = card);
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsAbOSXDirectory::GetCardsFromProperty(const char* aProperty,
                                       const nsACString& aValue,
                                       bool aCaseSensitive,
                                       nsTArray<RefPtr<nsIAbCard>>& aResult) {
  aResult.Clear();
  if (aValue.IsEmpty()) return NS_OK;

  nsIMutableArray* list = m_IsMailList ? m_AddressList : mCardList;
  if (!list) return NS_OK;

  uint32_t length;
  nsresult rv = list->GetLength(&length);
  NS_ENSURE_SUCCESS(rv, rv);
  aResult.SetCapacity(length);
  for (uint32_t i = 0; i < length; ++i) {
    nsCOMPtr<nsIAbCard> card = do_QueryElementAt(list, i, &rv);
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString cardValue;
      rv = card->GetPropertyAsAUTF8String(aProperty, cardValue);
      if (NS_SUCCEEDED(rv)) {
        bool equal =
            aCaseSensitive
                ? cardValue.Equals(aValue)
                : cardValue.Equals(aValue, nsCaseInsensitiveCStringComparator);
        if (equal) aResult.AppendElement(&*card);
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsAbOSXDirectory::CardForEmailAddress(const nsACString& aEmailAddress,
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

NS_IMETHODIMP
nsAbOSXDirectory::HasCard(nsIAbCard* aCard, bool* aHasCard) {
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

NS_IMETHODIMP
nsAbOSXDirectory::HasDirectory(nsIAbDirectory* aDirectory,
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

NS_IMETHODIMP
nsAbOSXDirectory::Search(const nsAString& query, const nsAString& searchString,
                         nsIAbDirSearchListener* listener) {
  nsresult rv;

  nsCOMPtr<nsIAbBooleanExpression> expression;
  rv = nsAbQueryStringToExpression::Convert(NS_ConvertUTF16toUTF8(query),
                                            getter_AddRefs(expression));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirectoryQueryArguments> arguments = do_CreateInstance(
      "@mozilla.org/addressbook/directory/query-arguments;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = arguments->SetExpression(expression);
  NS_ENSURE_SUCCESS(rv, rv);

  // Don't search the subdirectories. If the current directory is a mailing
  // list, it won't have any subdirectories. If the current directory is an
  // addressbook, searching both it and the subdirectories (the mailing
  // lists), will yield duplicate results because every entry in a mailing
  // list will be an entry in the parent addressbook.
  rv = arguments->SetQuerySubDirectories(false);
  NS_ENSURE_SUCCESS(rv, rv);

  // Initiate the proxy query with the no query directory
  nsCOMPtr<nsIAbDirectoryQueryProxy> queryProxy = do_CreateInstance(
      "@mozilla.org/addressbook/directory-query/proxy;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = queryProxy->Initiate();
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t context = 0;
  rv = queryProxy->DoQuery(this, arguments, listener, -1, 0, &context);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult nsAbOSXDirectory::DeleteUid(const nsACString& aUid) {
  if (!m_AddressList) return NS_ERROR_NULL_POINTER;

  nsresult rv;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // At this stage we don't know if aUid represents a card or group. The OS X
  // interfaces don't give us chance to find out, so we have to go through
  // our lists to find it.

  // First, we'll see if its in the group list as it is likely to be shorter.

  // See if this item is in our address list
  uint32_t addressCount;
  rv = m_AddressList->GetLength(&addressCount);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString uri(NS_ABOSXDIRECTORY_URI_PREFIX);
  uri.Append(aUid);

  // Iterate backwards in case we remove something
  while (addressCount--) {
    nsCOMPtr<nsISupports> abItem(
        do_QueryElementAt(m_AddressList, addressCount, &rv));
    if (NS_FAILED(rv)) continue;

    nsCOMPtr<nsIAbDirectory> directory(do_QueryInterface(abItem, &rv));
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString dirUri;
      directory->GetURI(dirUri);
      if (uri.Equals(dirUri)) return UnassertDirectory(abManager, directory);
    } else {
      nsCOMPtr<nsIAbOSXCard> osxCard(do_QueryInterface(abItem, &rv));
      if (NS_SUCCEEDED(rv)) {
        nsAutoCString cardUri;
        osxCard->GetURI(cardUri);
        if (uri.Equals(cardUri)) {
          nsCOMPtr<nsIAbCard> card(do_QueryInterface(osxCard, &rv));
          if (NS_SUCCEEDED(rv))
            return UnassertCard(abManager, card, m_AddressList);
        }
      }
    }
  }

  // Second, see if it is one of the cards.
  if (!mCardList) return NS_ERROR_FAILURE;

  uri = NS_ABOSXCARD_URI_PREFIX;
  uri.Append(aUid);

  rv = mCardList->GetLength(&addressCount);
  NS_ENSURE_SUCCESS(rv, rv);

  while (addressCount--) {
    nsCOMPtr<nsIAbOSXCard> osxCard(
        do_QueryElementAt(mCardList, addressCount, &rv));
    if (NS_FAILED(rv)) continue;

    nsAutoCString cardUri;
    osxCard->GetURI(cardUri);

    if (uri.Equals(cardUri)) {
      nsCOMPtr<nsIAbCard> card(do_QueryInterface(osxCard, &rv));
      if (NS_SUCCEEDED(rv)) return UnassertCard(abManager, card, mCardList);
    }
  }
  return NS_OK;
}
