/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeListeners.h"

// Implementation of ExchangeSimpleListener

NS_IMPL_ISUPPORTS(ExchangeSimpleListener, IExchangeSimpleOperationListener)

NS_IMETHODIMP ExchangeSimpleListener::OnOperationSuccess(
    const nsTArray<nsCString>& newIds, bool useLegacyFallback) {
  return mOnSuccess(newIds, useLegacyFallback);
};

// Implementation of ExchangeSimpleMessageListener

NS_IMPL_ISUPPORTS(ExchangeSimpleMessageListener,
                  IExchangeSimpleOperationListener)

NS_IMETHODIMP ExchangeSimpleMessageListener::OnOperationSuccess(
    const nsTArray<nsCString>& newIds, bool useLegacyFallback) {
  return mOnSuccess(mHeaders, newIds, useLegacyFallback);
};

// Implementation of ExchangeFallibleListener

NS_IMETHODIMP ExchangeFallibleListener::OnOperationFailure(nsresult status) {
  return mOnFailure(status);
};

// Implementation of ExchangeSimpleFallibleListener

NS_IMPL_ISUPPORTS_INHERITED(ExchangeSimpleFallibleListener,
                            ExchangeSimpleListener, ExchangeFallibleListener,
                            IExchangeSimpleOperationListener,
                            IExchangeFallibleOperationListener)

// Implementation of ExchangeSimpleFallibleMessageListener

NS_IMPL_ISUPPORTS_INHERITED(ExchangeSimpleFallibleMessageListener,
                            ExchangeSimpleMessageListener,
                            ExchangeFallibleListener,
                            IExchangeSimpleOperationListener,
                            IExchangeFallibleOperationListener)

// Implementation of ExchangeMessageCreateListener

NS_IMPL_ISUPPORTS(ExchangeMessageCreateListener, IExchangeMessageCreateListener)

NS_IMETHODIMP ExchangeMessageCreateListener::OnRemoteCreateFinished(
    nsresult status, nsACString const& exchangeId) {
  return mOnRemoteCreateFinished(status, exchangeId);
}

// Implementation of ExchangeFolderSyncListener

NS_IMPL_ISUPPORTS(ExchangeFolderSyncListener, ExchangeFallibleListener,
                  IExchangeFolderListener, IExchangeFallibleOperationListener)

NS_IMETHODIMP ExchangeFolderSyncListener::OnNewRootFolder(
    const nsACString& id) {
  return mOnNewRootFolder(id);
}

NS_IMETHODIMP ExchangeFolderSyncListener::OnFolderCreated(
    const nsACString& id, const nsACString& parentId, const nsACString& name,
    uint32_t flags) {
  return mOnFolderCreated(id, parentId, name, flags);
}

NS_IMETHODIMP ExchangeFolderSyncListener::OnFolderUpdated(
    const nsACString& id, const nsACString& parentId, const nsACString& name) {
  return mOnFolderUpdated(id, parentId, name);
}

NS_IMETHODIMP ExchangeFolderSyncListener::OnFolderDeleted(
    const nsACString& id) {
  return mOnFolderDeleted(id);
}

NS_IMETHODIMP ExchangeFolderSyncListener::OnSyncStateTokenChanged(
    const nsACString& syncStateToken) {
  return mOnSyncStateTokenChanged(syncStateToken);
}

NS_IMETHODIMP ExchangeFolderSyncListener::OnSuccess() { return mOnSuccess(); }

// Implementation of ExchangeMessageFetchListener

NS_IMPL_ISUPPORTS(ExchangeMessageFetchListener, IExchangeMessageFetchListener)

NS_IMETHODIMP ExchangeMessageFetchListener::OnFetchStart() {
  return mOnFetchStart();
}

NS_IMETHODIMP ExchangeMessageFetchListener::OnFetchedDataAvailable(
    nsIInputStream* stream) {
  uint64_t bytesFetched = 0;
  nsresult rv = mOnFetchedDataAvailable(stream, &bytesFetched);
  NS_ENSURE_SUCCESS(rv, rv);

  mTotalFetchedBytesCount += bytesFetched;

  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageFetchListener::OnFetchStop(nsresult status) {
  return mOnFetchStop(status, mTotalFetchedBytesCount);
}
