/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsISupports.h"
#include "nsIThread.h"
#include "nscore.h"
#include "mozilla/Assertions.h"
#include "mozilla/Likely.h"
#include "mozilla/MemoryReporting.h"
#include "mozilla/RefCountType.h"
#include "mozilla/RefPtr.h"
#include "nsLDAPSyncQuery.h"
#include "nsIServiceManager.h"
#include "nsILDAPErrors.h"
#include "nsThreadUtils.h"
#include "nsILDAPMessage.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsMemory.h"

// nsISupports Implementation

NS_IMPL_ISUPPORTS(nsLDAPSyncQuery, nsILDAPSyncQuery, nsILDAPMessageListener)

// Constructor
//
nsLDAPSyncQuery::nsLDAPSyncQuery()
    : mFinished(false),  // This is a control variable for event loop
      mFinishedStatus(NS_OK),
      mProtocolVersion(nsILDAPConnection::VERSION3) {}

// Destructor
//
nsLDAPSyncQuery::~nsLDAPSyncQuery() {}

// Messages received are passed back via this function.
// void OnLDAPMessage (in nsILDAPMessage aMessage)
//
NS_IMETHODIMP
nsLDAPSyncQuery::OnLDAPMessage(nsILDAPMessage* aMessage) {
  int32_t messageType;

  // just in case.
  //
  if (!aMessage) {
    return NS_OK;
  }

  // figure out what sort of message was returned
  //
  nsresult rv = aMessage->GetType(&messageType);
  if (NS_FAILED(rv)) {
    NS_ERROR(
        "nsLDAPSyncQuery::OnLDAPMessage(): unexpected "
        "error in aMessage->GetType()");
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;
  }

  switch (messageType) {
    case nsILDAPMessage::RES_BIND:

      // a bind has completed
      //
      return OnLDAPBind(aMessage);

    case nsILDAPMessage::RES_SEARCH_ENTRY:

      // a search entry has been returned
      //
      return OnLDAPSearchEntry(aMessage);

    case nsILDAPMessage::RES_SEARCH_RESULT:

      // the search is finished; we're all done
      //
      FinishLDAPQuery(NS_OK);
      return NS_OK;

    default:

      // Given the LDAP operations nsLDAPSyncQuery uses, we should
      // never get here.  If we do get here in a release build, it's
      // probably a bug, but maybe it's the LDAP server doing something
      // weird.  Might as well try and continue anyway.  The session should
      // eventually get reaped by the timeout code, if necessary.
      //
      NS_ERROR(
          "nsLDAPSyncQuery::OnLDAPMessage(): unexpected "
          "LDAP message received");
      return NS_OK;
  }
}

NS_IMETHODIMP
nsLDAPSyncQuery::OnLDAPInit() {
  nsresult rv;  // temp for xpcom return values
  // create and initialize an LDAP operation (to be used for the bind)
  //
  mOperation = do_CreateInstance("@mozilla.org/network/ldap-operation;1", &rv);
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_FAILURE;
  }

  // our OnLDAPMessage accepts all result callbacks
  //
  rv = mOperation->Init(mConnection, this, nullptr);
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;  // this should never happen
  }

  // kick off a bind operation
  //
  rv = mOperation->SimpleBind(EmptyCString());
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

NS_IMETHODIMP
nsLDAPSyncQuery::OnLDAPError(nsresult status, nsITransportSecurityInfo* secInfo,
                             nsACString const& location) {
  FinishLDAPQuery(status);
  return NS_OK;
}

nsresult nsLDAPSyncQuery::OnLDAPBind(nsILDAPMessage* aMessage) {
  int32_t errCode;

  mOperation = nullptr;  // done with bind op; make nsCOMPtr release it

  // get the status of the bind
  //
  nsresult rv = aMessage->GetErrorCode(&errCode);
  if (NS_FAILED(rv)) {
    NS_ERROR(
        "nsLDAPSyncQuery::OnLDAPBind(): couldn't get "
        "error code from aMessage");
    FinishLDAPQuery(rv);
    return NS_ERROR_FAILURE;
  }

  // check to be sure the bind succeeded
  //
  if (errCode != nsILDAPErrors::SUCCESS) {
    // All the LDAP codes can be mapped into nsresult
    nsresult status = NS_ERROR_GENERATE_FAILURE(NS_ERROR_MODULE_LDAP, errCode);
    FinishLDAPQuery(status);
    return NS_ERROR_FAILURE;
  }

  // ok, we're starting a search
  //
  return StartLDAPSearch();
}

nsresult nsLDAPSyncQuery::OnLDAPSearchEntry(nsILDAPMessage* aMessage) {
  nsTArray<nsCString> attributes;
  nsresult rv = aMessage->GetAttributes(attributes);
  if (NS_FAILED(rv)) {
    NS_WARNING(
        "nsLDAPSyncQuery:OnLDAPSearchEntry(): "
        "aMessage->GetAttributes() failed");
    FinishLDAPQuery(rv);
    return rv;
  }

  // Iterate through the attributes received in this message
  for (uint32_t i = 0; i < attributes.Length(); i++) {
    // Get the values of this attribute.
    // XXX better failure handling
    nsTArray<nsString> vals;
    rv = aMessage->GetValues(attributes[i].get(), vals);
    if (NS_FAILED(rv)) {
      NS_WARNING(
          "nsLDAPSyncQuery:OnLDAPSearchEntry(): "
          "aMessage->GetValues() failed");
      FinishLDAPQuery(rv);
      break;
    }

    // Store all values of this attribute in the mResults.
    for (uint32_t j = 0; j < vals.Length(); j++) {
      mResults.Append(char16_t('\n'));
      mResults.Append(NS_ConvertUTF8toUTF16(attributes[i]));
      mResults.Append(char16_t('='));
      mResults.Append(vals[j]);
    }
  }

  return NS_OK;
}

nsresult nsLDAPSyncQuery::StartLDAPSearch() {
  nsresult rv;
  // create and initialize an LDAP operation (to be used for the search
  //
  mOperation = do_CreateInstance("@mozilla.org/network/ldap-operation;1", &rv);

  if (NS_FAILED(rv)) {
    NS_ERROR(
        "nsLDAPSyncQuery::StartLDAPSearch(): couldn't "
        "create @mozilla.org/network/ldap-operation;1");
    FinishLDAPQuery(rv);
    return NS_ERROR_FAILURE;
  }

  // initialize the LDAP operation object
  //
  rv = mOperation->Init(mConnection, this, nullptr);
  if (NS_FAILED(rv)) {
    NS_ERROR(
        "nsLDAPSyncQuery::StartLDAPSearch(): couldn't "
        "initialize LDAP operation");
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;
  }

  // get the search filter associated with the directory server url;
  //
  nsAutoCString urlFilter;
  rv = mServerURL->GetFilter(urlFilter);
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;
  }

  // get the base dn to search
  //
  nsAutoCString dn;
  rv = mServerURL->GetDn(dn);
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;
  }

  // and the scope
  //
  int32_t scope;
  rv = mServerURL->GetScope(&scope);
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;
  }

  nsAutoCString attributes;
  rv = mServerURL->GetAttributes(attributes);
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;
  }

  // time to kick off the search.
  rv = mOperation->SearchExt(dn, scope, urlFilter, attributes, 0, 0);

  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

// void initConnection ();
//
nsresult nsLDAPSyncQuery::InitConnection() {
  // Because mConnection->Init proxies back to the main thread, this
  // better be the main thread.
  NS_ENSURE_TRUE(NS_IsMainThread(), NS_ERROR_FAILURE);
  nsresult rv;  // temp for xpcom return values
  // create an LDAP connection
  //
  mConnection =
      do_CreateInstance("@mozilla.org/network/ldap-connection;1", &rv);
  if (NS_FAILED(rv)) {
    NS_ERROR(
        "nsLDAPSyncQuery::InitConnection(): could "
        "not create @mozilla.org/network/ldap-connection;1");
    FinishLDAPQuery(rv);
    return NS_ERROR_FAILURE;
  }

  // have we been properly initialized?
  //
  if (!mServerURL) {
    NS_ERROR(
        "nsLDAPSyncQuery::InitConnection(): mServerURL "
        "is NULL");
    FinishLDAPQuery(NS_ERROR_NOT_INITIALIZED);
    return NS_ERROR_NOT_INITIALIZED;
  }
  rv = mConnection->Init(mServerURL, EmptyCString(), this, nullptr,
                         mProtocolVersion);
  if (NS_FAILED(rv)) {
    FinishLDAPQuery(rv);
    return NS_ERROR_UNEXPECTED;  // this should never happen
  }

  return NS_OK;
}

void nsLDAPSyncQuery::FinishLDAPQuery(nsresult status) {
  // We are done with the LDAP operation.
  // Release the Control variable for the eventloop
  //
  mFinished = true;
  mFinishedStatus = status;

  // Release member variables
  //
  mConnection = nullptr;
  mOperation = nullptr;
  mServerURL = nullptr;
}

/* wstring getQueryResults (in nsILDAPURL aServerURL, in unsigned long
 * aVersion); */
NS_IMETHODIMP nsLDAPSyncQuery::GetQueryResults(nsILDAPURL* aServerURL,
                                               uint32_t aProtocolVersion,
                                               char16_t** _retval) {
  nsresult rv;

  if (!aServerURL) {
    NS_ERROR("nsLDAPSyncQuery::GetQueryResults() called without LDAP URL");
    return NS_ERROR_FAILURE;
  }
  mServerURL = aServerURL;
  mProtocolVersion = aProtocolVersion;

  nsCOMPtr<nsIThread> currentThread = do_GetCurrentThread();

  // Start an LDAP query.
  // InitConnection will bind to the ldap server and post a OnLDAPMessage
  // event. This event will trigger a search and the whole operation will
  // be carried out by chain of events
  //
  rv = InitConnection();
  if (NS_FAILED(rv)) return rv;

  // We want this LDAP query to be synchronous while the XPCOM LDAP is
  // async in nature. So this eventQueue handling will wait for the
  // LDAP operation to be finished.
  // mFinished controls the state of the LDAP operation.
  // It will be released in any case (success/failure)

  // Run the event loop,
  // mFinished is a control variable
  //
  while (!mFinished) NS_ENSURE_STATE(NS_ProcessNextEvent(currentThread));

  if (NS_SUCCEEDED(mFinishedStatus)) {
    *_retval = ToNewUnicode(mResults);
  } else {
    *_retval = nullptr;
  }
  return mFinishedStatus;
}
