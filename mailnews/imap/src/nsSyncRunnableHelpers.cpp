/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsSyncRunnableHelpers.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgWindow.h"
#include "nsImapMailFolder.h"

#include "mozilla/Monitor.h"

NS_IMPL_ISUPPORTS(StreamListenerProxy, nsIStreamListener)
NS_IMPL_ISUPPORTS(ImapMailFolderSinkProxy, nsIImapMailFolderSink)
NS_IMPL_ISUPPORTS(ImapServerSinkProxy, nsIImapServerSink)
NS_IMPL_ISUPPORTS(ImapMessageSinkProxy,
                              nsIImapMessageSink)
NS_IMPL_ISUPPORTS(ImapProtocolSinkProxy,
                              nsIImapProtocolSink)
namespace {

// Traits class for a reference type, specialized for parameters which are
// already references.
template<typename T>
struct RefType
{
  typedef T& type;
};

template<>
struct RefType<nsAString&>
{
  typedef nsAString& type;
};

template<>
struct RefType<const nsAString&>
{
  typedef const nsAString& type;
};

template<>
struct RefType<nsACString&>
{
  typedef nsACString& type;
};

template<>
struct RefType<const nsACString&>
{
  typedef const nsACString& type;
};

template<>
struct RefType<const nsIID&>
{
  typedef const nsIID& type;
};

class SyncRunnableBase : public nsRunnable
{
public:
  nsresult Result() {
    return mResult;
  }

  mozilla::Monitor& Monitor() {
    return mMonitor;
  }

protected:
  SyncRunnableBase()
    : mResult(NS_ERROR_UNEXPECTED)
    , mMonitor("SyncRunnableBase")
  { }

  nsresult mResult;
  mozilla::Monitor mMonitor;
};

template<typename Receiver>
class SyncRunnable0 : public SyncRunnableBase
{
public:
  typedef nsresult (NS_STDCALL Receiver::*ReceiverMethod)();

  SyncRunnable0(Receiver* receiver, ReceiverMethod method)
    : mReceiver(receiver)
    , mMethod(method)
  { }

  NS_IMETHOD Run() {
    mResult = (mReceiver->*mMethod)();
    mozilla::MonitorAutoLock(mMonitor).Notify();
    return NS_OK;
  }

private:
  Receiver* mReceiver;
  ReceiverMethod mMethod;
};


template<typename Receiver, typename Arg1>
class SyncRunnable1 : public SyncRunnableBase
{
public:
  typedef nsresult (NS_STDCALL Receiver::*ReceiverMethod)(Arg1);
  typedef typename RefType<Arg1>::type Arg1Ref;

  SyncRunnable1(Receiver* receiver, ReceiverMethod method,
                Arg1Ref arg1)
    : mReceiver(receiver)
    , mMethod(method)
    , mArg1(arg1)
  { }

  NS_IMETHOD Run() {
    mResult = (mReceiver->*mMethod)(mArg1);
    mozilla::MonitorAutoLock(mMonitor).Notify();
    return NS_OK;
  }

private:
  Receiver* mReceiver;
  ReceiverMethod mMethod;
  Arg1Ref mArg1;
};

template<typename Receiver, typename Arg1, typename Arg2>
class SyncRunnable2 : public SyncRunnableBase
{
public:
  typedef nsresult (NS_STDCALL Receiver::*ReceiverMethod)(Arg1, Arg2);
  typedef typename RefType<Arg1>::type Arg1Ref;
  typedef typename RefType<Arg2>::type Arg2Ref;

  SyncRunnable2(Receiver* receiver, ReceiverMethod method,
                Arg1Ref arg1, Arg2Ref arg2)
    : mReceiver(receiver)
    , mMethod(method)
    , mArg1(arg1)
    , mArg2(arg2)
  { }

  NS_IMETHOD Run() {
    mResult = (mReceiver->*mMethod)(mArg1, mArg2);
    mozilla::MonitorAutoLock(mMonitor).Notify();
    return NS_OK;
  }

private:
  Receiver* mReceiver;
  ReceiverMethod mMethod;
  Arg1Ref mArg1;
  Arg2Ref mArg2;
};

template<typename Receiver, typename Arg1, typename Arg2, typename Arg3>
class SyncRunnable3 : public SyncRunnableBase
{
public:
  typedef nsresult (NS_STDCALL Receiver::*ReceiverMethod)(Arg1, Arg2, Arg3);
  typedef typename RefType<Arg1>::type Arg1Ref;
  typedef typename RefType<Arg2>::type Arg2Ref;
  typedef typename RefType<Arg3>::type Arg3Ref;

  SyncRunnable3(Receiver* receiver, ReceiverMethod method,
                Arg1Ref arg1, Arg2Ref arg2, Arg3Ref arg3)
    : mReceiver(receiver)
    , mMethod(method)
    , mArg1(arg1)
    , mArg2(arg2)
    , mArg3(arg3)
  { }

  NS_IMETHOD Run() {
    mResult = (mReceiver->*mMethod)(mArg1, mArg2, mArg3);
    mozilla::MonitorAutoLock(mMonitor).Notify();
    return NS_OK;
  }

private:
  Receiver* mReceiver;
  ReceiverMethod mMethod;
  Arg1Ref mArg1;
  Arg2Ref mArg2;
  Arg3Ref mArg3;
};

template<typename Receiver, typename Arg1, typename Arg2, typename Arg3,
         typename Arg4>
class SyncRunnable4 : public SyncRunnableBase
{
public:
  typedef nsresult (NS_STDCALL Receiver::*ReceiverMethod)(Arg1, Arg2, Arg3, Arg4);
  typedef typename RefType<Arg1>::type Arg1Ref;
  typedef typename RefType<Arg2>::type Arg2Ref;
  typedef typename RefType<Arg3>::type Arg3Ref;
  typedef typename RefType<Arg4>::type Arg4Ref;

  SyncRunnable4(Receiver* receiver, ReceiverMethod method,
                Arg1Ref arg1, Arg2Ref arg2, Arg3Ref arg3, Arg4Ref arg4)
    : mReceiver(receiver)
    , mMethod(method)
    , mArg1(arg1)
    , mArg2(arg2)
    , mArg3(arg3)
    , mArg4(arg4)
  { }

  NS_IMETHOD Run() {
    mResult = (mReceiver->*mMethod)(mArg1, mArg2, mArg3, mArg4);
    mozilla::MonitorAutoLock(mMonitor).Notify();
    return NS_OK;
  }

private:
  Receiver* mReceiver;
  ReceiverMethod mMethod;
  Arg1Ref mArg1;
  Arg2Ref mArg2;
  Arg3Ref mArg3;
  Arg4Ref mArg4;
};

template<typename Receiver, typename Arg1, typename Arg2, typename Arg3,
         typename Arg4, typename Arg5>
class SyncRunnable5 : public SyncRunnableBase
{
public:
  typedef nsresult (NS_STDCALL Receiver::*ReceiverMethod)(Arg1, Arg2, Arg3, Arg4, Arg5);
  typedef typename RefType<Arg1>::type Arg1Ref;
  typedef typename RefType<Arg2>::type Arg2Ref;
  typedef typename RefType<Arg3>::type Arg3Ref;
  typedef typename RefType<Arg4>::type Arg4Ref;
  typedef typename RefType<Arg5>::type Arg5Ref;

  SyncRunnable5(Receiver* receiver, ReceiverMethod method,
                Arg1Ref arg1, Arg2Ref arg2, Arg3Ref arg3, Arg4Ref arg4, Arg5Ref arg5)
    : mReceiver(receiver)
    , mMethod(method)
    , mArg1(arg1)
    , mArg2(arg2)
    , mArg3(arg3)
    , mArg4(arg4)
    , mArg5(arg5)
  { }

  NS_IMETHOD Run() {
    mResult = (mReceiver->*mMethod)(mArg1, mArg2, mArg3, mArg4, mArg5);
    mozilla::MonitorAutoLock(mMonitor).Notify();
    return NS_OK;
  }

private:
  Receiver* mReceiver;
  ReceiverMethod mMethod;
  Arg1Ref mArg1;
  Arg2Ref mArg2;
  Arg3Ref mArg3;
  Arg4Ref mArg4;
  Arg5Ref mArg5;
};

nsresult
DispatchSyncRunnable(SyncRunnableBase* r)
{
  if (NS_IsMainThread()) {
    r->Run();
  }
  else {
    mozilla::MonitorAutoLock lock(r->Monitor());
    nsresult rv = NS_DispatchToMainThread(r);
    if (NS_FAILED(rv))
      return rv;
    lock.Wait();
  }
  return r->Result();
}

} // anonymous namespace

#define NS_SYNCRUNNABLEMETHOD0(iface, method)                       \
  NS_IMETHODIMP iface##Proxy::method() {                     \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable0<nsI##iface>                           \
      (mReceiver, &nsI##iface::method);                         \
    return DispatchSyncRunnable(r);                                 \
  }


#define NS_SYNCRUNNABLEMETHOD1(iface, method,                       \
                               arg1)                                \
  NS_IMETHODIMP iface##Proxy::method(arg1 a1) {                     \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable1<nsI##iface, arg1>                           \
      (mReceiver, &nsI##iface::method, a1);                         \
    return DispatchSyncRunnable(r);                                 \
  }

#define NS_SYNCRUNNABLEMETHOD2(iface, method,                       \
                               arg1, arg2)                          \
  NS_IMETHODIMP iface##Proxy::method(arg1 a1, arg2 a2) {            \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable2<nsI##iface, arg1, arg2>                     \
      (mReceiver, &nsI##iface::method, a1, a2);                     \
    return DispatchSyncRunnable(r);                                 \
  }

#define NS_SYNCRUNNABLEMETHOD3(iface, method,                       \
                               arg1, arg2, arg3)                    \
  NS_IMETHODIMP iface##Proxy::method(arg1 a1, arg2 a2, arg3 a3) {   \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable3<nsI##iface, arg1, arg2, arg3>               \
      (mReceiver, &nsI##iface::method,                              \
       a1, a2, a3);                                                 \
    return DispatchSyncRunnable(r);                                 \
  }

#define NS_SYNCRUNNABLEMETHOD4(iface, method,                       \
                               arg1, arg2, arg3, arg4)              \
  NS_IMETHODIMP iface##Proxy::method(arg1 a1, arg2 a2, arg3 a3, arg4 a4) { \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable4<nsI##iface, arg1, arg2, arg3, arg4>         \
      (mReceiver, &nsI##iface::method,                              \
       a1, a2, a3, a4);                                             \
    return DispatchSyncRunnable(r);                                 \
  }

#define NS_SYNCRUNNABLEMETHOD5(iface, method,                       \
                               arg1, arg2, arg3, arg4, arg5)        \
  NS_IMETHODIMP iface##Proxy::method(arg1 a1, arg2 a2, arg3 a3, arg4 a4, arg5 a5) {   \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable5<nsI##iface, arg1, arg2, arg3, arg4, arg5>   \
      (mReceiver, &nsI##iface::method,                              \
       a1, a2, a3, a4, a5);                                         \
    return DispatchSyncRunnable(r);                                 \
  }

#define NS_SYNCRUNNABLEATTRIBUTE(iface, attribute,                       \
                                 type)                                \
NS_IMETHODIMP iface##Proxy::Get##attribute(type *a1) {                     \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable1<nsI##iface, type *>                           \
      (mReceiver, &nsI##iface::Get##attribute, a1);                         \
    return DispatchSyncRunnable(r);                                 \
  } \
NS_IMETHODIMP iface##Proxy::Set##attribute(type a1) {                     \
    RefPtr<SyncRunnableBase> r =                                  \
      new SyncRunnable1<nsI##iface, type>                           \
      (mReceiver, &nsI##iface::Set##attribute, a1);                         \
    return DispatchSyncRunnable(r);                                 \
  }


#define NS_NOTIMPLEMENTED \
  { NS_RUNTIMEABORT("Not implemented"); return NS_ERROR_UNEXPECTED; }

NS_SYNCRUNNABLEMETHOD5(StreamListener, OnDataAvailable,
                       nsIRequest *, nsISupports *, nsIInputStream *, uint64_t, uint32_t)

NS_SYNCRUNNABLEMETHOD2(StreamListener, OnStartRequest,
                       nsIRequest *, nsISupports *)

NS_SYNCRUNNABLEMETHOD3(StreamListener, OnStopRequest,
                       nsIRequest *, nsISupports *, nsresult)

NS_SYNCRUNNABLEMETHOD2(ImapProtocolSink, GetUrlWindow, nsIMsgMailNewsUrl *,
                       nsIMsgWindow **)

NS_SYNCRUNNABLEMETHOD0(ImapProtocolSink, CloseStreams)

NS_SYNCRUNNABLEATTRIBUTE(ImapMailFolderSink, FolderNeedsACLListed, bool)
NS_SYNCRUNNABLEATTRIBUTE(ImapMailFolderSink, FolderNeedsSubscribing, bool)
NS_SYNCRUNNABLEATTRIBUTE(ImapMailFolderSink, FolderNeedsAdded, bool)
NS_SYNCRUNNABLEATTRIBUTE(ImapMailFolderSink, AclFlags, uint32_t)
NS_SYNCRUNNABLEATTRIBUTE(ImapMailFolderSink, UidValidity, int32_t)
NS_SYNCRUNNABLEATTRIBUTE(ImapMailFolderSink, FolderQuotaCommandIssued, bool)
NS_SYNCRUNNABLEMETHOD3(ImapMailFolderSink, SetFolderQuotaData, const nsACString &, uint32_t, uint32_t)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, GetShouldDownloadAllHeaders, bool *)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, GetOnlineDelimiter, char *)
NS_SYNCRUNNABLEMETHOD0(ImapMailFolderSink, OnNewIdleMessages)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, UpdateImapMailboxStatus, nsIImapProtocol *, nsIMailboxSpec *)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, UpdateImapMailboxInfo, nsIImapProtocol *, nsIMailboxSpec *)
NS_SYNCRUNNABLEMETHOD4(ImapMailFolderSink, GetMsgHdrsToDownload, bool *, int32_t *, uint32_t *, nsMsgKey **)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, ParseMsgHdrs, nsIImapProtocol *, nsIImapHeaderXferInfo *)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, AbortHeaderParseStream, nsIImapProtocol *)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, OnlineCopyCompleted, nsIImapProtocol *, ImapOnlineCopyState)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, StartMessage, nsIMsgMailNewsUrl *)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, EndMessage, nsIMsgMailNewsUrl *, nsMsgKey)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, NotifySearchHit, nsIMsgMailNewsUrl *, const char *)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, CopyNextStreamMessage, bool, nsISupports *)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, CloseMockChannel, nsIImapMockChannel *)
NS_SYNCRUNNABLEMETHOD5(ImapMailFolderSink, SetUrlState, nsIImapProtocol *, nsIMsgMailNewsUrl *,
                       bool, bool, nsresult)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, ReleaseUrlCacheEntry, nsIMsgMailNewsUrl *)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, HeaderFetchCompleted, nsIImapProtocol *)
NS_SYNCRUNNABLEMETHOD1(ImapMailFolderSink, SetBiffStateAndUpdate, int32_t)
NS_SYNCRUNNABLEMETHOD3(ImapMailFolderSink, ProgressStatusString, nsIImapProtocol*, const char*, const char16_t *)
NS_SYNCRUNNABLEMETHOD4(ImapMailFolderSink, PercentProgress, nsIImapProtocol*, const char16_t *, int64_t, int64_t)
NS_SYNCRUNNABLEMETHOD0(ImapMailFolderSink, ClearFolderRights)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, SetCopyResponseUid, const char *, nsIImapUrl *)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, SetAppendMsgUid, nsMsgKey, nsIImapUrl *)
NS_SYNCRUNNABLEMETHOD2(ImapMailFolderSink, GetMessageId, nsIImapUrl *, nsACString &)

NS_SYNCRUNNABLEMETHOD2(ImapMessageSink, SetupMsgWriteStream, nsIFile *, bool)
NS_SYNCRUNNABLEMETHOD3(ImapMessageSink, ParseAdoptedMsgLine, const char *, nsMsgKey, nsIImapUrl *)
NS_SYNCRUNNABLEMETHOD4(ImapMessageSink, NormalEndMsgWriteStream, nsMsgKey, bool, nsIImapUrl *, int32_t)
NS_SYNCRUNNABLEMETHOD0(ImapMessageSink, AbortMsgWriteStream)
NS_SYNCRUNNABLEMETHOD0(ImapMessageSink, BeginMessageUpload)
NS_SYNCRUNNABLEMETHOD4(ImapMessageSink, NotifyMessageFlags, uint32_t, const nsACString &, nsMsgKey, uint64_t)
NS_SYNCRUNNABLEMETHOD3(ImapMessageSink, NotifyMessageDeleted, const char *, bool, const char *)
NS_SYNCRUNNABLEMETHOD2(ImapMessageSink, GetMessageSizeFromDB, const char *, uint32_t *)
NS_SYNCRUNNABLEMETHOD2(ImapMessageSink, SetContentModified, nsIImapUrl *, nsImapContentModifiedType)
NS_SYNCRUNNABLEMETHOD1(ImapMessageSink, SetImageCacheSessionForUrl, nsIMsgMailNewsUrl *)
NS_SYNCRUNNABLEMETHOD4(ImapMessageSink, GetCurMoveCopyMessageInfo, nsIImapUrl *, PRTime *, nsACString &, uint32_t *)

NS_SYNCRUNNABLEMETHOD4(ImapServerSink, PossibleImapMailbox, const nsACString &, char, int32_t, bool *)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, FolderNeedsACLInitialized, const nsACString &, bool *)
NS_SYNCRUNNABLEMETHOD3(ImapServerSink, AddFolderRights, const nsACString &, const nsACString &, const nsACString &)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, RefreshFolderRights, const nsACString &)
NS_SYNCRUNNABLEMETHOD0(ImapServerSink, DiscoveryDone)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, OnlineFolderDelete, const nsACString &)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, OnlineFolderCreateFailed, const nsACString &)
NS_SYNCRUNNABLEMETHOD3(ImapServerSink, OnlineFolderRename, nsIMsgWindow *, const nsACString &, const nsACString &)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, FolderIsNoSelect, const nsACString &, bool *)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, SetFolderAdminURL, const nsACString &, const nsACString &)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, FolderVerifiedOnline, const nsACString &, bool *)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, SetCapability, eIMAPCapabilityFlags)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, SetServerID, const nsACString &)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, LoadNextQueuedUrl, nsIImapProtocol *, bool *)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, PrepareToRetryUrl, nsIImapUrl *, nsIImapMockChannel **)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, SuspendUrl, nsIImapUrl *)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, RetryUrl, nsIImapUrl *, nsIImapMockChannel *)
NS_SYNCRUNNABLEMETHOD0(ImapServerSink, AbortQueuedUrls)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, GetImapStringByName, const char*, nsAString &)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, PromptLoginFailed, nsIMsgWindow *, int32_t *)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, FEAlert, const nsAString &, nsIMsgMailNewsUrl *)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, FEAlertWithName, const char*, nsIMsgMailNewsUrl *)
NS_SYNCRUNNABLEMETHOD2(ImapServerSink, FEAlertFromServer, const nsACString &, nsIMsgMailNewsUrl *)
NS_SYNCRUNNABLEMETHOD0(ImapServerSink, CommitNamespaces)
NS_SYNCRUNNABLEMETHOD3(ImapServerSink, AsyncGetPassword, nsIImapProtocol *, bool, nsACString &)
NS_SYNCRUNNABLEATTRIBUTE(ImapServerSink, UserAuthenticated, bool)
NS_SYNCRUNNABLEMETHOD3(ImapServerSink, SetMailServerUrls, const nsACString &, const nsACString &, const nsACString &)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, GetArbitraryHeaders, nsACString &)
NS_SYNCRUNNABLEMETHOD0(ImapServerSink, ForgetPassword)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, GetShowAttachmentsInline, bool *)
NS_SYNCRUNNABLEMETHOD3(ImapServerSink, CramMD5Hash, const char *, const char *, char **)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, GetLoginUsername, nsACString &)
NS_SYNCRUNNABLEMETHOD1(ImapServerSink, UpdateTrySTARTTLSPref, bool)

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS(OAuth2ThreadHelper, msgIOAuth2ModuleListener)

OAuth2ThreadHelper::OAuth2ThreadHelper(nsIMsgIncomingServer *aServer)
: mMonitor("OAuth thread lock"),
  mServer(aServer)
{
}

OAuth2ThreadHelper::~OAuth2ThreadHelper()
{
  if (mOAuth2Support)
  {
    nsCOMPtr<nsIThread> mainThread;
    NS_GetMainThread(getter_AddRefs(mainThread));
    NS_ProxyRelease(mainThread, mOAuth2Support);
  }
}

bool OAuth2ThreadHelper::SupportsOAuth2()
{
  // Acquire a lock early, before reading anything. Guarantees memory visibility
  // issues.
  MonitorAutoLock lockGuard(mMonitor);

  // If we don't have a server, we can't init, and therefore, we don't support
  // OAuth2.
  if (!mServer)
    return false;

  // If we have this, then we support OAuth2.
  if (mOAuth2Support)
    return true;

  // Initialize. This needs to be done on-main-thread: if we're off that thread,
  // synchronously dispatch to the main thread.
  if (NS_IsMainThread())
  {
    MonitorAutoUnlock lockGuard(mMonitor);
    Init();
  }
  else
  {
    nsCOMPtr<nsIRunnable> runInit =
      NS_NewRunnableMethod(this, &OAuth2ThreadHelper::Init);
    NS_DispatchToMainThread(runInit);
    mMonitor.Wait();
  }

  // After synchronously initializing, if we didn't get an object, then we don't
  // support XOAuth2.
  return mOAuth2Support != nullptr;
}

void OAuth2ThreadHelper::GetXOAuth2String(nsACString &base64Str)
{
  MOZ_ASSERT(!NS_IsMainThread(), "This method cannot run on the main thread");

  // Acquire a lock early, before reading anything. Guarantees memory visibility
  // issues.
  MonitorAutoLock lockGuard(mMonitor);

  // Umm... what are you trying to do?
  if (!mOAuth2Support)
    return;

  nsCOMPtr<nsIRunnable> runInit =
    NS_NewRunnableMethod(this, &OAuth2ThreadHelper::Connect);
  NS_DispatchToMainThread(runInit);
  mMonitor.Wait();

  // Now we either have the string, or we failed (in which case the string is
  // empty).
  base64Str = mOAuth2String;
}

void OAuth2ThreadHelper::Init()
{
  MOZ_ASSERT(NS_IsMainThread(), "Can't touch JS off-main-thread");
  MonitorAutoLock lockGuard(mMonitor);

  // Create the OAuth2 helper module and initialize it. If the preferences are
  // not set up on this server, we don't support OAuth2, and we nullify our
  // members to indicate this.
  mOAuth2Support = do_CreateInstance(MSGIOAUTH2MODULE_CONTRACTID);
  if (mOAuth2Support)
  {
    bool supportsOAuth = false;
    mOAuth2Support->InitFromMail(mServer, &supportsOAuth);
    if (!supportsOAuth)
      mOAuth2Support = nullptr;
  }

  // There is now no longer any need for the server. Kill it now--this helps
  // prevent us from maintaining a refcount cycle.
  mServer = nullptr;

  // Notify anyone waiting that we're done.
  mMonitor.Notify();
}

void OAuth2ThreadHelper::Connect()
{
  MOZ_ASSERT(NS_IsMainThread(), "Can't touch JS off-main-thread");
  MOZ_ASSERT(mOAuth2Support, "Should not be here if no OAuth2 support");

  // OK to delay lock since mOAuth2Support is only written on main thread.
  nsresult rv = mOAuth2Support->Connect(true, this);
  // If the method failed, we'll never get a callback, so notify the monitor
  // immediately so that IMAP can react.
  if (NS_FAILED(rv))
  {
    MonitorAutoLock lockGuard(mMonitor);
    mMonitor.Notify();
  }
}

nsresult OAuth2ThreadHelper::OnSuccess(const nsACString &aAccessToken)
{
  MOZ_ASSERT(NS_IsMainThread(), "Can't touch JS off-main-thread");
  MonitorAutoLock lockGuard(mMonitor);

  MOZ_ASSERT(mOAuth2Support, "Should not be here if no OAuth2 support");
  mOAuth2Support->BuildXOAuth2String(mOAuth2String);
  mMonitor.Notify();
  return NS_OK;
}

nsresult OAuth2ThreadHelper::OnFailure(nsresult aError)
{
  MOZ_ASSERT(NS_IsMainThread(), "Can't touch JS off-main-thread");
  MonitorAutoLock lockGuard(mMonitor);

  mOAuth2String.Truncate();
  mMonitor.Notify();
  return NS_OK;
}

} // namespace mailnews
} // namespace mozilla
