/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsAbOutlookDirectory.h"
#include "nsAbWinHelper.h"

#include "nsAbBaseCID.h"
#include "nsString.h"
#include "nsAbDirectoryQuery.h"
#include "nsIAbBooleanExpression.h"
#include "nsIAbManager.h"
#include "nsAbQueryStringToExpression.h"
#include "nsAbUtils.h"
#include "nsEnumeratorUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "mozilla/Logging.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsCRTGlue.h"
#include "nsArrayUtils.h"
#include "nsArrayEnumerator.h"
#include "nsMsgUtils.h"
#include "nsQueryObject.h"
#include "mozilla/Services.h"
#include "nsIObserverService.h"
#include "mozilla/JSONWriter.h"

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
      mSearchContext(-1),
      mAbWinType(nsAbWinType_Unknown) {
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
  nsAutoCString stub;

  mAbWinType = getAbWinType(kOutlookDirectoryScheme, mURI.get(), stub, entry);
  if (mAbWinType == nsAbWinType_Unknown) {
    PRINTF(("Huge problem URI=%s.\n", mURI.get()));
    return NS_ERROR_INVALID_ARG;
  }
  nsAbWinHelperGuard mapiAddBook(mAbWinType);
  nsString prefix;
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

  if (mAbWinType == nsAbWinType_Outlook)
    prefix.AssignLiteral("OP ");
  else
    prefix.AssignLiteral("OE ");
  prefix.Append(unichars);

  if (objectType == MAPI_DISTLIST) {
    m_IsMailList = true;
    SetDirName(unichars);
  } else {
    m_IsMailList = false;
    SetDirName(prefix);
  }

  return UpdateAddressList();
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
    nsISimpleEnumerator** aNodes) {
  NS_ENSURE_ARG_POINTER(aNodes);

  *aNodes = nullptr;

  nsresult rv;
  nsCOMPtr<nsIMutableArray> nodeList(
      do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = GetNodes(nodeList);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_NewArrayEnumerator(aNodes, nodeList, NS_GET_IID(nsIAbDirectory));
}

NS_IMETHODIMP nsAbOutlookDirectory::GetChildCards(
    nsISimpleEnumerator** aCards) {
  NS_ENSURE_ARG_POINTER(aCards);
  *aCards = nullptr;

  nsresult rv;
  nsCOMPtr<nsIMutableArray> cardList(
      do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  mCardList.Clear();

  rv = GetCards(cardList, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_AddressList) {
    m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Fill the results array and update the card list
  // Also update the address list and notify any changes.
  uint32_t nbCards = 0;

  NS_NewArrayEnumerator(aCards, cardList, NS_GET_IID(nsIAbCard));
  cardList->GetLength(&nbCards);

  nsCOMPtr<nsIAbCard> card;
  nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < nbCards; ++i) {
    card = do_QueryElementAt(cardList, i, &rv);
    if (NS_FAILED(rv)) continue;

    if (!mCardList.Get(card, nullptr)) {
      // We are dealing with a new element (probably directly
      // added from Outlook), we may need to sync m_AddressList
      mCardList.Put(card, card);

      bool isMailList = false;

      rv = card->GetIsMailList(&isMailList);
      NS_ENSURE_SUCCESS(rv, rv);
      if (isMailList) {
        // We can have mailing lists only in folder,
        // we must add the directory to m_AddressList
        nsCString mailListUri;
        rv = card->GetMailListURI(getter_Copies(mailListUri));
        NS_ENSURE_SUCCESS(rv, rv);
        nsCOMPtr<nsIAbDirectory> mailList;
        rv = abManager->GetDirectory(mailListUri, getter_AddRefs(mailList));
        NS_ENSURE_SUCCESS(rv, rv);

        m_AddressList->AppendElement(mailList);
        NotifyItemAddition(mailList);
      } else if (m_IsMailList) {
        m_AddressList->AppendElement(card);
        NotifyItemAddition(card);
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsAbOutlookDirectory::HasCard(nsIAbCard* aCard, bool* aHasCard) {
  if (!aCard || !aHasCard) return NS_ERROR_NULL_POINTER;

  *aHasCard = mCardList.Get(aCard, nullptr);
  return NS_OK;
}

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

nsresult nsAbOutlookDirectory::ExtractCardEntry(nsIAbCard* aCard,
                                                nsCString& aEntry) {
  aEntry.Truncate();

  nsCString uri;
  aCard->GetPropertyAsAUTF8String("OutlookEntryURI", uri);

  // If we don't have a URI, uri will be empty. getAbWinType doesn't set
  // aEntry to anything if uri is empty, so it will be truncated, allowing us
  // to accept cards not initialized by us.
  nsAutoCString stub;
  getAbWinType(kOutlookCardScheme, uri.get(), stub, aEntry);
  return NS_OK;
}

nsresult nsAbOutlookDirectory::ExtractDirectoryEntry(nsIAbDirectory* aDirectory,
                                                     nsCString& aEntry) {
  aEntry.Truncate();
  nsCString uri;
  nsresult rv = aDirectory->GetURI(uri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString stub;
  getAbWinType(kOutlookDirectoryScheme, uri.get(), stub, aEntry);

  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::DeleteCards(
    const nsTArray<RefPtr<nsIAbCard>>& aCards) {
  nsresult retCode = NS_OK;
  nsAbWinHelperGuard mapiAddBook(mAbWinType);

  if (!mapiAddBook->IsOK()) {
    return NS_ERROR_FAILURE;
  }

  nsAutoCString entryString;
  nsMapiEntry cardEntry;

  for (auto card : aCards) {
    retCode = ExtractCardEntry(card, entryString);
    if (NS_SUCCEEDED(retCode) && !entryString.IsEmpty()) {
      cardEntry.Assign(entryString);
      if (!mapiAddBook->DeleteEntry(*mDirEntry, cardEntry)) {
        PRINTF(("Cannot delete card %s.\n", entryString.get()));
      } else {
        mCardList.Remove(card);
        if (m_IsMailList && m_AddressList) {
          uint32_t pos;
          if (NS_SUCCEEDED(m_AddressList->IndexOf(0, card, &pos)))
            m_AddressList->RemoveElementAt(pos);
        }
        retCode = NotifyItemDeletion(card);
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
  nsAbWinHelperGuard mapiAddBook(mAbWinType);
  nsAutoCString entryString;

  if (!mapiAddBook->IsOK()) {
    return NS_ERROR_FAILURE;
  }
  retCode = ExtractDirectoryEntry(aDirectory, entryString);
  if (NS_SUCCEEDED(retCode) && !entryString.IsEmpty()) {
    nsMapiEntry directoryEntry;

    directoryEntry.Assign(entryString);
    if (!mapiAddBook->DeleteEntry(*mDirEntry, directoryEntry)) {
      PRINTF(("Cannot delete directory %s.\n", entryString.get()));
    } else {
      uint32_t pos;
      if (m_AddressList &&
          NS_SUCCEEDED(m_AddressList->IndexOf(0, aDirectory, &pos)))
        m_AddressList->RemoveElementAt(pos);

      retCode = NotifyItemDeletion(aDirectory);
      NS_ENSURE_SUCCESS(retCode, retCode);
    }
  } else {
    PRINTF(("Directory doesn't belong to this folder.\n"));
  }
  return retCode;
}

NS_IMETHODIMP nsAbOutlookDirectory::AddCard(nsIAbCard* aData,
                                            nsIAbCard** addedCard) {
  NS_ENSURE_ARG_POINTER(aData);

  nsresult retCode = NS_OK;
  bool hasCard = false;

  retCode = HasCard(aData, &hasCard);
  NS_ENSURE_SUCCESS(retCode, retCode);
  if (hasCard) {
    PRINTF(("Has card.\n"));
    NS_IF_ADDREF(*addedCard = aData);
    return NS_OK;
  }
  retCode = CreateCard(aData, addedCard);
  NS_ENSURE_SUCCESS(retCode, retCode);

  mCardList.Put(*addedCard, *addedCard);

  if (!m_AddressList) {
    m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &retCode);
    NS_ENSURE_SUCCESS(retCode, retCode);
  }

  if (m_IsMailList) m_AddressList->AppendElement(*addedCard);
  NotifyItemAddition(*addedCard);
  return retCode;
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
  nsAbWinHelperGuard mapiAddBook(mAbWinType);
  nsAutoCString entryString;
  nsMapiEntry newEntry;
  bool didCopy = false;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;
  nsresult rv = ExtractDirectoryEntry(aMailList, entryString);
  if (NS_SUCCEEDED(rv) && !entryString.IsEmpty()) {
    nsMapiEntry sourceEntry;

    sourceEntry.Assign(entryString);
    mapiAddBook->CopyEntry(*mDirEntry, sourceEntry, newEntry);
  }
  if (newEntry.mByteCount == 0) {
    if (!mapiAddBook->CreateDistList(*mDirEntry, newEntry))
      return NS_ERROR_FAILURE;
  } else {
    didCopy = true;
  }
  newEntry.ToString(entryString);
  nsAutoCString uri;

  buildAbWinUri(kOutlookDirectoryScheme, mAbWinType, uri);
  uri.Append(entryString);

  nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirectory> newList;
  rv = abManager->GetDirectory(uri, getter_AddRefs(newList));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!didCopy) {
    rv = newList->CopyMailList(aMailList);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = newList->EditMailListToDatabase(nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (!m_AddressList) {
    m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  m_AddressList->AppendElement(newList);
  NotifyItemAddition(newList);
  newList.forget(addedList);

  return rv;
}

NS_IMETHODIMP nsAbOutlookDirectory::EditMailListToDatabase(
    nsIAbCard* listCard) {
  nsresult rv;
  nsString name;
  nsAbWinHelperGuard mapiAddBook(mAbWinType);

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  rv = GetDirName(name);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!mapiAddBook->SetPropertyUString(*mDirEntry, PR_DISPLAY_NAME_W,
                                       name.get()))
    return NS_ERROR_FAILURE;

  return CommitAddressList();
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

  // Note the following:
  // This code is also run for the "OE" address book provider which provides
  // access to the "Windows Contacts" stored in C:\Users\<user>\Contacts.
  // Ultimately the cards are retrieved by `nsAbWinHelper::GetContents()` which
  // executes a `Restrict()` on the MAPI table. Unlike for Outlook, for
  // "Windows Contacts" that call always succeeds, regardless of whether
  // PR_ANR_A/W, PR_EMAIL_ADDRESS_A/W or PR_DISPLAY_NAME_A/W is used.
  // However, no cards are ever returned.

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
                                           nsIAbDirSearchListener* listener) {
  nsresult retCode = NS_OK;

  // Note the following: We get a rather complicated query passed here from
  // preference mail.addr_book.quicksearchquery.format.
  // Outlook address book search only allows search by PR_ANR, which is a fuzzy
  // Ambiguous Name Restriction search.

  retCode = StopSearch();
  NS_ENSURE_SUCCESS(retCode, retCode);

  nsCOMPtr<nsIAbBooleanExpression> expression;

  nsCOMPtr<nsIAbDirectoryQueryArguments> arguments =
      do_CreateInstance(NS_ABDIRECTORYQUERYARGUMENTS_CONTRACTID, &retCode);
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
    nsresult status, nsITransportSecurityInfo* secInfo,
    nsACString const& location) {
  return NS_OK;
}

NS_IMETHODIMP nsAbOutlookDirectory::OnSearchFoundCard(nsIAbCard* aCard) {
  mCardList.Put(aCard, aCard);
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

  aListener->OnSearchFinished(NS_OK, nullptr, ""_ns);
  return retCode;
}

// This function expects the aCards array to already be created.
nsresult nsAbOutlookDirectory::GetCards(nsIMutableArray* aCards,
                                        SRestriction* aRestriction) {
  nsAbWinHelperGuard mapiAddBook(mAbWinType);

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  nsMapiEntryArray cardEntries;
  LPSRestriction restriction = (LPSRestriction)aRestriction;

  if (!mapiAddBook->GetCards(*mDirEntry, restriction, cardEntries)) {
    PRINTF(("Cannot get cards.\n"));
    return NS_ERROR_FAILURE;
  }

  nsAutoCString ourUID;
  GetUID(ourUID);

  nsAutoCString entryId;
  nsAutoCString uriName;
  nsCOMPtr<nsIAbCard> childCard;
  nsresult rv = NS_OK;

  for (ULONG card = 0; card < cardEntries.mNbEntries; ++card) {
    cardEntries.mEntries[card].ToString(entryId);
    buildAbWinUri(kOutlookCardScheme, mAbWinType, uriName);
    uriName.Append(entryId);

    rv = OutlookCardForURI(uriName, getter_AddRefs(childCard));
    NS_ENSURE_SUCCESS(rv, rv);
    childCard->SetDirectoryUID(ourUID);

    aCards->AppendElement(childCard);
  }
  return rv;
}

nsresult nsAbOutlookDirectory::GetNodes(nsIMutableArray* aNodes) {
  NS_ENSURE_ARG_POINTER(aNodes);

  aNodes->Clear();

  nsAbWinHelperGuard mapiAddBook(mAbWinType);
  nsMapiEntryArray nodeEntries;

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  if (!mapiAddBook->GetNodes(*mDirEntry, nodeEntries)) {
    PRINTF(("Cannot get nodes.\n"));
    return NS_ERROR_FAILURE;
  }

  nsAutoCString entryId;
  nsAutoCString uriName;
  nsresult rv = NS_OK;

  nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  for (ULONG node = 0; node < nodeEntries.mNbEntries; ++node) {
    nodeEntries.mEntries[node].ToString(entryId);
    buildAbWinUri(kOutlookDirectoryScheme, mAbWinType, uriName);
    uriName.Append(entryId);

    nsCOMPtr<nsIAbDirectory> directory;
    rv = abManager->GetDirectory(uriName, getter_AddRefs(directory));
    NS_ENSURE_SUCCESS(rv, rv);

    aNodes->AppendElement(directory);
  }
  return rv;
}

static nsresult commonNotification(nsISupports* aItem, const char* aTopic) {
  nsCOMPtr<nsIAbCard> card = do_QueryInterface(aItem);
  // Right now, mailing lists are not fully working, see bug 1685166.
  if (!card) return NS_OK;

  nsAutoCString dirUID;
  card->GetDirectoryUID(dirUID);

  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();
  observerService->NotifyObservers(card, aTopic,
                                   NS_ConvertUTF8toUTF16(dirUID).get());

  return NS_OK;
}

nsresult nsAbOutlookDirectory::NotifyItemDeletion(nsISupports* aItem) {
  return commonNotification(aItem, "addrbook-contact-deleted");
}

nsresult nsAbOutlookDirectory::NotifyItemAddition(nsISupports* aItem) {
  return commonNotification(aItem, "addrbook-contact-created");
}

nsresult nsAbOutlookDirectory::NotifyItemModification(nsISupports* aItem) {
  return commonNotification(aItem, "addrbook-contact-updated");
}

class CStringWriter final : public mozilla::JSONWriteFunc {
 public:
  void Write(const mozilla::Span<const char>& aStr) override {
    mBuf.Append(aStr);
  }

  const nsCString& Get() const { return mBuf; }

 private:
  nsCString mBuf;
};

nsresult nsAbOutlookDirectory::NotifyCardPropertyChanges(nsIAbCard* aOld,
                                                         nsIAbCard* aNew) {
  mozilla::JSONWriter w(mozilla::MakeUnique<CStringWriter>());
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
  printf("%s", static_cast<CStringWriter*>(w.WriteFunc())->Get().get());
#endif

  if (somethingChanged) {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    observerService->NotifyObservers(
        aNew, "addrbook-contact-properties-updated",
        NS_ConvertUTF8toUTF16(static_cast<CStringWriter*>(w.WriteFunc())->Get())
            .get());
  }
  return NS_OK;
}

// This is called from EditMailListToDatabase.
// We got m_AddressList containing the list of cards the mailing
// list is supposed to contain at the end.
nsresult nsAbOutlookDirectory::CommitAddressList(void) {
  if (!m_IsMailList) {
    PRINTF(("We are not in a mailing list, no commit can be done.\n"));
    return NS_ERROR_UNEXPECTED;
  }

  nsresult rv;
  uint32_t i = 0;
  nsCOMPtr<nsIMutableArray> oldList(
      do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = GetCards(oldList, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_AddressList) return NS_ERROR_NULL_POINTER;

  uint32_t nbCards = 0;
  rv = m_AddressList->GetLength(&nbCards);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISupports> element;
  nsCOMPtr<nsIAbCard> newCard;
  uint32_t pos;

  nsTArray<RefPtr<nsIAbCard>> cardsToDelete;
  for (i = 0; i < nbCards; ++i) {
    element = do_QueryElementAt(m_AddressList, i, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    if (NS_SUCCEEDED(oldList->IndexOf(0, element, &pos))) {
      rv = oldList->RemoveElementAt(pos);
      NS_ENSURE_SUCCESS(rv, rv);

      // The entry was not already there
      nsCOMPtr<nsIAbCard> card(do_QueryInterface(element, &rv));
      NS_ENSURE_SUCCESS(rv, rv);

      rv = CreateCard(card, getter_AddRefs(newCard));
      NS_ENSURE_SUCCESS(rv, rv);
      m_AddressList->ReplaceElementAt(newCard, i);
    } else {
      RefPtr<nsIAbCard> cardToDelete = do_QueryObject(element);
      NS_ENSURE_SUCCESS(rv, rv);

      cardsToDelete.AppendElement(cardToDelete);
    }
  }
  return DeleteCards(cardsToDelete);
}

nsresult nsAbOutlookDirectory::UpdateAddressList(void) {
  if (!m_AddressList) {
    nsresult rv;
    m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return m_IsMailList ? GetCards(m_AddressList, nullptr)
                      : GetNodes(m_AddressList);
}

nsresult nsAbOutlookDirectory::CreateCard(nsIAbCard* aData,
                                          nsIAbCard** aNewCard) {
  if (!aData || !aNewCard) {
    return NS_ERROR_NULL_POINTER;
  }
  *aNewCard = nullptr;
  nsresult retCode = NS_OK;
  nsAbWinHelperGuard mapiAddBook(mAbWinType);
  nsMapiEntry newEntry;
  nsAutoCString entryString;
  bool didCopy = false;

  if (!mapiAddBook->IsOK()) {
    return NS_ERROR_FAILURE;
  }
  // If we get an nsIAbCard that maps onto an Outlook card uri
  // we simply copy the contents of the Outlook card.
  retCode = ExtractCardEntry(aData, entryString);
  if (NS_SUCCEEDED(retCode) && !entryString.IsEmpty()) {
    nsMapiEntry sourceEntry;

    sourceEntry.Assign(entryString);
    if (m_IsMailList) {
      // In the case of a mailing list, we can use the address
      // as a direct template to build the new one (which is done
      // by CopyEntry).
      mapiAddBook->CopyEntry(*mDirEntry, sourceEntry, newEntry);
      didCopy = true;
    } else {
      // Else, we have to create a temporary address and copy the
      // source into it. Yes it's silly.
      mapiAddBook->CreateEntry(*mDirEntry, newEntry);
    }
  }
  // If this approach doesn't work, well we're back to creating and copying.
  if (newEntry.mByteCount == 0) {
    // In the case of a mailing list, we cannot directly create a new card,
    // we have to create a temporary one in a real folder (to be able to use
    // templates) and then copy it to the mailing list.
    if (m_IsMailList) {
      nsMapiEntry parentEntry;
      nsMapiEntry temporaryEntry;

      if (!mapiAddBook->GetDefaultContainer(parentEntry)) {
        return NS_ERROR_FAILURE;
      }
      if (!mapiAddBook->CreateEntry(parentEntry, temporaryEntry)) {
        return NS_ERROR_FAILURE;
      }
      if (!mapiAddBook->CopyEntry(*mDirEntry, temporaryEntry, newEntry)) {
        return NS_ERROR_FAILURE;
      }
      if (!mapiAddBook->DeleteEntry(parentEntry, temporaryEntry)) {
        return NS_ERROR_FAILURE;
      }
    }
    // If we're on a real address book folder, we can directly create an
    // empty card.
    else if (!mapiAddBook->CreateEntry(*mDirEntry, newEntry)) {
      return NS_ERROR_FAILURE;
    }
  }
  newEntry.ToString(entryString);
  nsAutoCString uri;

  buildAbWinUri(kOutlookCardScheme, mAbWinType, uri);
  uri.Append(entryString);

  nsCOMPtr<nsIAbCard> newCard;
  retCode = OutlookCardForURI(uri, getter_AddRefs(newCard));
  NS_ENSURE_SUCCESS(retCode, retCode);

  nsAutoCString ourUID;
  GetUID(ourUID);
  newCard->SetDirectoryUID(ourUID);

  if (!didCopy) {
    retCode = newCard->Copy(aData);
    NS_ENSURE_SUCCESS(retCode, retCode);

    // Set a decent display name of the card. This needs to be set
    // on the card and not on the related contact via `SetPropertiesUString()`.
    nsAutoString displayName;
    newCard->GetDisplayName(displayName);
    mapiAddBook->SetPropertyUString(newEntry, PR_DISPLAY_NAME_W,
                                    displayName.get());

    retCode = ModifyCardInternal(newCard, true);
    NS_ENSURE_SUCCESS(retCode, retCode);
  }
  newCard.forget(aNewCard);
  return retCode;
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
    PRINTF(("Error conversion string %S: %08x.\n", (wchar_t*)(unichar.get()),
            errorCode));
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
  nsAbWinHelperGuard mapiAddBook(mAbWinType);

  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  nsCString entry;
  nsresult retCode = ExtractCardEntry(aModifiedCard, entry);
  NS_ENSURE_SUCCESS(retCode, retCode);
  // If we don't have the card entry, we can't work.
  if (entry.IsEmpty()) return NS_ERROR_FAILURE;

  nsMapiEntry mapiData;
  mapiData.Assign(entry);

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
  if (!mapiAddBook->SetPropertiesUString(*mDirEntry, mapiData,
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
  if (!mapiAddBook->SetPropertyUString(mapiData, PR_EMAIL_ADDRESS_W,
                                       unichar.get())) {
    PRINTF(("Cannot set primary email.\n"));
  }
  aModifiedCard->GetPropertyAsAString(kHomeAddressProperty, unichar);
  aModifiedCard->GetPropertyAsAString(kHomeAddress2Property, unichar2);

  utility.Assign(unichar.get());
  if (!utility.IsEmpty()) utility.AppendLiteral("\r\n");

  utility.Append(unichar2.get());
  if (!mapiAddBook->SetPropertyUString(mapiData, PR_HOME_ADDRESS_STREET_W,
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
  if (!mapiAddBook->SetPropertyUString(mapiData, PR_BUSINESS_ADDRESS_STREET_W,
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
  if (!mapiAddBook->SetPropertyDate(*mDirEntry, mapiData, true, PR_BIRTHDAY,
                                    year, month, day)) {
    PRINTF(("Cannot set date.\n"));
  }

  if (!aIsAddition) {
    NotifyItemModification(aModifiedCard);
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

  nsAutoCString entry;
  nsAutoCString stub;
  uint32_t abWinType = getAbWinType(
      kOutlookCardScheme, PromiseFlatCString(aUri).get(), stub, entry);
  if (abWinType == nsAbWinType_Unknown) {
    PRINTF(("Huge problem URI=%s.\n", PromiseFlatCString(aUri).get()));
    return NS_ERROR_INVALID_ARG;
  }

  nsAbWinHelperGuard mapiAddBook(abWinType);
  if (!mapiAddBook->IsOK()) return NS_ERROR_FAILURE;

  nsresult rv;
  nsCOMPtr<nsIAbCard> card =
      do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  card->SetPropertyAsAUTF8String("OutlookEntryURI", aUri);

  nsMapiEntry mapiData;
  mapiData.Assign(entry);

  nsString unichars[index_LastProp];
  bool success[index_LastProp];

  if (mapiAddBook->GetPropertiesUString(*mDirEntry, mapiData,
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
  }

  ULONG cardType = 0;
  if (mapiAddBook->GetPropertyLong(mapiData, PR_OBJECT_TYPE, cardType)) {
    card->SetIsMailList(cardType == MAPI_DISTLIST);
    if (cardType == MAPI_DISTLIST) {
      nsAutoCString normalChars;
      buildAbWinUri(kOutlookDirectoryScheme, abWinType, normalChars);
      normalChars.Append(entry);
      card->SetMailListURI(normalChars.get());
    }
  }

  nsAutoString unichar;
  nsAutoString unicharBis;
  if (mapiAddBook->GetPropertyUString(mapiData, PR_EMAIL_ADDRESS_W, unichar)) {
    card->SetPrimaryEmail(unichar);
  }
  if (mapiAddBook->GetPropertyUString(mapiData, PR_HOME_ADDRESS_STREET_W,
                                      unichar)) {
    splitString(unichar, unicharBis);
    card->SetPropertyAsAString(kHomeAddressProperty, unichar);
    card->SetPropertyAsAString(kHomeAddress2Property, unicharBis);
  }
  if (mapiAddBook->GetPropertyUString(mapiData, PR_BUSINESS_ADDRESS_STREET_W,
                                      unichar)) {
    splitString(unichar, unicharBis);
    card->SetPropertyAsAString(kWorkAddressProperty, unichar);
    card->SetPropertyAsAString(kWorkAddress2Property, unicharBis);
  }

  WORD year = 0, month = 0, day = 0;
  if (mapiAddBook->GetPropertyDate(*mDirEntry, mapiData, true, PR_BIRTHDAY,
                                   year, month, day)) {
    card->SetPropertyAsUint32(kBirthYearProperty, year);
    card->SetPropertyAsUint32(kBirthMonthProperty, month);
    card->SetPropertyAsUint32(kBirthDayProperty, day);
  }

  card.forget(newCard);
  return NS_OK;
}
