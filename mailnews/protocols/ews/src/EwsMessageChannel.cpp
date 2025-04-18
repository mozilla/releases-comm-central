/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsMessageChannel.h"

#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsIMailChannel.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolder.h"
#include "nsIMsgHdr.h"
#include "nsIMsgIncomingServer.h"
#include "nsIMsgMessageService.h"
#include "nsIMsgPluggableStore.h"
#include "nsIStreamConverterService.h"
#include "nsIStreamListener.h"
#include "nsIURIMutator.h"
#include "nsMimeTypes.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "OfflineStorage.h"

#define ID_PROPERTY "ewsId"

/**
 * A listener for a message download, which writes the message's content into
 * the relevant message store.
 *
 * Once the message has been downloaded and written into the store, this
 * listener will also use the provided docshell or stream listener, if any, to
 * display or stream the message's content from the store (using
 * `EwsOfflineMessageChannel`). If both a docshell and a stream listener are
 * provided, only the docshell is used.
 */
class MessageFetchListener : public IEwsMessageFetchCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSMESSAGEFETCHCALLBACKS

  MessageFetchListener(nsIURI* messageURI, nsIMsgDBHdr* hdr,
                       EwsMessageChannel* channel)
      : mChannel(channel), mMessageURI(messageURI), mHdr(hdr) {};

 protected:
  virtual ~MessageFetchListener();

 private:
  // The channel to notify about the start and end of the message download.
  RefPtr<EwsMessageChannel> mChannel;

  // The `ews-message` URI referring to the message to fetch.
  nsCOMPtr<nsIURI> mMessageURI;

  // The header for the message to fetch.
  nsCOMPtr<nsIMsgDBHdr> mHdr;

  // The folder the message is going into.
  nsCOMPtr<nsIMsgFolder> mFolder;

  // The message database for the message header, for committing the offline
  // flag and message size once the message content has been downloaded.
  nsCOMPtr<nsIMsgDatabase> mDB;

  // The offline store in which to write the message content.
  nsCOMPtr<nsIMsgPluggableStore> mStore;

  // The output stream in which to write the message content as it is being
  // downloaded.
  nsCOMPtr<nsIOutputStream> mStoreOutStream;

  // The size of the message in the offline store, updated as the content is
  // being downloaded. Once the download finishes, this size is written to the
  // message header and committed to the message database.
  uint64_t mOfflineSize = 0;
};

NS_IMPL_ISUPPORTS(MessageFetchListener, IEwsMessageFetchCallbacks)

MessageFetchListener::~MessageFetchListener() = default;

// IEwsMessageFetchCallbacks::OnFetchStart()
// Called when we start requesting the message's content from the server.
NS_IMETHODIMP MessageFetchListener::OnFetchStart() {
  // Notify consumers about the operation's start.
  mChannel->OnDownloadStart();

  // Instantiate the attributes we'll need to write the message and pass it on
  // to the right consumer.
  nsresult rv = mHdr->GetFolder(getter_AddRefs(mFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mFolder->GetMsgDatabase(getter_AddRefs(mDB));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mFolder->GetMsgStore(getter_AddRefs(mStore));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mStore->GetNewMsgOutputStream2(mFolder, getter_AddRefs(mStoreOutStream));
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

// IEwsMessageFetchCallbacks::OnFetchedDataAvailable()
// Called when we have received the message's content from the server.
NS_IMETHODIMP MessageFetchListener::OnFetchedDataAvailable(
    nsIInputStream* aInputStream, uint32_t aCount) {
  NS_ENSURE_ARG_POINTER(mStoreOutStream);

  // Copy the message from the provided stream to the output stream provided by
  // the store.
  uint64_t bytesCopied;
  nsresult rv = SyncCopyStream(aInputStream, mStoreOutStream, bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  mOfflineSize += bytesCopied;

  return NS_OK;
}

// IEwsMessageFetchCallbacks::OnFetchStop()
// Called when we have finished processing the server's response.
NS_IMETHODIMP MessageFetchListener::OnFetchStop(nsresult status) {
  NS_ENSURE_ARG_POINTER(mStore);
  NS_ENSURE_ARG_POINTER(mStoreOutStream);
  NS_ENSURE_ARG_POINTER(mDB);
  NS_ENSURE_ARG_POINTER(mFolder);

  nsresult rv;
  if (NS_SUCCEEDED(status)) {
    nsAutoCString storeToken;
    rv = mStore->FinishNewMessage2(mFolder, mStoreOutStream, storeToken);

    // Here, we don't use `NS_ENSURE_SUCCESS` or `MOZ_TRY` like most places in
    // this file, because we still need `OnDownloadFinished` to be called if any
    // of these calls fail. So instead we just ensure any failure trickles down
    // to it.
    if (NS_SUCCEEDED(rv)) {
      rv = mHdr->SetStoreToken(storeToken);
    }
    if (NS_SUCCEEDED(rv)) {
      // Mark the message as downloaded in the database record and record its
      // size.
      uint32_t unused;
      rv = mHdr->OrFlags(nsMsgMessageFlags::Offline, &unused);
    }

    if (NS_SUCCEEDED(rv)) {
      // Update the message's size in the database now that we've actually
      // downloaded it (in case the server previously lied about it).
      rv = mHdr->SetMessageSize(mOfflineSize);
    }

    if (NS_SUCCEEDED(rv)) {
      rv = mHdr->SetOfflineMessageSize(mOfflineSize);
    }

    if (NS_SUCCEEDED(rv)) {
      // Commit the changes to the folder's database.
      rv = mDB->Commit(nsMsgDBCommitType::kLargeCommit);
    }
    // If anything went wrong, make sure the caller hears about it.
    status = rv;
  } else {
    // Fetch has failed, discard the new message in the store.
    mStore->DiscardNewMessage2(mFolder, mStoreOutStream);
  }
  mStoreOutStream = nullptr;
  return mChannel->OnDownloadFinished(status);
}

/**
 * nsIChannel/nsIRequest impl for EwsOfflineMessageChannel
 */

NS_IMPL_ISUPPORTS_INHERITED(EwsMessageChannel, nsHashPropertyBag,
                            nsIMailChannel, nsIChannel, nsIRequest)

EwsMessageChannel::EwsMessageChannel(nsIURI* uri, bool convert)
    : mConvert(convert),
      mURI(uri),
      mContentDisposition(nsIChannel::DISPOSITION_INLINE),
      mContentLength(-1),
      mLoadFlags(nsIRequest::LOAD_NORMAL),
      mPending(true),
      mStatus(NS_OK) {
  mContentType.AssignLiteral(MESSAGE_RFC822);
}

EwsMessageChannel::~EwsMessageChannel() = default;

NS_IMETHODIMP EwsMessageChannel::GetName(nsACString& aName) {
  if (mURI) {
    return mURI->GetSpec(aName);
  }
  aName.Truncate();
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::IsPending(bool* aPending) {
  if (mReadRequest) {
    return mReadRequest->IsPending(aPending);
  }

  *aPending = mPending;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetStatus(nsresult* aStatus) {
  // If the download has failed, we want to serve the status from the download
  // operation regardless of whether we have a read request. Note that if the
  // download failed we shouldn't have a read request in the first place, so
  // this check exists more out of caution than real concern.
  if (mReadRequest && NS_SUCCEEDED(mStatus)) {
    return mReadRequest->GetStatus(aStatus);
  }

  *aStatus = mStatus;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::Cancel(nsresult aStatus) {
  if (mReadRequest) {
    return mReadRequest->Cancel(aStatus);
  }

  // We don't currently have a way to cancel the underlying necko request for
  // downloading the message.
  NS_WARNING("Cannot cancel an EWS message channel while downloading");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::Suspend(void) {
  if (mReadRequest) {
    return mReadRequest->Suspend();
  }

  // We don't currently have a way to suspend the underlying necko request for
  // downloading the message.
  NS_WARNING("Cannot suspend an EWS message channel while downloading");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::Resume(void) {
  if (mReadRequest) {
    return mReadRequest->Resume();
  }

  // We don't currently have a way to suspend the underlying necko request for
  // downloading the message.
  NS_WARNING("Cannot resume an EWS message channel while downloading");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::GetLoadGroup(nsILoadGroup** aLoadGroup) {
  if (mReadRequest) {
    return mReadRequest->GetLoadGroup(aLoadGroup);
  }

  NS_IF_ADDREF(*aLoadGroup = mLoadGroup);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetLoadGroup(nsILoadGroup* aLoadGroup) {
  if (mReadRequest) {
    return mReadRequest->SetLoadGroup(aLoadGroup);
  }

  mLoadGroup = aLoadGroup;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetLoadFlags(nsLoadFlags* aLoadFlags) {
  if (mReadRequest) {
    return mReadRequest->GetLoadFlags(aLoadFlags);
  }

  *aLoadFlags = mLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetLoadFlags(nsLoadFlags aLoadFlags) {
  if (mReadRequest) {
    return mReadRequest->SetLoadFlags(aLoadFlags);
  }

  mLoadFlags = aLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetTRRMode(nsIRequest::TRRMode* mode) {
  // `GetTRRModeImpl` only reads a value through calling `GetLoadFlags`, which
  // we already forward to the read request if it exists, so we don't need to
  // forward this call to.
  return GetTRRModeImpl(mode);
}

NS_IMETHODIMP EwsMessageChannel::SetTRRMode(nsIRequest::TRRMode mode) {
  // `GetTRRModeImpl` only sets a value through calling `SetLoadFlags`, which
  // we already forward to the read request if it exists, so we don't need to
  // forward this call to.
  return SetTRRModeImpl(mode);
}

NS_IMETHODIMP EwsMessageChannel::CancelWithReason(nsresult aStatus,
                                                  const nsACString& aReason) {
  // While we could forward this call to the read request if we have it, the
  // only important action we want to perform on it is cancel it, which
  // `CancelWithReasonImpl` does. It also stores the cancelation reason on the
  // current channel, which is fine since consumers will always try to read it
  // from here.
  return CancelWithReasonImpl(aStatus, aReason);
}

NS_IMETHODIMP EwsMessageChannel::GetCanceledReason(
    nsACString& aCanceledReason) {
  // See the documentation to `CancelWithReason` for details on why we don't
  // forward this call to the read request.
  return GetCanceledReasonImpl(aCanceledReason);
}

NS_IMETHODIMP EwsMessageChannel::SetCanceledReason(
    const nsACString& aCanceledReason) {
  // See the documentation to `CancelWithReason` for details on why we don't
  // forward this call to the read request.
  return SetCanceledReasonImpl(aCanceledReason);
}

NS_IMETHODIMP EwsMessageChannel::GetOriginalURI(nsIURI** aOriginalURI) {
  NS_IF_ADDREF(*aOriginalURI = mURI);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetOriginalURI(nsIURI* aOriginalURI) {
  // There's no meaningful "original URI" for these requests.
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetURI(nsIURI** aURI) {
  NS_IF_ADDREF(*aURI = mURI);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetOwner(nsISupports** aOwner) {
  NS_IF_ADDREF(*aOwner = mOwner);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetOwner(nsISupports* aOwner) {
  mOwner = aOwner;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetNotificationCallbacks(
    nsIInterfaceRequestor** aNotificationCallbacks) {
  NS_IF_ADDREF(*aNotificationCallbacks = mNotificationCallbacks);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetNotificationCallbacks(
    nsIInterfaceRequestor* aNotificationCallbacks) {
  mNotificationCallbacks = aNotificationCallbacks;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetSecurityInfo(
    nsITransportSecurityInfo** aSecurityInfo) {
  // Security info does not make sense here since we're only pulling messages
  // from storage.
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::GetContentType(nsACString& aContentType) {
  aContentType.Assign(mContentType);

  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetContentType(
    const nsACString& aContentType) {
  nsresult rv =
      NS_ParseResponseContentType(aContentType, mContentType, mCharset);

  if (NS_FAILED(rv) || mContentType.IsEmpty()) {
    mContentType.AssignLiteral(MESSAGE_RFC822);
  }

  if (NS_FAILED(rv) || mCharset.IsEmpty()) {
    mCharset.AssignLiteral("UTF-8");
  }

  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetContentCharset(
    nsACString& aContentCharset) {
  aContentCharset.Assign(mCharset);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetContentCharset(
    const nsACString& aContentCharset) {
  mCharset.Assign(aContentCharset);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetContentLength(int64_t* aContentLength) {
  *aContentLength = mContentLength;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetContentLength(int64_t aContentLength) {
  mContentLength = aContentLength;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::Open(nsIInputStream** _retval) {
  return NS_ImplementChannelOpen(this, _retval);
}

NS_IMETHODIMP EwsMessageChannel::AsyncOpen(nsIStreamListener* aListener) {
  mPending = false;

  // Get the header and folder matching the URI.
  nsresult rv;
  nsCOMPtr<nsIMsgMessageService> msgService =
      do_GetService("@mozilla.org/messenger/messageservice;1?type=ews", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString spec;
  rv = mURI->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgService->MessageURIToMsgHdr(spec, getter_AddRefs(mHdr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> folder;
  rv = mHdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsMsgKey msgKey;
  rv = mHdr->GetMessageKey(&msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  // Instantiate the listener wrapper.
  mStreamListener =
      new OfflineMessageReadListener(aListener, this, msgKey, folder);

  // Make sure the message exists in the offline store.
  bool hasOffline;
  rv = folder->HasMsgOffline(msgKey, &hasOffline);
  NS_ENSURE_SUCCESS(rv, rv);

  if (hasOffline) {
    // If the message already exists in the offline store, skip directly to
    // reading it.
    return StartMessageReadFromStore();
  }

  // Retrieve the EWS ID of the message we want to download.
  nsCString ewsId;
  rv = mHdr->GetStringProperty(ID_PROPERTY, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  // Look up the incoming server for this message, from which we can get an EWS
  // client.
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // `FindServerByURI()` expects that the URI passed in has a scheme matching
  // the value returned by an incoming server's `GetType()` method. In our case,
  // that should be `ews`.
  nsCOMPtr<nsIURI> serverUri;
  rv = NS_MutateURI(mURI).SetScheme("ews"_ns).Finalize(serverUri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = accountManager->FindServerByURI(serverUri, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  // Get an EWS client from the incoming server, and start downloading the
  // message content.
  nsCOMPtr<IEwsIncomingServer> ewsServer = do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsClient> client;
  rv = ewsServer->GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<MessageFetchListener> listener =
      new MessageFetchListener(mURI, mHdr, this);
  return client->GetMessage(ewsId, listener);
}

NS_IMETHODIMP EwsMessageChannel::GetCanceled(bool* aCanceled) {
  nsCString canceledReason;
  nsresult rv = mReadRequest->GetCanceledReason(canceledReason);
  NS_ENSURE_SUCCESS(rv, rv);

  *aCanceled = canceledReason.IsEmpty();

  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetContentDisposition(
    uint32_t* aContentDisposition) {
  *aContentDisposition = mContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetContentDisposition(
    uint32_t aContentDisposition) {
  mContentDisposition = aContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetContentDispositionFilename(
    nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::SetContentDispositionFilename(
    const nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::GetContentDispositionHeader(
    nsACString& aContentDispositionHeader) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::GetLoadInfo(nsILoadInfo** aLoadInfo) {
  NS_IF_ADDREF(*aLoadInfo = mLoadInfo);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetLoadInfo(nsILoadInfo* aLoadInfo) {
  mLoadInfo = aLoadInfo;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetIsDocument(bool* aIsDocument) {
  return NS_GetIsDocumentChannel(this, aIsDocument);
}

nsresult EwsMessageChannel::OnDownloadStart() {
  // Notify the consumer about the operation's start. Ideally we'd do this in
  // `AsyncOpen`, but `DocumentLoadListener::Open()` seems to expect we do this
  // after `AsyncOpen` has returned.
  return mStreamListener->OnStartRequest(this);
}

nsresult EwsMessageChannel::OnDownloadFinished(nsresult status) {
  mStatus = status;

  // If downloading the message failed, notify the consumer and bail.
  if (NS_FAILED(status)) {
    return mStreamListener->OnStopRequest(this, status);
  }

  return StartMessageReadFromStore();
}

nsresult EwsMessageChannel::StartMessageReadFromStore() {
  nsresult rv = AsyncReadMessageFromStore(mHdr, mStreamListener, mConvert, this,
                                          getter_AddRefs(mReadRequest));
  NS_ENSURE_SUCCESS(rv, rv);

  // Apply the same load flags and group that were previously set.
  MOZ_TRY(mReadRequest->SetLoadFlags(mLoadFlags));
  MOZ_TRY(mReadRequest->SetLoadGroup(mLoadGroup));

  return NS_OK;
}
