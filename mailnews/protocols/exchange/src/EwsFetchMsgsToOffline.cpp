/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFetchMsgsToOffline.h"
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
#include "nsThreadUtils.h"

/*
 * Helper class for EwsFetchMsgsToOffline().
 *
 * It calls IEwsClient.GetMessage() to download each message in turn, passing
 * itself as a listener.
 *
 * As the message data arrives, it is written to the local message store.
 *
 * When each message completes (see OnFetchStop()), it will update the message
 * database to set `.storeToken`, `.offlineMessageSize` and the `Offline`
 * message flag.
 * If there are remaining messages to download, the next one will then be
 * started.
 * If there are no more messages or if an error occurs, the onDone function
 * will be called and the async operation will finish.
 */
class MsgFetcher : public IEwsMessageFetchListener {
 public:
  NS_DECL_ISUPPORTS

  MsgFetcher() = default;
  MsgFetcher(nsIMsgFolder* folder, nsTArray<nsMsgKey> const& msgKeys,
             std::function<void(nsresult)> onDone)
      : mFolder(folder),
        mMsgKeys(msgKeys.Length()),
        mDoneFn(std::move(onDone)) {
    MOZ_ASSERT(mFolder);
    // We'll pop keys off the end as we go, so reverse list to
    // preserve ordering.
    for (auto it = msgKeys.rbegin(); it != msgKeys.rend(); ++it) {
      mMsgKeys.AppendElement(*it);
    }
  }

  nsresult Go() {
    // Empty list allowed as a special case.
    if (mMsgKeys.IsEmpty()) {
      // Inform caller of success, but not before we return.
      if (mDoneFn) {
        NS_DispatchToCurrentThread(NS_NewRunnableFunction(
            "MsgFetcher no-op",
            [self = RefPtr(this)] { self->mDoneFn(NS_OK); }));
      }
      return NS_OK;
    }

    // Kick off the first message.
    // If this fails we return the error, and onDone() is _not_ invoked.
    return StartNext();
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
  NS_IMETHOD OnFetchedDataAvailable(nsIInputStream* inputStream) override {
    uint64_t bytesCopied;
    MOZ_ASSERT(mOut);
    nsresult rv = SyncCopyStream(inputStream, mOut, bytesCopied);
    NS_ENSURE_SUCCESS(rv, rv);
    mMsgSize += bytesCopied;
    return NS_OK;
  }

  // IEwsMessageFetchListener.onFetchStop implementation.
  // (analogous to nsIStreamListener.onStopRequest)
  NS_IMETHOD OnFetchStop(nsresult status) override {
    // No early-outs from this function.
    nsresult rv;

    nsMsgKey msgKey = mMsgKeys.PopLastElement();

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
        rv = mFolder->GetMessageHeader(msgKey, getter_AddRefs(msgHdr));
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

    // Reset the per-message vars.
    mOut = nullptr;
    mMsgSize = 0;

    if (NS_SUCCEEDED(status) && !mMsgKeys.IsEmpty()) {
      // But wait, there's more!
      status = StartNext();
    }

    if (NS_FAILED(status) || mMsgKeys.IsEmpty()) {
      // Stop if there was a failure or we've run out of messages.
      if (mDoneFn) {
        mDoneFn(status);
      }
    }
    return NS_OK;
  }

 protected:
  virtual ~MsgFetcher() = default;

  // Begin fetching the next queued message from the server.
  nsresult StartNext() {
    nsresult rv;

    MOZ_ASSERT(!mMsgKeys.IsEmpty());
    // Remember, we're starting from the back and popping keys off
    // as they complete (see OnFetchStop()).
    nsMsgKey msgKey = mMsgKeys.LastElement();

    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = mFolder->GetMessageHeader(msgKey, getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = mFolder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    // Begin EWS-specific fetch.
    // This is the only protocol-specific part of the whole operation.
    // There _should_ be a protocol-neutral way to fetch a message from a
    // server but there currently isn't.
    nsCOMPtr<IEwsIncomingServer> ewsServer = do_QueryInterface(server, &rv);
    MOZ_ASSERT(ewsServer);  // Only EWS supported for now!
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<IEwsClient> ewsClient;
    rv = ewsServer->GetProtocolClient(getter_AddRefs(ewsClient));
    NS_ENSURE_SUCCESS(rv, rv);

    // Retrieve the EWS ID of the message we want to download.
    constexpr auto kEwsIdProperty = "ewsId";
    nsCString ewsId;
    rv = msgHdr->GetStringProperty(kEwsIdProperty, ewsId);
    NS_ENSURE_SUCCESS(rv, rv);

    // Start fetching the message.
    return ewsClient->GetMessage(this, ewsId);
  }

  // The folder containing the messages we're downloading.
  nsCOMPtr<nsIMsgFolder> mFolder;

  // The list of messages we're downloading.
  // We start at the end of the list and pop off each key once it's
  // completed.
  nsTArray<nsMsgKey> mMsgKeys;

  // Called upon failure or completion of all messages.
  std::function<void(nsresult status)> mDoneFn;

  // Current message: Output stream for writing to store.
  nsCOMPtr<nsIOutputStream> mOut;

  // Current message: size so far.
  uint64_t mMsgSize{0};
};

NS_IMPL_ISUPPORTS(MsgFetcher, IEwsMessageFetchListener)

nsresult EwsFetchMsgsToOffline(nsIMsgFolder* folder,
                               nsTArray<nsMsgKey> const& msgKeys,
                               std::function<void(nsresult)> onDone) {
  RefPtr<MsgFetcher> fetcher = new MsgFetcher(folder, msgKeys, onDone);
  return fetcher->Go();
}
