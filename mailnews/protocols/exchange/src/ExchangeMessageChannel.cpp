/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeMessageChannel.h"

#include "ExchangeFetchMsgsToOffline.h"
#include "ExchangeListeners.h"
#include "IExchangeClient.h"
#include "IExchangeFolder.h"
#include "IExchangeIncomingServer.h"
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
#include "mozilla/dom/ParentProcessChannelHandle.h"

/**
 * nsIChannel/nsIRequest impl for ExchangeMessageChannel
 */

NS_IMPL_ISUPPORTS_INHERITED(ExchangeMessageChannel, nsHashPropertyBag,
                            nsIMailChannel, nsIChannel, nsIRequest)

ExchangeMessageChannel::ExchangeMessageChannel(nsIURI* uri, bool convert)
    : mConvert(convert),
      mURI(uri),
      mContentDisposition(nsIChannel::DISPOSITION_INLINE),
      mContentLength(-1),
      mLoadFlags(nsIRequest::LOAD_NORMAL),
      mPending(true),
      mStatus(NS_OK) {
  mContentType.AssignLiteral(MESSAGE_RFC822);
}

ExchangeMessageChannel::~ExchangeMessageChannel() = default;

NS_IMETHODIMP ExchangeMessageChannel::GetName(nsACString& aName) {
  if (mURI) {
    return mURI->GetSpec(aName);
  }
  aName.Truncate();
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::IsPending(bool* aPending) {
  if (mReadRequest) {
    return mReadRequest->IsPending(aPending);
  }

  *aPending = mPending;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetStatus(nsresult* aStatus) {
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

NS_IMETHODIMP ExchangeMessageChannel::Cancel(nsresult aStatus) {
  if (mReadRequest) {
    return mReadRequest->Cancel(aStatus);
  }

  // We don't currently have a way to cancel the underlying necko request for
  // downloading the message.
  NS_WARNING("Cannot cancel an Exchange message channel while downloading");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP ExchangeMessageChannel::Suspend(void) {
  if (mReadRequest) {
    return mReadRequest->Suspend();
  }

  // We don't currently have a way to suspend the underlying necko request for
  // downloading the message.
  NS_WARNING("Cannot suspend an Exchange message channel while downloading");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP ExchangeMessageChannel::Resume(void) {
  if (mReadRequest) {
    return mReadRequest->Resume();
  }

  // We don't currently have a way to resume the underlying necko request for
  // downloading the message.
  NS_WARNING("Cannot resume an Exchange message channel while downloading");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP ExchangeMessageChannel::GetLoadGroup(nsILoadGroup** aLoadGroup) {
  if (mReadRequest) {
    return mReadRequest->GetLoadGroup(aLoadGroup);
  }

  NS_IF_ADDREF(*aLoadGroup = mLoadGroup);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetLoadGroup(nsILoadGroup* aLoadGroup) {
  if (mReadRequest) {
    return mReadRequest->SetLoadGroup(aLoadGroup);
  }

  mLoadGroup = aLoadGroup;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetLoadFlags(nsLoadFlags* aLoadFlags) {
  if (mReadRequest) {
    return mReadRequest->GetLoadFlags(aLoadFlags);
  }

  *aLoadFlags = mLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetLoadFlags(nsLoadFlags aLoadFlags) {
  if (mReadRequest) {
    return mReadRequest->SetLoadFlags(aLoadFlags);
  }

  mLoadFlags = aLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetTRRMode(nsIRequest::TRRMode* mode) {
  // `GetTRRModeImpl` only reads a value through calling `GetLoadFlags`, which
  // we already forward to the read request if it exists, so we don't need to
  // forward this call to.
  return GetTRRModeImpl(mode);
}

NS_IMETHODIMP ExchangeMessageChannel::SetTRRMode(nsIRequest::TRRMode mode) {
  // `GetTRRModeImpl` only sets a value through calling `SetLoadFlags`, which
  // we already forward to the read request if it exists, so we don't need to
  // forward this call to.
  return SetTRRModeImpl(mode);
}

NS_IMETHODIMP ExchangeMessageChannel::CancelWithReason(
    nsresult aStatus, const nsACString& aReason) {
  // While we could forward this call to the read request if we have it, the
  // only important action we want to perform on it is cancel it, which
  // `CancelWithReasonImpl` does. It also stores the cancellation reason on the
  // current channel, which is fine since consumers will always try to read it
  // from here.
  return CancelWithReasonImpl(aStatus, aReason);
}

NS_IMETHODIMP ExchangeMessageChannel::GetCanceledReason(
    nsACString& aCanceledReason) {
  // See the documentation to `CancelWithReason` for details on why we don't
  // forward this call to the read request.
  return GetCanceledReasonImpl(aCanceledReason);
}

NS_IMETHODIMP ExchangeMessageChannel::SetCanceledReason(
    const nsACString& aCanceledReason) {
  // See the documentation to `CancelWithReason` for details on why we don't
  // forward this call to the read request.
  return SetCanceledReasonImpl(aCanceledReason);
}

NS_IMETHODIMP ExchangeMessageChannel::GetOriginalURI(nsIURI** aOriginalURI) {
  NS_IF_ADDREF(*aOriginalURI = mURI);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetOriginalURI(nsIURI* aOriginalURI) {
  // There's no meaningful "original URI" for these requests.
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetURI(nsIURI** aURI) {
  NS_IF_ADDREF(*aURI = mURI);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetOwner(nsISupports** aOwner) {
  NS_IF_ADDREF(*aOwner = mOwner);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetOwner(nsISupports* aOwner) {
  mOwner = aOwner;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetNotificationCallbacks(
    nsIInterfaceRequestor** aNotificationCallbacks) {
  NS_IF_ADDREF(*aNotificationCallbacks = mNotificationCallbacks);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetNotificationCallbacks(
    nsIInterfaceRequestor* aNotificationCallbacks) {
  mNotificationCallbacks = aNotificationCallbacks;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetSecurityInfo(
    nsITransportSecurityInfo** aSecurityInfo) {
  // Security info does not make sense here since we're only pulling messages
  // from storage.
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP ExchangeMessageChannel::GetContentType(nsACString& aContentType) {
  aContentType.Assign(mContentType);

  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetContentType(
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

NS_IMETHODIMP ExchangeMessageChannel::GetContentCharset(
    nsACString& aContentCharset) {
  aContentCharset.Assign(mCharset);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetContentCharset(
    const nsACString& aContentCharset) {
  mCharset.Assign(aContentCharset);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetContentLength(
    int64_t* aContentLength) {
  *aContentLength = mContentLength;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetContentLength(int64_t aContentLength) {
  mContentLength = aContentLength;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::Open(nsIInputStream** _retval) {
  return NS_ImplementChannelOpen(this, _retval);
}

NS_IMETHODIMP ExchangeMessageChannel::AsyncOpen(nsIStreamListener* aListener) {
  mPending = false;

  nsAutoCString scheme;
  MOZ_TRY(mURI->GetScheme(scheme));

  nsAutoCString serviceId("@mozilla.org/messenger/messageservice;1?type=");
  if (scheme.EqualsLiteral("x-moz-ews")) {
    serviceId.AppendLiteral("ews");
  } else if (scheme.EqualsLiteral("x-moz-graph")) {
    serviceId.AppendLiteral("graph");
  } else {
    return nsresult::NS_ERROR_UNEXPECTED;
  }

  // Get the header and folder matching the URI.
  nsresult rv;
  nsCOMPtr<nsIMsgMessageService> msgService =
      do_GetService(serviceId.Data(), &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString spec;
  rv = mURI->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgService->MessageURIToMsgHdr(spec, getter_AddRefs(mHdr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> folder;
  rv = mHdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<IExchangeFolder> ewsFolder{do_QueryInterface(folder, &rv)};
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
  return ExchangeFetchMsgsToOffline(
      folder, {msgKey},
      [self = RefPtr(this), ewsFolder,
       listener = nsCOMPtr(aListener)](nsresult status) {
        if (NS_SUCCEEDED(status)) {
          // Let the folder know a message has been downloaded.
          ewsFolder->HandleDownloadedMessages();

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

NS_IMETHODIMP ExchangeMessageChannel::GetCanceled(bool* aCanceled) {
  nsCString canceledReason;
  nsresult rv = mReadRequest->GetCanceledReason(canceledReason);
  NS_ENSURE_SUCCESS(rv, rv);

  *aCanceled = canceledReason.IsEmpty();

  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetContentDisposition(
    uint32_t* aContentDisposition) {
  *aContentDisposition = mContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetContentDisposition(
    uint32_t aContentDisposition) {
  mContentDisposition = aContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetContentDispositionFilename(
    nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP ExchangeMessageChannel::SetContentDispositionFilename(
    const nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP ExchangeMessageChannel::GetContentDispositionHeader(
    nsACString& aContentDispositionHeader) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP ExchangeMessageChannel::GetLoadInfo(nsILoadInfo** aLoadInfo) {
  NS_IF_ADDREF(*aLoadInfo = mLoadInfo);
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetLoadInfo(nsILoadInfo* aLoadInfo) {
  mLoadInfo = aLoadInfo;
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::GetIsDocument(bool* aIsDocument) {
  return NS_GetIsDocumentChannel(this, aIsDocument);
}

NS_IMETHODIMP ExchangeMessageChannel::GetParentProcessChannelHandle(
    mozilla::dom::ParentProcessChannelHandle** aValue) {
  *aValue = do_AddRef(mParentProcessChannelHandle).take();
  return NS_OK;
}

NS_IMETHODIMP ExchangeMessageChannel::SetParentProcessChannelHandle(
    mozilla::dom::ParentProcessChannelHandle* aValue) {
  if (XRE_IsParentProcess()) {
    MOZ_ASSERT_UNREACHABLE(
        "SetParentProcessChannelHandle in the parent process would leak");
    return NS_ERROR_NOT_AVAILABLE;
  }

  mParentProcessChannelHandle = aValue;
  return NS_OK;
}

nsresult ExchangeMessageChannel::StartMessageReadFromStore(
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
