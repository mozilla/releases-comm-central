/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsMessageChannel.h"

#include "EwsFetchMsgToOffline.h"
#include "EwsListeners.h"
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
#include "mozilla/Components.h"

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
  // `CancelWithReasonImpl` does. It also stores the cancellation reason on the
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

  // Is the message already in the offline store?
  bool hasOffline;
  rv = folder->HasMsgOffline(msgKey, &hasOffline);
  NS_ENSURE_SUCCESS(rv, rv);
  if (hasOffline) {
    // Yes - start streaming it directly from there.
    return StartMessageReadFromStore(aListener);
  }

  // No - Fetch it from the server first.
  // TODO: Should use nsIStreamListenerTee to combine this into one operation.
  // TODO: There should be a policy check - do we actually _want_ to keep a
  //       local copy of this message?
  return EwsFetchMsgToOffline(
      folder, msgKey,
      [self = RefPtr(this), listener = nsCOMPtr(aListener)](nsresult status) {
        if (NS_SUCCEEDED(status)) {
          // Yay! We've now got the offline copy in the store.
          // Can start streaming it out now....
          status = self->StartMessageReadFromStore(listener);
        }

        if (NS_FAILED(status)) {
          // We've already returned from AsyncOpen(), so the listener is
          // expecting callbacks...
          listener->OnStartRequest(self);
          listener->OnStopRequest(self, status);
          return;
        }
      });
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

nsresult EwsMessageChannel::StartMessageReadFromStore(
    nsIStreamListener* streamListener) {
  nsresult rv = AsyncReadMessageFromStore(mHdr, streamListener, mConvert, this,
                                          getter_AddRefs(mReadRequest));
  NS_ENSURE_SUCCESS(rv, rv);

  // Apply the same load flags and group that were previously set.
  // TODO: should AsyncReadMessageFromStore() do this automatically?
  MOZ_TRY(mReadRequest->SetLoadFlags(mLoadFlags));
  MOZ_TRY(mReadRequest->SetLoadGroup(mLoadGroup));

  return NS_OK;
}
