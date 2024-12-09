/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsOfflineMessageChannel.h"

#include "IEwsClient.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsIMailChannel.h"
#include "nsIMsgFolder.h"
#include "nsIMsgHdr.h"
#include "nsIMsgIncomingServer.h"
#include "nsIMsgMessageService.h"
#include "nsIStreamConverterService.h"
#include "nsIStreamListener.h"
#include "nsIURIMutator.h"
#include "nsMimeTypes.h"
#include "nsNetUtil.h"

/**
 * A stream listener that proxies method calls to another stream listener, while
 * substituting the request argument with the provided channel.
 *
 * `EwsOfflineMessageChannel` can be called from an `nsIDocShell` to render the
 * message. The stream listener that `nsIDocShell` calls `AsyncOpen` with
 * expects the request used in method calls to be channel-like (i.e. it can be
 * QI'd as an `nsIChannel`). Additionally, we want to use `nsIInputStreamPump`
 * to pump the data from the message content's input stream (which we get from
 * the message store) into the provided stream listener. However, the default
 * `nsIInputStreamPump` implementation calls the stream listener methods with
 * itself as the request argument, but only implements `nsIRequest` (and not
 * `nsIChannel`), causing the operation to fail.
 *
 * Therefore we need this "proxy" listener to forward the method calls to the
 * listener `AsyncOpen` is originally provided with, while subsituting the
 * request arguments with an actual channel.
 */
class EwsDisplayProxyListener : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  EwsDisplayProxyListener(nsIStreamListener* destination, nsIChannel* channel)
      : mDestination(destination), mChannel(channel) {};

 protected:
  virtual ~EwsDisplayProxyListener();

 private:
  nsCOMPtr<nsIStreamListener> mDestination;
  nsCOMPtr<nsIChannel> mChannel;
};

NS_IMPL_ISUPPORTS(EwsDisplayProxyListener, nsIStreamListener)

EwsDisplayProxyListener::~EwsDisplayProxyListener() = default;

NS_IMETHODIMP EwsDisplayProxyListener::OnStartRequest(nsIRequest* request) {
  return mDestination->OnStartRequest(mChannel);
}

NS_IMETHODIMP EwsDisplayProxyListener::OnStopRequest(nsIRequest* request,
                                                     nsresult aStatus) {
  return mDestination->OnStopRequest(mChannel, aStatus);
}

NS_IMETHODIMP EwsDisplayProxyListener::OnDataAvailable(
    nsIRequest* request, nsIInputStream* aInStream, uint64_t aSourceOffset,
    uint32_t aCount) {
  return mDestination->OnDataAvailable(mChannel, aInStream, aSourceOffset,
                                       aCount);
}

/**
 * nsIChannel/nsIRequest impl for EwsOfflineMessageChannel
 */

NS_IMPL_ISUPPORTS(EwsOfflineMessageChannel, nsIMailChannel, nsIChannel,
                  nsIRequest)

EwsOfflineMessageChannel::EwsOfflineMessageChannel(nsIURI* uri)
    : mURI(uri), mPump(nullptr), mLoadFlags(nsIRequest::LOAD_NORMAL) {
  mContentType.AssignLiteral(MESSAGE_RFC822);
  mCharset.AssignLiteral("UTF-8");
}

EwsOfflineMessageChannel::~EwsOfflineMessageChannel() = default;

NS_IMETHODIMP EwsOfflineMessageChannel::GetName(nsACString& aName) {
  if (mURI) {
    return mURI->GetSpec(aName);
  }
  aName.Truncate();
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::IsPending(bool* aPending) {
  if (mPump) {
    *aPending = false;
  } else {
    *aPending = true;
  }
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetStatus(nsresult* aStatus) {
  if (!mPump) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  return mPump->GetStatus(aStatus);
}

NS_IMETHODIMP EwsOfflineMessageChannel::Cancel(nsresult aStatus) {
  if (!mPump) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  return mPump->Cancel(aStatus);
}

NS_IMETHODIMP EwsOfflineMessageChannel::Suspend(void) {
  if (!mPump) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  return mPump->Suspend();
}

NS_IMETHODIMP EwsOfflineMessageChannel::Resume(void) {
  if (!mPump) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  return mPump->Resume();
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetLoadGroup(
    nsILoadGroup** aLoadGroup) {
  NS_IF_ADDREF(*aLoadGroup = mLoadGroup);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetLoadGroup(nsILoadGroup* aLoadGroup) {
  mLoadGroup = aLoadGroup;
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetLoadFlags(nsLoadFlags* aLoadFlags) {
  *aLoadFlags = mLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetLoadFlags(nsLoadFlags aLoadFlags) {
  mLoadFlags = aLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetTRRMode(nsIRequest::TRRMode* mode) {
  return GetTRRModeImpl(mode);
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetTRRMode(nsIRequest::TRRMode mode) {
  return SetTRRModeImpl(mode);
}

NS_IMETHODIMP EwsOfflineMessageChannel::CancelWithReason(
    nsresult aStatus, const nsACString& aReason) {
  if (!mPump) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  return mPump->CancelWithReason(aStatus, aReason);
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetCanceledReason(
    nsACString& aCanceledReason) {
  if (!mPump) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  return mPump->GetCanceledReason(aCanceledReason);
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetCanceledReason(
    const nsACString& aCanceledReason) {
  if (!mPump) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  return mPump->SetCanceledReason(aCanceledReason);
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetOriginalURI(nsIURI** aOriginalURI) {
  NS_IF_ADDREF(*aOriginalURI = mURI);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetOriginalURI(nsIURI* aOriginalURI) {
  // There's no meaningful "original URI" for these requests.
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetURI(nsIURI** aURI) {
  NS_IF_ADDREF(*aURI = mURI);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetOwner(nsISupports** aOwner) {
  NS_IF_ADDREF(*aOwner = mOwner);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetOwner(nsISupports* aOwner) {
  mOwner = aOwner;
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetNotificationCallbacks(
    nsIInterfaceRequestor** aNotificationCallbacks) {
  NS_IF_ADDREF(*aNotificationCallbacks = mNotificationCallbacks);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetNotificationCallbacks(
    nsIInterfaceRequestor* aNotificationCallbacks) {
  mNotificationCallbacks = aNotificationCallbacks;
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetSecurityInfo(
    nsITransportSecurityInfo** aSecurityInfo) {
  // Security info does not make sense here since we're only pulling messages
  // from storage.
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetContentType(
    nsACString& aContentType) {
  aContentType.Assign(mContentType);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetContentType(
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

NS_IMETHODIMP EwsOfflineMessageChannel::GetContentCharset(
    nsACString& aContentCharset) {
  aContentCharset.Assign(mCharset);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetContentCharset(
    const nsACString& aContentCharset) {
  mCharset.Assign(aContentCharset);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetContentLength(
    int64_t* aContentLength) {
  NS_WARNING("GetContentLength");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetContentLength(
    int64_t aContentLength) {
  NS_WARNING("SetContentLength");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsOfflineMessageChannel::Open(nsIInputStream** _retval) {
  return NS_ImplementChannelOpen(this, _retval);
}

NS_IMETHODIMP EwsOfflineMessageChannel::AsyncOpen(
    nsIStreamListener* aListener) {
  // Get the header and folder matching the URI.
  nsresult rv;
  nsCOMPtr<nsIMsgMessageService> msgService =
      do_GetService("@mozilla.org/messenger/messageservice;1?type=ews", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString spec;
  rv = mURI->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = msgService->MessageURIToMsgHdr(spec, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> folder;
  rv = hdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Make sure the message exists in the offline store.
  nsMsgKey msgKey;
  rv = hdr->GetMessageKey(&msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasOffline;
  rv = folder->HasMsgOffline(msgKey, &hasOffline);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!hasOffline) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Stream the message from the store into the stream listener. This is also
  // where we instantiate and initialize `mPump`.
  nsCOMPtr<nsIInputStream> msgStream;
  rv = folder->GetMsgInputStream(hdr, getter_AddRefs(msgStream));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = NS_NewInputStreamPump(getter_AddRefs(mPump), msgStream.forget());
  NS_ENSURE_SUCCESS(rv, rv);

  // We don't need to use our RFC822->HTML converter here because `nsDocShell`
  // will run it for us.
  nsCOMPtr<nsIStreamListener> listener =
      new EwsDisplayProxyListener(aListener, this);
  return mPump->AsyncRead(listener);
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetCanceled(bool* aCanceled) {
  nsCString canceledReason;
  nsresult rv = mPump->GetCanceledReason(canceledReason);
  NS_ENSURE_SUCCESS(rv, rv);

  *aCanceled = canceledReason.IsEmpty();

  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetContentDisposition(
    uint32_t* aContentDisposition) {
  *aContentDisposition = nsIChannel::DISPOSITION_INLINE;
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetContentDisposition(
    uint32_t aContentDisposition) {
  NS_WARNING("SetContentDisposition");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetContentDispositionFilename(
    nsAString& aContentDispositionFilename) {
  NS_WARNING("GetContentDispositionFilename");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetContentDispositionFilename(
    const nsAString& aContentDispositionFilename) {
  NS_WARNING("SetContentDispositionFilename");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetContentDispositionHeader(
    nsACString& aContentDispositionHeader) {
  NS_WARNING("GetContentDispositionHeader");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetLoadInfo(nsILoadInfo** aLoadInfo) {
  NS_IF_ADDREF(*aLoadInfo = mLoadInfo);
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::SetLoadInfo(nsILoadInfo* aLoadInfo) {
  mLoadInfo = aLoadInfo;
  return NS_OK;
}

NS_IMETHODIMP EwsOfflineMessageChannel::GetIsDocument(bool* aIsDocument) {
  NS_WARNING("GetIsDocument");
  return NS_ERROR_NOT_IMPLEMENTED;
}
