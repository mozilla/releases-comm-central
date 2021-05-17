/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsILDAPMessage.h"
#include "nsAbLDAPReplicationData.h"
#include "nsIAbCard.h"
#include "nsAbBaseCID.h"
#include "nsAbUtils.h"
#include "nsAbLDAPReplicationQuery.h"
#include "nsILDAPErrors.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgUtils.h"
#include "nsIObserverService.h"
#include "nsIObserver.h"
#include "mozilla/Services.h"

using namespace mozilla;

// once bug # 101252 gets fixed, this should be reverted back to be non
// threadsafe implementation is not really thread safe since each object should
// exist independently along with its related independent
// nsAbLDAPReplicationQuery object.
NS_IMPL_ISUPPORTS(nsAbLDAPProcessReplicationData,
                  nsIAbLDAPProcessReplicationData, nsILDAPMessageListener,
                  nsIObserver)

nsAbLDAPProcessReplicationData::nsAbLDAPProcessReplicationData()
    : nsAbLDAPListenerBase(), mState(kIdle), mCount(0), mInitialized(false) {}

nsAbLDAPProcessReplicationData::~nsAbLDAPProcessReplicationData() {}

NS_IMETHODIMP nsAbLDAPProcessReplicationData::Init(
    nsIAbLDAPDirectory* aDirectory, nsILDAPConnection* aConnection,
    nsILDAPURL* aURL, nsIAbLDAPReplicationQuery* aQuery,
    nsIWebProgressListener* aProgressListener) {
  NS_ENSURE_ARG_POINTER(aDirectory);
  NS_ENSURE_ARG_POINTER(aConnection);
  NS_ENSURE_ARG_POINTER(aURL);
  NS_ENSURE_ARG_POINTER(aQuery);

  mDirectory = aDirectory;
  mConnection = aConnection;
  mDirectoryUrl = aURL;
  mQuery = aQuery;

  mListener = aProgressListener;

  nsresult rv = mDirectory->GetAttributeMap(getter_AddRefs(mAttrMap));
  if (NS_FAILED(rv)) {
    mQuery = nullptr;
    return rv;
  }

  rv = mDirectory->GetAuthDn(mLogin);
  if (NS_FAILED(rv)) {
    mQuery = nullptr;
    return rv;
  }

  rv = mDirectory->GetSaslMechanism(mSaslMechanism);
  if (NS_FAILED(rv)) {
    mQuery = nullptr;
    return rv;
  }

  mInitialized = true;

  return rv;
}

NS_IMETHODIMP nsAbLDAPProcessReplicationData::GetReplicationState(
    int32_t* aReplicationState) {
  NS_ENSURE_ARG_POINTER(aReplicationState);
  *aReplicationState = mState;
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPProcessReplicationData::OnLDAPMessage(
    nsILDAPMessage* aMessage) {
  NS_ENSURE_ARG_POINTER(aMessage);

  if (!mInitialized) return NS_ERROR_NOT_INITIALIZED;

  int32_t messageType;
  nsresult rv = aMessage->GetType(&messageType);
  if (NS_FAILED(rv)) {
    Done(false);
    return rv;
  }

  switch (messageType) {
    case nsILDAPMessage::RES_BIND:
      rv = OnLDAPMessageBind(aMessage);
      if (NS_FAILED(rv)) rv = Abort();
      break;
    case nsILDAPMessage::RES_SEARCH_ENTRY:
      rv = OnLDAPSearchEntry(aMessage);
      break;
    case nsILDAPMessage::RES_SEARCH_RESULT:
      rv = OnLDAPSearchResult(aMessage);
      break;
    default:
      // for messageTypes we do not handle return NS_OK to LDAP and move ahead.
      rv = NS_OK;
      break;
  }

  return rv;
}

NS_IMETHODIMP nsAbLDAPProcessReplicationData::OnLDAPError(
    nsresult status, nsITransportSecurityInfo* secInfo,
    nsACString const& location) {
  // (See also InitFailed() for error handling during init phase).
  // Just call Done() which will ensure everything is tidied up nicely.
  Done(false);
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPProcessReplicationData::Abort() {
  if (!mInitialized) return NS_ERROR_NOT_INITIALIZED;

  nsresult rv = NS_OK;

  if (mState != kIdle && mOperation) {
    rv = mOperation->AbandonExt();
    if (NS_SUCCEEDED(rv)) mState = kIdle;
  }

  Done(false);
  return rv;
}

nsresult nsAbLDAPProcessReplicationData::DoTask() {
  if (!mInitialized) return NS_ERROR_NOT_INITIALIZED;

  nsresult rv = OpenABForReplicatedDir(true);
  if (NS_FAILED(rv))
    // do not call done here since it is called by OpenABForReplicatedDir
    return rv;

  mOperation = do_CreateInstance(NS_LDAPOPERATION_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mOperation->Init(mConnection, this, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  // get the relevant attributes associated with the directory server url
  nsAutoCString urlFilter;
  rv = mDirectoryUrl->GetFilter(urlFilter);
  if (NS_FAILED(rv)) return rv;

  nsAutoCString dn;
  rv = mDirectoryUrl->GetDn(dn);
  if (NS_FAILED(rv)) return rv;

  if (dn.IsEmpty()) return NS_ERROR_UNEXPECTED;

  int32_t scope;
  rv = mDirectoryUrl->GetScope(&scope);
  if (NS_FAILED(rv)) return rv;

  nsAutoCString attributes;
  rv = mDirectoryUrl->GetAttributes(attributes);
  if (NS_FAILED(rv)) return rv;

  mState = kReplicatingAll;

  if (mListener && NS_SUCCEEDED(rv))
    mListener->OnStateChange(nullptr, nullptr,
                             nsIWebProgressListener::STATE_START, NS_OK);

  return mOperation->SearchExt(dn, scope, urlFilter, attributes, 0, 0);
}

void nsAbLDAPProcessReplicationData::InitFailed(bool aCancelled) {
  // Just call Done() which will ensure everything is tidied up nicely.
  Done(false);
}

nsresult nsAbLDAPProcessReplicationData::OnLDAPSearchEntry(
    nsILDAPMessage* aMessage) {
  NS_ENSURE_ARG_POINTER(aMessage);
  if (!mInitialized) return NS_ERROR_NOT_INITIALIZED;
  // since this runs on the main thread and is single threaded, this will
  // take care of entries returned by LDAP Connection thread after Abort.
  if (!mReplicationDB) return NS_ERROR_FAILURE;

  nsresult rv = NS_OK;

  // Although we would may naturally create an nsIAbLDAPCard here, we don't
  // need to as we are writing this straight to the database, so just create
  // the database version instead.
  nsCOMPtr<nsIAbCard> newCard(
      do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID, &rv));
  if (NS_FAILED(rv)) {
    Abort();
    return rv;
  }

  rv = mAttrMap->SetCardPropertiesFromLDAPMessage(aMessage, newCard);
  if (NS_FAILED(rv)) {
    NS_WARNING(
        "nsAbLDAPProcessReplicationData::OnLDAPSearchEntry"
        "No card properties could be set");
    // if some entries are bogus for us, continue with next one
    return NS_OK;
  }

  nsCOMPtr<nsIAbCard> tempCard;
  rv = mReplicationDB->AddCard(newCard, getter_AddRefs(tempCard));
  if (NS_FAILED(rv)) {
    Abort();
    return rv;
  }

  // now set the attribute for the DN of the entry in the card in the DB
  nsAutoCString authDN;
  rv = aMessage->GetDn(authDN);
  if (NS_SUCCEEDED(rv) && !authDN.IsEmpty()) {
    tempCard->SetPropertyAsAUTF8String("_DN", authDN);
  }

  rv = mReplicationDB->ModifyCard(tempCard);
  if (NS_FAILED(rv)) {
    Abort();
    return rv;
  }

  mCount++;

  if (mListener && !(mCount % 10))  // inform the listener every 10 entries
  {
    mListener->OnProgressChange(nullptr, nullptr, mCount, -1, mCount, -1);
    // in case if the LDAP Connection thread is starved and causes problem
    // uncomment this one and try.
    // PR_Sleep(PR_INTERVAL_NO_WAIT); // give others a chance
  }

  return rv;
}

nsresult nsAbLDAPProcessReplicationData::OnLDAPSearchResult(
    nsILDAPMessage* aMessage) {
  NS_ENSURE_ARG_POINTER(aMessage);
  if (!mInitialized) return NS_ERROR_NOT_INITIALIZED;

  int32_t errorCode;
  nsresult rv = aMessage->GetErrorCode(&errorCode);

  if (NS_SUCCEEDED(rv)) {
    // We are done with the LDAP search for all entries.
    if (errorCode == nsILDAPErrors::SUCCESS ||
        errorCode == nsILDAPErrors::SIZELIMIT_EXCEEDED) {
      Done(true);
      return NS_OK;
    }
  }

  // in case if GetErrorCode returned error or errorCode is not SUCCESS /
  // SIZELIMIT_EXCEEDED
  Done(false);
  return NS_OK;
}

nsresult nsAbLDAPProcessReplicationData::OpenABForReplicatedDir(bool aCreate) {
  if (!mInitialized) return NS_ERROR_NOT_INITIALIZED;

  mDirectory->GetReplicationFileName(mReplicationFileName);

  nsresult rv =
      mDirectory->GetReplicationFile(getter_AddRefs(mReplicationFile));
  if (NS_FAILED(rv)) {
    Done(false);
    return NS_ERROR_FAILURE;
  }

  // If the database file already exists, create a new one and populate it,
  // then replace the old file with the new one. Otherwise, create the
  // database in place.
  bool fileExists;
  rv = mReplicationFile->Exists(&fileExists);
  if (NS_SUCCEEDED(rv) && fileExists) {
    rv = mReplicationFile->Clone(getter_AddRefs(mOldReplicationFile));
    if (NS_FAILED(rv)) {
      Done(false);
      return rv;
    }

    rv = mReplicationFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0777);
    if (NS_FAILED(rv)) {
      Done(false);
      return rv;
    }
    mReplicationFile->Remove(false);
  }

  nsCString fileName;
  rv = mReplicationFile->GetNativeLeafName(fileName);
  if (NS_FAILED(rv)) {
    Done(false);
    return rv;
  }
  mDirectory->SetReplicationFileName(fileName);

  nsCString uri(kJSDirectoryRoot);
  uri.Append(fileName);

  mReplicationDB = do_CreateInstance(NS_ABJSDIRECTORY_CONTRACTID, &rv);
  if (NS_FAILED(rv)) {
    Done(false);
    return rv;
  }
  rv = mReplicationDB->Init(uri.get());
  if (NS_FAILED(rv)) {
    Done(false);
    return rv;
  }

  return rv;
}

NS_IMETHODIMP nsAbLDAPProcessReplicationData::Observe(nsISupports* aSubject,
                                                      const char* aTopic,
                                                      const char16_t* aData) {
  if (mDatabaseClosedPromise) {
    mDatabaseClosedPromise->Resolve(true, __func__);
  }
  return NS_OK;
}

RefPtr<GenericPromise> nsAbLDAPProcessReplicationData::PromiseDatabaseClosed(
    nsIFile* file) {
  if (file) {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    observerService->NotifyObservers(file, "addrbook-close-ab", nullptr);
  }
  mDatabaseClosedPromise = new GenericPromise::Private(__func__);
  return mDatabaseClosedPromise;
}

void nsAbLDAPProcessReplicationData::Done(bool aSuccess) {
  if (!mInitialized) return;

  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();
  observerService->AddObserver(this, "addrbook-close-ab-complete", false);
  RefPtr<GenericPromise> promise;

  if (aSuccess) {
    if (mOldReplicationFile) {
      // Close mReplicationFile.
      promise =
          this->PromiseDatabaseClosed(mReplicationFile)
              ->Then(GetCurrentSerialEventTarget(), __func__,
                     [&] {
                       // Close mOldReplicationFile.
                       return this->PromiseDatabaseClosed(mOldReplicationFile);
                     })
              ->Then(GetCurrentSerialEventTarget(), __func__, [&] {
                // Remove mOldReplicationFile.
                mOldReplicationFile->Remove(false);
                // Move mReplicationFile to the right place.
                mReplicationFile->MoveToNative(nullptr, mReplicationFileName);
                return GenericPromise::CreateAndResolve(true, __func__);
              });
    } else {
      promise = GenericPromise::CreateAndResolve(true, __func__);
    }
  } else {
    // Failed. Discard any partial results and clean up.
    // Note: if the failure occurs before the LDAP bind, then mReplicationDB,
    // mReplicationFile etc will be unset, so the cleanup needs to tolerate
    // that (Bug 1645512).
    if (mReplicationFile) {
      mReplicationFile->Remove(false);
    }
    promise = this->PromiseDatabaseClosed(mReplicationFile);
  }

  promise->Then(GetCurrentSerialEventTarget(), __func__, [&, aSuccess] {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    observerService->RemoveObserver(this, "addrbook-close-ab-complete");

    if (mReplicationDB) {
      mDirectory->SetReplicationFileName(mReplicationFileName);
    }
    mState = kReplicationDone;

    if (mQuery) mQuery->Done(aSuccess);

    if (mListener)
      mListener->OnStateChange(nullptr, nullptr,
                               nsIWebProgressListener::STATE_STOP,
                               aSuccess ? NS_OK : NS_ERROR_FAILURE);

    // since this is called when all is done here, either on success,
    // failure or abort release the query now.
    mQuery = nullptr;
  });
}
