/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMsgMailNewsUrl.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgStatusFeedback.h"
#include "nsIMsgWindow.h"
#include "nsString.h"
#include "nsILoadGroup.h"
#include "nsIDocShell.h"
#include "nsIWebProgress.h"
#include "nsIWebProgressListener.h"
#include "nsIInterfaceRequestorUtils.h"
#include "nsIIOService.h"
#include "nsNetCID.h"
#include "nsIStreamListener.h"
#include "nsIOutputStream.h"
#include "nsIInputStream.h"
#include "nsNetUtil.h"
#include "nsIFile.h"
#include "prmem.h"
#include <time.h>
#include "nsMsgUtils.h"
#include "mozilla/Components.h"
#include "nsProxyRelease.h"
#include "mozilla/Encoding.h"
#include "nsDocShellLoadState.h"
#include "nsContentUtils.h"
#include "nsIObjectInputStream.h"
#include "nsIObjectOutputStream.h"
#include "nsIChannel.h"

nsMsgMailNewsUrl::nsMsgMailNewsUrl() {
  // nsIURI specific state
  m_runningUrl = false;
  m_updatingFolder = false;
  m_msgIsInLocalCache = false;
  m_suppressErrorMsgs = false;
  m_hasNormalizedOrigin = false;  // SetSpecInternal() will set this correctly.
  mMaxProgress = -1;
}

#define NOTIFY_URL_LISTENERS(propertyfunc_, params_)                \
  PR_BEGIN_MACRO                                                    \
  nsTObserverArray<nsCOMPtr<nsIUrlListener>>::ForwardIterator iter( \
      mUrlListeners);                                               \
  while (iter.HasMore()) {                                          \
    nsCOMPtr<nsIUrlListener> listener = iter.GetNext();             \
    listener->propertyfunc_ params_;                                \
  }                                                                 \
  PR_END_MACRO

nsMsgMailNewsUrl::~nsMsgMailNewsUrl() {
  // In IMAP this URL is created and destroyed on the imap thread,
  // so we must ensure that releases of XPCOM objects (which might be
  // implemented by non-threadsafe JS components) are released on the
  // main thread.
  NS_ReleaseOnMainThread("nsMsgMailNewsUrl::m_baseURL", m_baseURL.forget());
  NS_ReleaseOnMainThread("nsMsgMailNewsUrl::mMimeHeaders",
                         mMimeHeaders.forget());
  NS_ReleaseOnMainThread("nsMsgMailNewsUrl::m_searchSession",
                         m_searchSession.forget());

  nsTObserverArray<nsCOMPtr<nsIUrlListener>>::ForwardIterator iter(
      mUrlListeners);
  while (iter.HasMore()) {
    nsCOMPtr<nsIUrlListener> listener = iter.GetNext();
    if (listener)
      NS_ReleaseOnMainThread("nsMsgMailNewsUrl::mUrlListeners",
                             listener.forget());
  }
}

NS_IMPL_ADDREF(nsMsgMailNewsUrl)
NS_IMPL_RELEASE(nsMsgMailNewsUrl)

// We want part URLs to QI to nsIURIWithSpecialOrigin so we can give
// them a "normalized" origin. URLs that already have a "normalized"
// origin should not QI to nsIURIWithSpecialOrigin.
NS_INTERFACE_MAP_BEGIN(nsMsgMailNewsUrl)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMsgMailNewsUrl)
  NS_INTERFACE_MAP_ENTRY(nsIMsgMailNewsUrl)
  NS_INTERFACE_MAP_ENTRY(nsIURL)
  NS_INTERFACE_MAP_ENTRY(nsIURI)
  NS_INTERFACE_MAP_ENTRY(nsISerializable)
  NS_INTERFACE_MAP_ENTRY(nsIClassInfo)
  NS_INTERFACE_MAP_ENTRY_CONDITIONAL(nsIURIWithSpecialOrigin,
                                     m_hasNormalizedOrigin)
NS_INTERFACE_MAP_END

//--------------------------
// Support for serialization
//--------------------------
// nsMsgMailNewsUrl is only partly serialized by serializing the "base URL"
// which is an nsStandardURL, or by only serializing the Spec. This may
// cause problems in the future. See bug 1512356 and bug 1515337 for details,
// follow-up in bug 1512698.

NS_IMETHODIMP_(void)
nsMsgMailNewsUrl::Serialize(mozilla::ipc::URIParams& aParams) {
  m_baseURL->Serialize(aParams);
}

//----------------------------
// Support for nsISerializable
//----------------------------
NS_IMETHODIMP nsMsgMailNewsUrl::Read(nsIObjectInputStream* stream) {
  nsAutoCString urlstr;
  nsresult rv = NS_ReadOptionalCString(stream, urlstr);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIIOService> ioService = mozilla::components::IO::Service();
  NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIURI> url;
  rv = ioService->NewURI(urlstr, nullptr, nullptr, getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);
  m_baseURL = do_QueryInterface(url);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::Write(nsIObjectOutputStream* stream) {
  nsAutoCString urlstr;
  nsresult rv = m_baseURL->GetSpec(urlstr);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_WriteOptionalStringZ(stream, urlstr.get());
}

//-------------------------
// Support for nsIClassInfo
//-------------------------
NS_IMETHODIMP nsMsgMailNewsUrl::GetInterfaces(nsTArray<nsIID>& array) {
  array.Clear();
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetScriptableHelper(
    nsIXPCScriptable** _retval) {
  *_retval = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetContractID(nsACString& aContractID) {
  aContractID.SetIsVoid(true);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetClassDescription(
    nsACString& aClassDescription) {
  aClassDescription.SetIsVoid(true);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetClassID(nsCID** aClassID) {
  *aClassID = (nsCID*)moz_xmalloc(sizeof(nsCID));
  return GetClassIDNoAlloc(*aClassID);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetFlags(uint32_t* aFlags) {
  *aFlags = 0;
  return NS_OK;
}

#define NS_MSGMAILNEWSURL_CID \
  {0x3fdae3ab, 0x4ac1, 0x4ad4, {0xb2, 0x8a, 0x28, 0xd0, 0xfa, 0x36, 0x39, 0x29}}
static NS_DEFINE_CID(kNS_MSGMAILNEWSURL_CID, NS_MSGMAILNEWSURL_CID);
NS_IMETHODIMP nsMsgMailNewsUrl::GetClassIDNoAlloc(nsCID* aClassIDNoAlloc) {
  *aClassIDNoAlloc = kNS_MSGMAILNEWSURL_CID;
  return NS_OK;
}

//------------------------------------
// Support for nsIURIWithSpecialOrigin
//------------------------------------
NS_IMETHODIMP nsMsgMailNewsUrl::GetOrigin(nsIURI** aOrigin) {
  MOZ_ASSERT(m_hasNormalizedOrigin,
             "nsMsgMailNewsUrl::GetOrigin() can only be called for URLs with "
             "normalized spec");

  if (!m_normalizedOrigin) {
    nsCOMPtr<nsIMsgMessageUrl> msgUrl;
    QueryInterface(NS_GET_IID(nsIMsgMessageUrl), getter_AddRefs(msgUrl));

    nsAutoCString spec;
    if (!msgUrl || NS_FAILED(msgUrl->GetNormalizedSpec(spec))) {
      MOZ_ASSERT(false, "Can't get normalized spec");
      // just use the normal spec.
      GetSpec(spec);
    }

    nsresult rv = NS_NewURI(getter_AddRefs(m_normalizedOrigin), spec);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  NS_IF_ADDREF(*aOrigin = m_normalizedOrigin);
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// Begin nsIMsgMailNewsUrl specific support
////////////////////////////////////////////////////////////////////////////////////

nsresult nsMsgMailNewsUrl::GetUrlState(bool* aRunningUrl) {
  if (aRunningUrl) *aRunningUrl = m_runningUrl;

  return NS_OK;
}

nsresult nsMsgMailNewsUrl::SetUrlState(bool aRunningUrl, nsresult aExitCode) {
  // if we already knew this running state, return, unless the url was aborted
  if (m_runningUrl == aRunningUrl && aExitCode != NS_MSG_ERROR_URL_ABORTED) {
    return NS_OK;
  }
  m_runningUrl = aRunningUrl;
  nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;

  // put this back - we need it for urls that don't run through the doc loader
  if (NS_SUCCEEDED(GetStatusFeedback(getter_AddRefs(statusFeedback))) &&
      statusFeedback) {
    if (m_runningUrl)
      statusFeedback->StartMeteors();
    else {
      statusFeedback->ShowProgress(0);
      statusFeedback->StopMeteors();
    }
  }

  if (m_runningUrl) {
    NOTIFY_URL_LISTENERS(OnStartRunningUrl, (this));
  } else {
    NOTIFY_URL_LISTENERS(OnStopRunningUrl, (this, aExitCode));
    mUrlListeners.Clear();
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::RegisterListener(nsIUrlListener* aUrlListener) {
  NS_ENSURE_ARG_POINTER(aUrlListener);
  mUrlListeners.AppendElement(aUrlListener);
  return NS_OK;
}

nsresult nsMsgMailNewsUrl::UnRegisterListener(nsIUrlListener* aUrlListener) {
  NS_ENSURE_ARG_POINTER(aUrlListener);

  // Due to the way mailnews is structured, some listeners attempt to remove
  // themselves twice. This may in fact be an error in the coding, however
  // if they didn't do it as they do currently, then they could fail to remove
  // their listeners.
  mUrlListeners.RemoveElement(aUrlListener);

  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetServer(
    nsIMsgIncomingServer** aIncomingServer) {
  // mscott --> we could cache a copy of the server here....but if we did, we
  // run the risk of leaking the server if any single url gets leaked....of
  // course that shouldn't happen...but it could. so i'm going to look it up
  // every time and we can look at caching it later.

  nsresult rv;

  nsAutoCString urlstr;
  rv = m_baseURL->GetSpec(urlstr);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURL> url;
  rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
           .SetSpec(urlstr)
           .Finalize(url);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString scheme;
  rv = GetScheme(scheme);
  if (NS_SUCCEEDED(rv)) {
    if (scheme.EqualsLiteral("pop")) scheme.AssignLiteral("pop3");
    // we use "nntp" in the server list so translate it here.
    if (scheme.EqualsLiteral("news")) scheme.AssignLiteral("nntp");
    rv = NS_MutateURI(url).SetScheme(scheme).Finalize(url);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = accountManager->FindServerByURI(url, aIncomingServer);
    if (!*aIncomingServer && scheme.EqualsLiteral("imap")) {
      // look for any imap server with this host name so clicking on
      // other users folder urls will work. We could override this method
      // for imap urls, or we could make caching of servers work and
      // just set the server in the imap code for this case.
      rv = NS_MutateURI(url).SetUserPass(EmptyCString()).Finalize(url);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = accountManager->FindServerByURI(url, aIncomingServer);
    }
  }

  return rv;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetMsgWindow(nsIMsgWindow** aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aMsgWindow);
  *aMsgWindow = nullptr;

  nsCOMPtr<nsIMsgWindow> msgWindow(do_QueryReferent(m_msgWindowWeak));
  msgWindow.forget(aMsgWindow);
  return *aMsgWindow ? NS_OK : NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetMsgWindow(nsIMsgWindow* aMsgWindow) {
  m_msgWindowWeak = do_GetWeakReference(aMsgWindow);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetStatusFeedback(
    nsIMsgStatusFeedback** aMsgFeedback) {
  // note: it is okay to return a null status feedback and not return an error
  // it's possible the url really doesn't have status feedback
  *aMsgFeedback = nullptr;
  if (!m_statusFeedbackWeak) {
    nsCOMPtr<nsIMsgWindow> msgWindow(do_QueryReferent(m_msgWindowWeak));
    if (msgWindow) msgWindow->GetStatusFeedback(aMsgFeedback);
  } else {
    nsCOMPtr<nsIMsgStatusFeedback> statusFeedback(
        do_QueryReferent(m_statusFeedbackWeak));
    statusFeedback.forget(aMsgFeedback);
  }
  return *aMsgFeedback ? NS_OK : NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetStatusFeedback(
    nsIMsgStatusFeedback* aMsgFeedback) {
  if (aMsgFeedback) m_statusFeedbackWeak = do_GetWeakReference(aMsgFeedback);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetMaxProgress(int64_t* aMaxProgress) {
  *aMaxProgress = mMaxProgress;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetMaxProgress(int64_t aMaxProgress) {
  mMaxProgress = aMaxProgress;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetLoadGroup(nsILoadGroup** aLoadGroup) {
  *aLoadGroup = nullptr;
  // note: it is okay to return a null load group and not return an error
  // it's possible the url really doesn't have load group
  nsCOMPtr<nsILoadGroup> loadGroup(do_QueryReferent(m_loadGroupWeak));
  if (!loadGroup) {
    nsCOMPtr<nsIMsgWindow> msgWindow(do_QueryReferent(m_msgWindowWeak));
    if (msgWindow) {
      // XXXbz This is really weird... why are we getting some
      // random loadgroup we're not really a part of?
      nsCOMPtr<nsIDocShell> docShell;
      msgWindow->GetRootDocShell(getter_AddRefs(docShell));
      loadGroup = do_GetInterface(docShell);
      m_loadGroupWeak = do_GetWeakReference(loadGroup);
    }
  }
  loadGroup.forget(aLoadGroup);
  return *aLoadGroup ? NS_OK : NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetUpdatingFolder(bool* aResult) {
  NS_ENSURE_ARG(aResult);
  *aResult = m_updatingFolder;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetUpdatingFolder(bool updatingFolder) {
  m_updatingFolder = updatingFolder;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetMsgIsInLocalCache(bool* aMsgIsInLocalCache) {
  NS_ENSURE_ARG(aMsgIsInLocalCache);
  *aMsgIsInLocalCache = m_msgIsInLocalCache;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetMsgIsInLocalCache(bool aMsgIsInLocalCache) {
  m_msgIsInLocalCache = aMsgIsInLocalCache;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetSuppressErrorMsgs(bool* aSuppressErrorMsgs) {
  NS_ENSURE_ARG(aSuppressErrorMsgs);
  *aSuppressErrorMsgs = m_suppressErrorMsgs;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetSuppressErrorMsgs(bool aSuppressErrorMsgs) {
  m_suppressErrorMsgs = aSuppressErrorMsgs;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetErrorCode(nsACString& aErrorCode) {
  aErrorCode = m_errorCode;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetErrorCode(const nsACString& aErrorCode) {
  m_errorCode.Assign(aErrorCode);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetErrorMessage(nsAString& aErrorMessage) {
  aErrorMessage = m_errorMessage;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetErrorMessage(
    const nsAString& aErrorMessage) {
  m_errorMessage.Assign(aErrorMessage);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetSeeOtherURI(const nsACString& aSeeOtherURI) {
  m_seeOtherURI.Assign(aSeeOtherURI);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetSeeOtherURI(nsACString& aSeeOtherURI) {
  aSeeOtherURI = m_seeOtherURI;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::IsUrlType(uint32_t type, bool* isType) {
  // base class doesn't know about any specific types
  NS_ENSURE_ARG(isType);
  *isType = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetSearchSession(
    nsIMsgSearchSession* aSearchSession) {
  if (aSearchSession) m_searchSession = aSearchSession;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetSearchSession(
    nsIMsgSearchSession** aSearchSession) {
  NS_ENSURE_ARG(aSearchSession);
  NS_IF_ADDREF(*aSearchSession = m_searchSession);
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// End nsIMsgMailNewsUrl specific support
////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////
// Begin nsIURI support
////////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsMsgMailNewsUrl::GetSpec(nsACString& aSpec) {
  return m_baseURL->GetSpec(aSpec);
}

nsresult nsMsgMailNewsUrl::CreateURL(const nsACString& aSpec, nsIURL** aURL) {
  nsCOMPtr<nsIURL> url;
  nsresult rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
                    .SetSpec(aSpec)
                    .Finalize(url);
  NS_ENSURE_SUCCESS(rv, rv);
  url.forget(aURL);
  return NS_OK;
}

#define FILENAME_PART_LEN 10

nsresult nsMsgMailNewsUrl::SetSpecInternal(const nsACString& aSpec) {
  nsAutoCString spec(aSpec);
  // Parse out "filename" attribute if present.
  char *start, *end;
  start = PL_strcasestr(spec.BeginWriting(), "?filename=");
  if (!start) start = PL_strcasestr(spec.BeginWriting(), "&filename=");
  if (start) {  // Make sure we only get our own value.
    end = PL_strcasestr((char*)(start + FILENAME_PART_LEN), "&");
    if (end) {
      *end = 0;
      mAttachmentFileName = start + FILENAME_PART_LEN;
      *end = '&';
    } else
      mAttachmentFileName = start + FILENAME_PART_LEN;
  }

  // Now, set the rest.
  nsresult rv = CreateURL(aSpec, getter_AddRefs(m_baseURL));
  NS_ENSURE_SUCCESS(rv, rv);

  // Check whether the URL is in normalized form.
  nsCOMPtr<nsIMsgMessageUrl> msgUrl;
  QueryInterface(NS_GET_IID(nsIMsgMessageUrl), getter_AddRefs(msgUrl));

  nsAutoCString normalizedSpec;
  if (!msgUrl || NS_FAILED(msgUrl->GetNormalizedSpec(normalizedSpec))) {
    // If we can't get the normalized spec, never QI this to
    // nsIURIWithSpecialOrigin.
    m_hasNormalizedOrigin = false;
  } else {
    m_hasNormalizedOrigin = !spec.Equals(normalizedSpec);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetPrePath(nsACString& aPrePath) {
  return m_baseURL->GetPrePath(aPrePath);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetScheme(nsACString& aScheme) {
  return m_baseURL->GetScheme(aScheme);
}

nsresult nsMsgMailNewsUrl::SetScheme(const nsACString& aScheme) {
  return NS_MutateURI(m_baseURL).SetScheme(aScheme).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetUserPass(nsACString& aUserPass) {
  return m_baseURL->GetUserPass(aUserPass);
}

nsresult nsMsgMailNewsUrl::SetUserPass(const nsACString& aUserPass) {
  return NS_MutateURI(m_baseURL).SetUserPass(aUserPass).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetUsername(nsACString& aUsername) {
  /* note:  this will return an escaped string */
  return m_baseURL->GetUsername(aUsername);
}

nsresult nsMsgMailNewsUrl::SetUsername(const nsACString& aUsername) {
  return NS_MutateURI(m_baseURL).SetUsername(aUsername).Finalize(m_baseURL);
}

nsresult nsMsgMailNewsUrl::SetUsernameInternal(const nsACString& aUsername) {
  return NS_MutateURI(m_baseURL).SetUsername(aUsername).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetPassword(nsACString& aPassword) {
  return m_baseURL->GetPassword(aPassword);
}

nsresult nsMsgMailNewsUrl::SetPassword(const nsACString& aPassword) {
  return NS_MutateURI(m_baseURL).SetPassword(aPassword).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetHostPort(nsACString& aHostPort) {
  return m_baseURL->GetHostPort(aHostPort);
}

nsresult nsMsgMailNewsUrl::SetHostPort(const nsACString& aHostPort) {
  return NS_MutateURI(m_baseURL).SetHostPort(aHostPort).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetHost(nsACString& aHost) {
  return m_baseURL->GetHost(aHost);
}

nsresult nsMsgMailNewsUrl::SetHost(const nsACString& aHost) {
  return NS_MutateURI(m_baseURL).SetHost(aHost).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetPort(int32_t* aPort) {
  return m_baseURL->GetPort(aPort);
}

nsresult nsMsgMailNewsUrl::SetPort(int32_t aPort) {
  return NS_MutateURI(m_baseURL).SetPort(aPort).Finalize(m_baseURL);
}

nsresult nsMsgMailNewsUrl::SetPortInternal(int32_t aPort) {
  return NS_MutateURI(m_baseURL).SetPort(aPort).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetPathQueryRef(nsACString& aPath) {
  return m_baseURL->GetPathQueryRef(aPath);
}

nsresult nsMsgMailNewsUrl::SetPathQueryRef(const nsACString& aPath) {
  return NS_MutateURI(m_baseURL).SetPathQueryRef(aPath).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetAsciiHost(nsACString& aHostA) {
  return m_baseURL->GetAsciiHost(aHostA);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetAsciiHostPort(nsACString& aHostPortA) {
  return m_baseURL->GetAsciiHostPort(aHostPortA);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetAsciiSpec(nsACString& aSpecA) {
  return m_baseURL->GetAsciiSpec(aSpecA);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetBaseURI(nsIURI** aBaseURI) {
  NS_ENSURE_ARG_POINTER(aBaseURI);
  return m_baseURL->QueryInterface(NS_GET_IID(nsIURI), (void**)aBaseURI);
}

NS_IMETHODIMP nsMsgMailNewsUrl::Equals(nsIURI* other, bool* _retval) {
  // The passed-in URI might be a mail news url. Pass our inner URL to its
  // Equals method. The other mail news url will then pass its inner URL to
  // to the Equals method of our inner URL. Other URIs will return false.
  if (other) return other->Equals(m_baseURL, _retval);

  return m_baseURL->Equals(other, _retval);
}

NS_IMETHODIMP nsMsgMailNewsUrl::EqualsExceptRef(nsIURI* other, bool* result) {
  // The passed-in URI might be a mail news url. Pass our inner URL to its
  // Equals method. The other mail news url will then pass its inner URL to
  // to the Equals method of our inner URL. Other URIs will return false.
  if (other) return other->EqualsExceptRef(m_baseURL, result);

  return m_baseURL->EqualsExceptRef(other, result);
}

NS_IMETHODIMP
nsMsgMailNewsUrl::GetSpecIgnoringRef(nsACString& result) {
  return m_baseURL->GetSpecIgnoringRef(result);
}

NS_IMETHODIMP
nsMsgMailNewsUrl::GetDisplaySpec(nsACString& aUnicodeSpec) {
  return m_baseURL->GetDisplaySpec(aUnicodeSpec);
}

NS_IMETHODIMP
nsMsgMailNewsUrl::GetDisplayHostPort(nsACString& aHostPort) {
  return m_baseURL->GetDisplayHostPort(aHostPort);
}

NS_IMETHODIMP
nsMsgMailNewsUrl::GetDisplayHost(nsACString& aHost) {
  return m_baseURL->GetDisplayHost(aHost);
}

NS_IMETHODIMP
nsMsgMailNewsUrl::GetDisplayPrePath(nsACString& aPrePath) {
  return m_baseURL->GetDisplayPrePath(aPrePath);
}

NS_IMETHODIMP
nsMsgMailNewsUrl::GetHasRef(bool* result) {
  return m_baseURL->GetHasRef(result);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetHasUserPass(bool* aHasUserPass) {
  nsAutoCString username;
  GetUsername(username);
  nsAutoCString password;
  GetPassword(password);
  *aHasUserPass = !username.IsEmpty() || !password.IsEmpty();
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SchemeIs(const char* aScheme, bool* _retval) {
  return m_baseURL->SchemeIs(aScheme, _retval);
}

nsresult nsMsgMailNewsUrl::Clone(nsIURI** _retval) {
  nsresult rv;
  nsAutoCString urlSpec;
  nsCOMPtr<nsIIOService> ioService = mozilla::components::IO::Service();
  NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);
  rv = GetSpec(urlSpec);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIURI> newUri;
  rv = ioService->NewURI(urlSpec, nullptr, nullptr, getter_AddRefs(newUri));
  NS_ENSURE_SUCCESS(rv, rv);

  // add the msg window to the cloned url
  nsCOMPtr<nsIMsgWindow> msgWindow(do_QueryReferent(m_msgWindowWeak));
  if (msgWindow) {
    nsCOMPtr<nsIMsgMailNewsUrl> msgMailNewsUrl = do_QueryInterface(newUri, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    msgMailNewsUrl->SetMsgWindow(msgWindow);
  }

  newUri.forget(_retval);
  return rv;
}

NS_IMETHODIMP nsMsgMailNewsUrl::Resolve(const nsACString& relativePath,
                                        nsACString& result) {
  // only resolve anchor urls....i.e. urls which start with '#' against the
  // mailnews url... everything else shouldn't be resolved against mailnews
  // urls.
  nsresult rv = NS_OK;

  if (relativePath.IsEmpty()) {
    // Return base URL.
    rv = GetSpec(result);
  } else if (!relativePath.IsEmpty() &&
             relativePath.First() == '#')  // an anchor
  {
    rv = m_baseURL->Resolve(relativePath, result);
  } else {
    // if relativePath is a complete url with it's own scheme then allow it...
    nsCOMPtr<nsIIOService> ioService = mozilla::components::IO::Service();
    NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);
    nsAutoCString scheme;

    rv = ioService->ExtractScheme(relativePath, scheme);
    // if we have a fully qualified scheme then pass the relative path back as
    // the result
    if (NS_SUCCEEDED(rv) && !scheme.IsEmpty()) {
      result = relativePath;
      rv = NS_OK;
    } else {
      result.Truncate();
      rv = NS_ERROR_FAILURE;
    }
  }

  return rv;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetDirectory(nsACString& aDirectory) {
  return m_baseURL->GetDirectory(aDirectory);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetFileName(nsACString& aFileName) {
  if (!mAttachmentFileName.IsEmpty()) {
    aFileName = mAttachmentFileName;
    return NS_OK;
  }
  return m_baseURL->GetFileName(aFileName);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetFileBaseName(nsACString& aFileBaseName) {
  return m_baseURL->GetFileBaseName(aFileBaseName);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetFileExtension(nsACString& aFileExtension) {
  if (!mAttachmentFileName.IsEmpty()) {
    int32_t pos = mAttachmentFileName.RFindChar(char16_t('.'));
    if (pos > 0)
      aFileExtension =
          Substring(mAttachmentFileName, pos + 1 /* skip the '.' */);
    return NS_OK;
  }
  return m_baseURL->GetFileExtension(aFileExtension);
}

nsresult nsMsgMailNewsUrl::SetFileNameInternal(const nsACString& aFileName) {
  mAttachmentFileName = aFileName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetQuery(nsACString& aQuery) {
  return m_baseURL->GetQuery(aQuery);
}

nsresult nsMsgMailNewsUrl::SetQuery(const nsACString& aQuery) {
  return NS_MutateURI(m_baseURL).SetQuery(aQuery).Finalize(m_baseURL);
}

nsresult nsMsgMailNewsUrl::SetQueryInternal(const nsACString& aQuery) {
  return NS_MutateURI(m_baseURL).SetQuery(aQuery).Finalize(m_baseURL);
}

nsresult nsMsgMailNewsUrl::SetQueryWithEncoding(
    const nsACString& aQuery, const mozilla::Encoding* aEncoding) {
  return NS_MutateURI(m_baseURL)
      .SetQueryWithEncoding(aQuery, aEncoding)
      .Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetHasQuery(bool* aHasQuery) {
  return m_baseURL->GetHasQuery(aHasQuery);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetRef(nsACString& aRef) {
  return m_baseURL->GetRef(aRef);
}

nsresult nsMsgMailNewsUrl::SetRef(const nsACString& aRef) {
  return NS_MutateURI(m_baseURL).SetRef(aRef).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetFilePath(nsACString& o_DirFile) {
  return m_baseURL->GetFilePath(o_DirFile);
}

nsresult nsMsgMailNewsUrl::SetFilePath(const nsACString& i_DirFile) {
  return NS_MutateURI(m_baseURL).SetFilePath(i_DirFile).Finalize(m_baseURL);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetCommonBaseSpec(nsIURI* uri2,
                                                  nsACString& result) {
  return m_baseURL->GetCommonBaseSpec(uri2, result);
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetRelativeSpec(nsIURI* uri2,
                                                nsACString& result) {
  return m_baseURL->GetRelativeSpec(uri2, result);
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetMemCacheEntry(nsICacheEntry* memCacheEntry) {
  m_memCacheEntry = memCacheEntry;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetMemCacheEntry(
    nsICacheEntry** memCacheEntry) {
  NS_ENSURE_ARG(memCacheEntry);
  nsresult rv = NS_OK;

  if (m_memCacheEntry) {
    NS_ADDREF(*memCacheEntry = m_memCacheEntry);
  } else {
    *memCacheEntry = nullptr;
    return NS_ERROR_NULL_POINTER;
  }

  return rv;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetMimeHeaders(nsIMimeHeaders** mimeHeaders) {
  NS_ENSURE_ARG_POINTER(mimeHeaders);
  NS_IF_ADDREF(*mimeHeaders = mMimeHeaders);
  return (mMimeHeaders) ? NS_OK : NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetMimeHeaders(nsIMimeHeaders* mimeHeaders) {
  mMimeHeaders = mimeHeaders;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::LoadURI(nsIDocShell* docShell,
                                        uint32_t aLoadFlags) {
  NS_ENSURE_ARG_POINTER(docShell);
  RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(this);
  loadState->SetLoadFlags(aLoadFlags);
  loadState->SetLoadType(MAKE_LOAD_TYPE(LOAD_NORMAL, aLoadFlags));
  loadState->SetFirstParty(false);
  loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
  return docShell->LoadURI(loadState, false);
}

#define SAVE_BUF_SIZE FILE_IO_BUFFER_SIZE
class nsMsgSaveAsListener : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  nsMsgSaveAsListener(nsIFile* aFile, bool addDummyEnvelope);
  nsresult SetupMsgWriteStream(nsIFile* aFile, bool addDummyEnvelope);

 protected:
  virtual ~nsMsgSaveAsListener();
  nsCOMPtr<nsIOutputStream> m_outputStream;
  nsCOMPtr<nsIFile> m_outputFile;
  bool m_addDummyEnvelope;
  bool m_writtenData;
  uint32_t m_leftOver;
  char m_dataBuffer[SAVE_BUF_SIZE +
                    1];  // temporary buffer for this save operation
};

NS_IMPL_ISUPPORTS(nsMsgSaveAsListener, nsIStreamListener, nsIRequestObserver)

nsMsgSaveAsListener::nsMsgSaveAsListener(nsIFile* aFile,
                                         bool addDummyEnvelope) {
  m_outputFile = aFile;
  m_writtenData = false;
  m_addDummyEnvelope = addDummyEnvelope;
  m_leftOver = 0;
}

nsMsgSaveAsListener::~nsMsgSaveAsListener() {}

NS_IMETHODIMP nsMsgSaveAsListener::OnStartRequest(nsIRequest* request) {
  return NS_OK;
}

NS_IMETHODIMP
nsMsgSaveAsListener::OnStopRequest(nsIRequest* request, nsresult aStatus) {
  if (m_outputStream) {
    m_outputStream->Flush();
    m_outputStream->Close();
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgSaveAsListener::OnDataAvailable(nsIRequest* request,
                                                   nsIInputStream* inStream,
                                                   uint64_t srcOffset,
                                                   uint32_t count) {
  nsresult rv;
  uint64_t available;
  rv = inStream->Available(&available);
  if (!m_writtenData) {
    m_writtenData = true;
    rv = SetupMsgWriteStream(m_outputFile, m_addDummyEnvelope);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  bool useCanonicalEnding = false;
  // We know the request is an nsIChannel we can get a URI from, but this is
  // probably bad form. See Bug 1528662.
  nsCOMPtr<nsIChannel> channel = do_QueryInterface(request, &rv);
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rv),
                       "error QI nsIRequest to nsIChannel failed");
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIURI> uri;
  rv = channel->GetURI(getter_AddRefs(uri));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(uri);
  if (msgUrl) msgUrl->GetCanonicalLineEnding(&useCanonicalEnding);

  const char* lineEnding = (useCanonicalEnding) ? CRLF : MSG_LINEBREAK;
  uint32_t lineEndingLength = (useCanonicalEnding) ? 2 : MSG_LINEBREAK_LEN;

  uint32_t readCount, maxReadCount = SAVE_BUF_SIZE - m_leftOver;
  uint32_t writeCount;
  char *start, *end, lastCharInPrevBuf = '\0';
  uint32_t linebreak_len = 0;

  while (count > 0) {
    if (count < maxReadCount) maxReadCount = count;
    rv = inStream->Read(m_dataBuffer + m_leftOver, maxReadCount, &readCount);
    if (NS_FAILED(rv)) return rv;

    m_leftOver += readCount;
    m_dataBuffer[m_leftOver] = '\0';

    start = m_dataBuffer;
    // make sure we don't insert another LF, accidentally, by ignoring
    // second half of CRLF spanning blocks.
    if (lastCharInPrevBuf == '\r' && *start == '\n') start++;

    end = PL_strpbrk(start, "\r\n");
    if (end) linebreak_len = (end[0] == '\r' && end[1] == '\n') ? 2 : 1;

    count -= readCount;
    maxReadCount = SAVE_BUF_SIZE - m_leftOver;

    if (!end && count > maxReadCount)
      // must be a very very long line; sorry cannot handle it
      return NS_ERROR_FAILURE;

    while (start && end) {
      if (m_outputStream && PL_strncasecmp(start, "X-Mozilla-Status:", 17) &&
          PL_strncasecmp(start, "X-Mozilla-Status2:", 18) &&
          PL_strncmp(start, "From - ", 7)) {
        rv = m_outputStream->Write(start, end - start, &writeCount);
        nsresult tmp =
            m_outputStream->Write(lineEnding, lineEndingLength, &writeCount);
        if (NS_FAILED(tmp)) {
          rv = tmp;
        }
      }
      start = end + linebreak_len;
      if (start >= m_dataBuffer + m_leftOver) {
        maxReadCount = SAVE_BUF_SIZE;
        m_leftOver = 0;
        break;
      }
      end = PL_strpbrk(start, "\r\n");
      if (end) linebreak_len = (end[0] == '\r' && end[1] == '\n') ? 2 : 1;
      if (start && !end) {
        m_leftOver -= (start - m_dataBuffer);
        memcpy(m_dataBuffer, start,
               m_leftOver + 1);  // including null
        maxReadCount = SAVE_BUF_SIZE - m_leftOver;
      }
    }
    if (NS_FAILED(rv)) return rv;
    if (end) lastCharInPrevBuf = *end;
  }
  return rv;

  //  rv = m_outputStream->WriteFrom(inStream, std::min(available, count),
  //  &bytesWritten);
}

nsresult nsMsgSaveAsListener::SetupMsgWriteStream(nsIFile* aFile,
                                                  bool addDummyEnvelope) {
  // If the file already exists, delete it, but do this before
  // getting the outputstream.
  // Due to bug 328027, the nsSaveMsgListener created in
  // nsMessenger::SaveAs now opens the stream on the nsIFile
  // object, thus creating an empty file. Actual save operations for
  // IMAP and NNTP use this nsMsgSaveAsListener here, though, so we
  // have to close the stream before deleting the file, else data
  // would still be written happily into a now non-existing file.
  // (Windows doesn't care, btw, just unixoids do...)
  aFile->Remove(false);

  nsresult rv = MsgNewBufferedFileOutputStream(getter_AddRefs(m_outputStream),
                                               aFile, -1, 0666);
  NS_ENSURE_SUCCESS(rv, rv);

  if (m_outputStream && addDummyEnvelope) {
    nsAutoCString result;
    uint32_t writeCount;

    time_t now = time((time_t*)0);
    char* ct = ctime(&now);
    // Remove the ending new-line character.
    ct[24] = '\0';
    result = "From - ";
    result += ct;
    result += MSG_LINEBREAK;
    m_outputStream->Write(result.get(), result.Length(), &writeCount);

    result = "X-Mozilla-Status: 0001";
    result += MSG_LINEBREAK;
    result += "X-Mozilla-Status2: 00000000";
    result += MSG_LINEBREAK;
    m_outputStream->Write(result.get(), result.Length(), &writeCount);
  }

  return rv;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetSaveAsListener(
    bool addDummyEnvelope, nsIFile* aFile, nsIStreamListener** aSaveListener) {
  NS_ENSURE_ARG_POINTER(aSaveListener);
  nsMsgSaveAsListener* saveAsListener =
      new nsMsgSaveAsListener(aFile, addDummyEnvelope);
  return saveAsListener->QueryInterface(NS_GET_IID(nsIStreamListener),
                                        (void**)aSaveListener);
}

NS_IMETHODIMP
nsMsgMailNewsUrl::SetFailedSecInfo(nsITransportSecurityInfo* secInfo) {
  mFailedSecInfo = secInfo;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetFailedSecInfo(
    nsITransportSecurityInfo** secInfo) {
  NS_ENSURE_ARG_POINTER(secInfo);
  NS_IF_ADDREF(*secInfo = mFailedSecInfo);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMailNewsUrl::SetFolder(nsIMsgFolder* /* aFolder */) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgMailNewsUrl::GetFolder(nsIMsgFolder** /* aFolder */) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMPL_ISUPPORTS(nsMsgMailNewsUrl::Mutator, nsIURISetters, nsIURIMutator)

NS_IMETHODIMP
nsMsgMailNewsUrl::Mutate(nsIURIMutator** aMutator) {
  RefPtr<nsMsgMailNewsUrl::Mutator> mutator = new nsMsgMailNewsUrl::Mutator();
  nsresult rv = mutator->InitFromURI(this);
  if (NS_FAILED(rv)) {
    return rv;
  }
  mutator.forget(aMutator);
  return NS_OK;
}
