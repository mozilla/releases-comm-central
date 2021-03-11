/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIAbCard.h"
#include "nsAbLDAPDirectoryQuery.h"
#include "nsAbBoolExprToLDAPFilter.h"
#include "nsILDAPMessage.h"
#include "nsILDAPErrors.h"
#include "nsIAbLDAPAttributeMap.h"
#include "nsAbUtils.h"
#include "nsAbBaseCID.h"
#include "nsString.h"
#include "prprf.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsCategoryManagerUtils.h"
#include "nsAbLDAPDirectory.h"
#include "nsAbLDAPListenerBase.h"
#include "nsXPCOMCIDInternal.h"
#include "nsIURIMutator.h"
#include "mozilla/Logging.h"

using namespace mozilla;

extern mozilla::LazyLogModule gLDAPLogModule;  // defined in nsLDAPService.cpp

// nsAbLDAPListenerBase inherits nsILDAPMessageListener
class nsAbQueryLDAPMessageListener : public nsAbLDAPListenerBase {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  // Note that the directoryUrl is the details of the ldap directory
  // without any search params or return attributes specified. The searchUrl
  // therefore has the search params and return attributes specified.
  //  nsAbQueryLDAPMessageListener(nsIAbDirectoryQuery* directoryQuery,
  nsAbQueryLDAPMessageListener(nsIAbDirSearchListener* resultListener,
                               nsILDAPURL* directoryUrl, nsILDAPURL* searchUrl,
                               nsILDAPConnection* connection,
                               nsIAbDirectoryQueryArguments* queryArguments,
                               const nsACString& login,
                               const nsACString& mechanism,
                               const int32_t resultLimit = -1,
                               const int32_t timeOut = 0);

  // nsILDAPMessageListener
  NS_IMETHOD OnLDAPMessage(nsILDAPMessage* aMessage) override;
  NS_IMETHOD OnLDAPError(nsresult status, nsITransportSecurityInfo* secInfo,
                         nsACString const& location) override;

 protected:
  virtual ~nsAbQueryLDAPMessageListener();
  nsresult OnLDAPMessageSearchEntry(nsILDAPMessage* aMessage);
  nsresult OnLDAPMessageSearchResult(nsILDAPMessage* aMessage);

  friend class nsAbLDAPDirectoryQuery;

  nsresult Cancel();
  virtual nsresult DoTask() override;
  virtual void InitFailed(bool aCancelled = false) override;

  nsCOMPtr<nsILDAPURL> mSearchUrl;
  nsCOMPtr<nsIAbDirSearchListener> mResultListener;
  nsCOMPtr<nsIAbDirectoryQueryArguments> mQueryArguments;
  int32_t mResultLimit;

  bool mFinished;
  bool mCanceled;
};

NS_IMPL_ISUPPORTS(nsAbQueryLDAPMessageListener, nsILDAPMessageListener)

nsAbQueryLDAPMessageListener::nsAbQueryLDAPMessageListener(
    nsIAbDirSearchListener* resultListener, nsILDAPURL* directoryUrl,
    nsILDAPURL* searchUrl, nsILDAPConnection* connection,
    nsIAbDirectoryQueryArguments* queryArguments, const nsACString& login,
    const nsACString& mechanism, const int32_t resultLimit,
    const int32_t timeOut)
    : nsAbLDAPListenerBase(directoryUrl, connection, login, timeOut),
      mSearchUrl(searchUrl),
      mResultListener(resultListener),
      mQueryArguments(queryArguments),
      mResultLimit(resultLimit),
      mFinished(false),
      mCanceled(false) {
  mSaslMechanism.Assign(mechanism);
}

nsAbQueryLDAPMessageListener::~nsAbQueryLDAPMessageListener() {}

nsresult nsAbQueryLDAPMessageListener::Cancel() {
  nsresult rv = Initiate();
  NS_ENSURE_SUCCESS(rv, rv);

  MutexAutoLock lock(mLock);

  if (mFinished || mCanceled) return NS_OK;

  mCanceled = true;
  return NS_OK;
}

NS_IMETHODIMP nsAbQueryLDAPMessageListener::OnLDAPError(
    nsresult status, nsITransportSecurityInfo* secInfo,
    nsACString const& location) {
  if (mResultListener) {
    mResultListener->OnSearchFinished(status, true, secInfo, location);
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbQueryLDAPMessageListener::OnLDAPMessage(
    nsILDAPMessage* aMessage) {
  nsresult rv = Initiate();
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t messageType;
  rv = aMessage->GetType(&messageType);
  uint32_t requestNum;
  mOperation->GetRequestNum(&requestNum);
  NS_ENSURE_SUCCESS(rv, rv);

  bool cancelOperation = false;

  // Enter lock
  {
    MutexAutoLock lock(mLock);

    if (requestNum != sCurrentRequestNum) {
      MOZ_LOG(
          gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsAbQueryLDAPMessageListener::OnLDAPMessage: Ignoring message with "
           "request num %" PRIu32 ", current request num is %" PRIu32 ".",
           requestNum, sCurrentRequestNum));
      return NS_OK;
    }

    if (mFinished) return NS_OK;

    if (messageType == nsILDAPMessage::RES_SEARCH_RESULT)
      mFinished = true;
    else if (mCanceled) {
      mFinished = true;
      cancelOperation = true;
    }
  }
  // Leave lock

  if (!mResultListener) return NS_ERROR_NULL_POINTER;

  if (!cancelOperation) {
    switch (messageType) {
      case nsILDAPMessage::RES_BIND:
        rv = OnLDAPMessageBind(aMessage);
        if (NS_FAILED(rv))
          // We know the bind failed and hence the message has an error, so we
          // can just call SearchResult with the message and that'll sort it out
          // for us.
          rv = OnLDAPMessageSearchResult(aMessage);
        break;
      case nsILDAPMessage::RES_SEARCH_ENTRY:
        if (!mFinished) rv = OnLDAPMessageSearchEntry(aMessage);
        break;
      case nsILDAPMessage::RES_SEARCH_RESULT:
        rv = OnLDAPMessageSearchResult(aMessage);
        NS_ENSURE_SUCCESS(rv, rv);
        break;
      default:
        break;
    }
  } else {
    if (mOperation) rv = mOperation->AbandonExt();
    NS_ENSURE_SUCCESS(rv, rv);

    rv =
        mResultListener->OnSearchFinished(NS_ERROR_ABORT, true, nullptr, ""_ns);

    // reset because we might re-use this listener...except don't do this
    // until the search is done, so we'll ignore results from a previous
    // search.
    if (messageType == nsILDAPMessage::RES_SEARCH_RESULT)
      mCanceled = mFinished = false;
  }

  return rv;
}

nsresult nsAbQueryLDAPMessageListener::DoTask() {
  nsresult rv;
  mCanceled = mFinished = false;

  mOperation = do_CreateInstance(NS_LDAPOPERATION_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mOperation->Init(mConnection, this, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  mOperation->SetRequestNum(++sCurrentRequestNum);

  nsAutoCString dn;
  rv = mSearchUrl->GetDn(dn);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t scope;
  rv = mSearchUrl->GetScope(&scope);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString filter;
  rv = mSearchUrl->GetFilter(filter);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString attributes;
  rv = mSearchUrl->GetAttributes(attributes);
  NS_ENSURE_SUCCESS(rv, rv);

  return mOperation->SearchExt(dn, scope, filter, attributes, mTimeOut,
                               mResultLimit);
}

void nsAbQueryLDAPMessageListener::InitFailed(bool aCancelled) {
  if (!mResultListener) return;

  if (aCancelled) {
    mResultListener->OnSearchFinished(NS_ERROR_ABORT, true, nullptr, ""_ns);
  } else {
    mResultListener->OnSearchFinished(NS_ERROR_FAILURE, true, nullptr, ""_ns);
  }
}

nsresult nsAbQueryLDAPMessageListener::OnLDAPMessageSearchEntry(
    nsILDAPMessage* aMessage) {
  nsresult rv;

  if (!mResultListener) return NS_ERROR_NULL_POINTER;

  // the map for translating between LDAP attrs <-> addrbook fields
  nsCOMPtr<nsISupports> iSupportsMap;
  rv = mQueryArguments->GetTypeSpecificArg(getter_AddRefs(iSupportsMap));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbLDAPAttributeMap> map = do_QueryInterface(iSupportsMap, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbCard> card =
      do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = map->SetCardPropertiesFromLDAPMessage(aMessage, card);
  NS_ENSURE_SUCCESS(rv, rv);

  return mResultListener->OnSearchFoundCard(card);
}

nsresult nsAbQueryLDAPMessageListener::OnLDAPMessageSearchResult(
    nsILDAPMessage* aMessage) {
  int32_t errorCode;
  nsresult rv = aMessage->GetErrorCode(&errorCode);
  NS_ENSURE_SUCCESS(rv, rv);

  if (errorCode == nsILDAPErrors::SUCCESS) {
    return mResultListener->OnSearchFinished(NS_OK, true, nullptr, ""_ns);
  }
  if (errorCode == nsILDAPErrors::SIZELIMIT_EXCEEDED) {
    return mResultListener->OnSearchFinished(NS_OK, false, nullptr, ""_ns);
  }

  return mResultListener->OnSearchFinished(NS_ERROR_FAILURE, true, nullptr,
                                           ""_ns);
}

// nsAbLDAPDirectoryQuery

NS_IMPL_ISUPPORTS(nsAbLDAPDirectoryQuery, nsIAbDirectoryQuery,
                  nsIAbDirSearchListener)

nsAbLDAPDirectoryQuery::nsAbLDAPDirectoryQuery() : mInitialized(false) {}

nsAbLDAPDirectoryQuery::~nsAbLDAPDirectoryQuery() {}

NS_IMETHODIMP nsAbLDAPDirectoryQuery::DoQuery(
    nsIAbDirectory* aDirectory, nsIAbDirectoryQueryArguments* aArguments,
    nsIAbDirSearchListener* aListener, int32_t aResultLimit, int32_t aTimeOut,
    int32_t* _retval) {
  NS_ENSURE_ARG_POINTER(aListener);
  NS_ENSURE_ARG_POINTER(aArguments);

  mListeners.AppendObject(aListener);

  // Ensure existing query is stopped. Context id doesn't matter here
  nsresult rv = StopQuery(0);
  NS_ENSURE_SUCCESS(rv, rv);

  mInitialized = true;

  // Get the current directory as LDAP specific
  nsCOMPtr<nsIAbLDAPDirectory> directory(do_QueryInterface(aDirectory, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // We also need the current URL to check as well...
  nsCOMPtr<nsILDAPURL> currentUrl;
  rv = directory->GetLDAPURL(getter_AddRefs(currentUrl));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString login;
  rv = directory->GetAuthDn(login);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString saslMechanism;
  rv = directory->GetSaslMechanism(saslMechanism);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t protocolVersion;
  rv = directory->GetProtocolVersion(&protocolVersion);
  NS_ENSURE_SUCCESS(rv, rv);

  // To do:
  // Ensure query is stopped
  // If connection params have changed re-create connection
  // else reuse existing connection

  bool redoConnection = false;

  if (!mConnection || !mDirectoryUrl) {
    mDirectoryUrl = currentUrl;
    aDirectory->GetUID(mDirectoryUID);
    mCurrentLogin = login;
    mCurrentMechanism = saslMechanism;
    mCurrentProtocolVersion = protocolVersion;
    redoConnection = true;
  } else {
    bool equal;
    rv = mDirectoryUrl->Equals(currentUrl, &equal);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!equal) {
      mDirectoryUrl = currentUrl;
      aDirectory->GetUID(mDirectoryUID);
      mCurrentLogin = login;
      mCurrentMechanism = saslMechanism;
      mCurrentProtocolVersion = protocolVersion;
      redoConnection = true;
    } else {
      // Has login or version changed?
      if (login != mCurrentLogin || saslMechanism != mCurrentMechanism ||
          protocolVersion != mCurrentProtocolVersion) {
        redoConnection = true;
        mCurrentLogin = login;
        mCurrentMechanism = saslMechanism;
        mCurrentProtocolVersion = protocolVersion;
      }
    }
  }

  nsCOMPtr<nsIURI> uri;
  rv = NS_MutateURI(mDirectoryUrl).Finalize(uri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsILDAPURL> url(do_QueryInterface(uri, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // Get/Set the return attributes
  nsCOMPtr<nsISupports> iSupportsMap;
  rv = aArguments->GetTypeSpecificArg(getter_AddRefs(iSupportsMap));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbLDAPAttributeMap> map = do_QueryInterface(iSupportsMap, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Require all attributes that are mapped to card properties
  nsAutoCString returnAttributes;
  rv = map->GetAllCardAttributes(returnAttributes);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = url->SetAttributes(returnAttributes);
  // Now do the error check
  NS_ENSURE_SUCCESS(rv, rv);

  // Also require the objectClass attribute, it is used by
  // nsAbLDAPCard::SetMetaProperties
  rv = url->AddAttribute("objectClass"_ns);

  nsAutoCString filter;

  // Get filter from arguments if set:
  rv = aArguments->GetFilter(filter);
  NS_ENSURE_SUCCESS(rv, rv);

  if (filter.IsEmpty()) {
    // Get the filter
    nsCOMPtr<nsISupports> supportsExpression;
    rv = aArguments->GetExpression(getter_AddRefs(supportsExpression));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbBooleanExpression> expression(
        do_QueryInterface(supportsExpression, &rv));

    // figure out how we map attribute names to addressbook fields for this
    // query
    rv = nsAbBoolExprToLDAPFilter::Convert(map, expression, filter);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  /*
   * Mozilla itself cannot arrive here with a blank filter
   * as the nsAbLDAPDirectory::StartSearch() disallows it.
   * But 3rd party LDAP query integration with Mozilla begins
   * in this method.
   *
   * Default the filter string if blank, otherwise it gets
   * set to (objectclass=*) which returns everything. Set
   * the default to (objectclass=inetorgperson) as this
   * is the most appropriate default objectclass which is
   * central to the makeup of the mozilla ldap address book
   * entries.
   */
  if (filter.IsEmpty()) {
    filter.AssignLiteral("(objectclass=inetorgperson)");
  }

  // get the directoryFilter from the directory url and merge it with the user's
  // search filter
  nsAutoCString urlFilter;
  rv = mDirectoryUrl->GetFilter(urlFilter);

  // if urlFilter is unset (or set to the default "objectclass=*"), there's
  // no need to AND in an empty search term, so leave prefix and suffix empty

  nsAutoCString searchFilter;
  if (urlFilter.Length() && !urlFilter.EqualsLiteral("(objectclass=*)")) {
    // if urlFilter isn't parenthesized, we need to add in parens so that
    // the filter works as a term to &
    //
    if (urlFilter[0] != '(') {
      searchFilter.AssignLiteral("(&(");
      searchFilter.Append(urlFilter);
      searchFilter.Append(')');
    } else {
      searchFilter.AssignLiteral("(&");
      searchFilter.Append(urlFilter);
    }

    searchFilter += filter;
    searchFilter += ')';
  } else
    searchFilter = filter;

  rv = url->SetFilter(searchFilter);
  NS_ENSURE_SUCCESS(rv, rv);

  // Now formulate the search string

  // Get the scope
  int32_t scope;
  bool doSubDirectories;
  rv = aArguments->GetQuerySubDirectories(&doSubDirectories);
  NS_ENSURE_SUCCESS(rv, rv);
  scope =
      doSubDirectories ? nsILDAPURL::SCOPE_SUBTREE : nsILDAPURL::SCOPE_ONELEVEL;

  rv = url->SetScope(scope);
  NS_ENSURE_SUCCESS(rv, rv);

  // too soon? Do we need a new listener?
  // If we already have a connection, and don't need to re-do it, give it the
  // new search details and go for it...
  if (!redoConnection) {
    nsAbQueryLDAPMessageListener* msgListener =
        static_cast<nsAbQueryLDAPMessageListener*>(
            static_cast<nsILDAPMessageListener*>(mListener.get()));
    if (msgListener) {
      // Ensure the urls are correct
      msgListener->mDirectoryUrl = mDirectoryUrl;
      msgListener->mSearchUrl = url;
      // Also ensure we set the correct result limit
      msgListener->mResultLimit = aResultLimit;
      return msgListener->DoTask();
    }
  }

  // Create the new connection (which cause the old one to be dropped if
  // necessary)
  mConnection = do_CreateInstance(NS_LDAPCONNECTION_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirSearchListener> resultListener =
      do_QueryInterface((nsIAbDirectoryQuery*)this, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Initiate LDAP message listener
  nsAbQueryLDAPMessageListener* _messageListener =
      new nsAbQueryLDAPMessageListener(
          resultListener, mDirectoryUrl, url, mConnection, aArguments,
          mCurrentLogin, mCurrentMechanism, aResultLimit, aTimeOut);
  if (_messageListener == NULL) return NS_ERROR_OUT_OF_MEMORY;

  mListener = _messageListener;
  *_retval = 1;

  // Now lets initialize the LDAP connection properly. We'll kick
  // off the bind operation in the callback function, |OnLDAPInit()|.
  rv = mConnection->Init(mDirectoryUrl, mCurrentLogin, mListener, nullptr,
                         mCurrentProtocolVersion);
  NS_ENSURE_SUCCESS(rv, rv);

  return rv;
}

/* void stopQuery (in long contextID); */
NS_IMETHODIMP nsAbLDAPDirectoryQuery::StopQuery(int32_t contextID) {
  mInitialized = true;

  if (!mListener) return NS_OK;

  nsAbQueryLDAPMessageListener* listener =
      static_cast<nsAbQueryLDAPMessageListener*>(
          static_cast<nsILDAPMessageListener*>(mListener.get()));
  if (listener) return listener->Cancel();

  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectoryQuery::OnSearchFoundCard(nsIAbCard* aCard) {
  aCard->SetDirectoryUID(mDirectoryUID);

  for (int32_t i = 0; i < mListeners.Count(); ++i)
    mListeners[i]->OnSearchFoundCard(aCard);

  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectoryQuery::OnSearchFinished(
    nsresult status, bool complete, nsITransportSecurityInfo* secInfo,
    nsACString const& location) {
  uint32_t count = mListeners.Count();

  // XXX: Temporary fix for crasher needs reviewing as part of bug 135231.
  // Temporarily add a reference to ourselves, in case the only thing
  // keeping us alive is the link with the listener.
  NS_ADDREF_THIS();

  for (int32_t i = count - 1; i >= 0; --i) {
    mListeners[i]->OnSearchFinished(status, complete, secInfo, location);
    mListeners.RemoveObjectAt(i);
  }

  NS_RELEASE_THIS();

  return NS_OK;
}
