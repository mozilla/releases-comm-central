/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/DebugOnly.h"

#include "nsAbView.h"
#include "nsISupports.h"
#include "nsCOMPtr.h"
#include "nsIServiceManager.h"
#include "nsIAbCard.h"
#include "nsILocale.h"
#include "nsILocaleService.h"
#include "prmem.h"
#include "nsCollationCID.h"
#include "nsIAbManager.h"
#include "nsAbBaseCID.h"
#include "nsXPCOM.h"
#include "nsISupportsPrimitives.h"
#include "nsITreeColumns.h"
#include "nsCRTGlue.h"
#include "nsIMutableArray.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIStringBundle.h"
#include "nsIPrefLocalizedString.h"
#include "nsArrayUtils.h"
#include "nsIAddrDatabase.h" // for kPriEmailColumn
#include "nsMsgUtils.h"
#include "mozilla/Services.h"

using namespace mozilla;

#define CARD_NOT_FOUND -1
#define ALL_ROWS -1

#define PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST "mail.addr_book.lastnamefirst"
#define PREF_MAIL_ADDR_BOOK_DISPLAYNAME_AUTOGENERATION "mail.addr_book.displayName.autoGeneration"
#define PREF_MAIL_ADDR_BOOK_DISPLAYNAME_LASTNAMEFIRST "mail.addr_book.displayName.lastnamefirst"

// Also, our default primary sort
#define GENERATED_NAME_COLUMN_ID "GeneratedName" 

NS_IMPL_ISUPPORTS(nsAbView, nsIAbView, nsITreeView, nsIAbListener, nsIObserver)

nsAbView::nsAbView() : mInitialized(false),
                       mIsAllDirectoryRootView(false),
                       mSuppressSelectionChange(false),
                       mSuppressCountChange(false),
                       mGeneratedNameFormat(0)
{
}

nsAbView::~nsAbView()
{
  if (mInitialized) {
    NS_ASSERTION(NS_SUCCEEDED(ClearView()), "failed to close view");
  }
}

NS_IMETHODIMP nsAbView::ClearView()
{
  mDirectory = nullptr;
  mAbViewListener = nullptr;
  if (mTree)
    mTree->SetView(nullptr);
  mTree = nullptr;
  mTreeSelection = nullptr;

  if (mInitialized)
  {
    nsresult rv;
    mInitialized = false;
    nsCOMPtr<nsIPrefBranch> pbi(do_GetService(NS_PREFSERVICE_CONTRACTID,
                                              &rv));
    NS_ENSURE_SUCCESS(rv,rv);

    rv = pbi->RemoveObserver(PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST, this);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID,
                                                   &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = abManager->RemoveAddressBookListener(this);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  int32_t i = mCards.Length();
  while(i-- > 0)
    NS_ASSERTION(NS_SUCCEEDED(RemoveCardAt(i)), "remove card failed\n");

  return NS_OK;
}

nsresult nsAbView::RemoveCardAt(int32_t row)
{
  nsresult rv;

  AbCard *abcard = mCards.ElementAt(row);
  NS_IF_RELEASE(abcard->card);
  mCards.RemoveElementAt(row);
  PR_FREEIF(abcard->primaryCollationKey);
  PR_FREEIF(abcard->secondaryCollationKey);
  PR_FREEIF(abcard);

  
  // This needs to happen after we remove the card, as RowCountChanged() will call GetRowCount()
  if (mTree) {
    rv = mTree->RowCountChanged(row, -1);
    NS_ENSURE_SUCCESS(rv,rv);
  }

  if (mAbViewListener && !mSuppressCountChange) {
    rv = mAbViewListener->OnCountChanged(mCards.Length());
    NS_ENSURE_SUCCESS(rv,rv);
  }
  return NS_OK;
}

nsresult nsAbView::SetGeneratedNameFormatFromPrefs()
{
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranchInt(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv,rv);

  return prefBranchInt->GetIntPref(PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST, &mGeneratedNameFormat);
}

nsresult nsAbView::Initialize()
{
  if (mInitialized)
    return NS_OK;

  mInitialized = true;

  nsresult rv;
  nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = abManager->AddAddressBookListener(this, nsIAbListener::all);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPrefBranch> pbi(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = pbi->AddObserver(PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST, this, false);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!mABBundle)
  {
    nsCOMPtr<nsIStringBundleService> stringBundleService =
      mozilla::services::GetStringBundleService();
    NS_ENSURE_TRUE(stringBundleService, NS_ERROR_UNEXPECTED);

    rv = stringBundleService->CreateBundle("chrome://messenger/locale/addressbook/addressBook.properties", getter_AddRefs(mABBundle));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return SetGeneratedNameFormatFromPrefs();
}

NS_IMETHODIMP nsAbView::SetView(nsIAbDirectory *aAddressBook,
                                nsIAbViewListener *aAbViewListener,
                                const nsAString &aSortColumn,
                                const nsAString &aSortDirection,
                                nsAString &aResult)
{
  // Ensure we are initialized
  nsresult rv = Initialize();

  mAbViewListener = nullptr;
  if (mTree)
  {
    // Try and speed deletion of old cards by disconnecting the tree from us.
    mTreeSelection->ClearSelection();
    mTree->SetView(nullptr);
  }

  // Clear out old cards
  int32_t i = mCards.Length();
  while(i-- > 0)
  {
    rv = RemoveCardAt(i);
    NS_ASSERTION(NS_SUCCEEDED(rv), "remove card failed\n");
  }

  // We replace all cards so any sorting is no longer valid.
  mSortColumn.AssignLiteral("");
  mSortDirection.AssignLiteral("");

  nsCString uri;
  aAddressBook->GetURI(uri);
  int32_t searchBegin = uri.FindChar('?');
  nsCString searchQuery(Substring(uri, searchBegin));
  // This is a special case, a workaround basically, to just have all ABs.
  if (searchQuery.EqualsLiteral("?")) {
    searchQuery.AssignLiteral("");
  }

  if (Substring(uri, 0, searchBegin).EqualsLiteral(kAllDirectoryRoot)) {
    mIsAllDirectoryRootView = true;
    // We have special request case to search all addressbooks, so we need
    // to iterate over all addressbooks.
    // Since the request is for all addressbooks, the URI must have been
    // passed with an extra '?'. We still check it for sanity and trim it here.
    if (searchQuery.Find("??") != kNotFound)
      searchQuery = Substring(searchQuery, 1);

    nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID,
                                                   &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsISimpleEnumerator> enumerator;
    rv = abManager->GetDirectories(getter_AddRefs(enumerator));
    NS_ENSURE_SUCCESS(rv, rv);

    bool hasMore = false;
    nsCOMPtr<nsISupports> support;
    nsCOMPtr<nsIAbDirectory> directory;
    while (NS_SUCCEEDED(enumerator->HasMoreElements(&hasMore)) && hasMore) {
      rv = enumerator->GetNext(getter_AddRefs(support));
      NS_ENSURE_SUCCESS(rv, rv);
      directory = do_QueryInterface(support, &rv);

      // If, for some reason, we are unable to get a directory, we continue.
      if (NS_FAILED(rv))
        continue;

      // Get appropriate directory with search query.
      nsCString uri;
      directory->GetURI(uri);
      rv = abManager->GetDirectory(uri + searchQuery, getter_AddRefs(directory));
      mDirectory = directory;
      rv = EnumerateCards();
      NS_ENSURE_SUCCESS(rv, rv);
    }
  } else {
    mIsAllDirectoryRootView = false;
    mDirectory = aAddressBook;
    rv = EnumerateCards();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  NS_NAMED_LITERAL_STRING(generatedNameColumnId, GENERATED_NAME_COLUMN_ID);

  // See if the persisted sortColumn is valid.
  // It may not be, if you migrated from older versions, or switched between
  // a mozilla build and a commercial build, which have different columns.
  nsAutoString actualSortColumn;
  if (!generatedNameColumnId.Equals(aSortColumn) && mCards.Length()) {
    nsIAbCard *card = mCards.ElementAt(0)->card;
    nsString value;
    // XXX todo
    // Need to check if _Generic is valid.  GetCardValue() will always return NS_OK for _Generic
    // We're going to have to ask mDirectory if it is.
    // It might not be.  example:  _ScreenName is valid in Netscape, but not Mozilla.
    rv = GetCardValue(card, PromiseFlatString(aSortColumn).get(), value);
    if (NS_FAILED(rv))
      actualSortColumn = generatedNameColumnId;
    else
      actualSortColumn = aSortColumn;
  }
  else
    actualSortColumn = aSortColumn;

  rv = SortBy(actualSortColumn.get(), PromiseFlatString(aSortDirection).get(), false);
  NS_ENSURE_SUCCESS(rv, rv);

  mAbViewListener = aAbViewListener;
  if (mAbViewListener && !mSuppressCountChange) {
    rv = mAbViewListener->OnCountChanged(mCards.Length());
    NS_ENSURE_SUCCESS(rv, rv);
  }

  aResult = actualSortColumn;
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetDirectory(nsIAbDirectory **aDirectory)
{
  NS_ENSURE_ARG_POINTER(aDirectory);
  NS_IF_ADDREF(*aDirectory = mDirectory);
  return NS_OK;
}

nsresult nsAbView::EnumerateCards()
{
  nsresult rv;    
  nsCOMPtr<nsISimpleEnumerator> cardsEnumerator;
  nsCOMPtr<nsIAbCard> card;

  if (!mDirectory)
    return NS_ERROR_UNEXPECTED;

  rv = mDirectory->GetChildCards(getter_AddRefs(cardsEnumerator));
  if (NS_SUCCEEDED(rv) && cardsEnumerator)
  {
    nsCOMPtr<nsISupports> item;
    bool more;
    while (NS_SUCCEEDED(cardsEnumerator->HasMoreElements(&more)) && more)
    {
      rv = cardsEnumerator->GetNext(getter_AddRefs(item));
      if (NS_SUCCEEDED(rv))
      {
        nsCOMPtr <nsIAbCard> card = do_QueryInterface(item);
        // Malloc these from an arena
        AbCard *abcard = (AbCard *) PR_Calloc(1, sizeof(struct AbCard));
        if (!abcard) 
          return NS_ERROR_OUT_OF_MEMORY;

        abcard->card = card;
        NS_IF_ADDREF(abcard->card);

        // XXX todo
        // Would it be better to do an insertion sort, than append and sort?
        // XXX todo
        // If we knew how many cards there was going to be
        // we could allocate an array of the size,
        // instead of growing and copying as we append.
        DebugOnly<bool> didAppend = mCards.AppendElement(abcard);
        NS_ASSERTION(didAppend, "failed to append card");
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetRowCount(int32_t *aRowCount)
{
  *aRowCount = mCards.Length();
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetSelection(nsITreeSelection * *aSelection)
{
  NS_IF_ADDREF(*aSelection = mTreeSelection);
  return NS_OK;
}

NS_IMETHODIMP nsAbView::SetSelection(nsITreeSelection * aSelection)
{
  mTreeSelection = aSelection;
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetRowProperties(int32_t index, nsAString& properties)
{
    return NS_OK;
}

NS_IMETHODIMP nsAbView::GetCellProperties(int32_t row, nsITreeColumn* col, nsAString& properties)
{
  NS_ENSURE_TRUE(row >= 0, NS_ERROR_UNEXPECTED);

  if (mCards.Length() <= (size_t)row)
    return NS_OK;

  const char16_t* colID;
  col->GetIdConst(&colID);
  // "G" == "GeneratedName"
  if (colID[0] != char16_t('G'))
    return NS_OK;

  nsIAbCard *card = mCards.ElementAt(row)->card;

  bool isMailList;
  nsresult rv = card->GetIsMailList(&isMailList);
  NS_ENSURE_SUCCESS(rv,rv);

  if (isMailList)
    properties.AssignLiteral("MailList");

  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetColumnProperties(nsITreeColumn* col, nsAString& properties)
{
    return NS_OK;
}

NS_IMETHODIMP nsAbView::IsContainer(int32_t index, bool *_retval)
{
    *_retval = false;
    return NS_OK;
}

NS_IMETHODIMP nsAbView::IsContainerOpen(int32_t index, bool *_retval)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::IsContainerEmpty(int32_t index, bool *_retval)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::IsSeparator(int32_t index, bool *_retval)
{
  *_retval = false;
  return NS_OK;
}

NS_IMETHODIMP nsAbView::IsSorted(bool *_retval)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::CanDrop(int32_t index,
                                int32_t orientation,
                                nsIDOMDataTransfer *dataTransfer,
                                bool *_retval)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::Drop(int32_t row,
                             int32_t orientation,
                             nsIDOMDataTransfer *dataTransfer)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::GetParentIndex(int32_t rowIndex, int32_t *_retval)
{
  *_retval = -1;
  return NS_OK;
}

NS_IMETHODIMP nsAbView::HasNextSibling(int32_t rowIndex, int32_t afterIndex, bool *_retval)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::GetLevel(int32_t index, int32_t *_retval)
{
  *_retval = 0;
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetImageSrc(int32_t row, nsITreeColumn* col, nsAString& _retval)
{
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetProgressMode(int32_t row, nsITreeColumn* col, int32_t* _retval)
{
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetCellValue(int32_t row, nsITreeColumn* col, nsAString& _retval)
{
  return NS_OK;
}

nsresult nsAbView::GetCardValue(nsIAbCard *card, const char16_t *colID,
                                nsAString &_retval)
{
  if (nsString(colID).EqualsLiteral("addrbook")) {
    nsCString dirID;
    nsresult rv = card->GetDirectoryId(dirID);
    if (NS_SUCCEEDED(rv))
      CopyUTF8toUTF16(Substring(dirID, dirID.FindChar('&') + 1), _retval);

    return rv;
  }

  // "G" == "GeneratedName", "_P" == "_PhoneticName"
  // else, standard column (like PrimaryEmail and _AimScreenName)
  if (colID[0] == char16_t('G'))
    return card->GenerateName(mGeneratedNameFormat, mABBundle, _retval);

  if (colID[0] == char16_t('_') && colID[1] == char16_t('P'))
    // Use LN/FN order for the phonetic name
    return card->GeneratePhoneticName(true, _retval);

  if (!NS_strcmp(colID, MOZ_UTF16("ChatName")))
    return card->GenerateChatName(_retval);

  nsresult rv = card->GetPropertyAsAString(NS_ConvertUTF16toUTF8(colID).get(), _retval);
  if (rv == NS_ERROR_NOT_AVAILABLE) {
    rv = NS_OK;
    _retval.Truncate();
  }
  return rv;
}

nsresult nsAbView::RefreshTree()
{
  nsresult rv;

  // The PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST pref affects how the GeneratedName column looks.
  // so if the GeneratedName is our primary or secondary sort,
  // we need to resort.
  // the same applies for kPhoneticNameColumn
  //
  // XXX optimize me
  // PrimaryEmail is always the secondary sort, unless it is currently the
  // primary sort.  So, if PrimaryEmail is the primary sort,
  // GeneratedName might be the secondary sort.
  //
  // One day, we can get fancy and remember what the secondary sort is.
  // We do that, we can fix this code. At best, it will turn a sort into a invalidate.
  // 
  // If neither the primary nor the secondary sorts are GeneratedName (or kPhoneticNameColumn),
  // all we have to do is invalidate (to show the new GeneratedNames),
  // but the sort will not change.
  if (mSortColumn.EqualsLiteral(GENERATED_NAME_COLUMN_ID) ||
      mSortColumn.EqualsLiteral(kPriEmailProperty) ||
      mSortColumn.EqualsLiteral(kPhoneticNameColumn)) {
    rv = SortBy(mSortColumn.get(), mSortDirection.get(), true);
  }
  else {
    rv = InvalidateTree(ALL_ROWS);

    // Although the selection hasn't changed, the card that is selected may need
    // to be displayed differently, therefore pretend that the selection has
    // changed to force that update.
    SelectionChanged();
  }

  return rv;
}

NS_IMETHODIMP nsAbView::GetCellText(int32_t row, nsITreeColumn* col, nsAString& _retval)
{
  NS_ENSURE_TRUE(row >= 0 && (size_t)row < mCards.Length(), NS_ERROR_UNEXPECTED);

  nsIAbCard *card = mCards.ElementAt(row)->card;
  const char16_t* colID;
  col->GetIdConst(&colID);
  return GetCardValue(card, colID, _retval);
}

NS_IMETHODIMP nsAbView::SetTree(nsITreeBoxObject *tree)
{
  mTree = tree;
  return NS_OK;
}

NS_IMETHODIMP nsAbView::ToggleOpenState(int32_t index)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::CycleHeader(nsITreeColumn* col)
{
  return NS_OK;
}

nsresult nsAbView::InvalidateTree(int32_t row)
{
  if (!mTree)
    return NS_OK;
  
  if (row == ALL_ROWS)
    return mTree->Invalidate();
  else
    return mTree->InvalidateRow(row);
}

NS_IMETHODIMP nsAbView::SelectionChanged()
{
  if (mAbViewListener && !mSuppressSelectionChange) {
    nsresult rv = mAbViewListener->OnSelectionChanged();
    NS_ENSURE_SUCCESS(rv,rv);
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbView::CycleCell(int32_t row, nsITreeColumn* col)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::IsEditable(int32_t row, nsITreeColumn* col, bool* _retval)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::IsSelectable(int32_t row, nsITreeColumn* col, bool* _retval)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::SetCellValue(int32_t row, nsITreeColumn* col, const nsAString& value)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::SetCellText(int32_t row, nsITreeColumn* col, const nsAString& value)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::PerformAction(const char16_t *action)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::PerformActionOnRow(const char16_t *action, int32_t row)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::PerformActionOnCell(const char16_t *action, int32_t row, nsITreeColumn* col)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbView::GetCardFromRow(int32_t row, nsIAbCard **aCard)
{
  *aCard = nullptr;  
  NS_ENSURE_TRUE(row >= 0, NS_ERROR_UNEXPECTED);
  if (mCards.Length() <= (size_t)row) {
    return NS_OK;
  }

  AbCard *a = mCards.ElementAt(row);
  if (!a)
      return NS_OK;

  NS_IF_ADDREF(*aCard = a->card);
  return NS_OK;
}

#define DESCENDING_SORT_FACTOR -1
#define ASCENDING_SORT_FACTOR 1

typedef struct SortClosure
{
  const char16_t *colID;
  int32_t factor;
  nsAbView *abView;
} SortClosure;

static int
inplaceSortCallback(const AbCard *card1, const AbCard *card2, SortClosure *closure)
{
  int32_t sortValue;
  
  // If we are sorting the "PrimaryEmail", swap the collation keys, as the secondary is always the
  // PrimaryEmail. Use the last primary key as the secondary key.
  //
  // "Pr" to distinguish "PrimaryEmail" from "PagerNumber"
  if (closure->colID[0] == char16_t('P') && closure->colID[1] == char16_t('r')) {
    sortValue = closure->abView->CompareCollationKeys(card1->secondaryCollationKey,card1->secondaryCollationKeyLen,card2->secondaryCollationKey,card2->secondaryCollationKeyLen);
    if (sortValue)
      return sortValue * closure->factor;
    else
      return closure->abView->CompareCollationKeys(card1->primaryCollationKey,card1->primaryCollationKeyLen,card2->primaryCollationKey,card2->primaryCollationKeyLen) * (closure->factor);
  }
  else {
    sortValue = closure->abView->CompareCollationKeys(card1->primaryCollationKey,card1->primaryCollationKeyLen,card2->primaryCollationKey,card2->primaryCollationKeyLen);
    if (sortValue)
      return sortValue * (closure->factor);
    else
      return closure->abView->CompareCollationKeys(card1->secondaryCollationKey,card1->secondaryCollationKeyLen,card2->secondaryCollationKey,card2->secondaryCollationKeyLen) * (closure->factor);
  }
}

static void SetSortClosure(const char16_t *sortColumn, const char16_t *sortDirection, nsAbView *abView, SortClosure *closure)
{
  closure->colID = sortColumn;
  
  if (sortDirection && !NS_strcmp(sortDirection, MOZ_UTF16("descending")))
    closure->factor = DESCENDING_SORT_FACTOR;
  else 
    closure->factor = ASCENDING_SORT_FACTOR;

  closure->abView = abView;
  return;
}

class CardComparator
{
public:
  void SetClosure(SortClosure *closure) { m_closure = closure; };

  bool Equals(const AbCard *a, const AbCard *b) const {
    return inplaceSortCallback(a, b, m_closure) == 0;
  }
  bool LessThan(const AbCard *a, const AbCard *b) const{
    return inplaceSortCallback(a, b, m_closure) < 0;
  }

private:
  SortClosure *m_closure;
};

NS_IMETHODIMP nsAbView::SortBy(const char16_t *colID, const char16_t *sortDir, bool aResort = false)
{
  nsresult rv;

  int32_t count = mCards.Length();

  nsAutoString sortColumn;
  if (!colID)
    sortColumn = NS_LITERAL_STRING(GENERATED_NAME_COLUMN_ID);  // default sort column
  else
    sortColumn = colID;

  nsAutoString sortDirection;
  if (!sortDir)
    sortDirection = NS_LITERAL_STRING("ascending");  // default direction
  else
    sortDirection = sortDir;

  if (mSortColumn.Equals(sortColumn) && !aResort) {
    if (mSortDirection.Equals(sortDir)) {
      // If sortColumn and sortDirection are identical since the last call, do nothing.
      return NS_OK;
    } else {
      // If we are sorting by how we are already sorted,
      // and just the sort direction changes, just reverse.
      int32_t halfPoint = count / 2;
      for (int32_t i = 0; i < halfPoint; i++) {
        // Swap the elements.
        AbCard *ptr1 = mCards.ElementAt(i);
        AbCard *ptr2 = mCards.ElementAt(count - i - 1);
        mCards.ReplaceElementAt(i, ptr2);
        mCards.ReplaceElementAt(count - i - 1, ptr1);
      }
      mSortDirection = sortDir;
    }
  }
  else {
    // Generate collation keys
    for (int32_t i = 0; i < count; i++) {
      AbCard *abcard = mCards.ElementAt(i);

      rv = GenerateCollationKeysForCard(sortColumn.get(), abcard);
      NS_ENSURE_SUCCESS(rv,rv);
    }

    // We need to do full sort.
    SortClosure closure;
    SetSortClosure(sortColumn.get(), sortDirection.get(), this, &closure);

    nsCOMPtr<nsIMutableArray> selectedCards = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = GetSelectedCards(selectedCards);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbCard> indexCard;

    if (mTreeSelection) {
      int32_t currentIndex = -1;

      rv = mTreeSelection->GetCurrentIndex(&currentIndex);
      NS_ENSURE_SUCCESS(rv,rv);

      if (currentIndex != -1) {
        rv = GetCardFromRow(currentIndex, getter_AddRefs(indexCard));
        NS_ENSURE_SUCCESS(rv,rv);
      }
    }

    CardComparator cardComparator;
    cardComparator.SetClosure(&closure);
    mCards.Sort(cardComparator);

    rv = ReselectCards(selectedCards, indexCard);
    NS_ENSURE_SUCCESS(rv, rv);

    mSortColumn = sortColumn;
    mSortDirection = sortDirection;
  }

  rv = InvalidateTree(ALL_ROWS);
  NS_ENSURE_SUCCESS(rv,rv);
  return rv;
}

int32_t nsAbView::CompareCollationKeys(uint8_t *key1, uint32_t len1, uint8_t *key2, uint32_t len2)
{
  NS_ASSERTION(mCollationKeyGenerator, "no key generator");
  if (!mCollationKeyGenerator)
    return 0;

  int32_t result;

  nsresult rv = mCollationKeyGenerator->CompareRawSortKey(key1,len1,key2,len2,&result);
  NS_ASSERTION(NS_SUCCEEDED(rv), "key compare failed");
  if (NS_FAILED(rv))
    result = 0;
  return result;
}

nsresult nsAbView::GenerateCollationKeysForCard(const char16_t *colID, AbCard *abcard)
{
  nsresult rv;
  nsString value;

  if (!mCollationKeyGenerator)
  {
    nsCOMPtr<nsILocaleService> localeSvc = do_GetService(NS_LOCALESERVICE_CONTRACTID,&rv); 
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsILocale> locale; 
    rv = localeSvc->GetApplicationLocale(getter_AddRefs(locale));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr <nsICollationFactory> factory = do_CreateInstance(NS_COLLATIONFACTORY_CONTRACTID, &rv); 
    NS_ENSURE_SUCCESS(rv, rv);

    rv = factory->CreateCollation(locale, getter_AddRefs(mCollationKeyGenerator));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = GetCardValue(abcard->card, colID, value);
  NS_ENSURE_SUCCESS(rv,rv);
  
  PR_FREEIF(abcard->primaryCollationKey);
  rv = mCollationKeyGenerator->AllocateRawSortKey(nsICollation::kCollationCaseInSensitive,
    value, &(abcard->primaryCollationKey), &(abcard->primaryCollationKeyLen));
  NS_ENSURE_SUCCESS(rv,rv);
  
  // Hardcode email to be our secondary key. As we are doing this, just call
  // the card's GetCardValue direct, rather than our own function which will
  // end up doing the same as then we can save a bit of time.
  rv = abcard->card->GetPrimaryEmail(value);
  NS_ENSURE_SUCCESS(rv,rv);
  
  PR_FREEIF(abcard->secondaryCollationKey);
  rv = mCollationKeyGenerator->AllocateRawSortKey(nsICollation::kCollationCaseInSensitive,
    value, &(abcard->secondaryCollationKey), &(abcard->secondaryCollationKeyLen));
  NS_ENSURE_SUCCESS(rv,rv);
  return rv;
}

// A helper method currently returns true if the directory is an LDAP.
// We can tweak this to return true for all Remote Address Books where the
// search is asynchronous.
bool isDirectoryRemote(nsCOMPtr<nsIAbDirectory> aDir)
{
  nsCString uri;
  aDir->GetURI(uri);
  return (uri.Find("moz-abldapdirectory") != kNotFound);
}

// A helper method to get the query string for nsIAbDirectory.
nsCString getQuery(nsCOMPtr<nsIAbDirectory> aDir)
{
  nsCString uri;
  aDir->GetURI(uri);
  int32_t searchBegin = uri.FindChar('?');
  if (searchBegin == kNotFound)
    return EmptyCString();

  return nsCString(Substring(uri, searchBegin));
}

NS_IMETHODIMP nsAbView::OnItemAdded(nsISupports *parentDir, nsISupports *item)
{
  nsresult rv;
  nsCOMPtr <nsIAbDirectory> directory = do_QueryInterface(parentDir, &rv);
  NS_ENSURE_SUCCESS(rv,rv);

  bool isRemote = isDirectoryRemote(directory);
  // If the search is performed on All Address books, its possible that the LDAP
  // results start coming when mDirectory has changed (LDAP search works in an
  // asynchronous manner).
  // Since the listeners are being added to all nsAbView instances, we need to
  // make sure that all the views aren't updated by the listeners.
  bool isDirectoryQuery = false;
  bool isMDirectoryQuery = false;
  // See if current parent directory to which the item is added is a query
  // directory.
  directory->GetIsQuery(&isDirectoryQuery);
  // Get the query string for the directory in Advanced AB Search window.
  nsCString directoryQuery(getQuery(directory));
  // See if the selected directory in Address book main window is a query
  // directory.
  mDirectory->GetIsQuery(&isMDirectoryQuery);
  // Get the query string for the selected directory in the main AB window.
  nsCString mDirectoryQuery(getQuery(mDirectory));
  if ((mIsAllDirectoryRootView && isRemote &&
       isDirectoryQuery && isMDirectoryQuery &&
       directoryQuery.Equals(mDirectoryQuery)) ||
      directory.get() == mDirectory.get()) {
    nsCOMPtr <nsIAbCard> addedCard = do_QueryInterface(item);
    if (addedCard) {
      // Malloc these from an arena
      AbCard *abcard = (AbCard *) PR_Calloc(1, sizeof(struct AbCard));
      if (!abcard)
        return NS_ERROR_OUT_OF_MEMORY;

      abcard->card = addedCard;
      NS_IF_ADDREF(abcard->card);
    
      rv = GenerateCollationKeysForCard(mSortColumn.get(), abcard);
      NS_ENSURE_SUCCESS(rv,rv);

      int32_t index;
      rv = AddCard(abcard, false /* select card */, &index);
      NS_ENSURE_SUCCESS(rv,rv);
    }
  }
  return rv;
}

NS_IMETHODIMP nsAbView::Observe(nsISupports *aSubject, const char *aTopic, const char16_t *someData)
{
  if (!strcmp(aTopic, NS_PREFBRANCH_PREFCHANGE_TOPIC_ID)) {
    if (nsDependentString(someData).EqualsLiteral(PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST)) {
      nsresult rv = SetGeneratedNameFormatFromPrefs();
      NS_ENSURE_SUCCESS(rv, rv);

      rv = RefreshTree();
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }
  return NS_OK;
}

nsresult nsAbView::AddCard(AbCard *abcard, bool selectCardAfterAdding, int32_t *index)
{
  nsresult rv = NS_OK;
  NS_ENSURE_ARG_POINTER(abcard);
  
  *index = FindIndexForInsert(abcard);
  mCards.InsertElementAt(*index, abcard);

  // This needs to happen after we insert the card, as RowCountChanged() will call GetRowCount()
  if (mTree)
    rv = mTree->RowCountChanged(*index, 1);

  // Checking for mTree here works around core bug 399227
  if (selectCardAfterAdding && mTreeSelection && mTree) {
    mTreeSelection->SetCurrentIndex(*index);
    mTreeSelection->RangedSelect(*index, *index, false /* augment */);
  }

  if (mAbViewListener && !mSuppressCountChange) {
    rv = mAbViewListener->OnCountChanged(mCards.Length());
    NS_ENSURE_SUCCESS(rv,rv);
  }

  return rv;
}

int32_t nsAbView::FindIndexForInsert(AbCard *abcard)
{
  int32_t count = mCards.Length();
  int32_t i;

  SortClosure closure;
  SetSortClosure(mSortColumn.get(), mSortDirection.get(), this, &closure);
  
  // XXX todo
  // Make this a binary search
  for (i=0; i < count; i++) {
    int32_t value = inplaceSortCallback(abcard, mCards.ElementAt(i), &closure);
    // XXX Fix me, this is not right for both ascending and descending
    if (value <= 0) 
      break;
  }
  return i;
}

NS_IMETHODIMP nsAbView::OnItemRemoved(nsISupports *parentDir, nsISupports *item)
{
  nsresult rv;

  nsCOMPtr <nsIAbDirectory> directory = do_QueryInterface(parentDir,&rv);
  NS_ENSURE_SUCCESS(rv,rv);

  if (directory.get() == mDirectory.get())
    return RemoveCardAndSelectNextCard(item);

  // The pointers aren't the same, are the URI strings similar? This is most
  // likely the case if the current directory is a search on a directory.
  nsCString currentURI;
  rv = mDirectory->GetURI(currentURI);
  NS_ENSURE_SUCCESS(rv, rv);

  // If it is a search, it will have something like ?(or(PrimaryEmail...
  // on the end of the string, so remove that before comparing
  int32_t pos = currentURI.FindChar('?');
  if (pos != -1)
    currentURI.SetLength(pos);

  nsCString notifiedURI;
  rv = directory->GetURI(notifiedURI);
  NS_ENSURE_SUCCESS(rv, rv);

  if (currentURI.Equals(notifiedURI))
    return RemoveCardAndSelectNextCard(item);

  return NS_OK;
}

nsresult nsAbView::RemoveCardAndSelectNextCard(nsISupports *item)
{
  nsresult rv = NS_OK;
  nsCOMPtr <nsIAbCard> card = do_QueryInterface(item);
  if (card) {
    int32_t index = FindIndexForCard(card);
    if (index != CARD_NOT_FOUND) {
      bool selectNextCard = false;
      if (mTreeSelection) {
        int32_t selectedIndex;
        // XXX todo
        // Make sure it works if nothing selected
        mTreeSelection->GetCurrentIndex(&selectedIndex);
        if (index == selectedIndex)
          selectNextCard = true;
      }

      rv = RemoveCardAt(index);
      NS_ENSURE_SUCCESS(rv,rv);

      if (selectNextCard) {
      int32_t count = mCards.Length();
      if (count && mTreeSelection) {
        // If we deleted the last card, adjust so we select the new "last" card
        if (index >= (count - 1)) {
          index = count -1;
        }
        mTreeSelection->SetCurrentIndex(index);
        mTreeSelection->RangedSelect(index, index, false /* augment */);
      }
    }
  }
  }
  return rv;
}

int32_t nsAbView::FindIndexForCard(nsIAbCard *card)
{
  int32_t count = mCards.Length();
  int32_t i;
 
  // You can't implement the binary search here, as all you have is the nsIAbCard
  // you might be here because one of the card properties has changed, and that property
  // could be the collation key.
  for (i=0; i < count; i++) {
    AbCard *abcard = mCards.ElementAt(i);
    bool equals;
    nsresult rv = card->Equals(abcard->card, &equals);
    if (NS_SUCCEEDED(rv) && equals) {
      return i;
    }
  }
  return CARD_NOT_FOUND;
}

NS_IMETHODIMP nsAbView::OnItemPropertyChanged(nsISupports *item, const char *property, const char16_t *oldValue, const char16_t *newValue)
{
  nsresult rv;

  nsCOMPtr <nsIAbCard> card = do_QueryInterface(item);
  if (!card)
    return NS_OK;

  int32_t index = FindIndexForCard(card);
  if (index == -1)
    return NS_OK;

  AbCard *oldCard = mCards.ElementAt(index);

  // Malloc these from an arena
  AbCard *newCard = (AbCard *) PR_Calloc(1, sizeof(struct AbCard));
  if (!newCard)
    return NS_ERROR_OUT_OF_MEMORY;

  newCard->card = card;
  NS_IF_ADDREF(newCard->card);
    
  rv = GenerateCollationKeysForCard(mSortColumn.get(), newCard);
  NS_ENSURE_SUCCESS(rv,rv);

  bool cardWasSelected = false;

  if (mTreeSelection) {
    rv = mTreeSelection->IsSelected(index, &cardWasSelected);
    NS_ENSURE_SUCCESS(rv,rv);
  }
  
  if (!CompareCollationKeys(newCard->primaryCollationKey,newCard->primaryCollationKeyLen,oldCard->primaryCollationKey,oldCard->primaryCollationKeyLen)
    && CompareCollationKeys(newCard->secondaryCollationKey,newCard->secondaryCollationKeyLen,oldCard->secondaryCollationKey,oldCard->secondaryCollationKeyLen)) {
    // No need to remove and add, since the collation keys haven't changed.
    // Since they haven't changed, the card will sort to the same place.
    // We just need to clean up what we allocated.
    NS_IF_RELEASE(newCard->card);
    if (newCard->primaryCollationKey)
      free(newCard->primaryCollationKey);
    if (newCard->secondaryCollationKey)
      free(newCard->secondaryCollationKey);
    PR_FREEIF(newCard);

    // Still need to invalidate, as the other columns may have changed.
    rv = InvalidateTree(index);
    NS_ENSURE_SUCCESS(rv,rv);
  }
  else {
    mSuppressSelectionChange = true;
    mSuppressCountChange = true;

    // Remove the old card.
    rv = RemoveCardAt(index);
    NS_ASSERTION(NS_SUCCEEDED(rv), "remove card failed\n");

    // Add the card we created, and select it (to restore selection) if it was selected.
    rv = AddCard(newCard, cardWasSelected /* select card */, &index);
    NS_ASSERTION(NS_SUCCEEDED(rv), "add card failed\n");

    mSuppressSelectionChange = false;
    mSuppressCountChange = false;

    // Ensure restored selection is visible
    if (cardWasSelected && mTree) 
      mTree->EnsureRowIsVisible(index);
  }

  // Although the selection hasn't changed, the card that is selected may need
  // to be displayed differently, therefore pretend that the selection has
  // changed to force that update.
  if (cardWasSelected)
    SelectionChanged();

  return NS_OK;
}

NS_IMETHODIMP nsAbView::SelectAll()
{
  if (mTreeSelection && mTree) {
    mTreeSelection->SelectAll();
    mTree->Invalidate();
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetSortDirection(nsAString & aDirection)
{
  aDirection = mSortDirection;
  return NS_OK;
}

NS_IMETHODIMP nsAbView::GetSortColumn(nsAString & aColumn)
{
  aColumn = mSortColumn;
  return NS_OK;
}

nsresult nsAbView::ReselectCards(nsIArray *aCards, nsIAbCard *aIndexCard)
{
  uint32_t count;
  uint32_t i;

  if (!mTreeSelection || !aCards)
    return NS_OK;

  nsresult rv = mTreeSelection->ClearSelection();
  NS_ENSURE_SUCCESS(rv,rv);

  rv = aCards->GetLength(&count);
  NS_ENSURE_SUCCESS(rv, rv);

  // If we don't have any cards selected, nothing else to do.
  if (!count)
    return NS_OK;

  for (i = 0; i < count; i++) {
    nsCOMPtr<nsIAbCard> card = do_QueryElementAt(aCards, i);
    if (card) {
      int32_t index = FindIndexForCard(card);
      if (index != CARD_NOT_FOUND) {
        mTreeSelection->RangedSelect(index, index, true /* augment */);
      }
    }
  }

  // Reset the index card, and ensure it is visible.
  if (aIndexCard) {
    int32_t currentIndex = FindIndexForCard(aIndexCard);
    rv = mTreeSelection->SetCurrentIndex(currentIndex);
    NS_ENSURE_SUCCESS(rv, rv);
  
    if (mTree) {
      rv = mTree->EnsureRowIsVisible(currentIndex);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbView::DeleteSelectedCards()
{
  nsresult rv;
  nsCOMPtr<nsIMutableArray> cardsToDelete = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  
  rv = GetSelectedCards(cardsToDelete);
  NS_ENSURE_SUCCESS(rv, rv);

  // mDirectory should not be null
  // Bullet proof (and assert) to help figure out bug #127748
  NS_ENSURE_TRUE(mDirectory, NS_ERROR_UNEXPECTED);

  rv = mDirectory->DeleteCards(cardsToDelete);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

nsresult nsAbView::GetSelectedCards(nsCOMPtr<nsIMutableArray> &aSelectedCards)
{
  if (!mTreeSelection)
    return NS_OK;

  int32_t selectionCount; 
  nsresult rv = mTreeSelection->GetRangeCount(&selectionCount);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!selectionCount)
    return NS_OK;

  for (int32_t i = 0; i < selectionCount; i++)
  {
    int32_t startRange;
    int32_t endRange;
    rv = mTreeSelection->GetRangeAt(i, &startRange, &endRange);
    NS_ENSURE_SUCCESS(rv, NS_OK); 
    int32_t totalCards = mCards.Length();
    if (startRange >= 0 && startRange < totalCards)
    {
      for (int32_t rangeIndex = startRange; rangeIndex <= endRange && rangeIndex < totalCards; rangeIndex++) {
        nsCOMPtr<nsIAbCard> abCard;
        rv = GetCardFromRow(rangeIndex, getter_AddRefs(abCard));
        NS_ENSURE_SUCCESS(rv,rv);
        
        rv = aSelectedCards->AppendElement(abCard, false);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbView::SwapFirstNameLastName()
{
  if (!mTreeSelection)
    return NS_OK;
  
  int32_t selectionCount; 
  nsresult rv = mTreeSelection->GetRangeCount(&selectionCount);
  NS_ENSURE_SUCCESS(rv, rv);
  
  if (!selectionCount)
    return NS_OK;
  
  // Prepare for displayname generation
  // No cache for pref and bundle since the swap operation is not executed frequently
  bool displayNameAutoGeneration;
  bool displayNameLastnamefirst = false;

  nsCOMPtr<nsIPrefBranch> pPrefBranchInt(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = pPrefBranchInt->GetBoolPref(PREF_MAIL_ADDR_BOOK_DISPLAYNAME_AUTOGENERATION, &displayNameAutoGeneration);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIStringBundle> bundle;
  if (displayNameAutoGeneration)
  {
    nsCOMPtr<nsIPrefLocalizedString> pls;
    rv = pPrefBranchInt->GetComplexValue(PREF_MAIL_ADDR_BOOK_DISPLAYNAME_LASTNAMEFIRST,
                                         NS_GET_IID(nsIPrefLocalizedString), getter_AddRefs(pls));
    NS_ENSURE_SUCCESS(rv, rv);

    nsString str;
    pls->ToString(getter_Copies(str));
    displayNameLastnamefirst = str.EqualsLiteral("true");
    nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::services::GetStringBundleService();
    NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);

    rv = bundleService->CreateBundle("chrome://messenger/locale/addressbook/addressBook.properties", 
                                     getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  for (int32_t i = 0; i < selectionCount; i++)
  {
    int32_t startRange;
    int32_t endRange;
    rv = mTreeSelection->GetRangeAt(i, &startRange, &endRange);
    NS_ENSURE_SUCCESS(rv, NS_OK); 
    int32_t totalCards = mCards.Length();
    if (startRange >= 0 && startRange < totalCards)
    {
      for (int32_t rangeIndex = startRange; rangeIndex <= endRange && rangeIndex < totalCards; rangeIndex++) {
        nsCOMPtr<nsIAbCard> abCard;
        rv = GetCardFromRow(rangeIndex, getter_AddRefs(abCard));
        NS_ENSURE_SUCCESS(rv, rv);

        // Swap FN/LN
        nsAutoString fn, ln;
        abCard->GetFirstName(fn);
        abCard->GetLastName(ln);
        if (!fn.IsEmpty() || !ln.IsEmpty())
        {
          abCard->SetFirstName(ln);
          abCard->SetLastName(fn);

          // Generate display name using the new order
          if (displayNameAutoGeneration &&
              !fn.IsEmpty() && !ln.IsEmpty())
          {
            nsString dnLnFn;
            nsString dnFnLn;
            const char16_t *nameString[2];
            const char16_t *formatString;

            // The format should stays the same before/after we swap the names
            formatString = displayNameLastnamefirst ?
                              MOZ_UTF16("lastFirstFormat") :
                              MOZ_UTF16("firstLastFormat");

            // Generate both ln/fn and fn/ln combination since we need both later
            // to check to see if the current display name was edited
            // note that fn/ln still hold the values before the swap
            nameString[0] = ln.get();
            nameString[1] = fn.get();
            rv = bundle->FormatStringFromName(formatString,
                                              nameString, 2, getter_Copies(dnLnFn));
            NS_ENSURE_SUCCESS(rv, rv);
            nameString[0] = fn.get();
            nameString[1] = ln.get();
            rv = bundle->FormatStringFromName(formatString,
                                              nameString, 2, getter_Copies(dnFnLn));
            NS_ENSURE_SUCCESS(rv, rv);

            // Get the current display name
            nsAutoString dn;
            rv = abCard->GetDisplayName(dn);
            NS_ENSURE_SUCCESS(rv, rv);

            // Swap the display name if not edited
            if (displayNameLastnamefirst)
            {
              if (dn.Equals(dnLnFn))
                abCard->SetDisplayName(dnFnLn);
            }
            else
            {
              if (dn.Equals(dnFnLn))
                abCard->SetDisplayName(dnLnFn);
            }
          }

          // Swap phonetic names
          rv = abCard->GetPropertyAsAString(kPhoneticFirstNameProperty, fn);
          NS_ENSURE_SUCCESS(rv, rv);
          rv = abCard->GetPropertyAsAString(kPhoneticLastNameProperty, ln);
          NS_ENSURE_SUCCESS(rv, rv);
          if (!fn.IsEmpty() || !ln.IsEmpty())
          {
            abCard->SetPropertyAsAString(kPhoneticFirstNameProperty, ln);
            abCard->SetPropertyAsAString(kPhoneticLastNameProperty, fn);
          }
        }
      }
    }
  }
  // Update the tree
  // Re-sort if either generated or phonetic name is primary or secondary sort,
  // otherwise invalidate to reflect the change
  rv = RefreshTree();

  return rv;
}

NS_IMETHODIMP nsAbView::GetSelectedAddresses(nsIArray **_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv;
  nsCOMPtr<nsIMutableArray> selectedCards = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = GetSelectedCards(selectedCards);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMutableArray> addresses = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  uint32_t count;
  selectedCards->GetLength(&count);

  for (uint32_t i = 0; i < count; i++) {
    nsCOMPtr<nsIAbCard> card(do_QueryElementAt(selectedCards, i, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    bool isMailList;
    card->GetIsMailList(&isMailList);
    nsAutoString primaryEmail;
    if (isMailList) {
      nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID,
                                                     &rv));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCString mailListURI;
      rv = card->GetMailListURI(getter_Copies(mailListURI));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIAbDirectory> mailList;
      rv = abManager->GetDirectory(mailListURI, getter_AddRefs(mailList));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIMutableArray> mailListAddresses;
      rv = mailList->GetAddressLists(getter_AddRefs(mailListAddresses));
      NS_ENSURE_SUCCESS(rv,rv);

      uint32_t mailListCount = 0;
      mailListAddresses->GetLength(&mailListCount);	

      for (uint32_t j = 0; j < mailListCount; j++) {
        nsCOMPtr<nsIAbCard> mailListCard = do_QueryElementAt(mailListAddresses, j, &rv);
        NS_ENSURE_SUCCESS(rv,rv);

        rv = mailListCard->GetPrimaryEmail(primaryEmail);
        NS_ENSURE_SUCCESS(rv,rv);

        if (!primaryEmail.IsEmpty()) {
          nsCOMPtr<nsISupportsString> supportsEmail(do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID));
          supportsEmail->SetData(primaryEmail);
          addresses->AppendElement(supportsEmail, false);
        }
      }
    }
    else {
      rv = card->GetPrimaryEmail(primaryEmail);
      NS_ENSURE_SUCCESS(rv,rv);

      if (!primaryEmail.IsEmpty()) {
        nsCOMPtr<nsISupportsString> supportsEmail(do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID));
        supportsEmail->SetData(primaryEmail);
        addresses->AppendElement(supportsEmail, false);
      }
    }    
  }

  NS_IF_ADDREF(*_retval = addresses);

  return NS_OK;
}
