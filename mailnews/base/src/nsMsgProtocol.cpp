/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgProtocol.h"

#include "mozilla/dom/ParentProcessChannelHandle.h"
#include "msgCore.h"
#include "nsString.h"
#include "nsMemory.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgMailSession.h"
#include "nsITransportSecurityInfo.h"
#include "nsILoadGroup.h"
#include "nsILoadInfo.h"
#include "nsIIOService.h"
#include "nsNetUtil.h"
#include "nsIWebProgressListener.h"
#include "nsIPrompt.h"
#include "prprf.h"
#include "nsIStringBundle.h"
#include "nsThreadUtils.h"
#include "nsDirectoryServiceDefs.h"
#include "nsMsgUtils.h"
#include "nsILineInputStream.h"
#include "nsIMsgIncomingServer.h"
#include "nsIInputStreamPump.h"
#include "nsMimeTypes.h"
#include "mozilla/Components.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/SlicedInputStream.h"
#include "nsContentSecurityManager.h"
#include "nsPrintfCString.h"

using namespace mozilla;

NS_IMPL_ISUPPORTS_INHERITED(nsMsgProtocol, nsHashPropertyBag, nsIMailChannel,
                            nsIChannel, nsIStreamListener, nsIRequestObserver,
                            nsIRequest)

static char16_t* FormatStringWithHostNameByName(const char16_t* stringName,
                                                nsIMsgMailNewsUrl* msgUri);

nsMsgProtocol::nsMsgProtocol(nsIURI* aURL) {
  m_flags = 0;
  mLoadFlags = 0;
  m_socketIsOpen = false;
  mContentLength = -1;
  m_isChannel = false;
  mContentDisposition = nsIChannel::DISPOSITION_INLINE;

  mSuppressListenerNotifications = false;
  InitFromURI(aURL);
}

nsresult nsMsgProtocol::InitFromURI(nsIURI* aUrl) {
  m_url = aUrl;

  // Reset channel data in case the object is reused and initialised again.
  mCharset.Truncate();

  return NS_OK;
}

nsMsgProtocol::~nsMsgProtocol() {}

nsresult nsMsgProtocol::CloseSocket() {
  nsresult rv = NS_OK;
  // release all of our socket state
  m_socketIsOpen = false;
  // we need to call Cancel so that we remove the socket transport from the
  // mActiveTransportList.  see bug #30648
  if (m_request) {
    rv = m_request->Cancel(NS_BINDING_ABORTED);
  }
  m_request = nullptr;
  if (m_transport) {
    m_transport->Close(NS_BINDING_ABORTED);
    m_transport = nullptr;
  }

  return rv;
}

// Whenever data arrives from the connection, core netlib notifices the protocol
// by calling OnDataAvailable. We then read and process the incoming data from
// the input stream.
NS_IMETHODIMP nsMsgProtocol::OnDataAvailable(nsIRequest* request,
                                             nsIInputStream* inStr,
                                             uint64_t sourceOffset,
                                             uint32_t count) {
  AUTO_PROFILER_LABEL("nsMsgProtocol::OnDataAvailable", MAILNEWS);
  // right now, this really just means turn around and churn through the state
  // machine
  nsCOMPtr<nsIURI> uri;
  GetURI(getter_AddRefs(uri));

  return ProcessProtocolState(uri, inStr, sourceOffset, count);
}

NS_IMETHODIMP nsMsgProtocol::OnStartRequest(nsIRequest* request) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIURI> uri;
  GetURI(getter_AddRefs(uri));

  if (uri) {
    nsCOMPtr<nsIMsgMailNewsUrl> aMsgUrl = do_QueryInterface(uri);
    rv = aMsgUrl->SetUrlState(true, NS_OK);
    if (m_loadGroup)
      m_loadGroup->AddRequest(static_cast<nsIRequest*>(this),
                              nullptr /* context isupports */);
  }

  // if we are set up as a channel, we should notify our channel listener that
  // we are starting... so pass in ourself as the channel and not the underlying
  // socket or file channel the protocol happens to be using
  if (!mSuppressListenerNotifications && m_channelListener) {
    m_isChannel = true;
    rv = m_channelListener->OnStartRequest(this);
  }

  return rv;
}

void nsMsgProtocol::ShowAlertMessage(nsIMsgMailNewsUrl* aMsgUrl,
                                     nsresult aStatus) {
  const char16_t* errorString = nullptr;
  switch (aStatus) {
    case NS_ERROR_UNKNOWN_HOST:
    case NS_ERROR_UNKNOWN_PROXY_HOST:
      errorString = u"unknownHostError";
      break;
    case NS_ERROR_CONNECTION_REFUSED:
    case NS_ERROR_PROXY_CONNECTION_REFUSED:
      errorString = u"connectionRefusedError";
      break;
    case NS_ERROR_NET_TIMEOUT:
      errorString = u"netTimeoutError";
      break;
    case NS_ERROR_NET_RESET:
      errorString = u"netResetError";
      break;
    case NS_ERROR_NET_INTERRUPT:
      errorString = u"netInterruptError";
      break;
    case NS_ERROR_OFFLINE:
      // Don't alert when offline as that is already displayed in the UI.
      return;
    default:
      nsPrintfCString msg(
          "Unexpected status passed to ShowAlertMessage: %" PRIx32,
          static_cast<uint32_t>(aStatus));
      NS_WARNING(msg.get());
      return;
  }

  nsString errorMsg;
  errorMsg.Adopt(FormatStringWithHostNameByName(errorString, aMsgUrl));
  if (errorMsg.IsEmpty()) {
    errorMsg.AssignLiteral(u"[StringID ");
    errorMsg.Append(errorString);
    errorMsg.AppendLiteral(u"?]");
  }

  nsCOMPtr<nsIMsgMailSession> mailSession =
      mozilla::components::MailSession::Service();
  // A background operation has nobody to alert, so tell the mail session to
  // only call the listeners.
  bool interactive = false;
  nsresult rv = aMsgUrl->GetInteractive(&interactive);
  NS_ENSURE_SUCCESS_VOID(rv);
  bool silent = !interactive;

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = aMsgUrl->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS_VOID(rv);
  nsAutoCString serverKey;
  rv = server->GetKey(serverKey);
  NS_ENSURE_SUCCESS_VOID(rv);

  mailSession->AlertUser(errorMsg, serverKey, silent);
}

// stop binding is a "notification" informing us that the stream associated with
// aURL is going away.
NS_IMETHODIMP nsMsgProtocol::OnStopRequest(nsIRequest* request,
                                           nsresult aStatus) {
  AUTO_PROFILER_LABEL("nsMsgProtocol::OnStopRequest", MAILNEWS);
  nsresult rv = NS_OK;

  // if we are set up as a channel, we should notify our channel listener that
  // we are starting... so pass in ourself as the channel and not the underlying
  // socket or file channel the protocol happens to be using
  if (!mSuppressListenerNotifications && m_channelListener) {
    rv = m_channelListener->OnStopRequest(this, aStatus);
  }

  nsCOMPtr<nsIURI> uri;
  GetURI(getter_AddRefs(uri));

  if (uri) {
    nsCOMPtr<nsIMsgMailNewsUrl> msgUrl = do_QueryInterface(uri);
    rv = msgUrl->SetUrlState(false, aStatus);  // Always returns NS_OK.
    if (m_loadGroup)
      m_loadGroup->RemoveRequest(static_cast<nsIRequest*>(this), nullptr,
                                 aStatus);

    // !m_isChannel because if we're set up as a channel, then the remove
    // request above will handle alerting the user, so we don't need to.
    //
    // !NS_BINDING_ABORTED because we don't want to see an alert if the user
    // cancelled the operation.  also, we'll get here because we call Cancel()
    // to force removal of the nsSocketTransport.  see CloseSocket()
    // bugs #30775 and #30648 relate to this
    if (!m_isChannel && NS_FAILED(aStatus) && (aStatus != NS_BINDING_ABORTED))
      ShowAlertMessage(msgUrl, aStatus);
  }  // if we have a mailnews url.

  // Drop notification callbacks to prevent cycles.
  mCallbacks = nullptr;
  m_channelListener = nullptr;
  // Call CloseSocket(), in case we got here because the server dropped the
  // connection while reading, and we never get a chance to get back into
  // the protocol state machine via OnDataAvailable.
  if (m_socketIsOpen) CloseSocket();

  return rv;
}

nsresult nsMsgProtocol::LoadUrl(nsIURI* aURL, nsISupports* aConsumer) {
  // nsMsgProtocol implements nsIChannel, and all channels are required to
  // have non-null loadInfo. So if it's still unset, we've not been correctly
  // initialised.
  MOZ_ASSERT(m_loadInfo);

  // okay now kick us off to the next state...
  // our first state is a process state so drive the state machine...
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgMailNewsUrl> aMsgUrl = do_QueryInterface(aURL, &rv);

  if (NS_SUCCEEDED(rv) && aMsgUrl) {
    bool msgIsInLocalCache;
    aMsgUrl->GetMsgIsInLocalCache(&msgIsInLocalCache);

    // Set the url as a url currently being run...
    rv = aMsgUrl->SetUrlState(true, NS_OK);

    // if the url is given a stream consumer then we should use it to forward
    // calls to...
    if (!m_channelListener &&
        aConsumer)  // if we don't have a registered listener already
    {
      m_channelListener = do_QueryInterface(aConsumer);
      m_isChannel = true;
    }

    if (!m_socketIsOpen) {
      if (m_transport) {
        // open buffered, asynchronous input stream
        nsCOMPtr<nsIInputStream> stream;
        rv = m_transport->OpenInputStream(0, 0, 0, getter_AddRefs(stream));
        if (NS_FAILED(rv)) return rv;

        nsCOMPtr<nsIInputStreamPump> pump;
        rv = NS_NewInputStreamPump(getter_AddRefs(pump), stream.forget());
        if (NS_FAILED(rv)) return rv;

        m_request = pump;  // keep a reference to the pump so we can cancel it

        // Put us in a state where we are always notified of incoming data.
        // OnDataAvailable() will be called when that happens, which will
        // pass that data into ProcessProtocolState().
        rv = pump->AsyncRead(this);
        NS_ASSERTION(NS_SUCCEEDED(rv), "AsyncRead failed");
        m_socketIsOpen = true;  // mark the channel as open
      }
    } else if (!msgIsInLocalCache) {
      // The connection is already open so we should begin processing our url.
      rv = ProcessProtocolState(aURL, nullptr, 0, 0);
    }
  }

  return rv;
}

///////////////////////////////////////////////////////////////////////
// The rest of this file is mostly nsIChannel mumbo jumbo stuff
///////////////////////////////////////////////////////////////////////

nsresult nsMsgProtocol::SetUrl(nsIURI* aURL) {
  m_url = aURL;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetLoadGroup(nsILoadGroup* aLoadGroup) {
  m_loadGroup = aLoadGroup;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetTRRMode(nsIRequest::TRRMode* aTRRMode) {
  return GetTRRModeImpl(aTRRMode);
}

NS_IMETHODIMP nsMsgProtocol::SetTRRMode(nsIRequest::TRRMode aTRRMode) {
  return SetTRRModeImpl(aTRRMode);
}

NS_IMETHODIMP nsMsgProtocol::GetOriginalURI(nsIURI** aURI) {
  NS_IF_ADDREF(*aURI = m_originalUrl ? m_originalUrl : m_url);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetOriginalURI(nsIURI* aURI) {
  m_originalUrl = aURI;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetURI(nsIURI** aURI) {
  NS_IF_ADDREF(*aURI = m_url);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::Open(nsIInputStream** _retval) {
  nsCOMPtr<nsIStreamListener> listener;
  nsresult rv =
      nsContentSecurityManager::doContentSecurityCheck(this, listener);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_ImplementChannelOpen(this, _retval);
}

NS_IMETHODIMP nsMsgProtocol::AsyncOpen(nsIStreamListener* aListener) {
  mLoadFlags |= nsIChannel::LOAD_REPLACE;
  nsCOMPtr<nsIStreamListener> listener = aListener;
  nsresult rv =
      nsContentSecurityManager::doContentSecurityCheck(this, listener);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t port;
  rv = m_url->GetPort(&port);
  if (NS_FAILED(rv)) return rv;

  nsAutoCString scheme;
  rv = m_url->GetScheme(scheme);
  if (NS_FAILED(rv)) return rv;

  rv = NS_CheckPortSafety(port, scheme.get());
  if (NS_FAILED(rv)) return rv;

  // set the stream listener and then load the url
  m_isChannel = true;

  m_channelListener = listener;
  return LoadUrl(m_url, nullptr);
}

NS_IMETHODIMP nsMsgProtocol::GetLoadFlags(nsLoadFlags* aLoadFlags) {
  *aLoadFlags = mLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetLoadFlags(nsLoadFlags aLoadFlags) {
  mLoadFlags = aLoadFlags;
  return NS_OK;  // don't fail when trying to set this
}

NS_IMETHODIMP nsMsgProtocol::GetContentType(nsACString& aContentType) {
  // as url dispatching matures, we'll be intelligent and actually start
  // opening the url before specifying the content type. This will allow
  // us to optimize the case where the message url actual refers to
  // a part in the message that has a content type that is not message/rfc822

  if (mContentType.IsEmpty())
    aContentType.AssignLiteral("message/rfc822");
  else
    aContentType = mContentType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetContentType(const nsACString& aContentType) {
  nsAutoCString charset;
  nsresult rv =
      NS_ParseResponseContentType(aContentType, mContentType, charset);
  if (NS_FAILED(rv) || mContentType.IsEmpty())
    mContentType.AssignLiteral(UNKNOWN_CONTENT_TYPE);
  return rv;
}

NS_IMETHODIMP nsMsgProtocol::GetContentCharset(nsACString& aContentCharset) {
  aContentCharset.Assign(mCharset);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetContentCharset(
    const nsACString& aContentCharset) {
  mCharset.Assign(aContentCharset);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgProtocol::GetContentDisposition(uint32_t* aContentDisposition) {
  *aContentDisposition = mContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgProtocol::SetContentDisposition(uint32_t aContentDisposition) {
  mContentDisposition = aContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgProtocol::GetContentDispositionFilename(
    nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP
nsMsgProtocol::SetContentDispositionFilename(
    const nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP
nsMsgProtocol::GetContentDispositionHeader(
    nsACString& aContentDispositionHeader) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsMsgProtocol::GetContentLength(int64_t* aContentLength) {
  *aContentLength = mContentLength;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetContentLength(int64_t aContentLength) {
  mContentLength = aContentLength;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetSecurityInfo(
    nsITransportSecurityInfo** secInfo) {
  *secInfo = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetName(nsACString& result) {
  if (m_url) return m_url->GetSpec(result);
  result.Truncate();
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetOwner(nsISupports** aPrincipal) {
  NS_IF_ADDREF(*aPrincipal = mOwner);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetOwner(nsISupports* aPrincipal) {
  mOwner = aPrincipal;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetLoadGroup(nsILoadGroup** aLoadGroup) {
  NS_IF_ADDREF(*aLoadGroup = m_loadGroup);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetLoadInfo(nsILoadInfo** aLoadInfo) {
  NS_IF_ADDREF(*aLoadInfo = m_loadInfo);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetLoadInfo(nsILoadInfo* aLoadInfo) {
  m_loadInfo = aLoadInfo;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgProtocol::GetNotificationCallbacks(
    nsIInterfaceRequestor** aNotificationCallbacks) {
  NS_IF_ADDREF(*aNotificationCallbacks = mCallbacks.get());
  return NS_OK;
}

NS_IMETHODIMP
nsMsgProtocol::SetNotificationCallbacks(
    nsIInterfaceRequestor* aNotificationCallbacks) {
  mCallbacks = aNotificationCallbacks;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgProtocol::GetIsDocument(bool* aIsDocument) {
  return NS_GetIsDocumentChannel(this, aIsDocument);
}

////////////////////////////////////////////////////////////////////////////////
// From nsIRequest
////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsMsgProtocol::IsPending(bool* result) {
  *result = m_channelListener != nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::GetStatus(nsresult* status) {
  if (m_request) return m_request->GetStatus(status);

  *status = NS_OK;
  return *status;
}

NS_IMETHODIMP nsMsgProtocol::SetCanceledReason(const nsACString& aReason) {
  return SetCanceledReasonImpl(aReason);
}

NS_IMETHODIMP nsMsgProtocol::GetCanceledReason(nsACString& aReason) {
  return GetCanceledReasonImpl(aReason);
}

NS_IMETHODIMP nsMsgProtocol::CancelWithReason(nsresult aStatus,
                                              const nsACString& aReason) {
  return CancelWithReasonImpl(aStatus, aReason);
}

NS_IMETHODIMP nsMsgProtocol::Cancel(nsresult status) {
  if (m_request) return m_request->Cancel(status);

  NS_WARNING("no request to cancel");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsMsgProtocol::GetCanceled(bool* aCanceled) {
  nsresult status = NS_ERROR_FAILURE;
  GetStatus(&status);
  *aCanceled = NS_FAILED(status);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::Suspend() {
  if (m_request) return m_request->Suspend();

  NS_WARNING("no request to suspend");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsMsgProtocol::Resume() {
  if (m_request) return m_request->Resume();

  NS_WARNING("no request to resume");
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsMsgProtocol::GetParentProcessChannelHandle(
    mozilla::dom::ParentProcessChannelHandle** aValue) {
  *aValue = do_AddRef(mParentProcessChannelHandle).take();
  return NS_OK;
}

NS_IMETHODIMP nsMsgProtocol::SetParentProcessChannelHandle(
    mozilla::dom::ParentProcessChannelHandle* aValue) {
  if (XRE_IsParentProcess()) {
    MOZ_ASSERT_UNREACHABLE(
        "SetParentProcessChannelHandle in the parent process would leak");
    return NS_ERROR_NOT_AVAILABLE;
  }

  mParentProcessChannelHandle = aValue;
  return NS_OK;
}

char16_t* FormatStringWithHostNameByName(const char16_t* stringName,
                                         nsIMsgMailNewsUrl* msgUri) {
  if (!msgUri) return nullptr;

  nsresult rv;

  nsCOMPtr<nsIStringBundleService> sBundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(sBundleService, nullptr);

  nsCOMPtr<nsIStringBundle> sBundle;
  rv = sBundleService->CreateBundle(MSGS_URL, getter_AddRefs(sBundle));
  NS_ENSURE_SUCCESS(rv, nullptr);

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = msgUri->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, nullptr);

  nsCString hostname;
  rv = server->GetHostname(hostname);
  NS_ENSURE_SUCCESS(rv, nullptr);

  AutoTArray<nsString, 1> params;
  CopyASCIItoUTF16(hostname, *params.AppendElement());
  nsAutoString str;
  rv = sBundle->FormatStringFromName(NS_ConvertUTF16toUTF8(stringName).get(),
                                     params, str);
  NS_ENSURE_SUCCESS(rv, nullptr);

  return ToNewUnicode(str);
}
