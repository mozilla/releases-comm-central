/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFetchMsgToOffline.h"
#include "EwsListeners.h"
#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "MailNewsTypes.h"
#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsDebug.h"
#include "nsError.h"
#include "nsIInputStream.h"
#include "nsIMsgHdr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgPluggableStore.h"
#include "nsIOutputStream.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"

/*
 * Helper class for fetching a message from a server to the offline store.
 *
 * This _could_ be made protocol-independent. What would need to happen:
 * - implement nsIStreamListener instead of IEwsMessageFetchListener
 * - have a common protocol API for fetching a message from server
 *   (one which _doesn't_ stream out from the local store if available).
 * - have a protocol-agnostic way to get the server-side ID from the msgDB.
 *
 * All these are very doable.
 */
class MsgFetcher : public IEwsMessageFetchListener {
 public:
  NS_DECL_ISUPPORTS

  MsgFetcher() = default;

  // Begins fetching a message from the server, adds it to the local store,
  // updates the folder database and calls doneFn when finished (or upon
  // failure).
  nsresult FetchMsgToOffline(nsIMsgFolder* folder, nsMsgKey msgKey,
                             std::function<void(nsresult)> doneFn) {
    nsresult rv;
    MOZ_ASSERT(mMsgKey == nsMsgKey_None);

    mDoneFn = std::move(doneFn);
    mFolder = folder;
    mMsgKey = msgKey;

    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = folder->GetMessageHeader(msgKey, getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = folder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    // Begin EWS-specific fetch.
    // This is the only protocol-specific part of the whole operation.
    // There _should_ be a protocol-neutral way to fetch a message from a
    // server but there currently isn't.
    nsCOMPtr<IEwsIncomingServer> ewsServer = do_QueryInterface(server, &rv);
    MOZ_ASSERT(ewsServer);  // Only EWS supported for now!
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<IEwsClient> ewsClient;
    rv = ewsServer->GetEwsClient(getter_AddRefs(ewsClient));
    NS_ENSURE_SUCCESS(rv, rv);

    // Retrieve the EWS ID of the message we want to download.
    constexpr auto kEwsIdProperty = "ewsId";
    nsCString ewsId;
    rv = msgHdr->GetStringProperty(kEwsIdProperty, ewsId);
    NS_ENSURE_SUCCESS(rv, rv);

    return ewsClient->GetMessage(this, ewsId);
  }

  // IEwsMessageFetchListener.onFetchStart implementation.
  // (analogous to nsIStreamListener.onStart)
  NS_IMETHOD OnFetchStart() override {
    nsresult rv;
    MOZ_ASSERT(!mOut);
    nsCOMPtr<nsIMsgPluggableStore> store;
    rv = mFolder->GetMsgStore(getter_AddRefs(store));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = store->GetNewMsgOutputStream(mFolder, getter_AddRefs(mOut));
    NS_ENSURE_SUCCESS(rv, rv);
    return NS_OK;
  }

  // IEwsMessageFetchListener.onFetchedDataAvailable implementation.
  // (analogous to nsIStreamListener.onDataAvailable)
  NS_IMETHOD OnFetchedDataAvailable(nsIInputStream* inputStream,
                                    uint32_t count) override {
    MOZ_ASSERT(mOut);
    nsresult rv = SyncCopyStreamN(inputStream, mOut, count);
    NS_ENSURE_SUCCESS(rv, rv);
    mMsgSize += count;
    return NS_OK;
  }

  // IEwsMessageFetchListener.onFetchStop implementation.
  // (analogous to nsIStreamListener.onStopRequest)
  NS_IMETHOD OnFetchStop(nsresult status) override {
    nsresult rv;
    // No early-outs here. mDoneFn() _must_ be called, no matter what.
    nsCOMPtr<nsIMsgPluggableStore> store;
    rv = mFolder->GetMsgStore(getter_AddRefs(store));
    if (NS_FAILED(rv)) {
      status = rv;  // GetMsgStore() _should_ be infallible, but...
    }

    if (NS_FAILED(status)) {
      // The operation failed.
      // If OnStartRequest() failed, we may not have an outputstream to close.
      if (mOut && store) {
        store->DiscardNewMessage(mFolder, mOut);
      }
    } else {
      // Update the database entry for the message to link it to the store.
      MOZ_ASSERT(mOut);

      nsAutoCString storeToken;
      rv = store->FinishNewMessage(mFolder, mOut, storeToken);

      nsCOMPtr<nsIMsgDBHdr> msgHdr;
      if (NS_SUCCEEDED(rv)) {
        rv = mFolder->GetMessageHeader(mMsgKey, getter_AddRefs(msgHdr));
      }

      if (NS_SUCCEEDED(rv)) {
        rv = msgHdr->SetStoreToken(storeToken);
      }
      if (NS_SUCCEEDED(rv)) {
        rv = msgHdr->SetOfflineMessageSize(mMsgSize);
      }
      // NOTE: we don't set .messageSize. That should already have been set
      // before a download is attempted, having been sent down by the server
      // when it first told us about the existance of the message.
      if (NS_SUCCEEDED(rv)) {
        uint32_t unused;
        rv = msgHdr->OrFlags(nsMsgMessageFlags::Offline, &unused);
      }

      // If anything went wrong, fail the whole operation.
      status = rv;
    }

    // We're all done. Let the caller know how it went.
    if (mDoneFn) {
      mDoneFn(status);
    }
    return NS_OK;
  }

 protected:
  virtual ~MsgFetcher() = default;

  nsCOMPtr<nsIMsgFolder> mFolder;
  nsMsgKey mMsgKey{nsMsgKey_None};
  std::function<void(nsresult status)> mDoneFn;

  nsCOMPtr<nsIOutputStream> mOut;
  uint64_t mMsgSize{0};
};

NS_IMPL_ISUPPORTS(MsgFetcher, IEwsMessageFetchListener)

nsresult EwsFetchMsgToOffline(nsIMsgFolder* folder, nsMsgKey msgKey,
                              std::function<void(nsresult)> onDone) {
  MOZ_ASSERT(msgKey != nsMsgKey_None);

  RefPtr<MsgFetcher> fetcher = new MsgFetcher();
  return fetcher->FetchMsgToOffline(folder, msgKey, onDone);
}
