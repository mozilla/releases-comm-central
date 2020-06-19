/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMPtr.h"
#include "nsAbLDAPReplicationService.h"
#include "nsAbLDAPReplicationQuery.h"
#include "nsAbBaseCID.h"
#include "nsIWebProgressListener.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"

#include "nsIAbLDAPReplicationData.h"

/*** implementation of the service ******/

NS_IMPL_ISUPPORTS(nsAbLDAPReplicationService, nsIAbLDAPReplicationService)

nsAbLDAPReplicationService::nsAbLDAPReplicationService()
    : mReplicating(false) {}

nsAbLDAPReplicationService::~nsAbLDAPReplicationService() {}

/* void startReplication(in string aURI, in nsIWebProgressListener
 * progressListener); */
NS_IMETHODIMP nsAbLDAPReplicationService::StartReplication(
    nsIAbLDAPDirectory* aDirectory, nsIWebProgressListener* progressListener) {
  NS_ENSURE_ARG_POINTER(aDirectory);

  // Makes sure to allow only one replication at a time.
  if (mReplicating) return NS_ERROR_FAILURE;

  mDirectory = aDirectory;

  nsresult rv = NS_ERROR_NOT_IMPLEMENTED;

  mQuery = do_CreateInstance(NS_ABLDAP_REPLICATIONQUERY_CONTRACTID, &rv);

  if (NS_SUCCEEDED(rv) && mQuery) {
    rv = mQuery->Init(mDirectory, progressListener);
    if (NS_SUCCEEDED(rv)) {
      rv = mQuery->DoReplicationQuery();
      if (NS_SUCCEEDED(rv)) {
        mReplicating = true;
        return rv;
      }
    }
  }

  if (progressListener && NS_FAILED(rv))
    progressListener->OnStateChange(nullptr, nullptr,
                                    nsIWebProgressListener::STATE_STOP, NS_OK);

  if (NS_FAILED(rv)) {
    mDirectory = nullptr;
    mQuery = nullptr;
  }

  return rv;
}

/* void cancelReplication(in string aURI); */
NS_IMETHODIMP nsAbLDAPReplicationService::CancelReplication(
    nsIAbLDAPDirectory* aDirectory) {
  NS_ENSURE_ARG_POINTER(aDirectory);

  nsresult rv = NS_ERROR_FAILURE;

  if (aDirectory == mDirectory) {
    if (mQuery && mReplicating) rv = mQuery->CancelQuery();
  }

  // If query has been cancelled successfully
  if (NS_SUCCEEDED(rv)) Done(false);

  return rv;
}

NS_IMETHODIMP nsAbLDAPReplicationService::Done(bool aSuccess) {
  mReplicating = false;
  if (mQuery) {
    mQuery = nullptr;      // Release query obj
    mDirectory = nullptr;  // Release directory
  }

  return NS_OK;
}
