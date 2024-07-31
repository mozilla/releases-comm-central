/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsMessageChannel.h"

#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "nsIMailChannel.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgIncomingServer.h"
#include "nsIStreamConverterService.h"
#include "nsIStreamListener.h"
#include "nsIURIMutator.h"
#include "nsMimeTypes.h"
#include "nsNetUtil.h"

NS_IMPL_ISUPPORTS(EwsMessageChannel, nsIMailChannel, nsIChannel, nsIRequest)

EwsMessageChannel::EwsMessageChannel(nsIURI* uri, bool shouldConvert)
    : m_isPending(true),
      m_status(NS_OK),
      m_loadFlags(nsIRequest::LOAD_NORMAL),
      m_uri(uri) {
  if (shouldConvert) {
    m_contentType.AssignLiteral(TEXT_HTML);
  } else {
    m_contentType.AssignLiteral(MESSAGE_RFC822);
  }

  m_charset.AssignLiteral("UTF-8");
}

EwsMessageChannel::~EwsMessageChannel() = default;

NS_IMETHODIMP EwsMessageChannel::GetName(nsACString& aName) {
  NS_WARNING("GetName");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::IsPending(bool* _retval) {
  *_retval = m_isPending;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetStatus(nsresult* aStatus) {
  *aStatus = m_status;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::Cancel(nsresult aStatus) {
  NS_WARNING("Cancel");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::Suspend(void) {
  NS_WARNING("Suspend");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::Resume(void) {
  NS_WARNING("Resume");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP EwsMessageChannel::GetLoadGroup(nsILoadGroup** aLoadGroup) {
  NS_IF_ADDREF(*aLoadGroup = m_loadGroup);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetLoadGroup(nsILoadGroup* aLoadGroup) {
  m_loadGroup = aLoadGroup;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetLoadFlags(nsLoadFlags* aLoadFlags) {
  *aLoadFlags = m_loadFlags;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetLoadFlags(nsLoadFlags aLoadFlags) {
  m_loadFlags = aLoadFlags;

  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetTRRMode(nsIRequest::TRRMode* _retval) {
  return GetTRRModeImpl(_retval);
}

NS_IMETHODIMP EwsMessageChannel::SetTRRMode(nsIRequest::TRRMode mode) {
  return SetTRRModeImpl(mode);
}

NS_IMETHODIMP EwsMessageChannel::CancelWithReason(nsresult aStatus,
                                                  const nsACString& aReason) {
  return CancelWithReasonImpl(aStatus, aReason);
}

NS_IMETHODIMP EwsMessageChannel::GetCanceledReason(
    nsACString& aCanceledReason) {
  return GetCanceledReasonImpl(aCanceledReason);
}

NS_IMETHODIMP EwsMessageChannel::SetCanceledReason(
    const nsACString& aCanceledReason) {
  return SetCanceledReasonImpl(aCanceledReason);
}

NS_IMETHODIMP EwsMessageChannel::GetOriginalURI(nsIURI** aOriginalURI) {
  NS_IF_ADDREF(*aOriginalURI = m_uri);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetOriginalURI(nsIURI* aOriginalURI) {
  // There's no meaningful "original URI" for these requests.
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetURI(nsIURI** aURI) {
  NS_IF_ADDREF(*aURI = m_uri);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetOwner(nsISupports** aOwner) {
  NS_IF_ADDREF(*aOwner = m_owner);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetOwner(nsISupports* aOwner) {
  m_owner = aOwner;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetNotificationCallbacks(
    nsIInterfaceRequestor** aNotificationCallbacks) {
  NS_IF_ADDREF(*aNotificationCallbacks = m_notificationCallbacks);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetNotificationCallbacks(
    nsIInterfaceRequestor* aNotificationCallbacks) {
  m_notificationCallbacks = aNotificationCallbacks;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetSecurityInfo(
    nsITransportSecurityInfo** aSecurityInfo) {
  NS_WARNING("GetSecurityInfo");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::GetContentType(nsACString& aContentType) {
  aContentType.Assign(m_contentType);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetContentType(
    const nsACString& aContentType) {
  nsresult rv =
      NS_ParseResponseContentType(aContentType, m_contentType, m_charset);

  if (NS_FAILED(rv) || m_contentType.IsEmpty()) {
    m_contentType.AssignLiteral(MESSAGE_RFC822);
  }

  if (NS_FAILED(rv) || m_charset.IsEmpty()) {
    m_charset.AssignLiteral("UTF-8");
  }

  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetContentCharset(
    nsACString& aContentCharset) {
  aContentCharset.Assign(m_charset);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetContentCharset(
    const nsACString& aContentCharset) {
  m_charset.Assign(aContentCharset);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetContentLength(int64_t* aContentLength) {
  NS_WARNING("GetContentLength");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::SetContentLength(int64_t aContentLength) {
  NS_WARNING("SetContentLength");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::Open(nsIInputStream** _retval) {
  return NS_ImplementChannelOpen(this, _retval);
}

NS_IMETHODIMP EwsMessageChannel::AsyncOpen(nsIStreamListener* aListener) {
  nsAutoCString path;
  nsresult rv = m_uri->GetFilePath(path);
  NS_ENSURE_SUCCESS(rv, rv);

  // Trim the leading '/' to get the EWS ID alone.
  auto ewsId = Substring(path, 1);

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // `FindServerByURI()` expects that the URI passed in has a scheme matching
  // the value returned by an incoming server's `GetType()` method. In our case,
  // that should be `ews`.
  nsCOMPtr<nsIURI> serverUri;
  rv = NS_MutateURI(m_uri)
           .SetScheme("ews"_ns)
           .SetPathQueryRef(ewsId)
           .Finalize(serverUri);

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = accountManager->FindServerByURI(serverUri, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsIncomingServer> ewsServer = do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<IEwsClient> client;
  rv = ewsServer->GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  // If the consumer requests HTML, we want to render the message (from its raw
  // Internet Message Format text) for display. Otherwise, we will return the
  // raw Internet Message Format (RFC 822/2822/5322).
  RefPtr<nsIStreamListener> listenerToUse = aListener;
  if (m_contentType.Equals(TEXT_HTML)) {
    nsresult rv;
    nsCOMPtr<nsIStreamConverterService> converter =
        do_GetService("@mozilla.org/streamConverters;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    // Wrap the consumer-provided listener in a stream converter and use the
    // listener it creates for further operations.
    rv = converter->AsyncConvertData(MESSAGE_RFC822, ANY_WILDCARD, aListener,
                                     static_cast<nsIChannel*>(this),
                                     getter_AddRefs(listenerToUse));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  m_status = client->GetMessage(ewsId, this, listenerToUse);
  NS_ENSURE_SUCCESS(m_status, m_status);

  m_isPending = false;

  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetCanceled(bool* aCanceled) {
  NS_WARNING("GetCanceled");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::GetContentDisposition(
    uint32_t* aContentDisposition) {
  *aContentDisposition = nsIChannel::DISPOSITION_INLINE;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetContentDisposition(
    uint32_t aContentDisposition) {
  NS_WARNING("SetContentDisposition");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::GetContentDispositionFilename(
    nsAString& aContentDispositionFilename) {
  NS_WARNING("GetContentDispositionFilename");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::SetContentDispositionFilename(
    const nsAString& aContentDispositionFilename) {
  NS_WARNING("SetContentDispositionFilename");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::GetContentDispositionHeader(
    nsACString& aContentDispositionHeader) {
  NS_WARNING("GetContentDispositionHeader");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsMessageChannel::GetLoadInfo(nsILoadInfo** aLoadInfo) {
  NS_IF_ADDREF(*aLoadInfo = m_loadInfo);
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::SetLoadInfo(nsILoadInfo* aLoadInfo) {
  m_loadInfo = aLoadInfo;
  return NS_OK;
}

NS_IMETHODIMP EwsMessageChannel::GetIsDocument(bool* aIsDocument) {
  NS_WARNING("GetIsDocument");
  return NS_ERROR_NOT_IMPLEMENTED;
}
