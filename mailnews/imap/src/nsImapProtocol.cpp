/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsImapProtocol.h"

#include "msgCore.h"  // for pre-compiled headers
#include "nsMsgUtils.h"

#include "nsImapStringBundle.h"
#include "nsVersionComparator.h"

#include "nsThreadUtils.h"
#include "nsIMsgStatusFeedback.h"
#include "nsImapCore.h"
#include "nsIMsgMailNewsUrl.h"
#include "../public/nsIImapHostSessionList.h"
#include "nsImapMailFolder.h"
#include "nsIMsgAccountManager.h"
#include "nsImapServerResponseParser.h"
#include "nspr.h"
#include "plbase64.h"
#include "nsIEventTarget.h"
#include "nsIImapService.h"
#include "nsISocketTransportService.h"
#include "nsIStreamListenerTee.h"
#include "nsIInputStreamPump.h"
#include "nsNetUtil.h"
#include "nsIDBFolderInfo.h"
#include "nsIPipe.h"
#include "nsIMsgFolder.h"
#include "nsMsgMessageFlags.h"
#include "nsTransportUtils.h"
#include "nsIMsgHdr.h"
#include "nsMsgI18N.h"
// for the memory cache...
#include "nsICacheEntry.h"
#include "nsICacheStorage.h"
#include "nsICacheEntryOpenCallback.h"
#include "CacheObserver.h"
#include "nsIURIMutator.h"

#include "nsIDocShell.h"
#include "nsILoadInfo.h"
#include "nsCOMPtr.h"
#include "nsMimeTypes.h"
#include "nsIInterfaceRequestor.h"
#include "nsXPCOMCIDInternal.h"
#include "nsIXULAppInfo.h"
#include "nsSocketTransportService2.h"
#include "nsSyncRunnableHelpers.h"
#include "nsICancelable.h"

// netlib required files
#include "nsIStreamListener.h"
#include "nsIMsgIncomingServer.h"
#include "nsIImapIncomingServer.h"
#include "nsIPrefLocalizedString.h"
#include "nsImapUtils.h"
#include "nsIStreamConverterService.h"
#include "nsIProxyInfo.h"
#include "nsITLSSocketControl.h"
#include "nsITransportSecurityInfo.h"
#include "nsProxyRelease.h"
#include "nsDebug.h"
#include "nsMsgCompressIStream.h"
#include "nsMsgCompressOStream.h"
#include "mozilla/Logging.h"
#include "mozilla/Preferences.h"
#include "nsIPrincipal.h"
#include "nsContentSecurityManager.h"

// imap event sinks
#include "nsIImapMailFolderSink.h"
#include "nsIImapServerSink.h"
#include "nsIImapMessageSink.h"

#include "mozilla/dom/InternalResponse.h"
#include "mozilla/NullPrincipal.h"

// TLS alerts
#include "NSSErrorsService.h"

#include "mozilla/Components.h"
#include "mozilla/SyncRunnable.h"

using namespace mozilla;

LazyLogModule IMAP("IMAP");
LazyLogModule IMAP_CS("IMAP_CS");
LazyLogModule IMAPCache("IMAPCache");
extern LazyLogModule IMAP_DC;  // For imap folder discovery

#define ONE_SECOND ((uint32_t)1000)  // one second

#define OUTPUT_BUFFER_SIZE (4096 * 2)

#define IMAP_ENV_HEADERS "From To Cc Bcc Subject Date Message-ID "
#define IMAP_DB_HEADERS                                                 \
  "Priority X-Priority References Newsgroups In-Reply-To Content-Type " \
  "Reply-To"
#define IMAP_ENV_AND_DB_HEADERS IMAP_ENV_HEADERS IMAP_DB_HEADERS
MOZ_RUNINIT static const PRIntervalTime kImapSleepTime =
    PR_MillisecondsToInterval(60000);
static int32_t gPromoteNoopToCheckCount = 0;
static const uint32_t kFlagChangesBeforeCheck = 10;
static const int32_t kMaxSecondsBeforeCheck = 600;

class AutoProxyReleaseMsgWindow {
 public:
  AutoProxyReleaseMsgWindow() : mMsgWindow() {}
  ~AutoProxyReleaseMsgWindow() {
    NS_ReleaseOnMainThread("AutoProxyReleaseMsgWindow::mMsgWindow",
                           dont_AddRef(mMsgWindow));
  }
  nsIMsgWindow** StartAssignment() {
    MOZ_ASSERT(!mMsgWindow);
    return &mMsgWindow;
  }
  operator nsIMsgWindow*() { return mMsgWindow; }

 private:
  nsIMsgWindow* mMsgWindow;
};

nsIMsgWindow** getter_AddRefs(AutoProxyReleaseMsgWindow& aSmartPtr) {
  return aSmartPtr.StartAssignment();
}

NS_IMPL_ISUPPORTS(nsMsgImapHdrXferInfo, nsIImapHeaderXferInfo)

nsMsgImapHdrXferInfo::nsMsgImapHdrXferInfo() : m_hdrInfos(kNumHdrsToXfer) {
  m_nextFreeHdrInfo = 0;
}

nsMsgImapHdrXferInfo::~nsMsgImapHdrXferInfo() {}

NS_IMETHODIMP nsMsgImapHdrXferInfo::GetNumHeaders(int32_t* aNumHeaders) {
  *aNumHeaders = m_nextFreeHdrInfo;
  return NS_OK;
}

NS_IMETHODIMP nsMsgImapHdrXferInfo::GetHeader(int32_t hdrIndex,
                                              nsIImapHeaderInfo** aResult) {
  // If the header index is more than (or equal to) our next free pointer, then
  // its a header we haven't really got and the caller has done something
  // wrong.
  NS_ENSURE_TRUE(hdrIndex < m_nextFreeHdrInfo, NS_ERROR_NULL_POINTER);

  NS_IF_ADDREF(*aResult = m_hdrInfos.SafeObjectAt(hdrIndex));
  if (!*aResult) return NS_ERROR_NULL_POINTER;
  return NS_OK;
}

static const int32_t kInitLineHdrCacheSize = 512;  // should be about right

nsIImapHeaderInfo* nsMsgImapHdrXferInfo::StartNewHdr() {
  if (m_nextFreeHdrInfo >= kNumHdrsToXfer) return nullptr;

  nsIImapHeaderInfo* result = m_hdrInfos.SafeObjectAt(m_nextFreeHdrInfo++);
  if (result) return result;

  nsMsgImapLineDownloadCache* lineCache = new nsMsgImapLineDownloadCache();
  if (!lineCache) return nullptr;

  lineCache->GrowBuffer(kInitLineHdrCacheSize);

  m_hdrInfos.AppendObject(lineCache);

  return lineCache;
}

// maybe not needed...
void nsMsgImapHdrXferInfo::FinishCurrentHdr() {
  // nothing to do?
}

void nsMsgImapHdrXferInfo::ResetAll() {
  int32_t count = m_hdrInfos.Count();
  for (int32_t i = 0; i < count; i++) {
    nsIImapHeaderInfo* hdrInfo = m_hdrInfos[i];
    if (hdrInfo) hdrInfo->ResetCache();
  }
  m_nextFreeHdrInfo = 0;
}

void nsMsgImapHdrXferInfo::ReleaseAll() {
  m_hdrInfos.Clear();
  m_nextFreeHdrInfo = 0;
}

NS_IMPL_ISUPPORTS(nsMsgImapLineDownloadCache, nsIImapHeaderInfo)

// **** helper class for downloading line ****
nsMsgImapLineDownloadCache::nsMsgImapLineDownloadCache() {
  fLineInfo = (msg_line_info*)PR_CALLOC(sizeof(msg_line_info));
  fLineInfo->uidOfMessage = nsMsgKey_None;
  m_msgSize = 0;
}

nsMsgImapLineDownloadCache::~nsMsgImapLineDownloadCache() {
  PR_Free(fLineInfo);
}

uint32_t nsMsgImapLineDownloadCache::CurrentUID() {
  return fLineInfo->uidOfMessage;
}

uint32_t nsMsgImapLineDownloadCache::SpaceAvailable() {
  MOZ_ASSERT(kDownLoadCacheSize >= m_bufferPos);
  if (kDownLoadCacheSize <= m_bufferPos) return 0;
  return kDownLoadCacheSize - m_bufferPos;
}

msg_line_info* nsMsgImapLineDownloadCache::GetCurrentLineInfo() {
  AppendBuffer("", 1);  // null terminate the buffer
  fLineInfo->adoptedMessageLine = GetBuffer();
  return fLineInfo;
}

NS_IMETHODIMP nsMsgImapLineDownloadCache::ResetCache() {
  ResetWritePos();
  return NS_OK;
}

bool nsMsgImapLineDownloadCache::CacheEmpty() { return m_bufferPos == 0; }

NS_IMETHODIMP nsMsgImapLineDownloadCache::CacheLine(const char* line,
                                                    uint32_t uid) {
  fLineInfo->uidOfMessage = uid;
  return AppendString(line);
}

/* attribute nsMsgKey msgUid; */
NS_IMETHODIMP nsMsgImapLineDownloadCache::GetMsgUid(nsMsgKey* aMsgUid) {
  *aMsgUid = fLineInfo->uidOfMessage;
  return NS_OK;
}
NS_IMETHODIMP nsMsgImapLineDownloadCache::SetMsgUid(nsMsgKey aMsgUid) {
  fLineInfo->uidOfMessage = aMsgUid;
  return NS_OK;
}

/* attribute long msgSize; */
NS_IMETHODIMP nsMsgImapLineDownloadCache::GetMsgSize(int32_t* aMsgSize) {
  *aMsgSize = m_msgSize;
  return NS_OK;
}

NS_IMETHODIMP nsMsgImapLineDownloadCache::SetMsgSize(int32_t aMsgSize) {
  m_msgSize = aMsgSize;
  return NS_OK;
}

/* readonly attribute ACString msgHdrs; */
NS_IMETHODIMP nsMsgImapLineDownloadCache::GetMsgHdrs(nsACString& aMsgHdrs) {
  AppendBuffer("", 1);  // null terminate the buffer
  aMsgHdrs.Assign(GetBuffer());
  return NS_OK;
}

// The following macros actually implement addref, release and query interface
// for our component.
NS_IMPL_ADDREF_INHERITED(nsImapProtocol, nsMsgProtocol)
NS_IMPL_RELEASE_INHERITED(nsImapProtocol, nsMsgProtocol)

NS_INTERFACE_MAP_BEGIN(nsImapProtocol)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIImapProtocol)
  NS_INTERFACE_MAP_ENTRY(nsIImapProtocol)
  NS_INTERFACE_MAP_ENTRY(nsIProtocolProxyCallback)
  NS_INTERFACE_MAP_ENTRY(nsIInputStreamCallback)
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
  NS_INTERFACE_MAP_ENTRY(nsIImapProtocolSink)
  NS_INTERFACE_MAP_ENTRY(nsIMsgAsyncPromptListener)
NS_INTERFACE_MAP_END

static int32_t gTooFastTime = 2;
static int32_t gIdealTime = 4;
static int32_t gChunkAddSize = 16384;
static int32_t gChunkSize = 250000;
MOZ_RUNINIT static int32_t gChunkThreshold = gChunkSize + gChunkSize / 2;
static bool gChunkSizeDirty = false;
static bool gFetchByChunks = true;
static bool gInitialized = false;
static bool gHideUnusedNamespaces = true;
static bool gHideOtherUsersFromList = false;
static bool gUseEnvelopeCmd = false;
static bool gUseLiteralPlus = true;
static bool gExpungeAfterDelete = false;
static bool gCheckDeletedBeforeExpunge = false;  // bug 235004
static int32_t gResponseTimeout = 100;
MOZ_RUNINIT static int32_t gAppendTimeout = gResponseTimeout / 5;
static nsImapProtocol::TCPKeepalive gTCPKeepalive;
static bool gUseDiskCache2 = true;  // Use disk cache instead of memory cache

// let delete model control expunging, i.e., don't ever expunge when the
// user chooses the imap delete model, otherwise, expunge when over the
// threshold. This is the normal TB behavior.
static const int32_t kAutoExpungeDeleteModel = 0;  // default
// Expunge whenever the folder is opened regardless of delete model or number
// of marked deleted messages present in the folder.
static const int32_t kAutoExpungeAlways = 1;
// Expunge when over the threshold, independent of the delete model.
static const int32_t kAutoExpungeOnThreshold = 2;
// Set mail.imap.expunge_option to kAutoExpungeNever to NEVER do an auto-
// expunge. This is useful when doing a bulk transfer of folders and messages
// between imap servers.
static const int32_t kAutoExpungeNever = 3;

static int32_t gExpungeOption = kAutoExpungeDeleteModel;
static int32_t gExpungeThreshold = 20;

const int32_t kAppBufSize = 100;
// can't use static nsCString because it shows up as a leak.
static char gAppName[kAppBufSize];
static char gAppVersion[kAppBufSize];

nsresult nsImapProtocol::GlobalInitialization() {
  gInitialized = true;

  Preferences::GetInt("mail.imap.chunk_fast",
                      &gTooFastTime);  // secs we read too little too fast
  Preferences::GetInt("mail.imap.chunk_ideal",
                      &gIdealTime);  // secs we read enough in good time
  Preferences::GetInt("mail.imap.chunk_add",
                      &gChunkAddSize);  // buffer size to add when wasting time
  Preferences::GetInt("mail.imap.chunk_size", &gChunkSize);
  Preferences::GetInt("mail.imap.min_chunk_size_threshold", &gChunkThreshold);
  Preferences::GetBool("mail.imap.hide_other_users", &gHideOtherUsersFromList);
  Preferences::GetBool("mail.imap.hide_unused_namespaces",
                       &gHideUnusedNamespaces);
  Preferences::GetInt("mail.imap.noop_check_count", &gPromoteNoopToCheckCount);
  Preferences::GetBool("mail.imap.use_envelope_cmd", &gUseEnvelopeCmd);
  Preferences::GetBool("mail.imap.use_literal_plus", &gUseLiteralPlus);
  Preferences::GetBool("mail.imap.expunge_after_delete", &gExpungeAfterDelete);
  Preferences::GetBool("mail.imap.use_disk_cache2", &gUseDiskCache2);
  Preferences::GetBool("mail.imap.check_deleted_before_expunge",
                       &gCheckDeletedBeforeExpunge);
  Preferences::GetInt("mail.imap.expunge_option", &gExpungeOption);
  Preferences::GetInt("mail.imap.expunge_threshold_number", &gExpungeThreshold);
  Preferences::GetInt("mailnews.tcptimeout", &gResponseTimeout);
  gAppendTimeout = gResponseTimeout / 5;

  gTCPKeepalive.enabled.store(false, std::memory_order_relaxed);
  gTCPKeepalive.idleTimeS.store(-1, std::memory_order_relaxed);
  gTCPKeepalive.retryIntervalS.store(-1, std::memory_order_relaxed);

  nsCOMPtr<nsIXULAppInfo> appInfo(do_GetService(XULAPPINFO_SERVICE_CONTRACTID));

  if (appInfo) {
    nsCString appName, appVersion;
    appInfo->GetName(appName);
    appInfo->GetVersion(appVersion);
    PL_strncpyz(gAppName, appName.get(), kAppBufSize);
    PL_strncpyz(gAppVersion, appVersion.get(), kAppBufSize);
  }
  return NS_OK;
}

class nsImapTransportEventSink final : public nsITransportEventSink {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSITRANSPORTEVENTSINK

 private:
  friend class nsImapProtocol;

  virtual ~nsImapTransportEventSink() = default;
  nsresult ApplyTCPKeepalive(nsISocketTransport* aTransport);

  nsCOMPtr<nsITransportEventSink> m_proxy;
};

NS_IMPL_ISUPPORTS(nsImapTransportEventSink, nsITransportEventSink)

NS_IMETHODIMP
nsImapTransportEventSink::OnTransportStatus(nsITransport* aTransport,
                                            nsresult aStatus, int64_t aProgress,
                                            int64_t aProgressMax) {
  if (aStatus == NS_NET_STATUS_CONNECTED_TO) {
    nsCOMPtr<nsISocketTransport> sockTrans(do_QueryInterface(aTransport));
    if (!NS_WARN_IF(!sockTrans)) ApplyTCPKeepalive(sockTrans);
  }

  if (NS_WARN_IF(!m_proxy)) return NS_OK;

  return m_proxy->OnTransportStatus(aTransport, aStatus, aProgress,
                                    aProgressMax);
}

nsresult nsImapTransportEventSink::ApplyTCPKeepalive(
    nsISocketTransport* aTransport) {
  nsresult rv;

  bool kaEnabled = gTCPKeepalive.enabled.load(std::memory_order_relaxed);
  if (kaEnabled) {
    // TCP keepalive idle time, don't mistake with IMAP IDLE.
    int32_t kaIdleTime =
        gTCPKeepalive.idleTimeS.load(std::memory_order_relaxed);
    int32_t kaRetryInterval =
        gTCPKeepalive.retryIntervalS.load(std::memory_order_relaxed);

    if (kaIdleTime < 0 || kaRetryInterval < 0) {
      if (NS_WARN_IF(!net::gSocketTransportService))
        return NS_ERROR_NOT_INITIALIZED;
    }
    if (kaIdleTime < 0) {
      rv = net::gSocketTransportService->GetKeepaliveIdleTime(&kaIdleTime);
      if (NS_FAILED(rv)) {
        MOZ_LOG(IMAP, LogLevel::Error,
                ("GetKeepaliveIdleTime() failed, %" PRIx32,
                 static_cast<uint32_t>(rv)));
        return rv;
      }
    }
    if (kaRetryInterval < 0) {
      rv = net::gSocketTransportService->GetKeepaliveRetryInterval(
          &kaRetryInterval);
      if (NS_FAILED(rv)) {
        MOZ_LOG(IMAP, LogLevel::Error,
                ("GetKeepaliveRetryInterval() failed, %" PRIx32,
                 static_cast<uint32_t>(rv)));
        return rv;
      }
    }

    MOZ_ASSERT(kaIdleTime > 0);
    MOZ_ASSERT(kaRetryInterval > 0);
    rv = aTransport->SetKeepaliveVals(kaIdleTime, kaRetryInterval);
    if (NS_FAILED(rv)) {
      MOZ_LOG(IMAP, LogLevel::Error,
              ("SetKeepaliveVals(%" PRId32 ", %" PRId32 ") failed, %" PRIx32,
               kaIdleTime, kaRetryInterval, static_cast<uint32_t>(rv)));
      return rv;
    }
  }

  rv = aTransport->SetKeepaliveEnabled(kaEnabled);
  if (NS_FAILED(rv)) {
    MOZ_LOG(IMAP, LogLevel::Error,
            ("SetKeepaliveEnabled(%s) failed, %" PRIx32,
             kaEnabled ? "true" : "false", static_cast<uint32_t>(rv)));
    return rv;
  }
  return NS_OK;
}

// This runnable runs on IMAP thread.
class nsImapProtocolMainLoopRunnable final : public mozilla::Runnable {
 public:
  explicit nsImapProtocolMainLoopRunnable(nsImapProtocol* aProtocol)
      : mozilla::Runnable("nsImapProtocolEventLoopRunnable"),
        mProtocol(aProtocol) {}

  NS_IMETHOD Run() {
    MOZ_ASSERT(!NS_IsMainThread());

    if (!mProtocol->RunImapThreadMainLoop()) {
      // We already run another IMAP event loop.
      return NS_OK;
    }

    // Release protocol object on the main thread to avoid destruction of
    // nsImapProtocol on the IMAP thread, which causes grief for weak
    // references.
    NS_ReleaseOnMainThread("nsImapProtocol::this", mProtocol.forget());

    // shutdown this thread, but do it from the main thread
    nsCOMPtr<nsIThread> imapThread(do_GetCurrentThread());
    if (NS_FAILED(NS_DispatchToMainThread(
            NS_NewRunnableFunction("nsImapProtorolMainLoopRunnable::Run",
                                   [imapThread = std::move(imapThread)]() {
                                     imapThread->Shutdown();
                                   })))) {
      NS_WARNING("Failed to dispatch nsImapThreadShutdownEvent");
    }
    return NS_OK;
  }

 private:
  RefPtr<nsImapProtocol> mProtocol;
};

nsImapProtocol::nsImapProtocol()
    : nsMsgProtocol(nullptr),
      m_urlReadyToRunMonitor("imapUrlReadyToRun"),
      m_pseudoInterruptMonitor("imapPseudoInterrupt"),
      m_dataMemberMonitor("imapDataMember"),
      m_threadDeathMonitor("imapThreadDeath"),
      m_waitForBodyIdsMonitor("imapWaitForBodyIds"),
      m_fetchBodyListMonitor("imapFetchBodyList"),
      m_passwordReadyMonitor("imapPasswordReady"),
      mMonitor("nsImapProtocol.mMonitor"),
      m_parser(*this) {
  m_urlInProgress = false;
  m_idle = false;
  m_retryUrlOnError = false;
  m_useIdle = true;  // by default, use it
  m_useCondStore = true;
  m_useCompressDeflate = true;
  m_ignoreExpunges = false;
  m_prefAuthMethods = kCapabilityUndefined;
  m_failedAuthMethods = 0;
  m_currentAuthMethod = kCapabilityUndefined;
  m_socketType = nsMsgSocketType::alwaysSTARTTLS;
  m_connectionStatus = NS_OK;
  m_safeToCloseConnection = false;
  m_hostSessionList = nullptr;
  m_isGmailServer = false;
  m_fetchingWholeMessage = false;
  m_allowUTF8Accept = false;

  // read in the accept languages preference
  if (!gInitialized) GlobalInitialization();

  nsCOMPtr<nsIPrefLocalizedString> prefString;
  Preferences::GetComplex("intl.accept_languages",
                          NS_GET_IID(nsIPrefLocalizedString),
                          getter_AddRefs(prefString));
  if (prefString) prefString->ToString(getter_Copies(mAcceptLanguages));

  nsCString customDBHeaders;
  Preferences::GetCString("mailnews.customDBHeaders", customDBHeaders);

  ParseString(customDBHeaders, ' ', mCustomDBHeaders);
  Preferences::GetBool("mailnews.display.prefer_plaintext", &m_preferPlainText);

  nsAutoCString customHeaders;
  Preferences::GetCString("mailnews.customHeaders", customHeaders);
  customHeaders.StripWhitespace();
  ParseString(customHeaders, ':', mCustomHeaders);

  bool bVal = Preferences::GetBool("mail.imap.tcp_keepalive.enabled");
  gTCPKeepalive.enabled.store(bVal, std::memory_order_relaxed);

  if (bVal) {
    // TCP keepalive idle time, don't mistake with IMAP IDLE.
    int32_t val = Preferences::GetInt("mail.imap.tcp_keepalive.idle_time");
    if (val >= 0)
      gTCPKeepalive.idleTimeS.store(
          std::min<int32_t>(std::max(val, 1), net::kMaxTCPKeepIdle),
          std::memory_order_relaxed);

    val = Preferences::GetInt("mail.imap.tcp_keepalive.retry_interval");
    if (val >= 0)
      gTCPKeepalive.retryIntervalS.store(
          std::min<int32_t>(std::max(val, 1), net::kMaxTCPKeepIntvl),
          std::memory_order_relaxed);
  }

  // ***** Thread support *****
  m_thread = nullptr;
  m_imapThreadIsRunning = false;
  m_currentServerCommandTagNumber = 0;
  m_active = false;
  m_folderNeedsSubscribing = false;
  m_folderNeedsACLRefreshed = false;
  m_threadShouldDie = false;
  m_inThreadShouldDie = false;
  m_pseudoInterrupted = false;
  m_nextUrlReadyToRun = false;
  m_idleResponseReadyToHandle = false;
  m_trackingTime = false;
  m_curFetchSize = 0;
  m_startTime = 0;
  m_endTime = 0;
  m_lastActiveTime = 0;
  m_lastProgressTime = 0;
  ResetProgressInfo();

  m_tooFastTime = 0;
  m_idealTime = 0;
  m_chunkAddSize = 0;
  m_chunkStartSize = 0;
  m_fetchByChunks = true;
  m_sendID = true;
  m_chunkSize = 0;
  m_chunkThreshold = 0;
  m_fromHeaderSeen = false;
  m_closeNeededBeforeSelect = false;
  m_needNoop = false;
  m_noopCount = 0;
  m_fetchBodyListIsNew = false;
  m_flagChangeCount = 0;
  m_lastCheckTime = PR_Now();

  m_hierarchyNameState = kNoOperationInProgress;
  m_discoveryStatus = eContinue;

  // m_dataOutputBuf is used by Send Data
  m_dataOutputBuf = (char*)PR_CALLOC(sizeof(char) * OUTPUT_BUFFER_SIZE);

  // used to buffer incoming data by ReadNextLine
  m_inputStreamBuffer = new nsMsgLineStreamBuffer(
      OUTPUT_BUFFER_SIZE, true /* allocate new lines */,
      false /* leave CRLFs on the returned string */);
  m_currentBiffState = nsIMsgFolder::nsMsgBiffState_Unknown;
  m_progressStringName.Truncate();
  m_stringIndex = IMAP_EMPTY_STRING_INDEX;
  m_progressExpectedNumber = 0;
  memset(m_progressCurrentNumber, 0, sizeof m_progressCurrentNumber);

  // since these are embedded in the nsImapProtocol object, but passed
  // through proxied xpcom methods, just AddRef them here.
  m_hdrDownloadCache = new nsMsgImapHdrXferInfo();
  m_downloadLineCache = new nsMsgImapLineDownloadCache();

  // subscription
  m_autoSubscribe = true;
  m_autoUnsubscribe = true;
  m_autoSubscribeOnOpen = true;
  m_deletableChildren = nullptr;

  mFolderLastModSeq = 0;

  Configure(gTooFastTime, gIdealTime, gChunkAddSize, gChunkSize,
            gChunkThreshold, gFetchByChunks);
  m_forceSelect = false;
  m_capabilityResponseOccurred = true;

  m_imapAction = 0;
  m_bytesToChannel = 0;
  m_passwordStatus = NS_OK;
  m_passwordObtained = false;
  mFolderTotalMsgCount = 0;
  mFolderHighestUID = 0;
  m_notifySearchHit = false;
  m_preferPlainText = false;
  m_uidValidity = kUidUnknown;
}

nsresult nsImapProtocol::Configure(int32_t TooFastTime, int32_t IdealTime,
                                   int32_t ChunkAddSize, int32_t ChunkSize,
                                   int32_t ChunkThreshold, bool FetchByChunks) {
  m_tooFastTime = TooFastTime;    // secs we read too little too fast
  m_idealTime = IdealTime;        // secs we read enough in good time
  m_chunkAddSize = ChunkAddSize;  // buffer size to add when wasting time
  m_chunkStartSize = m_chunkSize = ChunkSize;
  m_chunkThreshold = ChunkThreshold;
  m_fetchByChunks = FetchByChunks;

  return NS_OK;
}

NS_IMETHODIMP
nsImapProtocol::Initialize(nsIImapHostSessionList* aHostSessionList,
                           nsIImapIncomingServer* aServer) {
  NS_ASSERTION(
      aHostSessionList && aServer,
      "oops...trying to initialize with a null host session list or server!");
  if (!aHostSessionList || !aServer) return NS_ERROR_NULL_POINTER;

  nsresult rv = m_downloadLineCache->GrowBuffer(kDownLoadCacheSize);
  NS_ENSURE_SUCCESS(rv, rv);

  m_flagState = new nsImapFlagAndUidState(kImapFlagAndUidStateSize);
  if (!m_flagState) return NS_ERROR_OUT_OF_MEMORY;

  aServer->GetUseIdle(&m_useIdle);
  aServer->GetForceSelect(&m_forceSelect);
  aServer->GetUseCondStore(&m_useCondStore);
  aServer->GetUseCompressDeflate(&m_useCompressDeflate);
  aServer->GetAllowUTF8Accept(&m_allowUTF8Accept);

  m_hostSessionList = aHostSessionList;
  m_parser.SetHostSessionList(aHostSessionList);
  m_parser.SetFlagState(m_flagState);

  // Initialize the empty mime part string on the main thread.
  nsCOMPtr<nsIStringBundle> bundle;
  rv = IMAPGetStringBundle(getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = bundle->GetStringFromName("imapEmptyMimePart", m_emptyMimePartString);
  NS_ENSURE_SUCCESS(rv, rv);

  // Now initialize the thread for the connection
  if (m_thread == nullptr) {
    nsCOMPtr<nsIThread> imapThread;
    nsresult rv = NS_NewNamedThread("IMAP", getter_AddRefs(imapThread));
    if (NS_FAILED(rv)) {
      NS_ASSERTION(imapThread, "Unable to create imap thread.");
      return rv;
    }
    RefPtr<nsImapProtocolMainLoopRunnable> runnable =
        new nsImapProtocolMainLoopRunnable(this);
    imapThread->Dispatch(runnable.forget(), NS_DISPATCH_NORMAL);
    imapThread->GetPRThread(&m_thread);
  }
  return NS_OK;
}

nsImapProtocol::~nsImapProtocol() {
  PR_Free(m_dataOutputBuf);

  // **** We must be out of the thread main loop function
  NS_ASSERTION(!m_imapThreadIsRunning, "Oops, thread is still running.");
  MOZ_DIAGNOSTIC_ASSERT(NS_IsMainThread());
}

const nsCString& nsImapProtocol::GetImapHostName() {
  if (m_runningUrl && m_hostName.IsEmpty()) {
    nsCOMPtr<nsIURI> url = do_QueryInterface(m_runningUrl);
    url->GetAsciiHost(m_hostName);
  }

  return m_hostName;
}

const nsCString& nsImapProtocol::GetImapUserName() {
  if (m_userName.IsEmpty() && m_imapServerSink) {
    m_imapServerSink->GetOriginalUsername(m_userName);
  }
  return m_userName;
}

const char* nsImapProtocol::GetImapServerKey() {
  if (m_serverKey.IsEmpty() && m_imapServerSink) {
    m_imapServerSink->GetServerKey(m_serverKey);
  }
  return m_serverKey.get();
}

nsresult nsImapProtocol::SetupSinkProxy() {
  if (!m_runningUrl) return NS_OK;
  nsresult res;
  bool newFolderSink = false;
  if (!m_imapMailFolderSink) {
    nsCOMPtr<nsIImapMailFolderSink> aImapMailFolderSink;
    (void)m_runningUrl->GetImapMailFolderSink(
        getter_AddRefs(aImapMailFolderSink));
    if (aImapMailFolderSink) {
      m_imapMailFolderSink = new ImapMailFolderSinkProxy(aImapMailFolderSink);
      newFolderSink = true;
    }
  }
  if (newFolderSink) Log("SetupSinkProxy", nullptr, "got m_imapMailFolderSink");

  if (!m_imapMessageSink) {
    nsCOMPtr<nsIImapMessageSink> aImapMessageSink;
    (void)m_runningUrl->GetImapMessageSink(getter_AddRefs(aImapMessageSink));
    if (aImapMessageSink) {
      m_imapMessageSink = new ImapMessageSinkProxy(aImapMessageSink);
    } else {
      return NS_ERROR_ILLEGAL_VALUE;
    }
  }
  if (!m_imapServerSink) {
    nsCOMPtr<nsIImapServerSink> aImapServerSink;
    res = m_runningUrl->GetImapServerSink(getter_AddRefs(aImapServerSink));
    if (aImapServerSink) {
      m_imapServerSink = new ImapServerSinkProxy(aImapServerSink);
      m_imapServerSinkLatest = m_imapServerSink;
    } else {
      return NS_ERROR_ILLEGAL_VALUE;
    }
  }
  if (!m_imapProtocolSink) {
    nsCOMPtr<nsIImapProtocolSink> anImapProxyHelper(
        do_QueryInterface(NS_ISUPPORTS_CAST(nsIImapProtocolSink*, this), &res));
    m_imapProtocolSink = new ImapProtocolSinkProxy(anImapProxyHelper);
  }
  return NS_OK;
}

static void SetSecurityCallbacksFromChannel(nsISocketTransport* aTrans,
                                            nsIChannel* aChannel) {
  nsCOMPtr<nsIInterfaceRequestor> callbacks;
  aChannel->GetNotificationCallbacks(getter_AddRefs(callbacks));

  nsCOMPtr<nsILoadGroup> loadGroup;
  aChannel->GetLoadGroup(getter_AddRefs(loadGroup));

  nsCOMPtr<nsIInterfaceRequestor> securityCallbacks;
  NS_NewNotificationCallbacksAggregation(callbacks, loadGroup,
                                         getter_AddRefs(securityCallbacks));
  if (securityCallbacks) aTrans->SetSecurityCallbacks(securityCallbacks);
}

// Setup With Url is intended to set up data which is held on a PER URL basis
// and not a per connection basis. If you have data which is independent of the
// url we are currently running, then you should put it in Initialize(). This is
// only ever called from the UI thread. It is called from LoadImapUrl, right
// before the url gets run - i.e., the url is next in line to run.
// See also ReleaseUrlState(), which frees a bunch of the things set up in here.
nsresult nsImapProtocol::SetupWithUrl(nsIURI* aURL, nsISupports* aConsumer) {
  nsresult rv = NS_ERROR_FAILURE;
  NS_ASSERTION(aURL, "null URL passed into Imap Protocol");
  ReentrantMonitorAutoEnter mon(mMonitor);
  m_urlInProgress = true;
  m_imapMailFolderSink = nullptr;

  if (aURL) {
    nsCOMPtr<nsIImapUrl> imapURL = do_QueryInterface(aURL, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    m_runningUrl = imapURL;
    m_runningUrlLatest = m_runningUrl;

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
    nsCOMPtr<nsIMsgIncomingServer> server = do_QueryReferent(m_server);
    if (!server) {
      rv = mailnewsUrl->GetServer(getter_AddRefs(server));
      NS_ENSURE_SUCCESS(rv, rv);
      m_server = do_GetWeakReference(server);
    }
    nsCOMPtr<nsIMsgFolder> folder;
    mailnewsUrl->GetFolder(getter_AddRefs(folder));
    mFolderLastModSeq = 0;
    mFolderTotalMsgCount = 0;
    mFolderHighestUID = 0;
    m_uidValidity = kUidUnknown;
    if (folder) {
      nsCOMPtr<nsIMsgDatabase> folderDB;
      nsCOMPtr<nsIDBFolderInfo> folderInfo;
      folder->GetDBFolderInfoAndDB(getter_AddRefs(folderInfo),
                                   getter_AddRefs(folderDB));
      if (folderInfo) {
        nsCString modSeqStr;
        folderInfo->GetCharProperty(kModSeqPropertyName, modSeqStr);
        mFolderLastModSeq = ParseUint64Str(modSeqStr.get());
        folderInfo->GetNumMessages(&mFolderTotalMsgCount);
        folderInfo->GetUint32Property(kHighestRecordedUIDPropertyName, 0,
                                      &mFolderHighestUID);
        folderInfo->GetImapUidValidity(&m_uidValidity);
      }
    }
    nsCOMPtr<nsIImapIncomingServer> imapServer = do_QueryInterface(server);
    nsCOMPtr<nsIStreamListener> aRealStreamListener =
        do_QueryInterface(aConsumer);
    m_runningUrl->GetMockChannel(getter_AddRefs(m_mockChannel));
    imapServer->GetIsGMailServer(&m_isGmailServer);
    if (!m_mockChannel) {
      nsCOMPtr<nsIPrincipal> nullPrincipal =
          NullPrincipal::CreateWithoutOriginAttributes();

      // there are several imap operations that aren't initiated via a
      // nsIChannel::AsyncOpen call on the mock channel. such as selecting a
      // folder. nsImapProtocol now insists on a mock channel when processing a
      // url.
      nsCOMPtr<nsIChannel> channel;
      rv =
          NS_NewChannel(getter_AddRefs(channel), aURL, nullPrincipal,
                        nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                        nsIContentPolicy::TYPE_OTHER);
      m_mockChannel = do_QueryInterface(channel);
      NS_ASSERTION(m_mockChannel,
                   "failed to get a mock channel in nsImapProtocol");

      // Certain imap operations (not initiated by the IO Service via AsyncOpen)
      // can be interrupted by  the stop button on the toolbar. We do this by
      // using the loadgroup of the docshell for the message pane. We really
      // shouldn't be doing this.. See the comment in
      // nsMsgMailNewsUrl::GetLoadGroup.
      nsCOMPtr<nsILoadGroup> loadGroup;
      mailnewsUrl->GetLoadGroup(
          getter_AddRefs(loadGroup));  // get the message pane load group
      if (loadGroup)
        loadGroup->AddRequest(m_mockChannel, nullptr /* context isupports */);
    }

    if (m_mockChannel) {
      m_mockChannel->SetImapProtocol(this);
      // if we have a listener from a mock channel, over-ride the consumer that
      // was passed in
      nsCOMPtr<nsIStreamListener> channelListener;
      m_mockChannel->GetChannelListener(getter_AddRefs(channelListener));
      if (channelListener)  // only over-ride if we have a non null channel
                            // listener
        aRealStreamListener = channelListener;
    }

    // since we'll be making calls directly from the imap thread to the channel
    // listener, we need to turn it into a proxy object....we'll assume that the
    // listener is on the same thread as the event sink queue
    if (aRealStreamListener) {
      NS_ASSERTION(!m_channelListener,
                   "shouldn't already have a channel listener");
      m_channelListener = new StreamListenerProxy(aRealStreamListener);
    }

    server->GetHostName(m_hostName);
    int32_t authMethod;
    (void)server->GetAuthMethod(&authMethod);
    InitPrefAuthMethods(authMethod, server);
    (void)server->GetSocketType(&m_socketType);
    bool shuttingDown;
    (void)imapServer->GetShuttingDown(&shuttingDown);
    if (!shuttingDown)
      (void)imapServer->GetUseIdle(&m_useIdle);
    else
      m_useIdle = false;
    imapServer->GetFetchByChunks(&m_fetchByChunks);
    imapServer->GetSendID(&m_sendID);

    nsAutoCString trashFolderPath;
    if (NS_SUCCEEDED(imapServer->GetTrashFolderName(trashFolderPath))) {
      if (m_allowUTF8Accept)
        m_trashFolderPath = trashFolderPath;
      else
        CopyUTF16toMUTF7(NS_ConvertUTF8toUTF16(trashFolderPath),
                         m_trashFolderPath);
    }

    bool preferPlainText =
        Preferences::GetBool("mailnews.display.prefer_plaintext");
    // If the pref has changed since the last time we ran a url,
    // clear the shell cache for this host. (bodyshell no longer exists.)
    if (preferPlainText != m_preferPlainText) {
      m_preferPlainText = preferPlainText;
    }
    // If enabled, retrieve the clientid so that we can use it later.
    bool clientidEnabled = false;
    if (NS_SUCCEEDED(server->GetClientidEnabled(&clientidEnabled)) &&
        clientidEnabled)
      server->GetClientid(m_clientId);
    else {
      m_clientId.Truncate();
    }

    bool proxyCallback = false;
    if (m_runningUrl && !m_transport /* and we don't have a transport yet */) {
      if (m_mockChannel) {
        rv = MsgExamineForProxyAsync(m_mockChannel, this,
                                     getter_AddRefs(m_proxyRequest));
        if (NS_FAILED(rv)) {
          rv = SetupWithUrlCallback(nullptr);
        } else {
          proxyCallback = true;
        }
      }
    }

    if (!proxyCallback) rv = LoadImapUrlInternal();
  }

  return rv;
}

// nsIProtocolProxyCallback
NS_IMETHODIMP
nsImapProtocol::OnProxyAvailable(nsICancelable* aRequest, nsIChannel* aChannel,
                                 nsIProxyInfo* aProxyInfo, nsresult aStatus) {
  // If we're called with NS_BINDING_ABORTED, the IMAP thread already died,
  // so we can't carry on. Otherwise, no checking of 'aStatus' here, see
  // nsHttpChannel::OnProxyAvailable(). Status is non-fatal and we just kick on.
  if (aStatus == NS_BINDING_ABORTED) return NS_ERROR_FAILURE;

  nsresult rv = SetupWithUrlCallback(aProxyInfo);
  if (NS_FAILED(rv)) {
    // Cancel the protocol and be done.
    if (m_mockChannel) m_mockChannel->Cancel(rv);
    return rv;
  }

  rv = LoadImapUrlInternal();
  if (NS_FAILED(rv)) {
    if (m_mockChannel) m_mockChannel->Cancel(rv);
  }

  return rv;
}

nsresult nsImapProtocol::SetupWithUrlCallback(nsIProxyInfo* aProxyInfo) {
  m_proxyRequest = nullptr;

  nsresult rv;

  nsCOMPtr<nsISocketTransportService> socketService =
      mozilla::components::SocketTransport::Service();

  Log("SetupWithUrlCallback", nullptr, "clearing IMAP_CONNECTION_IS_OPEN");
  ClearFlag(IMAP_CONNECTION_IS_OPEN);
  const char* connectionType = nullptr;

  if (m_socketType == nsMsgSocketType::SSL)
    connectionType = "ssl";
  else if (m_socketType == nsMsgSocketType::alwaysSTARTTLS)
    connectionType = "starttls";

  int32_t port = -1;
  nsCOMPtr<nsIURI> uri = do_QueryInterface(m_runningUrl, &rv);
  if (NS_FAILED(rv)) return rv;
  uri->GetPort(&port);

  AutoTArray<nsCString, 1> connectionTypeArray;
  if (connectionType) connectionTypeArray.AppendElement(connectionType);
  // NOTE: Some errors won't show up until the first read attempt (SSL bad
  // certificate errors, for example).
  rv = socketService->CreateTransport(connectionTypeArray, m_hostName, port,
                                      aProxyInfo, nullptr,
                                      getter_AddRefs(m_transport));
  NS_ENSURE_SUCCESS(rv, rv);

  // remember so we can know whether we can issue a start tls or not...
  m_connectionType = connectionType;
  if (m_transport && m_mockChannel) {
    uint8_t qos;
    rv = GetQoSBits(&qos);
    if (NS_SUCCEEDED(rv)) m_transport->SetQoSBits(qos);

    // Ensure that the socket can get the notification callbacks
    SetSecurityCallbacksFromChannel(m_transport, m_mockChannel);

    // open buffered, blocking input stream
    rv = m_transport->OpenInputStream(nsITransport::OPEN_BLOCKING, 0, 0,
                                      getter_AddRefs(m_inputStream));
    if (NS_FAILED(rv)) return rv;

    // open buffered, blocking output stream
    rv = m_transport->OpenOutputStream(nsITransport::OPEN_BLOCKING, 0, 0,
                                       getter_AddRefs(m_outputStream));
    if (NS_FAILED(rv)) return rv;
    SetFlag(IMAP_CONNECTION_IS_OPEN);

    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    obs->NotifyObservers(m_runningUrl, "server-connection-succeeded", nullptr);
  }

  return rv;
}

// when the connection is done processing the current state, free any per url
// state data...
void nsImapProtocol::ReleaseUrlState(bool rerunning) {
  // clear out the socket's reference to the notification callbacks for this
  // transaction
  {
    ReentrantMonitorAutoEnter mon(mMonitor);
    if (m_transport) {
      m_transport->SetSecurityCallbacks(nullptr);
      m_transport->SetEventSink(nullptr, nullptr);
    }
  }

  if (m_mockChannel && !rerunning) {
    // Proxy the close of the channel to the ui thread.
    if (m_imapMailFolderSink)
      m_imapMailFolderSink->CloseMockChannel(m_mockChannel);
    else
      m_mockChannel->Close();

    {
      // grab a lock so m_mockChannel doesn't get cleared out
      // from under us.
      ReentrantMonitorAutoEnter mon(mMonitor);
      if (m_mockChannel) {
        // Proxy the release of the channel to the main thread.  This is
        // something that the xpcom proxy system should do for us!
        NS_ReleaseOnMainThread("nsImapProtocol::m_mockChannel",
                               m_mockChannel.forget());
      }
    }
  }

  m_imapMessageSink = nullptr;

  // Proxy the release of the listener to the main thread.  This is something
  // that the xpcom proxy system should do for us!
  {
    // grab a lock so the m_channelListener doesn't get cleared.
    ReentrantMonitorAutoEnter mon(mMonitor);
    if (m_channelListener) {
      NS_ReleaseOnMainThread("nsImapProtocol::m_channelListener",
                             m_channelListener.forget());
    }
  }
  m_channelInputStream = nullptr;
  m_channelOutputStream = nullptr;

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl;
  nsCOMPtr<nsIImapMailFolderSink> saveFolderSink;

  {
    ReentrantMonitorAutoEnter mon(mMonitor);
    if (m_runningUrl) {
      mailnewsurl = do_QueryInterface(m_runningUrl);
      // It is unclear what 'saveFolderSink' is used for, most likely to hold
      // a reference for a little longer. See bug 1324893 and bug 391259.
      saveFolderSink = m_imapMailFolderSink;

      m_runningUrl =
          nullptr;  // force us to release our last reference on the url
      m_urlInProgress = false;
    }
  }
  // Need to null this out whether we have an m_runningUrl or not
  m_imapMailFolderSink = nullptr;

  // we want to make sure the imap protocol's last reference to the url gets
  // released back on the UI thread. This ensures that the objects the imap url
  // hangs on to properly get released back on the UI thread.
  if (mailnewsurl) {
    NS_ReleaseOnMainThread("nsImapProtocol::m_runningUrl",
                           mailnewsurl.forget());
  }
  saveFolderSink = nullptr;
}

class nsImapCancelProxy : public mozilla::Runnable {
 public:
  explicit nsImapCancelProxy(nsICancelable* aProxyRequest)
      : mozilla::Runnable("nsImapCancelProxy"), mRequest(aProxyRequest) {}
  NS_IMETHOD Run() {
    if (mRequest) mRequest->Cancel(NS_BINDING_ABORTED);
    return NS_OK;
  }

 private:
  nsCOMPtr<nsICancelable> mRequest;
};

bool nsImapProtocol::RunImapThreadMainLoop() {
  PR_CEnterMonitor(this);
  NS_ASSERTION(!m_imapThreadIsRunning,
               "Oh. oh. thread is already running. What's wrong here?");
  if (m_imapThreadIsRunning) {
    PR_CExitMonitor(this);
    return false;
  }

  m_imapThreadIsRunning = true;
  PR_CExitMonitor(this);

  // call the platform specific main loop ....
  ImapThreadMainLoop();

  if (m_proxyRequest) {
    // Cancel proxy on main thread.
    RefPtr<nsImapCancelProxy> cancelProxy =
        new nsImapCancelProxy(m_proxyRequest);
    NS_DispatchAndSpinEventLoopUntilComplete(
        "nsImapProtocol::RunImapThreadMainLoop"_ns,
        GetMainThreadSerialEventTarget(), cancelProxy.forget());
    m_proxyRequest = nullptr;
  }

  if (m_runningUrl) {
    NS_ReleaseOnMainThread("nsImapProtocol::m_runningUrl",
                           m_runningUrl.forget());
  }

  // close streams via UI thread if it's not already done
  if (m_imapProtocolSink) m_imapProtocolSink->CloseStreams();

  m_imapMailFolderSink = nullptr;
  m_imapMailFolderSinkSelected = nullptr;
  m_imapMessageSink = nullptr;

  return true;
}

//
// Must be called from UI thread only
//
NS_IMETHODIMP nsImapProtocol::CloseStreams() {
  // make sure that it is called by the UI thread
  MOZ_ASSERT(NS_IsMainThread(),
             "CloseStreams() should not be called from an off UI thread");

  {
    ReentrantMonitorAutoEnter mon(mMonitor);
    if (m_transport) {
      // make sure the transport closes (even if someone is still indirectly
      // referencing it).
      m_transport->Close(NS_ERROR_ABORT);
      m_transport = nullptr;
    }
    m_inputStream = nullptr;
    m_outputStream = nullptr;
    m_channelListener = nullptr;
    if (m_mockChannel) {
      m_mockChannel->Close();
      m_mockChannel = nullptr;
    }
    m_channelInputStream = nullptr;
    m_channelOutputStream = nullptr;

    // Close scope because we must let go of the monitor before calling
    // RemoveConnection to unblock anyone who tries to get a monitor to the
    // protocol object while holding onto a monitor to the server.
  }
  nsCOMPtr<nsIMsgIncomingServer> me_server = do_QueryReferent(m_server);
  if (me_server) {
    nsresult result;
    nsCOMPtr<nsIImapIncomingServer> aImapServer(
        do_QueryInterface(me_server, &result));
    if (NS_SUCCEEDED(result)) aImapServer->RemoveConnection(this);
    me_server = nullptr;
  }
  m_server = nullptr;
  // take this opportunity of being on the UI thread to
  // persist chunk prefs if they've changed
  if (gChunkSizeDirty) {
    Preferences::SetInt("mail.imap.chunk_size", gChunkSize);
    Preferences::SetInt("mail.imap.min_chunk_size_threshold", gChunkThreshold);
    gChunkSizeDirty = false;
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapProtocol::GetUrlWindow(nsIMsgMailNewsUrl* aUrl,
                                           nsIMsgWindow** aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aUrl);
  NS_ENSURE_ARG_POINTER(aMsgWindow);
  return aUrl->GetMsgWindow(aMsgWindow);
}

NS_IMETHODIMP nsImapProtocol::SetupMainThreadProxies() {
  return SetupSinkProxy();
}

NS_IMETHODIMP nsImapProtocol::OnInputStreamReady(nsIAsyncInputStream* inStr) {
  // should we check if it's a close vs. data available?
  if (m_idle) {
    uint64_t bytesAvailable = 0;
    (void)inStr->Available(&bytesAvailable);
    // check if data available - might be a close
    if (bytesAvailable != 0) {
      ReentrantMonitorAutoEnter mon(m_urlReadyToRunMonitor);
      m_lastActiveTime = PR_Now();
      m_idleResponseReadyToHandle = true;
      mon.Notify();
    }
  }
  return NS_OK;
}

// this is to be called from the UI thread. It sets m_threadShouldDie,
// and then signals the imap thread, which, when it wakes up, should exit.
// The imap thread cleanup code will check m_safeToCloseConnection.
NS_IMETHODIMP
nsImapProtocol::TellThreadToDie(bool aIsSafeToClose) {
  MOZ_DIAGNOSTIC_ASSERT(
      NS_IsMainThread(),
      "TellThreadToDie(aIsSafeToClose) should only be called from UI thread");
  ReentrantMonitorAutoEnter mon(mMonitor);

  nsCOMPtr<nsIMsgIncomingServer> me_server = do_QueryReferent(m_server);
  if (me_server) {
    nsresult rv;
    nsCOMPtr<nsIImapIncomingServer> aImapServer(
        do_QueryInterface(me_server, &rv));
    if (NS_SUCCEEDED(rv)) aImapServer->RemoveConnection(this);
    m_server = nullptr;
    me_server = nullptr;
  }
  {
    ReentrantMonitorAutoEnter deathMon(m_threadDeathMonitor);
    m_safeToCloseConnection = aIsSafeToClose;
    m_threadShouldDie = true;
  }
  ReentrantMonitorAutoEnter readyMon(m_urlReadyToRunMonitor);
  m_nextUrlReadyToRun = true;
  readyMon.Notify();
  return NS_OK;
}

/**
 * Dispatch socket thread to to determine if connection is alive.
 */
nsresult nsImapProtocol::IsTransportAlive(bool* alive) {
  nsresult rv;
  auto GetIsAlive = [transport = nsCOMPtr{m_transport}, &rv, alive]() mutable {
    rv = transport->IsAlive(alive);
  };
  nsCOMPtr<nsIEventTarget> socketThread =
      mozilla::components::SocketTransport::Service();
  mozilla::SyncRunnable::DispatchToThread(
      socketThread,
      NS_NewRunnableFunction("nsImapProtocol::IsTransportAlive", GetIsAlive));
  return rv;
}

/**
 * Dispatch socket thread to initiate STARTTLS handshakes.
 */
nsresult nsImapProtocol::TransportStartTLS() {
  nsresult rv = NS_ERROR_NOT_AVAILABLE;
  nsCOMPtr<nsITLSSocketControl> tlsSocketControl;
  if (m_transport &&
      NS_SUCCEEDED(
          m_transport->GetTlsSocketControl(getter_AddRefs(tlsSocketControl))) &&
      tlsSocketControl) {
    auto CallStartTLS = [sockCon = nsCOMPtr{tlsSocketControl}, &rv]() mutable {
      rv = sockCon->StartTLS();
    };
    nsCOMPtr<nsIEventTarget> socketThread =
        mozilla::components::SocketTransport::Service();
    mozilla::SyncRunnable::DispatchToThread(
        socketThread, NS_NewRunnableFunction(
                          "nsImapProtocol::TransportStartTLS", CallStartTLS));
  }
  return rv;
}

/**
 * Dispatch socket thread to obtain transport security information.
 */
void nsImapProtocol::GetTransportSecurityInfo(
    nsITransportSecurityInfo** aSecurityInfo) {
  *aSecurityInfo = nullptr;
  nsCOMPtr<nsIEventTarget> socketThread =
      mozilla::components::SocketTransport::Service();
  nsCOMPtr<nsITLSSocketControl> tlsSocketControl;
  if (NS_SUCCEEDED(
          m_transport->GetTlsSocketControl(getter_AddRefs(tlsSocketControl))) &&
      tlsSocketControl) {
    if (socketThread) {
      nsCOMPtr<nsITransportSecurityInfo> secInfo;
      auto GetSecurityInfo = [&tlsSocketControl, &secInfo]() mutable {
        tlsSocketControl->GetSecurityInfo(getter_AddRefs(secInfo));
      };
      mozilla::SyncRunnable::DispatchToThread(
          socketThread,
          NS_NewRunnableFunction("nsImapProtocol::GetTransportSecurityInfo",
                                 GetSecurityInfo));
      NS_IF_ADDREF(*aSecurityInfo = secInfo);
    }
  }
}

void nsImapProtocol::TellThreadToDie() {
  nsresult rv = NS_OK;
  MOZ_DIAGNOSTIC_ASSERT(
      !NS_IsMainThread(),
      "TellThreadToDie() should not be called from UI thread");

  // prevent re-entering this method because it may lock the UI.
  if (m_inThreadShouldDie) return;
  m_inThreadShouldDie = true;

  {
    ReentrantMonitorAutoEnter mon(mMonitor);
    m_urlInProgress = true;  // let's say it's busy so no one tries to use
                             // this about to die connection.
  }

  // This routine is called only from the imap protocol thread.
  // The UI thread causes this to be called by calling TellThreadToDie.
  // In that case, m_safeToCloseConnection will be FALSE if it's dropping a
  // timed out connection, true when closing a cached connection.
  // We're using PR_CEnter/ExitMonitor because Monitors don't like having
  // us to hold one monitor and call code that gets a different monitor. And
  // some of the methods we call here use Monitors.
  PR_CEnterMonitor(this);

  bool urlWritingData = false;
  bool connectionIdle = !m_runningUrl;

  if (!connectionIdle)
    urlWritingData = m_imapAction == nsIImapUrl::nsImapAppendMsgFromFile ||
                     m_imapAction == nsIImapUrl::nsImapAppendDraftFromFile;

  bool closeNeeded = GetServerStateParser().GetIMAPstate() ==
                         nsImapServerResponseParser::kFolderSelected &&
                     m_safeToCloseConnection;
  nsCString command;
  // if a url is writing data, we can't even logout, so we're just
  // going to close the connection as if the user pressed stop.
  if (m_currentServerCommandTagNumber > 0 && !urlWritingData) {
    bool isAlive = false;
    if (m_transport) rv = IsTransportAlive(&isAlive);

    if (TestFlag(IMAP_CONNECTION_IS_OPEN) && m_idle && isAlive) EndIdle(false);

    if (NS_SUCCEEDED(rv) && isAlive && closeNeeded &&
        GetDeleteIsMoveToTrash() && TestFlag(IMAP_CONNECTION_IS_OPEN) &&
        m_outputStream)
      ImapClose(true, connectionIdle);

    if (NS_SUCCEEDED(rv) && isAlive && TestFlag(IMAP_CONNECTION_IS_OPEN) &&
        NS_SUCCEEDED(GetConnectionStatus()) && m_outputStream)
      Logout(true, connectionIdle);
  }
  PR_CExitMonitor(this);
  // close streams via UI thread
  if (m_imapProtocolSink) {
    m_imapProtocolSink->CloseStreams();
    m_imapProtocolSink = nullptr;
  }
  Log("TellThreadToDie", nullptr, "close socket connection");

  {
    ReentrantMonitorAutoEnter mon(m_threadDeathMonitor);
    m_threadShouldDie = true;
  }
  ReentrantMonitorAutoEnter urlReadyMon(m_urlReadyToRunMonitor);
  urlReadyMon.NotifyAll();
}

NS_IMETHODIMP
nsImapProtocol::GetLastActiveTimeStamp(PRTime* aTimeStamp) {
  if (aTimeStamp) *aTimeStamp = m_lastActiveTime;
  return NS_OK;
}

static void DoomCacheEntry(nsIMsgMailNewsUrl* url);
NS_IMETHODIMP
nsImapProtocol::PseudoInterruptMsgLoad(nsIMsgFolder* aImapFolder,
                                       nsIMsgWindow* aMsgWindow,
                                       bool* interrupted) {
  NS_ENSURE_ARG(interrupted);

  *interrupted = false;

  PR_CEnterMonitor(this);

  if (m_runningUrl && !TestFlag(IMAP_CLEAN_UP_URL_STATE)) {
    nsImapAction imapAction;
    m_runningUrl->GetImapAction(&imapAction);

    if (imapAction == nsIImapUrl::nsImapMsgFetch) {
      nsresult rv = NS_OK;
      nsCOMPtr<nsIImapUrl> runningImapURL;

      rv = GetRunningImapURL(getter_AddRefs(runningImapURL));
      if (NS_SUCCEEDED(rv) && runningImapURL) {
        nsCOMPtr<nsIMsgFolder> runningImapFolder;
        nsCOMPtr<nsIMsgWindow> msgWindow;
        nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
            do_QueryInterface(runningImapURL);
        mailnewsUrl->GetMsgWindow(getter_AddRefs(msgWindow));
        mailnewsUrl->GetFolder(getter_AddRefs(runningImapFolder));
        if (aImapFolder == runningImapFolder && msgWindow == aMsgWindow) {
          MOZ_LOG(IMAPCache, LogLevel::Debug,
                  ("%s: Set PseudoInterrupt", __func__));
          PseudoInterrupt(true);
          *interrupted = true;
        }
        // If we're pseudo-interrupted, doom any incomplete cache entry.
        // But if mock channel indicates fetch is complete so cache write is
        // done, then don't doom the cache entry.
        bool cacheWriteInProgress = true;
        if (m_mockChannel)
          m_mockChannel->GetWritingToCache(&cacheWriteInProgress);
        if (cacheWriteInProgress) {
          MOZ_LOG(IMAPCache, LogLevel::Debug,
                  ("%s: Call DoomCacheEntry()", __func__));
          DoomCacheEntry(mailnewsUrl);
        }
      }
    }
  }
  PR_CExitMonitor(this);
  return NS_OK;
}

bool nsImapProtocol::IsUrlInProgress() {
  ReentrantMonitorAutoEnter mon(mMonitor);
  return m_urlInProgress;
}

void nsImapProtocol::ImapThreadMainLoop() {
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("ImapThreadMainLoop entering [this=%p]", this));

  PRIntervalTime sleepTime = kImapSleepTime;
  bool idlePending = false;
  while (!DeathSignalReceived()) {
    nsresult rv = NS_OK;
    bool urlReadyToRun;

    // wait for a URL or idle response to process...
    while (!DeathSignalReceived()) {
      {
        ReentrantMonitorAutoEnter mon(m_threadDeathMonitor);
        if (m_threadShouldDie) {
          break;
        }
      }
      {
        ReentrantMonitorAutoEnter mon(m_urlReadyToRunMonitor);
        if (m_nextUrlReadyToRun || m_idleResponseReadyToHandle) {
          break;
        }
        rv = mon.Wait(sleepTime);
        if (NS_FAILED(rv)) {
          break;
        }
        if (idlePending) {
          break;
        }
      }
    }

    urlReadyToRun = m_nextUrlReadyToRun;
    m_nextUrlReadyToRun = false;

    // This will happen if the UI thread signals us to die
    if (m_threadShouldDie) {
      TellThreadToDie();
      break;
    }

    if (NS_FAILED(rv) && PR_PENDING_INTERRUPT_ERROR == PR_GetError()) {
      printf("error waiting for monitor\n");
      break;
    }

    // If an idle response has occurred, handle only it on this pass through
    // the loop.
    if (m_idleResponseReadyToHandle && !m_threadShouldDie) {
      m_idleResponseReadyToHandle = false;
      HandleIdleResponses();
      if (urlReadyToRun) {
        // A URL is also ready. Process it on next loop.
        m_nextUrlReadyToRun = true;
        urlReadyToRun = false;
      }
    }

    if (urlReadyToRun && m_runningUrl) {
      if (m_currentServerCommandTagNumber && m_transport) {
        bool isAlive;
        rv = IsTransportAlive(&isAlive);
        // if the transport is not alive, and we've ever sent a command with
        // this connection, kill it. otherwise, we've probably just not finished
        // setting it so don't kill it!
        if (NS_FAILED(rv) || !isAlive) {
          // This says we never started running the url, which is the case.
          m_runningUrl->SetRerunningUrl(false);
          RetryUrl();
          return;
        }
      }
      //
      // NOTE: Although we cleared m_nextUrlReadyToRun above, it may now be set
      //       again by LoadImapUrlInternal(), which runs on the main thread.
      //       Because of this, we must not clear m_nextUrlReadyToRun here.
      //
      if (ProcessCurrentURL()) {
        // Another URL has been setup to run. Process it on next loop.
        m_nextUrlReadyToRun = true;
        m_imapMailFolderSink = nullptr;
      } else {
        // No more URLs setup to run. Set idle pending if user has configured
        // idle and if a URL is not in progress and if the server has IDLE
        // capability. Just set idlePending since want to wait a short time
        // to see if more URLs occurs before actually entering idle.
        if (!idlePending && m_useIdle && !IsUrlInProgress() &&
            GetServerStateParser().GetCapabilityFlag() & kHasIdleCapability &&
            GetServerStateParser().GetIMAPstate() ==
                nsImapServerResponseParser::kFolderSelected) {
          // Set-up short wait time in milliseconds
          static const PRIntervalTime kIdleWait =
              PR_MillisecondsToInterval(2000);
          sleepTime = kIdleWait;
          idlePending = true;
          Log("ImapThreadMainLoop", nullptr, "idlePending set");
        } else {
          // if not idle used, don't need to remember folder sink
          m_imapMailFolderSink = nullptr;
        }
      }
    } else {
      // No URL to run detected on wake up.
      if (idlePending) {
        // Have seen no URLs for the short time (kIdleWait) so go into idle mode
        // and set the loop sleep time back to its original longer time.
        Idle();
        if (!m_idle) {
          // Server rejected IDLE. Treat like IDLE not enabled or available.
          m_imapMailFolderSink = nullptr;
        }
        idlePending = false;
        sleepTime = kImapSleepTime;
      }
    }
    if (!GetServerStateParser().Connected()) break;

    // This can happen if the UI thread closes cached connections in the
    // OnStopRunningUrl notification.
    if (m_threadShouldDie) TellThreadToDie();
  }
  m_imapThreadIsRunning = false;

  MOZ_LOG(IMAP, LogLevel::Debug,
          ("ImapThreadMainLoop leaving [this=%p]", this));
}

// This handles the response to Idle() command and handles responses sent by
// the server after in idle mode. Returns true if a BAD or NO response is
// not seen which is needed when called from Idle().
bool nsImapProtocol::HandleIdleResponses() {
  bool rvIdleOk = true;
  bool untagged = false;
  NS_ASSERTION(PL_strstr(m_currentCommand.get(), " IDLE"), "not IDLE!");
  do {
    ParseIMAPandCheckForNewMail();
    rvIdleOk = rvIdleOk && !GetServerStateParser().CommandFailed();
    untagged = untagged || GetServerStateParser().UntaggedResponse();
  } while (m_inputStreamBuffer->NextLineAvailable() &&
           GetServerStateParser().Connected());

  // If still connected and rvIdleOk is true and an untagged response was
  // detected and have the sink pointer, OnNewIdleMessage will invoke a URL to
  // update the folder. Otherwise just setup so we get notified of idle response
  // data on the socket transport thread by OnInputStreamReady() above, which
  // will trigger the imap thread main loop to run and call this function again.
  if (GetServerStateParser().Connected() && rvIdleOk) {
    if (m_imapMailFolderSinkSelected && untagged) {
      Log("HandleIdleResponses", nullptr, "idle response");
      m_imapMailFolderSinkSelected->OnNewIdleMessages();
    } else {
      // Enable async wait mode. Occurs when Idle() called.
      nsCOMPtr<nsIAsyncInputStream> asyncInputStream =
          do_QueryInterface(m_inputStream);
      if (asyncInputStream) {
        asyncInputStream->AsyncWait(this, 0, 0, nullptr);
        Log("HandleIdleResponses", nullptr, "idle mode async waiting");
      }
    }
  }
  return rvIdleOk;
}

void nsImapProtocol::EstablishServerConnection() {
#define ESC_LENGTH(x) (sizeof(x) - 1)
#define ESC_OK "* OK"
#define ESC_OK_LEN ESC_LENGTH(ESC_OK)
#define ESC_PREAUTH "* PREAUTH"
#define ESC_PREAUTH_LEN ESC_LENGTH(ESC_PREAUTH)
#define ESC_CAPABILITY_STAR "* "
#define ESC_CAPABILITY_STAR_LEN ESC_LENGTH(ESC_CAPABILITY_STAR)
#define ESC_CAPABILITY_OK "* OK ["
#define ESC_CAPABILITY_OK_LEN ESC_LENGTH(ESC_CAPABILITY_OK)
#define ESC_CAPABILITY_GREETING (ESC_CAPABILITY_OK "CAPABILITY")
#define ESC_CAPABILITY_GREETING_LEN ESC_LENGTH(ESC_CAPABILITY_GREETING)
#define ESC_BYE "* BYE"
#define ESC_BYE_LEN ESC_LENGTH(ESC_BYE)

  char* serverResponse = CreateNewLineFromSocket();  // read in the greeting
  // record the fact that we've received a greeting for this connection so we
  // don't ever try to do it again..
  if (serverResponse) SetFlag(IMAP_RECEIVED_GREETING);

  if (!PL_strncasecmp(serverResponse, ESC_OK, ESC_OK_LEN)) {
    SetConnectionStatus(NS_OK);

    if (!PL_strncasecmp(serverResponse, ESC_CAPABILITY_GREETING,
                        ESC_CAPABILITY_GREETING_LEN)) {
      nsAutoCString tmpstr(serverResponse);
      int32_t endIndex = tmpstr.FindChar(']', ESC_CAPABILITY_GREETING_LEN);
      if (endIndex >= 0) {
        // Allocate the new buffer here. This buffer will be passed to
        // ParseIMAPServerResponse() where it will be used to fill the
        // fCurrentLine field and will be freed by the next call to
        // ResetLexAnalyzer().
        char* fakeServerResponse = (char*)PR_Malloc(PL_strlen(serverResponse));
        // Munge the greeting into something that would pass for an IMAP
        // server's response to a "CAPABILITY" command.
        strcpy(fakeServerResponse, ESC_CAPABILITY_STAR);
        strcat(fakeServerResponse, serverResponse + ESC_CAPABILITY_OK_LEN);
        fakeServerResponse[endIndex - ESC_CAPABILITY_OK_LEN +
                           ESC_CAPABILITY_STAR_LEN] = '\0';
        // Tell the response parser that we just issued a "CAPABILITY" and
        // got the following back.
        GetServerStateParser().ParseIMAPServerResponse("1 CAPABILITY", true,
                                                       fakeServerResponse);
      }
    }
  } else if (!PL_strncasecmp(serverResponse, ESC_PREAUTH, ESC_PREAUTH_LEN)) {
    // PREAUTH greeting received. We've been pre-authenticated by the server.
    // We can skip sending a password and transition right into the
    // kAuthenticated state; but we won't if the user has configured STARTTLS.
    // (STARTTLS can only occur with the server in non-authenticated state.)
    if (m_socketType != nsMsgSocketType::alwaysSTARTTLS) {
      GetServerStateParser().PreauthSetAuthenticatedState();

      if (GetServerStateParser().GetCapabilityFlag() == kCapabilityUndefined)
        Capability();

      if (!(GetServerStateParser().GetCapabilityFlag() &
            (kIMAP4Capability | kIMAP4rev1Capability | kIMAP4other))) {
        // AlertUserEventUsingId(MK_MSG_IMAP_SERVER_NOT_IMAP4);
        SetConnectionStatus(NS_ERROR_FAILURE);  // stop netlib
      } else {
        // let's record the user as authenticated.
        m_imapServerSink->SetUserAuthenticated(true);
        m_hostSessionList->SetPasswordVerifiedOnline(GetImapServerKey());

        ProcessAfterAuthenticated();
        // the connection was a success
        SetConnectionStatus(NS_OK);
      }
    } else {
      // STARTTLS is configured so don't transition to authenticated state. Just
      // alert the user, log the error and drop the connection. This may
      // indicate a man-in-the middle attack if the user is not expecting
      // PREAUTH. The user must change the connection security setting to other
      // than STARTTLS to allow PREAUTH to be accepted on subsequent IMAP
      // connections.
      AlertUserEventUsingName("imapServerDisconnected");
      const nsCString& hostName = GetImapHostName();
      MOZ_LOG(
          IMAP, LogLevel::Error,
          ("PREAUTH received from IMAP server %s because STARTTLS selected. "
           "Connection dropped",
           hostName.get()));
      SetConnectionStatus(NS_ERROR_FAILURE);  // stop netlib
    }
  } else if (!PL_strncasecmp(serverResponse, ESC_BYE, ESC_BYE_LEN)) {
    if (m_imapServerSink) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
      m_imapServerSink->FEAlertFromServer(nsDependentCString(serverResponse),
                                          mailnewsUrl, true);
    }
    SetConnectionStatus(NS_ERROR_FAILURE);  // stop netlib
    if (MOZ_LOG_TEST(IMAP, LogLevel::Error)) {
      const nsCString& hostName = GetImapHostName();
      MOZ_LOG(IMAP, LogLevel::Error,
              ("BYE greeting sent by IMAP server %s. "
               "Connection rejected by server and is now closed.",
               hostName.get()));
    }
  }
  PR_Free(serverResponse);  // we don't care about the greeting yet...

#undef ESC_LENGTH
#undef ESC_OK
#undef ESC_OK_LEN
#undef ESC_PREAUTH
#undef ESC_PREAUTH_LEN
#undef ESC_CAPABILITY_STAR
#undef ESC_CAPABILITY_STAR_LEN
#undef ESC_CAPABILITY_OK
#undef ESC_CAPABILITY_OK_LEN
#undef ESC_CAPABILITY_GREETING
#undef ESC_CAPABILITY_GREETING_LEN
#undef ESC_BYE
#undef ESC_BYE_LEN
}

// This can get called from the UI thread or an imap thread.
// It makes sure we don't get left with partial messages in
// the memory cache.
static void DoomCacheEntry(nsIMsgMailNewsUrl* url) {
  bool readingFromMemCache = false;
  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(url);
  imapUrl->GetMsgLoadingFromCache(&readingFromMemCache);
  if (!readingFromMemCache) {
    nsCOMPtr<nsICacheEntry> cacheEntry;
    url->GetMemCacheEntry(getter_AddRefs(cacheEntry));
    if (cacheEntry) {
      MOZ_LOG(IMAPCache, LogLevel::Debug,
              ("%s: Call AsyncDoom(), url=%s", __func__,
               url->GetSpecOrDefault().get()));
      cacheEntry->AsyncDoom(nullptr);
    }
  }
}

/**
 * ProcessCurrentURL() runs the current URL (m_runningUrl).
 * Things to remember:
 * - IMAP protocol URLs don't correspond directly to IMAP commands. A single
 *   URL might cause multiple IMAP commands to be issued.
 * - This is all synchronous. But that's OK, because we're running in our
 *   own thread.
 *
 * @return true if another url was run, false otherwise.
 */
bool nsImapProtocol::ProcessCurrentURL() {
  nsresult rv = NS_OK;
  if (m_idle) EndIdle();

  if (m_retryUrlOnError) {
    // we clear this flag if we're re-running immediately, because that
    // means we never sent a start running url notification, and later we
    // don't send start running notification if we think we're rerunning
    // the url (see first call to SetUrlState below). This means we won't
    // send a start running notification, which means our stop running
    // notification will be ignored because we don't think we were running.
    m_runningUrl->SetRerunningUrl(false);
    return RetryUrl();
  }
  Log("ProcessCurrentURL", nullptr, "entering");
  (void)GetImapHostName();  // force m_hostName to get set.

  bool logonFailed = false;
  bool anotherUrlRun = false;
  bool rerunningUrl = false;
  bool isExternalUrl;
  bool validUrl = true;

  PseudoInterrupt(false);  // clear this if left over from previous url.

  m_runningUrl->GetRerunningUrl(&rerunningUrl);
  m_runningUrl->GetExternalLinkUrl(&isExternalUrl);
  m_runningUrl->GetValidUrl(&validUrl);
  m_runningUrl->GetImapAction(&m_imapAction);

  if (isExternalUrl) {
    if (m_imapAction == nsIImapUrl::nsImapSelectFolder) {
      // we need to send a start request so that the doc loader
      // will call HandleContent on the imap service so we
      // can abort this url, and run a new url in a new msg window
      // to run the folder load url and get off this crazy merry-go-round.
      if (m_channelListener) {
        m_channelListener->OnStartRequest(m_mockChannel);
      }
      return false;
    }
  }

  if (!m_imapMailFolderSink && m_imapProtocolSink) {
    // This occurs when running another URL in the main thread loop
    rv = m_imapProtocolSink->SetupMainThreadProxies();
    NS_ENSURE_SUCCESS(rv, false);
  }

  // Reinitialize the parser
  GetServerStateParser().InitializeState();
  GetServerStateParser().SetConnected(true);

  // acknowledge that we are running the url now..
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl =
      do_QueryInterface(m_runningUrl, &rv);
  nsAutoCString urlSpec;
  rv = mailnewsurl->GetSpec(urlSpec);
  NS_ENSURE_SUCCESS(rv, false);
  Log("ProcessCurrentURL", urlSpec.get(),
      (validUrl) ? " = currentUrl" : " is not valid");
  if (!validUrl) return false;

  if (NS_SUCCEEDED(rv) && mailnewsurl && m_imapMailFolderSink && !rerunningUrl)
    m_imapMailFolderSink->SetUrlState(this, mailnewsurl, true, false, NS_OK);

  // if we are set up as a channel, we should notify our channel listener that
  // we are starting... so pass in ourself as the channel and not the underlying
  // socket or file channel the protocol happens to be using
  if (m_channelListener)  // ### not sure we want to do this if rerunning url...
  {
    m_channelListener->OnStartRequest(m_mockChannel);
  }
  // If we haven't received the greeting yet, we need to make sure we strip
  // it out of the input before we start to do useful things...
  if (!TestFlag(IMAP_RECEIVED_GREETING)) EstablishServerConnection();

  // Step 1: If we have not moved into the authenticated state yet then do so
  // by attempting to logon.
  if (!DeathSignalReceived() && NS_SUCCEEDED(GetConnectionStatus()) &&
      (GetServerStateParser().GetIMAPstate() ==
       nsImapServerResponseParser::kNonAuthenticated)) {
    /* if we got here, the server's greeting should not have been PREAUTH */
    // If greeting did not contain a capability response and if user has not
    // configured STARTTLS, request capabilities. If STARTTLS configured,
    // capabilities will be requested after TLS handshakes are complete.
    if ((GetServerStateParser().GetCapabilityFlag() == kCapabilityUndefined) &&
        (m_socketType != nsMsgSocketType::alwaysSTARTTLS)) {
      Capability();
    }

    // If capability response has yet to occur and STARTTLS is not
    // configured then drop the connection since this should not happen. Also
    // drop the connection if capability response has occurred and
    // the imap version is unacceptable. Show alert only for wrong version.
    if (((GetServerStateParser().GetCapabilityFlag() == kCapabilityUndefined) &&
         (m_socketType != nsMsgSocketType::alwaysSTARTTLS)) ||
        (GetServerStateParser().GetCapabilityFlag() &&
         !(GetServerStateParser().GetCapabilityFlag() &
           (kIMAP4Capability | kIMAP4rev1Capability | kIMAP4other)))) {
      if (!DeathSignalReceived() && NS_SUCCEEDED(GetConnectionStatus()) &&
          GetServerStateParser().GetCapabilityFlag())
        AlertUserEventUsingName("imapServerNotImap4");

      SetConnectionStatus(NS_ERROR_FAILURE);  // stop netlib
    } else {
      if (m_socketType == nsMsgSocketType::alwaysSTARTTLS) {
        StartTLS();  // Send imap STARTTLS command
        if (GetServerStateParser().LastCommandSuccessful()) {
          NS_ENSURE_TRUE(m_transport, false);
          MOZ_ASSERT(!NS_IsMainThread());
          rv = TransportStartTLS();  // Initiate STARTTLS handshakes
          if (NS_SUCCEEDED(rv)) {
            // Transition to secure state is now enabled but handshakes and
            // negotiation has not yet occurred. Make sure that
            // the stream input response buffer is drained to avoid false
            // responses to subsequent commands (capability, login etc),
            // i.e., due to possible MitM attack doing pre-TLS response
            // injection. We are discarding any possible malicious data
            // stored prior to TransportStartTLS().
            // Note: If any non-TLS related data arrives while transitioning
            // to secure state (after TransportStartTLS()), it will
            // cause the TLS negotiation to fail so any injected data is never
            // accessed since the transport connection will be dropped.
            char discardBuf[80];
            uint64_t numBytesInStream = 0;
            uint32_t numBytesRead;
            rv = m_inputStream->Available(&numBytesInStream);
            nsCOMPtr<nsIInputStream> kungFuGrip = m_inputStream;
            // Read and discard any data available in socket buffer.
            while (numBytesInStream > 0 && NS_SUCCEEDED(rv)) {
              rv = m_inputStream->Read(
                  discardBuf,
                  std::min(uint64_t(sizeof discardBuf), numBytesInStream),
                  &numBytesRead);
              numBytesInStream -= numBytesRead;
            }
            kungFuGrip = nullptr;

            // Discard any data lines previously read from socket buffer.
            m_inputStreamBuffer->ClearBuffer();

            // Force re-issue of "capability", because servers may
            // enable other auth features (e.g. remove LOGINDISABLED
            // and add AUTH=PLAIN). Sending imap data here first triggers
            // the TLS negotiation handshakes.
            Capability();

            // Courier imap doesn't return STARTTLS capability if we've done
            // a STARTTLS! But we need to remember this capability so we'll
            // try to use STARTTLS next time.
            // Update: This may not be a problem since "next time" will be
            // on a new connection that is not yet in secure state. So the
            // capability greeting *will* contain STARTTLS. I observed and
            // tested this on Courier imap server. But keep this to be sure.
            eIMAPCapabilityFlags capabilityFlag =
                GetServerStateParser().GetCapabilityFlag();
            if (!(capabilityFlag & kHasStartTLSCapability)) {
              capabilityFlag |= kHasStartTLSCapability;
              GetServerStateParser().SetCapabilityFlag(capabilityFlag);
              CommitCapability();
            }
          }
          if (NS_FAILED(rv)) {
            nsAutoCString logLine("Enable of STARTTLS failed. Error 0x");
            logLine.AppendInt(static_cast<uint32_t>(rv), 16);
            Log("ProcessCurrentURL", nullptr, logLine.get());
            if (m_socketType == nsMsgSocketType::alwaysSTARTTLS) {
              SetConnectionStatus(rv);  // stop netlib
              if (m_transport) m_transport->Close(rv);
            }
          }
        } else if (m_socketType == nsMsgSocketType::alwaysSTARTTLS) {
          SetConnectionStatus(NS_ERROR_FAILURE);  // stop netlib
          if (m_transport) m_transport->Close(rv);
        }
      }
      if (!DeathSignalReceived() && (NS_SUCCEEDED(GetConnectionStatus()))) {
        // Run TryToLogon() under the protection of the server's logon monitor.
        // This prevents a dogpile of multiple connections all attempting to
        // log on at the same time using an obsolete password, potentially
        // triggering the provider to block the account (Bug 1862111).
        // We run this on the current thread, not proxied to the main thread!
        logonFailed = true;
        nsCOMPtr<nsIRunnable> logonFunc = NS_NewRunnableFunction(
            "IMAP TryToLogin", [&]() { logonFailed = !TryToLogon(); });
        m_imapServerSink->Receiver()->RunLogonExclusive(logonFunc);
      }
      if (m_retryUrlOnError) return RetryUrl();
    }
  }  // if death signal not received

  // We assume one IMAP thread is used for exactly one server, only.
  if (m_transport && !m_securityInfo) {
    MOZ_ASSERT(!NS_IsMainThread());
    GetTransportSecurityInfo(getter_AddRefs(m_securityInfo));
  }

  if (!DeathSignalReceived() && (NS_SUCCEEDED(GetConnectionStatus()))) {
    // if the server supports a language extension then we should
    // attempt to issue the language extension.
    if (GetServerStateParser().GetCapabilityFlag() & kHasLanguageCapability)
      Language();

    if (m_runningUrl) {
      bool foundMailboxesAlready = false;
      m_hostSessionList->GetHaveWeEverDiscoveredFoldersForHost(
          GetImapServerKey(), foundMailboxesAlready);
      if (!foundMailboxesAlready) FindMailboxesIfNecessary();
    }

    nsImapState imapState = nsIImapUrl::ImapStatusNone;
    if (m_runningUrl) m_runningUrl->GetRequiredImapState(&imapState);

    if (imapState == nsIImapUrl::nsImapAuthenticatedState)
      ProcessAuthenticatedStateURL();
    else  // must be a url that requires us to be in the selected state
      ProcessSelectedStateURL();

    if (m_retryUrlOnError) return RetryUrl();

    // The URL has now been processed
    if ((!logonFailed && NS_FAILED(GetConnectionStatus())) ||
        DeathSignalReceived())
      HandleCurrentUrlError();

  } else if (!logonFailed)
    HandleCurrentUrlError();

  // if we are set up as a channel, we should notify our channel listener that
  // we are stopping... so pass in ourself as the channel and not the underlying
  // socket or file channel the protocol happens to be using
  if (m_channelListener) {
    NS_ASSERTION(m_mockChannel, "no request");
    if (m_mockChannel) {
      nsresult status;
      m_mockChannel->GetStatus(&status);
      if (!GetServerStateParser().LastCommandSuccessful() &&
          NS_SUCCEEDED(status))
        status = NS_MSG_ERROR_IMAP_COMMAND_FAILED;
      rv = m_channelListener->OnStopRequest(m_mockChannel, status);
    }
  }
  bool suspendUrl = false;
  m_runningUrl->GetMoreHeadersToDownload(&suspendUrl);
  if (mailnewsurl && m_imapMailFolderSink) {
    rv = GetConnectionStatus();
    // There are error conditions to check even if the connection is OK.
    if (NS_SUCCEEDED(rv)) {
      if (logonFailed) {
        rv = NS_ERROR_FAILURE;
      } else if (GetServerStateParser().CommandFailed()) {
        rv = NS_MSG_ERROR_IMAP_COMMAND_FAILED;
      }
    }
    if (NS_FAILED(rv)) {
      MOZ_LOG(
          IMAP, LogLevel::Debug,
          ("URL failed with code 0x%" PRIx32 " (%s)", static_cast<uint32_t>(rv),
           mailnewsurl->GetSpecOrDefault().get()));
      // If discovery URL fails, clear the in-progress flag.
      if (m_imapAction == nsIImapUrl::nsImapDiscoverAllBoxesUrl) {
        m_hostSessionList->SetDiscoveryForHostInProgress(GetImapServerKey(),
                                                         false);
      }
    }
    // Inform any nsIUrlListeners that the URL has finished. This will invoke
    // nsIUrlListener.onStopRunningUrl().
    m_imapMailFolderSink->SetUrlState(this, mailnewsurl, false, suspendUrl, rv);

    // Doom the cache entry if shutting down or thread is terminated.
    if (NS_FAILED(rv) && DeathSignalReceived() && m_mockChannel) {
      MOZ_LOG(IMAPCache, LogLevel::Debug,
              ("ProcessCurrentURL(): Call DoomCacheEntry()"));
      DoomCacheEntry(mailnewsurl);
    }
  } else {
    // That's seen at times in debug sessions.
    NS_WARNING("missing url or sink");
  }

  // disable timeouts before caching connection.
  if (m_transport)
    m_transport->SetTimeout(nsISocketTransport::TIMEOUT_READ_WRITE,
                            PR_UINT32_MAX);

  SetFlag(IMAP_CLEAN_UP_URL_STATE);

  nsCOMPtr<nsISupports> copyState;
  if (m_runningUrl) m_runningUrl->GetCopyState(getter_AddRefs(copyState));
  // this is so hokey...we MUST clear any local references to the url
  // BEFORE calling ReleaseUrlState
  mailnewsurl = nullptr;

  if (suspendUrl) m_imapServerSink->SuspendUrl(m_runningUrl);
  // save the imap folder sink since we need it to do the CopyNextStreamMessage
  RefPtr<ImapMailFolderSinkProxy> imapMailFolderSink = m_imapMailFolderSink;
  // release the url as we are done with it...
  ReleaseUrlState(false);
  ResetProgressInfo();

  ClearFlag(IMAP_CLEAN_UP_URL_STATE);

  if (imapMailFolderSink) {
    if (copyState) {
      rv = imapMailFolderSink->CopyNextStreamMessage(
          GetServerStateParser().LastCommandSuccessful() &&
              NS_SUCCEEDED(GetConnectionStatus()),
          copyState);
      if (NS_FAILED(rv))
        MOZ_LOG(IMAP, LogLevel::Info,
                ("CopyNextStreamMessage failed: %" PRIx32,
                 static_cast<uint32_t>(rv)));

      NS_ReleaseOnMainThread("nsImapProtocol, copyState", copyState.forget());
    }
    // we might need this to stick around for IDLE support
    m_imapMailFolderSink = imapMailFolderSink;
    imapMailFolderSink = nullptr;
  } else
    MOZ_LOG(IMAP, LogLevel::Info, ("null imapMailFolderSink"));

  // now try queued urls, now that we've released this connection.
  if (m_imapServerSink) {
    if (NS_SUCCEEDED(GetConnectionStatus()))
      rv = m_imapServerSink->LoadNextQueuedUrl(this, &anotherUrlRun);
    else  // if we don't do this, they'll just sit and spin until
          // we run some other url on this server.
    {
      Log("ProcessCurrentURL", nullptr, "aborting queued urls");
      rv = m_imapServerSink->AbortQueuedUrls();
    }
  }

  // if we didn't run another url, release the server sink to
  // cut circular refs.
  if (!anotherUrlRun) m_imapServerSink = nullptr;

  if (NS_FAILED(GetConnectionStatus()) || !GetServerStateParser().Connected() ||
      GetServerStateParser().SyntaxError()) {
    if (m_imapServerSink) m_imapServerSink->RemoveServerConnection(this);

    if (!DeathSignalReceived()) {
      TellThreadToDie();
    }
  } else {
    if (m_imapServerSink) {
      bool shuttingDown;
      m_imapServerSink->GetServerShuttingDown(&shuttingDown);
      if (shuttingDown) m_useIdle = false;
    }
  }
  return anotherUrlRun;
}

bool nsImapProtocol::RetryUrl() {
  nsCOMPtr<nsIImapUrl> kungFuGripImapUrl = m_runningUrl;
  nsCOMPtr<nsIImapMockChannel> saveMockChannel;

  // the mock channel might be null - that's OK.
  if (m_imapServerSink)
    (void)m_imapServerSink->PrepareToRetryUrl(kungFuGripImapUrl,
                                              getter_AddRefs(saveMockChannel));

  ReleaseUrlState(true);
  if (m_imapServerSink) {
    m_imapServerSink->RemoveServerConnection(this);
    m_imapServerSink->RetryUrl(kungFuGripImapUrl, saveMockChannel);
  }

  // Hack for Bug 1586494.
  // (this is a workaround to try and prevent a specific crash, and
  // does nothing clarify the threading mess!)
  // RetryUrl() is only ever called from the imap thread.
  // Mockchannel dtor insists upon being run on the main thread.
  // So make sure we don't accidentally cause the mockchannel to die right now.
  if (saveMockChannel) {
    NS_ReleaseOnMainThread("nsImapProtocol::RetryUrl",
                           saveMockChannel.forget());
  }

  return (m_imapServerSink != nullptr);  // we're running a url (the same url)
}

// ignoreBadAndNOResponses --> don't throw a error dialog if this command
// results in a NO or Bad response from the server..in other words the command
// is "exploratory" and we don't really care if it succeeds or fails.
void nsImapProtocol::ParseIMAPandCheckForNewMail(
    const char* commandString, bool aIgnoreBadAndNOResponses) {
  if (commandString)
    GetServerStateParser().ParseIMAPServerResponse(commandString,
                                                   aIgnoreBadAndNOResponses);
  else
    GetServerStateParser().ParseIMAPServerResponse(m_currentCommand.get(),
                                                   aIgnoreBadAndNOResponses);
  // **** fix me for new mail biff state *****
}

/////////////////////////////////////////////////////////////////////////////////////////////
// End of nsIStreamListenerSupport
//////////////////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsImapProtocol::GetRunningUrl(nsIURI** result) {
  if (result && m_runningUrl)
    return m_runningUrl->QueryInterface(NS_GET_IID(nsIURI), (void**)result);
  return NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsImapProtocol::GetRunningImapURL(nsIImapUrl** aImapUrl) {
  if (aImapUrl && m_runningUrl)
    return m_runningUrl->QueryInterface(NS_GET_IID(nsIImapUrl),
                                        (void**)aImapUrl);
  return NS_ERROR_NULL_POINTER;
}

/*
 * Writes the data contained in dataBuffer into the current output stream. It
 * also informs the transport layer that this data is now available for
 * transmission. Returns a positive number for success, 0 for failure (not all
 * the bytes were written to the stream, etc). We need to make another pass
 * through this file to install an error system (mscott)
 */

nsresult nsImapProtocol::SendData(const char* dataBuffer,
                                  bool aSuppressLogging) {
  nsresult rv = NS_ERROR_NULL_POINTER;

  if (!m_transport) {
    Log("SendData", nullptr, "clearing IMAP_CONNECTION_IS_OPEN");
    // the connection died unexpectedly! so clear the open connection flag
    ClearFlag(IMAP_CONNECTION_IS_OPEN);
    TellThreadToDie();
    SetConnectionStatus(NS_ERROR_FAILURE);
    return NS_ERROR_FAILURE;
  }

  if (dataBuffer && m_outputStream) {
    m_currentCommand = dataBuffer;
    if (!aSuppressLogging)
      Log("SendData", nullptr, dataBuffer);
    else
      Log("SendData", nullptr,
          "Logging suppressed for this command (it probably contained "
          "authentication information)");

    {
      // don't allow someone to close the stream/transport out from under us
      // this can happen when the ui thread calls TellThreadToDie.
      PR_CEnterMonitor(this);
      uint32_t n;
      if (m_outputStream)
        rv = m_outputStream->Write(dataBuffer, PL_strlen(dataBuffer), &n);
      PR_CExitMonitor(this);
    }
    if (NS_FAILED(rv)) {
      Log("SendData", nullptr, "clearing IMAP_CONNECTION_IS_OPEN");
      // the connection died unexpectedly! so clear the open connection flag
      ClearFlag(IMAP_CONNECTION_IS_OPEN);
      TellThreadToDie();
      SetConnectionStatus(rv);
      if (m_runningUrl && !m_retryUrlOnError) {
        bool alreadyRerunningUrl;
        m_runningUrl->GetRerunningUrl(&alreadyRerunningUrl);
        if (!alreadyRerunningUrl) {
          m_runningUrl->SetRerunningUrl(true);
          m_retryUrlOnError = true;
        }
      }
    }
  }

  return rv;
}

/////////////////////////////////////////////////////////////////////////////////////////////
// Begin protocol state machine functions...
//////////////////////////////////////////////////////////////////////////////////////////////

// ProcessProtocolState - we override this only so we'll link - it should never
// get called.

nsresult nsImapProtocol::ProcessProtocolState(nsIURI* url,
                                              nsIInputStream* inputStream,
                                              uint64_t sourceOffset,
                                              uint32_t length) {
  return NS_OK;
}

class UrlListenerNotifierEvent : public mozilla::Runnable {
 public:
  UrlListenerNotifierEvent(nsIMsgMailNewsUrl* aUrl, nsIImapProtocol* aProtocol)
      : mozilla::Runnable("UrlListenerNotifierEvent"),
        mUrl(aUrl),
        mProtocol(aProtocol) {}

  NS_IMETHOD Run() {
    if (mUrl) {
      nsCOMPtr<nsIMsgFolder> folder;
      mUrl->GetFolder(getter_AddRefs(folder));
      NS_ENSURE_TRUE(folder, NS_OK);
      nsCOMPtr<nsIImapMailFolderSink> folderSink(do_QueryInterface(folder));
      // This causes the url listener to get OnStart and Stop notifications.
      folderSink->SetUrlState(mProtocol, mUrl, true, false, NS_OK);
      folderSink->SetUrlState(mProtocol, mUrl, false, false, NS_OK);
    }
    return NS_OK;
  }

 private:
  nsCOMPtr<nsIMsgMailNewsUrl> mUrl;
  nsCOMPtr<nsIImapProtocol> mProtocol;
};

bool nsImapProtocol::TryToRunUrlLocally(nsIURI* aURL, nsISupports* aConsumer) {
  nsresult rv;
  nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(aURL, &rv));
  NS_ENSURE_SUCCESS(rv, false);
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(aURL);
  nsCString messageIdString;
  imapUrl->GetListOfMessageIds(messageIdString);
  bool useLocalCache = false;
  if (!messageIdString.IsEmpty() &&
      !HandlingMultipleMessages(messageIdString)) {
    nsImapAction action;
    imapUrl->GetImapAction(&action);
    nsCOMPtr<nsIMsgFolder> folder;
    mailnewsUrl->GetFolder(getter_AddRefs(folder));
    NS_ENSURE_TRUE(folder, false);

    folder->HasMsgOffline(strtoul(messageIdString.get(), nullptr, 10),
                          &useLocalCache);
    mailnewsUrl->SetMsgIsInLocalCache(useLocalCache);
    // We're downloading a single message for offline use, and it's
    // already offline. So we shouldn't do anything, but we do
    // need to notify the url listener.
    if (useLocalCache && action == nsIImapUrl::nsImapMsgDownloadForOffline) {
      nsCOMPtr<nsIRunnable> event =
          new UrlListenerNotifierEvent(mailnewsUrl, this);
      // Post this as an event because it can lead to re-entrant calls to
      // LoadNextQueuedUrl if the listener runs a new url.
      if (event) NS_DispatchToCurrentThread(event);
      return true;
    }
  }
  if (!useLocalCache) return false;

  nsCOMPtr<nsIImapMockChannel> mockChannel;
  imapUrl->GetMockChannel(getter_AddRefs(mockChannel));
  if (!mockChannel) return false;

  nsImapMockChannel* imapChannel =
      static_cast<nsImapMockChannel*>(mockChannel.get());
  if (!imapChannel) return false;

  nsCOMPtr<nsILoadGroup> loadGroup;
  imapChannel->GetLoadGroup(getter_AddRefs(loadGroup));
  if (!loadGroup)  // if we don't have one, the url will snag one from the msg
                   // window...
    mailnewsUrl->GetLoadGroup(getter_AddRefs(loadGroup));

  if (loadGroup)
    loadGroup->RemoveRequest((nsIRequest*)mockChannel,
                             nullptr /* context isupports */, NS_OK);

  if (imapChannel->ReadFromLocalCache()) {
    (void)imapChannel->NotifyStartEndReadFromCache(true);
    return true;
  }
  return false;
}

// LoadImapUrl takes a url, initializes all of our url specific data by calling
// SetupUrl. Finally, we signal the url to run monitor to let the imap main
// thread loop process the current url (it is waiting on this monitor). There
// is a contract that the imap thread has already been started before we
// attempt to load a url...
// LoadImapUrl() is called by nsImapIncomingServer to run a queued url on a free
// connection.
NS_IMETHODIMP nsImapProtocol::LoadImapUrl(nsIURI* aURL,
                                          nsISupports* aConsumer) {
  nsresult rv = NS_ERROR_FAILURE;
  if (aURL) {
    // We might be able to fulfill the request locally (e.g. fetching a message
    // which is already stored offline).
    if (TryToRunUrlLocally(aURL, aConsumer)) return NS_OK;
    rv = SetupWithUrl(aURL, aConsumer);
    m_lastActiveTime = PR_Now();
    if (NS_FAILED(rv)) {
      TellThreadToDie(true);
    }
  }
  return rv;
}

nsresult nsImapProtocol::LoadImapUrlInternal() {
  nsresult rv = NS_ERROR_FAILURE;

  if (m_transport && m_mockChannel) {
    m_transport->SetTimeout(nsISocketTransport::TIMEOUT_CONNECT,
                            gResponseTimeout + 60);
    int32_t readWriteTimeout = gResponseTimeout;
    if (m_runningUrl) {
      m_runningUrl->GetImapAction(&m_imapAction);
      // This is a silly hack, but the default of 100 seconds is typically way
      // too long for things like APPEND, which should come back immediately.
      // However, for large messages on some servers the final append response
      // time can be longer. So now it is one-fifth of the configured
      // `mailnews.tcptimeout' which defaults to 20 seconds.
      if (m_imapAction == nsIImapUrl::nsImapAppendMsgFromFile ||
          m_imapAction == nsIImapUrl::nsImapAppendDraftFromFile) {
        readWriteTimeout = gAppendTimeout;
      } else if (m_imapAction == nsIImapUrl::nsImapOnlineMove ||
                 m_imapAction == nsIImapUrl::nsImapOnlineCopy) {
        nsCString messageIdString;
        m_runningUrl->GetListOfMessageIds(messageIdString);
        uint32_t copyCount = CountMessagesInIdString(messageIdString.get());
        // If we're move/copying a large number of messages,
        // which should be rare, increase the timeout based on number
        // of messages. 40 messages per second should be sufficiently slow.
        if (copyCount > 2400)  // 40 * 60, 60 is default read write timeout
          readWriteTimeout =
              std::max(readWriteTimeout, (int32_t)copyCount / 40);
      }
    }
    m_transport->SetTimeout(nsISocketTransport::TIMEOUT_READ_WRITE,
                            readWriteTimeout);
    // Set the security info for the mock channel to be the security info for
    // our underlying transport.
    if (m_securityInfo) {
      m_mockChannel->SetSecurityInfo(m_securityInfo);
    }

    SetSecurityCallbacksFromChannel(m_transport, m_mockChannel);

    nsCOMPtr<nsITransportEventSink> sinkMC = do_QueryInterface(m_mockChannel);
    if (sinkMC) {
      nsCOMPtr<nsIThread> thread = do_GetMainThread();
      RefPtr<nsImapTransportEventSink> sink = new nsImapTransportEventSink;
      rv = net_NewTransportEventSinkProxy(getter_AddRefs(sink->m_proxy), sinkMC,
                                          thread);
      NS_ENSURE_SUCCESS(rv, rv);
      m_transport->SetEventSink(sink, nullptr);
    }

    // And if we have a cache2 entry that we are saving the message to, set the
    // security info on it too.
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
    if (mailnewsUrl && m_securityInfo) {
      nsCOMPtr<nsICacheEntry> cacheEntry;
      mailnewsUrl->GetMemCacheEntry(getter_AddRefs(cacheEntry));
      if (cacheEntry) {
        cacheEntry->SetSecurityInfo(m_securityInfo);
      }
    }
  }

  rv = SetupSinkProxy();  // generate proxies for all of the event sinks in the
                          // url
  if (NS_FAILED(rv))      // URL can be invalid.
    return rv;

  if (m_transport && m_runningUrl) {
    nsImapAction imapAction;
    m_runningUrl->GetImapAction(&imapAction);
    // if we're shutting down, and not running the kinds of urls we run at
    // shutdown, then this should fail because running urls during
    // shutdown will very likely fail and potentially hang.
    nsCOMPtr<nsIMsgAccountManager> accountMgr =
        mozilla::components::AccountManager::Service();
    bool shuttingDown = false;
    (void)accountMgr->GetShutdownInProgress(&shuttingDown);
    if (shuttingDown && imapAction != nsIImapUrl::nsImapExpungeFolder &&
        imapAction != nsIImapUrl::nsImapDeleteAllMsgs &&
        imapAction != nsIImapUrl::nsImapDeleteFolder)
      return NS_ERROR_FAILURE;

    // if we're running a select or delete all, do a noop first.
    // this should really be in the connection cache code when we know
    // we're pulling out a selected state connection, but maybe we
    // can get away with this.
    m_needNoop = (imapAction == nsIImapUrl::nsImapSelectFolder ||
                  imapAction == nsIImapUrl::nsImapDeleteAllMsgs);

    // We now have a url to run so signal the monitor for url ready to be
    // processed...
    ReentrantMonitorAutoEnter urlReadyMon(m_urlReadyToRunMonitor);
    m_nextUrlReadyToRun = true;
    urlReadyMon.Notify();

  }  // if we have an imap url and a transport
  else {
    NS_ASSERTION(false, "missing channel or running url");
  }

  return rv;
}

NS_IMETHODIMP nsImapProtocol::IsBusy(bool* aIsConnectionBusy,
                                     bool* isInboxConnection) {
  if (!aIsConnectionBusy || !isInboxConnection) return NS_ERROR_NULL_POINTER;
  nsresult rv = NS_OK;
  *aIsConnectionBusy = false;
  *isInboxConnection = false;
  if (!m_transport) {
    // this connection might not be fully set up yet.
    rv = NS_ERROR_FAILURE;
  } else {
    if (IsUrlInProgress()) {
      // do we have a url? That means we're working on it...
      *aIsConnectionBusy = true;
    }

    if (GetServerStateParser().GetIMAPstate() ==
            nsImapServerResponseParser::kFolderSelected &&
        GetServerStateParser().GetSelectedMailboxName() &&
        PL_strcasecmp(GetServerStateParser().GetSelectedMailboxName(),
                      "Inbox") == 0)
      *isInboxConnection = true;
  }
  return rv;
}

#define IS_SUBSCRIPTION_RELATED_ACTION(action)        \
  (action == nsIImapUrl::nsImapSubscribe ||           \
   action == nsIImapUrl::nsImapUnsubscribe ||         \
   action == nsIImapUrl::nsImapDiscoverAllBoxesUrl || \
   action == nsIImapUrl::nsImapListFolder)

// canRunUrl means the connection is not busy, and is in the selected state
// for the desired folder (or authenticated).
// has to wait means it's in the right selected state, but busy.
NS_IMETHODIMP nsImapProtocol::CanHandleUrl(nsIImapUrl* aImapUrl,
                                           bool* aCanRunUrl, bool* hasToWait) {
  if (!aCanRunUrl || !hasToWait || !aImapUrl) return NS_ERROR_NULL_POINTER;
  nsresult rv = NS_OK;

  *aCanRunUrl = false;  // assume guilty until proven otherwise...
  *hasToWait = false;

  if (DeathSignalReceived()) return NS_ERROR_FAILURE;

  ReentrantMonitorAutoEnter mon(mMonitor);

  bool isBusy = false;
  bool isInboxConnection = false;

  if (!m_transport) {
    // this connection might not be fully set up yet.
    return NS_ERROR_FAILURE;
  }
  IsBusy(&isBusy, &isInboxConnection);
  bool inSelectedState = GetServerStateParser().GetIMAPstate() ==
                         nsImapServerResponseParser::kFolderSelected;

  nsAutoCString curSelectedUrlFolderName;
  nsAutoCString pendingUrlFolderName;
  if (inSelectedState)
    curSelectedUrlFolderName = GetServerStateParser().GetSelectedMailboxName();

  if (isBusy) {
    nsImapState curUrlImapState;
    NS_ASSERTION(m_runningUrl, "isBusy, but no running url.");
    if (m_runningUrl) {
      m_runningUrl->GetRequiredImapState(&curUrlImapState);
      if (curUrlImapState == nsIImapUrl::nsImapSelectedState) {
        nsCString folderName = GetFolderPathString();
        if (!curSelectedUrlFolderName.Equals(folderName))
          pendingUrlFolderName = folderName;
        inSelectedState = true;
      }
    }
  }

  nsImapState imapState;
  nsImapAction actionForProposedUrl;
  aImapUrl->GetImapAction(&actionForProposedUrl);
  aImapUrl->GetRequiredImapState(&imapState);

  // OK, this is a bit of a hack - we're going to pretend that
  // these types of urls requires a selected state connection on
  // the folder in question. This isn't technically true,
  // but we would much rather use that connection for several reasons,
  // one is that some UW servers require us to use that connection
  // the other is that we don't want to leave a connection dangling in
  // the selected state for the deleted folder.
  // If we don't find a connection in that selected state,
  // we'll fall back to the first free connection.
  bool isSelectedStateUrl =
      imapState == nsIImapUrl::nsImapSelectedState ||
      actionForProposedUrl == nsIImapUrl::nsImapDeleteFolder ||
      actionForProposedUrl == nsIImapUrl::nsImapRenameFolder ||
      actionForProposedUrl == nsIImapUrl::nsImapMoveFolderHierarchy ||
      actionForProposedUrl == nsIImapUrl::nsImapAppendDraftFromFile ||
      actionForProposedUrl == nsIImapUrl::nsImapAppendMsgFromFile ||
      actionForProposedUrl == nsIImapUrl::nsImapFolderStatus;

  nsCOMPtr<nsIMsgMailNewsUrl> msgUrl = do_QueryInterface(aImapUrl);
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = msgUrl->GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv)) {
    // compare host/user between url and connection.
    nsCString urlHostName;
    nsCString urlUserName;
    rv = server->GetHostName(urlHostName);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = server->GetUsername(urlUserName);
    NS_ENSURE_SUCCESS(rv, rv);

    if ((GetImapHostName().IsEmpty() ||
         urlHostName.Equals(GetImapHostName(),
                            nsCaseInsensitiveCStringComparator)) &&
        (GetImapUserName().IsEmpty() ||
         urlUserName.Equals(GetImapUserName(),
                            nsCaseInsensitiveCStringComparator))) {
      if (isSelectedStateUrl) {
        if (inSelectedState) {
          // *** jt - in selected state can only run url with
          // matching foldername
          nsCString folderNameForProposedUrl;
          rv = aImapUrl->CreateServerSourceFolderPathString(
              folderNameForProposedUrl);
          if (NS_SUCCEEDED(rv) && !folderNameForProposedUrl.IsEmpty()) {
            bool isInbox =
                PL_strcasecmp("Inbox", folderNameForProposedUrl.get()) == 0;
            if (!curSelectedUrlFolderName.IsEmpty() ||
                !pendingUrlFolderName.IsEmpty()) {
              bool matched =
                  isInbox ? PL_strcasecmp(curSelectedUrlFolderName.get(),
                                          folderNameForProposedUrl.get()) == 0
                          : PL_strcmp(curSelectedUrlFolderName.get(),
                                      folderNameForProposedUrl.get()) == 0;
              if (!matched && !pendingUrlFolderName.IsEmpty()) {
                matched =
                    isInbox ? PL_strcasecmp(pendingUrlFolderName.get(),
                                            folderNameForProposedUrl.get()) == 0
                            : PL_strcmp(pendingUrlFolderName.get(),
                                        folderNameForProposedUrl.get()) == 0;
              }
              if (matched) {
                if (isBusy)
                  *hasToWait = true;
                else
                  *aCanRunUrl = true;
              }
            }
          }
          MOZ_LOG(
              IMAP, LogLevel::Debug,
              ("proposed url = %s folder for connection %s has To Wait = "
               "%s can run = %s",
               folderNameForProposedUrl.get(), curSelectedUrlFolderName.get(),
               (*hasToWait) ? "true" : "false",
               (*aCanRunUrl) ? "true" : "false"));
        }
      } else  // *** jt - an authenticated state url can be run in either
              // authenticated or selected state
      {
        nsImapAction actionForRunningUrl;

        // If proposed url is subscription related, and we are currently running
        // a subscription url, then we want to queue the proposed url after the
        // current url. Otherwise, we can run this url if we're not busy. If we
        // never find a running subscription-related url, the caller will just
        // use whatever free connection it can find, which is what we want.
        if (IS_SUBSCRIPTION_RELATED_ACTION(actionForProposedUrl)) {
          if (isBusy && m_runningUrl) {
            m_runningUrl->GetImapAction(&actionForRunningUrl);
            if (IS_SUBSCRIPTION_RELATED_ACTION(actionForRunningUrl)) {
              *aCanRunUrl = false;
              *hasToWait = true;
            }
          }
        } else {
          if (!isBusy) *aCanRunUrl = true;
        }
      }
    }
  }
  return rv;
}

// Command tag handling stuff.
// Zero tag number indicates never used so set it to an initial random number
// between 1 and 100. Otherwise just increment the uint32_t value unless it
// rolls to zero then set it to 1. Then convert the tag number to a string for
// use in IMAP commands.
void nsImapProtocol::IncrementCommandTagNumber() {
  if (m_currentServerCommandTagNumber == 0) {
    srand((unsigned)m_lastCheckTime);
    m_currentServerCommandTagNumber = 1 + (rand() % 100);
  } else if (++m_currentServerCommandTagNumber == 0) {
    m_currentServerCommandTagNumber = 1;
  }
  m_currentServerCommandTag =
      nsPrintfCString("%u", m_currentServerCommandTagNumber);
}

const char* nsImapProtocol::GetServerCommandTag() {
  return m_currentServerCommandTag.get();
}

/**
 *  ProcessSelectedStateURL() is a helper for ProcessCurrentURL(). It handles
 *  running URLs which require the connection to be in the selected state.
 *  It will issue SELECT commands if needed to make sure the correct mailbox
 *  is selected.
 */
void nsImapProtocol::ProcessSelectedStateURL() {
  nsCString mailboxName;
  bool bMessageIdsAreUids = true;
  bool moreHeadersToDownload;
  imapMessageFlagsType msgFlags = 0;
  nsCString urlHost;

  // this can't fail, can it?
  nsresult res;
  res = m_runningUrl->GetImapAction(&m_imapAction);
  // See nsIImapUrl.idl for m_imapAction values.
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("ProcessSelectedStateURL [this=%p], m_imapAction = 0x%" PRIx32, this,
           m_imapAction));
  m_runningUrl->MessageIdsAreUids(&bMessageIdsAreUids);
  m_runningUrl->GetMsgFlags(&msgFlags);
  m_runningUrl->GetMoreHeadersToDownload(&moreHeadersToDownload);

  res = CreateServerSourceFolderPathString(mailboxName);
  if (NS_FAILED(res))
    Log("ProcessSelectedStateURL", nullptr,
        "error getting source folder path string");

  if (NS_SUCCEEDED(res) && !DeathSignalReceived()) {
    bool selectIssued = false;
    if (GetServerStateParser().GetIMAPstate() ==
        nsImapServerResponseParser::kFolderSelected) {
      if (GetServerStateParser().GetSelectedMailboxName() &&
          PL_strcmp(GetServerStateParser().GetSelectedMailboxName(),
                    mailboxName.get())) {  // we are selected in another folder
        if (m_closeNeededBeforeSelect) ImapClose();
        if (GetServerStateParser().LastCommandSuccessful()) {
          selectIssued = true;
          SelectMailbox(mailboxName.get());
        }
      } else if (!GetServerStateParser()
                      .GetSelectedMailboxName()) {  // why are we in the
                                                    // selected state with no
                                                    // box name?
        SelectMailbox(mailboxName.get());
        selectIssued = true;
      } else if (moreHeadersToDownload &&
                 m_imapMailFolderSink)  // we need to fetch older headers
      {
        nsTArray<nsMsgKey> msgIdList;
        bool more;
        m_imapMailFolderSink->GetMsgHdrsToDownload(
            &more, &m_progressExpectedNumber, msgIdList);
        if (msgIdList.Length() > 0) {
          FolderHeaderDump(msgIdList.Elements(), msgIdList.Length());
          m_runningUrl->SetMoreHeadersToDownload(more);
          // We're going to be re-running this url.
          if (more) m_runningUrl->SetRerunningUrl(true);
        }
        HeaderFetchCompleted();
      } else {
        // get new message counts, if any, from server
        if (m_needNoop) {
          // For some IMAP servers, to detect new email we must send imap
          // SELECT even if already SELECTed on the same mailbox.
          if (m_forceSelect) {
            SelectMailbox(mailboxName.get());
            selectIssued = true;
          }

          m_noopCount++;
          if ((gPromoteNoopToCheckCount > 0 &&
               (m_noopCount % gPromoteNoopToCheckCount) == 0) ||
              CheckNeeded())
            Check();
          else
            Noop();  // I think this is needed when we're using a cached
                     // connection
          m_needNoop = false;
        }
      }
    } else {
      // go to selected state
      SelectMailbox(mailboxName.get());
      selectIssued = GetServerStateParser().LastCommandSuccessful();
    }

    if (selectIssued) RefreshACLForFolderIfNecessary(mailboxName.get());

    bool uidValidityOk = true;
    if (GetServerStateParser().LastCommandSuccessful() && selectIssued &&
        (m_imapAction != nsIImapUrl::nsImapSelectFolder) &&
        (m_imapAction != nsIImapUrl::nsImapLiteSelectFolder)) {
      // error on the side of caution, if the fe event fails to set
      // uidStruct->returnValidity, then assume that UIDVALIDITY did not roll.
      // This is a common case event for attachments that are fetched within a
      // browser context.
      if (!DeathSignalReceived())
        uidValidityOk = m_uidValidity == kUidUnknown ||
                        m_uidValidity == GetServerStateParser().FolderUID();
    }

    if (!uidValidityOk)
      Log("ProcessSelectedStateURL", nullptr, "uid validity not ok");
    if (GetServerStateParser().LastCommandSuccessful() &&
        !DeathSignalReceived() &&
        (uidValidityOk || m_imapAction == nsIImapUrl::nsImapDeleteAllMsgs)) {
      if (GetServerStateParser().CurrentFolderReadOnly()) {
        Log("ProcessSelectedStateURL", nullptr, "current folder read only");
        if (m_imapAction == nsIImapUrl::nsImapAddMsgFlags ||
            m_imapAction == nsIImapUrl::nsImapSubtractMsgFlags) {
          bool canChangeFlag = false;
          if (GetServerStateParser().ServerHasACLCapability() &&
              m_imapMailFolderSink) {
            uint32_t aclFlags = 0;

            if (NS_SUCCEEDED(m_imapMailFolderSink->GetAclFlags(&aclFlags)) &&
                aclFlags != 0)  // make sure we have some acl flags
              canChangeFlag = ((msgFlags & kImapMsgSeenFlag) &&
                               (aclFlags & IMAP_ACL_STORE_SEEN_FLAG));
          } else
            canChangeFlag = (GetServerStateParser().SettablePermanentFlags() &
                             msgFlags) == msgFlags;
          if (!canChangeFlag) return;
        }
        if (m_imapAction == nsIImapUrl::nsImapExpungeFolder ||
            m_imapAction == nsIImapUrl::nsImapDeleteMsg ||
            m_imapAction == nsIImapUrl::nsImapDeleteAllMsgs)
          return;
      }
      switch (m_imapAction) {
        case nsIImapUrl::nsImapLiteSelectFolder:
          if (GetServerStateParser().LastCommandSuccessful() &&
              m_imapMailFolderSink && !moreHeadersToDownload) {
            m_imapMailFolderSink->SetUidValidity(
                GetServerStateParser().FolderUID());
            ProcessMailboxUpdate(false);  // handle uidvalidity change
          }
          break;
        case nsIImapUrl::nsImapSaveMessageToDisk:
        case nsIImapUrl::nsImapMsgFetch:
        case nsIImapUrl::nsImapMsgFetchPeek:
        case nsIImapUrl::nsImapMsgDownloadForOffline:
        case nsIImapUrl::nsImapMsgPreview: {
          nsCString messageIdString;
          m_runningUrl->GetListOfMessageIds(messageIdString);
          // we don't want to send the flags back in a group
          if (HandlingMultipleMessages(messageIdString) ||
              m_imapAction == nsIImapUrl::nsImapMsgDownloadForOffline ||
              m_imapAction == nsIImapUrl::nsImapMsgPreview) {
            if (m_imapAction == nsIImapUrl::nsImapMsgPreview) {
              // Autosync does its own progress. Don't show progress here
              // unless preview. This avoids lots of "1 of 1", "1 of 3", etc.
              // interspersed with autosync progress.
              SetProgressString(IMAP_MESSAGES_STRING_INDEX);

              m_progressCurrentNumber[m_stringIndex] = 0;
              m_progressExpectedNumber =
                  CountMessagesInIdString(messageIdString.get());
            }

            FetchMessage(messageIdString,
                         (m_imapAction == nsIImapUrl::nsImapMsgPreview)
                             ? kBodyStart
                             : kEveryThingRFC822Peek);
            if (m_imapAction == nsIImapUrl::nsImapMsgPreview)
              HeaderFetchCompleted();
            SetProgressString(IMAP_EMPTY_STRING_INDEX);
          } else {
            // A single message ID
            nsIMAPeFetchFields whatToFetch = kEveryThingRFC822;
            if (m_imapAction == nsIImapUrl::nsImapMsgFetchPeek)
              whatToFetch = kEveryThingRFC822Peek;

            // Note: Should no longer fetch a specific imap section (part).
            // First, let's see if we're requesting a specific MIME part.
            char* imappart = nullptr;
            m_runningUrl->GetImapPartToFetch(&imappart);
            MOZ_ASSERT(!imappart, "no longer fetching imap section/imappart");
            // downloading a single message: try to do it by bodystructure,
            // and/or do it by chunks
            // Note: No longer doing bodystructure.
            uint32_t messageSize = GetMessageSize(messageIdString);

            // The "wontFit" and cache parameter calculations (customLimit,
            // realLimit) are only for debug information logging below.
            if (MOZ_LOG_TEST(IMAPCache, LogLevel::Debug)) {
              nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl =
                  do_QueryInterface(m_runningUrl);
              if (mailnewsurl) {
                bool wontFit = net::CacheObserver::EntryIsTooBig(
                    messageSize, gUseDiskCache2);
                int64_t customLimit;
                int64_t realLimit;
                if (gUseDiskCache2) {
                  customLimit = net::CacheObserver::MaxDiskEntrySize();
                  realLimit = net::CacheObserver::DiskCacheCapacity();
                } else {
                  customLimit = net::CacheObserver::MaxMemoryEntrySize();
                  realLimit = net::CacheObserver::MemoryCacheCapacity();
                }
                if (!(customLimit & (int64_t)0x80000000))
                  customLimit <<= 10;  // multiply by 1024 to get num bytes
                else
                  customLimit = (int32_t)customLimit;  // make it negative
                realLimit <<= (10 - 3);  // 1/8th capacity, num bytes.
                if (customLimit > -1 && customLimit < realLimit)
                  realLimit = customLimit;
                MOZ_LOG(IMAPCache, LogLevel::Debug,
                        ("%s: customLimit=%" PRId64 ", realLimit=%" PRId64,
                         __func__, customLimit, realLimit));
                MOZ_LOG(IMAPCache, LogLevel::Debug,
                        ("%s: URL=%s, messageSize=%d, cache too small=%d(bool)",
                         __func__, mailnewsurl->GetSpecOrDefault().get(),
                         messageSize, wontFit));
              }
            }
            // Note again: No longer doing bodystructure.
            // Fetch the whole thing, and try to do it in chunks.
            MOZ_LOG(
                IMAPCache, LogLevel::Debug,
                ("%s: Fetch entire message with FetchTryChunking", __func__));
            FetchTryChunking(messageIdString, whatToFetch, bMessageIdsAreUids,
                             NULL, messageSize, true);
            // If fetch was not a peek, ensure that the message displays as
            // read (not bold) in case the server fails to mark the message
            // as SEEN.
            if (GetServerStateParser().LastCommandSuccessful() &&
                m_imapAction != nsIImapUrl::nsImapMsgFetchPeek) {
              uint32_t uid = strtoul(messageIdString.get(), nullptr, 10);
              int32_t index;
              bool foundIt;
              imapMessageFlagsType flags =
                  m_flagState->GetMessageFlagsFromUID(uid, &foundIt, &index);
              if (foundIt) {
                flags |= kImapMsgSeenFlag;
                m_flagState->SetMessageFlags(index, flags);
              }
            }
          }
        } break;
        case nsIImapUrl::nsImapExpungeFolder:
          Expunge();
          // note fall through to next cases.
          [[fallthrough]];
        case nsIImapUrl::nsImapSelectFolder:
        case nsIImapUrl::nsImapSelectNoopFolder:
          if (!moreHeadersToDownload) ProcessMailboxUpdate(true);
          break;
        case nsIImapUrl::nsImapMsgHeader: {
          nsCString messageIds;
          m_runningUrl->GetListOfMessageIds(messageIds);

          FetchMessage(messageIds, kHeadersRFC822andUid);
          // if we explicitly ask for headers, as opposed to getting them as a
          // result of selecting the folder, or biff, send the
          // headerFetchCompleted notification to flush out the header cache.
          HeaderFetchCompleted();
        } break;
        case nsIImapUrl::nsImapSearch: {
          nsAutoCString searchCriteriaString;
          m_runningUrl->CreateSearchCriteriaString(
              getter_Copies(searchCriteriaString));
          Search(searchCriteriaString.get(), bMessageIdsAreUids);
          // drop the results on the floor for now
        } break;
        case nsIImapUrl::nsImapUserDefinedMsgCommand: {
          nsCString messageIdString;
          nsCString command;

          m_runningUrl->GetCommand(command);
          m_runningUrl->GetListOfMessageIds(messageIdString);
          IssueUserDefinedMsgCommand(command.get(), messageIdString.get());
        } break;
        case nsIImapUrl::nsImapUserDefinedFetchAttribute: {
          nsCString messageIdString;
          nsCString attribute;

          m_runningUrl->GetCustomAttributeToFetch(attribute);
          m_runningUrl->GetListOfMessageIds(messageIdString);
          FetchMsgAttribute(messageIdString, attribute);
        } break;
        case nsIImapUrl::nsImapMsgStoreCustomKeywords: {
          // If the server doesn't support user defined flags, don't try to
          // define/set new ones. But if this is an attempt by TB to set or
          // reset flags "Junk" or "NonJunk", change "Junk" or "NonJunk" to
          // "$Junk" or "$NotJunk" respectively and store the modified flag
          // name if the server doesn't support storing user defined flags
          // and the server does allow storing the almost-standard flag names
          // "$Junk" and "$NotJunk". Yahoo imap server is an example of this.
          uint16_t userFlags = 0;
          GetSupportedUserFlags(&userFlags);
          bool userDefinedSettable = userFlags & kImapMsgSupportUserFlag;
          bool stdJunkOk = GetServerStateParser().IsStdJunkNotJunkUseOk();

          nsCString messageIdString;
          nsCString addFlags;
          nsCString subtractFlags;

          m_runningUrl->GetListOfMessageIds(messageIdString);
          m_runningUrl->GetCustomAddFlags(addFlags);
          m_runningUrl->GetCustomSubtractFlags(subtractFlags);
          if (!addFlags.IsEmpty()) {
            if (!userDefinedSettable) {
              if (stdJunkOk) {
                if (addFlags.EqualsIgnoreCase("junk"))
                  addFlags = "$Junk";
                else if (addFlags.EqualsIgnoreCase("nonjunk"))
                  addFlags = "$NotJunk";
                else
                  break;
              } else
                break;
            }
            nsAutoCString storeString("+FLAGS (");
            storeString.Append(addFlags);
            storeString.Append(')');
            Store(messageIdString, storeString.get(), true);
          }
          if (!subtractFlags.IsEmpty()) {
            if (!userDefinedSettable) {
              if (stdJunkOk) {
                if (subtractFlags.EqualsIgnoreCase("junk"))
                  subtractFlags = "$Junk";
                else if (subtractFlags.EqualsIgnoreCase("nonjunk"))
                  subtractFlags = "$NotJunk";
                else
                  break;
              } else
                break;
            }
            nsAutoCString storeString("-FLAGS (");
            storeString.Append(subtractFlags);
            storeString.Append(')');
            Store(messageIdString, storeString.get(), true);
          }
        } break;
        case nsIImapUrl::nsImapDeleteMsg: {
          // Note: this never actually occurs to delete a message. Instead
          // when messages are deleted or moved to another server, m_imapAction
          // nsIImapUrl::nsImapAddMsgFlags occurs.
          nsCString messageIdString;
          m_runningUrl->GetListOfMessageIds(messageIdString);

          ProgressEventFunctionUsingName(
              HandlingMultipleMessages(messageIdString)
                  ? "imapDeletingMessages"
                  : "imapDeletingMessage");

          Store(messageIdString, "+FLAGS (\\Deleted)", bMessageIdsAreUids);

          if (GetServerStateParser().LastCommandSuccessful()) {
            nsCString canonicalName;
            const char* selectedMailboxName =
                GetServerStateParser().GetSelectedMailboxName();
            if (selectedMailboxName) {
              m_runningUrl->AllocateCanonicalPath(
                  nsDependentCString(selectedMailboxName),
                  kOnlineHierarchySeparatorUnknown, canonicalName);
            }

            if (m_imapMessageSink)
              m_imapMessageSink->NotifyMessageDeleted(
                  canonicalName.get(), false, messageIdString.get());
            // notice we don't wait for this to finish...

            // Only when pref "expunge_after_delete" is set: if server is
            // UIDPLUS capable, expunge the UIDs just marked deleted;
            // otherwise, go ahead and expunge the full mailbox of ALL
            // emails marked as deleted in mailbox, not just the ones
            // marked as deleted here.
            if (gExpungeAfterDelete) {
              if (GetServerStateParser().GetCapabilityFlag() &
                  kUidplusCapability) {
                UidExpunge(messageIdString);
              } else {
                Expunge();
              }
            }
          } else
            HandleMemoryFailure();
        } break;
        case nsIImapUrl::nsImapDeleteFolderAndMsgs:
          DeleteFolderAndMsgs(mailboxName.get());
          break;
        case nsIImapUrl::nsImapDeleteAllMsgs: {
          uint32_t numberOfMessages = GetServerStateParser().NumberOfMessages();
          if (numberOfMessages) {
            Store("1:*"_ns, "+FLAGS.SILENT (\\Deleted)",
                  false);  // use sequence #'s

            if (GetServerStateParser().LastCommandSuccessful())
              Expunge();  // expunge messages with deleted flag
            if (GetServerStateParser().LastCommandSuccessful()) {
              nsCString canonicalName;
              const char* selectedMailboxName =
                  GetServerStateParser().GetSelectedMailboxName();
              if (selectedMailboxName) {
                m_runningUrl->AllocateCanonicalPath(
                    nsDependentCString(selectedMailboxName),
                    kOnlineHierarchySeparatorUnknown, canonicalName);
              }

              if (m_imapMessageSink)
                m_imapMessageSink->NotifyMessageDeleted(canonicalName.get(),
                                                        true, nullptr);
            }
          }
          bool deleteSelf = false;
          DeleteSubFolders(mailboxName.get(), deleteSelf);  // don't delete self
        } break;
        case nsIImapUrl::nsImapAppendDraftFromFile: {
          OnAppendMsgFromFile();
        } break;
        case nsIImapUrl::nsImapAddMsgFlags: {
          nsCString messageIdString;
          m_runningUrl->GetListOfMessageIds(messageIdString);

          // If server is gmail and \deleted flag is being set and not doing
          // "just mark as deleted" and pref "expunge_after_delete" is set true
          // and there exists a [Gmail]/Trash folder, move each message to be
          // deleted to trash folder and mark each of these in trash as deleted
          // and expunge from trash only these messages. With default gmail.com
          // imap setting this completely removes the deleted messages, even
          // from All Mail. Gmail supports UIDPLUS so no check of imap
          // capabilities is needed, but if a command fails or is not supported
          // below, the added flags (including \deleted) are set for the folder.
          if (m_isGmailServer && !GetShowDeletedMessages() &&
              (msgFlags & kImapMsgDeletedFlag) && gExpungeAfterDelete) {
            // Check that trash exists
            bool trashFolderExists = false;
            m_hostSessionList->GetOnlineTrashFolderExistsForHost(
                GetImapServerKey(), trashFolderExists);
            if (trashFolderExists && !m_trashFolderPath.IsEmpty()) {
              // Trash folder exists and have the trash folder path so do a
              // "copy" of the message set to Trash. (Note: Copy of gmail
              // messages to Trash actually expunges the messages from source
              // folder so gmail copy to trash is effective move to trash.)
              Copy(messageIdString.get(), m_trashFolderPath.get(), true);
              if (GetServerStateParser().LastCommandSuccessful()) {
                // Obtain new UIDs for the trash folder from COPYUID response
                // code
                nsCString trashIdString = GetServerStateParser().fCopyUidSet;
                if (!trashIdString.IsEmpty() && trashIdString.Last() == ']') {
                  trashIdString.Cut(trashIdString.Length() - 1, 1);
                }
                if (!trashIdString.IsEmpty()) {
                  // Have new UIDs of message just moved into Trash, mark them
                  // \deleted and expunge these UIDs. But first, since gmail
                  // returns the destination response in COPYUID as a comma
                  // separated descending list of each destination UID, it is
                  // helpful to change the list to ranges. This will minimize
                  // the string length when lots of messages are deleted.

                  // Get array of UIDs from the COPYUID destination UIDs.
                  nsTArray<nsMsgKey> msgKeys;
                  ParseUidString(trashIdString.get(), msgKeys);

                  // Re-create trashIdString as a ascending range or ranges.
                  trashIdString.Truncate();
                  nsImapMailFolder::AllocateUidStringFromKeys(msgKeys,
                                                              trashIdString);

                  // Imap SELECT trash folder and do UID Expunge on messages
                  // just moved to trash. However, don't do a folder update to
                  // avoid showing a temporary message count change and unread
                  // message indication.
                  SelectMailbox(m_trashFolderPath.get(), true);
                  if (GetServerStateParser().LastCommandSuccessful()) {
                    // Now selected on Trash.
                    ProcessStoreFlags(trashIdString, true, kImapMsgDeletedFlag,
                                      true);
                    UidExpunge(trashIdString);
                    if (!GetServerStateParser().LastCommandSuccessful()) {
                      MOZ_LOG(IMAP_CS, LogLevel::Error,
                              ("UidExpunge() of gmail Trash messages failed"));
                    }
                    // Select original mailbox.
                    SelectMailbox(mailboxName.get(), true);
                    break;
                  }
                }
              }
            }
          }

          // This sets the flag(s) on the message. The message or whole folder
          // may be expunged below if \deleted flag is set.
          ProcessStoreFlags(messageIdString, bMessageIdsAreUids, msgFlags,
                            true);

          // Nothing more to do if \deleted flag was not set.
          if (!(msgFlags & kImapMsgDeletedFlag)) break;

          bool uidPlusCapable =
              GetServerStateParser().GetCapabilityFlag() & kUidplusCapability;
          // Flags contain \deleted so if pref "expunge_after_delete" is set,
          // and if server is UIDPLUS capable, then expunge the UIDs just marked
          // deleted; otherwise, go ahead and expunge the full mailbox of ALL
          // emails marked as deleted in mailbox, not just the ones marked as
          // deleted here.
          if (gExpungeAfterDelete) {
            if (uidPlusCapable)
              UidExpunge(messageIdString);  // Expunge just the target message
            else
              Expunge();  // Expunge all messages in folder marked imap \deleted
            break;
          }

          // If reached, gExpungeAfterDelete is false (the default).  If server
          // is UIDPLUS capable AND user not using "just mark as deleted" delete
          // method and URL has just marked a draft message deleted, then
          // expunge just the target message using imap command "uid expunge".
          // Otherwise, old versions of drafts marked deleted remain until
          // Drafts folder is expunged (compacted) or the old draft messages are
          // deleted and expunged by other means.
          // Note: All "well known" imap servers support UIDPLUS so accumulation
          // of old and deleted drafts should be unusual. So for rare servers
          // not supporting UIDPLUS, users may want to enable pref
          // expunge_after_delete to trigger full folder Expunge() above.
          if (uidPlusCapable && !GetShowDeletedMessages()) {
            // Determine if we just marked \deleted a draft message.
            uint32_t uid = strtoul(messageIdString.get(), nullptr, 10);
            int32_t index;
            bool foundIt = false;
            imapMessageFlagsType flags =
                m_flagState->GetMessageFlagsFromUID(uid, &foundIt, &index);
            if (foundIt && (flags & kImapMsgDraftFlag)) {
              MOZ_ASSERT(flags & kImapMsgDeletedFlag,
                         "expunging a not deleted msg");
              UidExpunge(messageIdString);
            } else
              MOZ_ASSERT(foundIt, "deleted msg not found in flagState");
          }
        } break;
        case nsIImapUrl::nsImapSubtractMsgFlags: {
          nsCString messageIdString;
          m_runningUrl->GetListOfMessageIds(messageIdString);

          ProcessStoreFlags(messageIdString, bMessageIdsAreUids, msgFlags,
                            false);
        } break;
        case nsIImapUrl::nsImapSetMsgFlags: {
          // This changes the flags to the value in msgFlags. Any flags that
          // are currently set and not in msgFlags are reset.
          nsCString messageIdString;
          m_runningUrl->GetListOfMessageIds(messageIdString);

          ProcessStoreFlags(messageIdString, bMessageIdsAreUids, msgFlags,
                            true);
          ProcessStoreFlags(messageIdString, bMessageIdsAreUids, ~msgFlags,
                            false);
        } break;
        case nsIImapUrl::nsImapBiff:
          PeriodicBiff();
          break;
        case nsIImapUrl::nsImapOnlineCopy:
        case nsIImapUrl::nsImapOnlineMove: {
          nsCString messageIdString;
          m_runningUrl->GetListOfMessageIds(messageIdString);
          nsCString destinationMailbox =
              OnCreateServerDestinationFolderPathString();

          if (m_imapAction == nsIImapUrl::nsImapOnlineMove) {
            if (HandlingMultipleMessages(messageIdString))
              ProgressEventFunctionUsingNameWithString(
                  "imapMovingMessages", destinationMailbox.get());
            else
              ProgressEventFunctionUsingNameWithString(
                  "imapMovingMessage", destinationMailbox.get());
          } else {
            if (HandlingMultipleMessages(messageIdString))
              ProgressEventFunctionUsingNameWithString(
                  "imapCopyingMessages", destinationMailbox.get());
            else
              ProgressEventFunctionUsingNameWithString(
                  "imapCopyingMessage", destinationMailbox.get());
          }
          Copy(messageIdString.get(), destinationMailbox.get(),
               bMessageIdsAreUids);
          ImapOnlineCopyState copyState;
          if (DeathSignalReceived())
            copyState = ImapOnlineCopyStateType::kInterruptedState;
          else
            copyState =
                GetServerStateParser().LastCommandSuccessful()
                    ? (ImapOnlineCopyState)
                          ImapOnlineCopyStateType::kSuccessfulCopy
                    : (ImapOnlineCopyState)ImapOnlineCopyStateType::kFailedCopy;
          if (m_imapMailFolderSink)
            m_imapMailFolderSink->OnlineCopyCompleted(this, copyState);
          // Don't mark message 'Deleted' for servers that support the MOVE
          // extension, since we already issued a 'move' command.
          if (GetServerStateParser().LastCommandSuccessful() &&
              (m_imapAction == nsIImapUrl::nsImapOnlineMove) &&
              !(GetServerStateParser().GetCapabilityFlag() &
                kHasMoveCapability)) {
            // Simulate MOVE for servers that don't support MOVE: do
            // COPY-DELETE-EXPUNGE.
            Store(messageIdString, "+FLAGS (\\Deleted \\Seen)",
                  bMessageIdsAreUids);
            bool storeSuccessful =
                GetServerStateParser().LastCommandSuccessful();
            if (storeSuccessful) {
              // We are simulating a imap MOVE (on the same server). The
              // message(s) has/(have) been COPY'd and marked deleted. Only when
              // pref "expunge_after_delete" is set: if server is UIDPLUS
              // capable, expunge the UIDs just marked \deleted; otherwise, go
              // ahead and expunge the full mailbox of ALL emails marked as
              // deleted in mailbox, not just the ones copied.
              if (gExpungeAfterDelete) {
                if (GetServerStateParser().GetCapabilityFlag() &
                    kUidplusCapability) {
                  UidExpunge(messageIdString);
                } else {
                  // This will expunge all emails marked as deleted in mailbox,
                  // not just the ones marked as deleted above.
                  Expunge();
                }
              } else {
                // When "expunge_after_delete" is not true, check if UIDPLUS
                // capable so we can just expunge emails we just copied and
                // marked as deleted. This prevents expunging emails that other
                // clients may have marked as deleted in the mailbox and don't
                // want them to disappear. Only do UidExpunge() when user
                // selected delete method is "Move it to this folder" or "Remove
                // it immediately", not when the delete method is "Just mark it
                // as deleted".
                if (!GetShowDeletedMessages() &&
                    (GetServerStateParser().GetCapabilityFlag() &
                     kUidplusCapability)) {
                  UidExpunge(messageIdString);
                }
              }
            }
            if (m_imapMailFolderSink) {
              copyState = storeSuccessful
                              ? (ImapOnlineCopyState)
                                    ImapOnlineCopyStateType::kSuccessfulDelete
                              : (ImapOnlineCopyState)
                                    ImapOnlineCopyStateType::kFailedDelete;
              m_imapMailFolderSink->OnlineCopyCompleted(this, copyState);
            }
          }
        } break;
        case nsIImapUrl::nsImapOnlineToOfflineCopy:
        case nsIImapUrl::nsImapOnlineToOfflineMove: {
          // Only happens for copy between servers, not for move.
          nsCString messageIdString;
          nsresult rv = m_runningUrl->GetListOfMessageIds(messageIdString);
          if (NS_SUCCEEDED(rv)) {
            SetProgressString(IMAP_MESSAGES_STRING_INDEX);
            m_progressCurrentNumber[m_stringIndex] = 0;
            m_progressExpectedNumber =
                CountMessagesInIdString(messageIdString.get());

            FetchMessage(messageIdString, kEveryThingRFC822Peek);

            SetProgressString(IMAP_EMPTY_STRING_INDEX);
            if (m_imapMailFolderSink) {
              ImapOnlineCopyState copyStatus;
              copyStatus = GetServerStateParser().LastCommandSuccessful()
                               ? ImapOnlineCopyStateType::kSuccessfulCopy
                               : ImapOnlineCopyStateType::kFailedCopy;

              m_imapMailFolderSink->OnlineCopyCompleted(this, copyStatus);
              if (GetServerStateParser().LastCommandSuccessful() &&
                  (m_imapAction == nsIImapUrl::nsImapOnlineToOfflineMove)) {
                // Note: action nsImapOnlineToOfflineMove never occurs.
                Store(messageIdString, "+FLAGS (\\Deleted \\Seen)",
                      bMessageIdsAreUids);
                if (GetServerStateParser().LastCommandSuccessful()) {
                  copyStatus = ImapOnlineCopyStateType::kSuccessfulDelete;
                  // Only when pref "expunge_after_delete" is set: if server is
                  // UIDPLUS capable, expunge the UIDs just marked deleted;
                  // otherwise, go ahead and expunge the full mailbox of ALL
                  // emails marked as deleted in mailbox, not just the ones
                  // marked as deleted here.
                  if (gExpungeAfterDelete) {
                    if (GetServerStateParser().GetCapabilityFlag() &
                        kUidplusCapability) {
                      UidExpunge(messageIdString);
                    } else {
                      Expunge();
                    }
                  }
                } else {
                  copyStatus = ImapOnlineCopyStateType::kFailedDelete;
                }
                m_imapMailFolderSink->OnlineCopyCompleted(this, copyStatus);
              }
            }
          } else
            HandleMemoryFailure();
        } break;
        default:
          if (GetServerStateParser().LastCommandSuccessful() && !uidValidityOk)
            ProcessMailboxUpdate(false);  // handle uidvalidity change
          break;
      }
    }
  } else if (!DeathSignalReceived())
    HandleMemoryFailure();
}

nsresult nsImapProtocol::BeginMessageDownLoad(
    uint32_t total_message_size,  // for user, headers and body
    const char* content_type) {
  nsresult rv = NS_OK;
  char* sizeString = PR_smprintf("OPEN Size: %ld", total_message_size);
  Log("STREAM", sizeString, "Begin Message Download Stream");
  PR_Free(sizeString);
  // start counting how many bytes we see in this message after all
  // transformations
  m_bytesToChannel = 0;

  if (content_type) {
    m_fromHeaderSeen = false;
    if (GetServerStateParser().GetDownloadingHeaders()) {
      // if we get multiple calls to BeginMessageDownload w/o intervening
      // calls to NormalEndMessageDownload or Abort, then we're just
      // going to fake a NormalMessageEndDownload. This will most likely
      // cause an empty header to get written to the db, and the user
      // will have to delete the empty header themselves, which
      // should remove the message from the server as well.
      if (m_curHdrInfo) NormalMessageEndDownload();
      if (!m_curHdrInfo) m_curHdrInfo = m_hdrDownloadCache->StartNewHdr();
      if (m_curHdrInfo) m_curHdrInfo->SetMsgSize(total_message_size);
      return NS_OK;
    }
    // if we have a mock channel, that means we have a channel listener who
    // wants the message. So set up a pipe. We'll write the message into one end
    // of the pipe and they will read it out of the other end.
    if (m_channelListener) {
      // create a pipe to pump the message into...the output will go to whoever
      // is consuming the message display
      // we create an "infinite" pipe in case we get extremely long lines from
      // the imap server, and the consumer is waiting for a whole line
      nsCOMPtr<nsIPipe> pipe = do_CreateInstance("@mozilla.org/pipe;1");
      rv = pipe->Init(false, false, 4096, PR_UINT32_MAX);
      NS_ENSURE_SUCCESS(rv, rv);

      // These always succeed because the pipe is initialized above.
      MOZ_ALWAYS_SUCCEEDS(
          pipe->GetInputStream(getter_AddRefs(m_channelInputStream)));
      MOZ_ALWAYS_SUCCEEDS(
          pipe->GetOutputStream(getter_AddRefs(m_channelOutputStream)));
    }
    // else, if we are saving the message to disk!
    else if (m_imapMessageSink /* && m_imapAction == nsIImapUrl::nsImapSaveMessageToDisk */)
    {
      // we get here when download the inbox for offline use
      nsCOMPtr<nsIFile> file;
      bool addDummyEnvelope = true;
      nsCOMPtr<nsIMsgMessageUrl> msgurl = do_QueryInterface(m_runningUrl);
      msgurl->GetMessageFile(getter_AddRefs(file));
      msgurl->GetAddDummyEnvelope(&addDummyEnvelope);
      if (file)
        rv = m_imapMessageSink->SetupMsgWriteStream(file, addDummyEnvelope);
    }
    if (m_imapMailFolderSink && m_runningUrl) {
      nsCOMPtr<nsISupports> copyState;
      if (m_runningUrl) {
        m_runningUrl->GetCopyState(getter_AddRefs(copyState));
        if (copyState)  // only need this notification during copy
        {
          nsCOMPtr<nsIMsgMailNewsUrl> mailurl = do_QueryInterface(m_runningUrl);
          m_imapMailFolderSink->StartMessage(mailurl);
        }
      }
    }

  } else
    HandleMemoryFailure();
  return rv;
}

void nsImapProtocol::GetShouldDownloadAllHeaders(bool* aResult) {
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->GetShouldDownloadAllHeaders(aResult);
}

void nsImapProtocol::GetArbitraryHeadersToDownload(nsCString& aResult) {
  if (m_imapServerSink) m_imapServerSink->GetArbitraryHeaders(aResult);
}

void nsImapProtocol::AdjustChunkSize() {
  int32_t deltaInSeconds;

  m_endTime = PR_Now();
  PRTime2Seconds(m_endTime - m_startTime, &deltaInSeconds);
  m_trackingTime = false;
  if (deltaInSeconds < 0) return;  // bogus for some reason

  if (deltaInSeconds <= m_tooFastTime && m_curFetchSize >= m_chunkSize) {
    m_chunkSize += m_chunkAddSize;
    m_chunkThreshold = m_chunkSize + (m_chunkSize / 2);
    // we used to have a max for the chunk size - I don't think that's needed.
  } else if (deltaInSeconds <= m_idealTime)
    return;
  else {
    if (m_chunkSize > m_chunkStartSize)
      m_chunkSize = m_chunkStartSize;
    else if (m_chunkSize > (m_chunkAddSize * 2))
      m_chunkSize -= m_chunkAddSize;
    m_chunkThreshold = m_chunkSize + (m_chunkSize / 2);
  }
  // remember these new values globally so new connections
  // can take advantage of them.
  if (gChunkSize != m_chunkSize) {
    // will cause chunk size pref to be written in CloseStream.
    gChunkSizeDirty = true;
    gChunkSize = m_chunkSize;
    gChunkThreshold = m_chunkThreshold;
  }
}

// authenticated state commands

// escape any backslashes or quotes.  Backslashes are used a lot with our NT
// server
void nsImapProtocol::CreateEscapedMailboxName(const char* rawName,
                                              nsCString& escapedName) {
  escapedName.Assign(rawName);

  for (int32_t strIndex = 0; *rawName; strIndex++) {
    char currentChar = *rawName++;
    if ((currentChar == '\\') || (currentChar == '\"'))
      escapedName.Insert('\\', strIndex++);
  }
}

// SELECT a mailbox and do a folder update unless noUpdate is set to true.
// For example, when gmail messages are shift-deleted to gmail Trash, we don't
// want to update. This prevents Trash folder message count badge from
// temporarily increasing.
void nsImapProtocol::SelectMailbox(const char* mailboxName,
                                   bool noUpdate /* = false */) {
  ProgressEventFunctionUsingNameWithString("imapStatusSelectingMailbox",
                                           mailboxName);
  IncrementCommandTagNumber();

  m_closeNeededBeforeSelect = false;  // initial value
  GetServerStateParser().ResetFlagInfo();
  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);
  nsCString commandBuffer(GetServerCommandTag());
  commandBuffer.AppendLiteral(" select \"");
  commandBuffer.Append(escapedName.get());
  commandBuffer.Append('"');
  if (UseCondStore()) commandBuffer.AppendLiteral(" (CONDSTORE)");
  commandBuffer.Append(CRLF);

  nsresult res;
  res = SendData(commandBuffer.get());
  if (NS_FAILED(res)) return;
  ParseIMAPandCheckForNewMail();

  // Save the folder sink obtained in SetupSinkProxy() for whatever URL just
  // caused this SELECT. Needed so idle and noop responses are using the correct
  // folder when detecting changed flags or new messages.
  m_imapMailFolderSinkSelected = m_imapMailFolderSink;
  MOZ_ASSERT(m_imapMailFolderSinkSelected);
  Log("SelectMailbox", nullptr, "got m_imapMailFolderSinkSelected");

  // Check for need to skip possible call to ProcessMailboxUpdate() below
  if (noUpdate) return;

  int32_t numOfMessagesInFlagState = 0;
  nsImapAction imapAction;
  m_flagState->GetNumberOfMessages(&numOfMessagesInFlagState);
  res = m_runningUrl->GetImapAction(&imapAction);
  // if we've selected a mailbox, and we're not going to do an update because of
  // the url type, but don't have the flags, go get them!
  if (GetServerStateParser().LastCommandSuccessful() && NS_SUCCEEDED(res) &&
      imapAction != nsIImapUrl::nsImapSelectFolder &&
      imapAction != nsIImapUrl::nsImapExpungeFolder &&
      imapAction != nsIImapUrl::nsImapLiteSelectFolder &&
      imapAction != nsIImapUrl::nsImapDeleteAllMsgs &&
      ((GetServerStateParser().NumberOfMessages() !=
        numOfMessagesInFlagState) &&
       (numOfMessagesInFlagState == 0))) {
    ProcessMailboxUpdate(false);
  }
}

void nsImapProtocol::FetchMsgAttribute(const nsCString& messageIds,
                                       const nsCString& attribute) {
  IncrementCommandTagNumber();

  nsAutoCString commandString(GetServerCommandTag());
  commandString.AppendLiteral(" UID fetch ");
  commandString.Append(messageIds);
  commandString.AppendLiteral(" (");
  commandString.Append(attribute);
  commandString.AppendLiteral(")" CRLF);
  nsresult rv = SendData(commandString.get());

  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail(commandString.get());
  GetServerStateParser().SetFetchingFlags(false);
  // Always clear this flag after every fetch.
  m_fetchingWholeMessage = false;
}

// this routine is used to fetch a message or messages, or headers for a
// message...

void nsImapProtocol::FallbackToFetchWholeMsg(const nsCString& messageId,
                                             uint32_t messageSize) {
  if (m_imapMessageSink && m_runningUrl) {
    bool shouldStoreMsgOffline;
    m_runningUrl->GetStoreOfflineOnFallback(&shouldStoreMsgOffline);
    m_runningUrl->SetStoreResultsOffline(shouldStoreMsgOffline);
  }
  FetchTryChunking(messageId,
                   m_imapAction == nsIImapUrl::nsImapMsgFetchPeek
                       ? kEveryThingRFC822Peek
                       : kEveryThingRFC822,
                   true, nullptr, messageSize, true);
}

void nsImapProtocol::FetchMessage(const nsCString& messageIds,
                                  nsIMAPeFetchFields whatToFetch,
                                  const char* fetchModifier, uint32_t startByte,
                                  uint32_t numBytes, char* part) {
  IncrementCommandTagNumber();

  nsCString commandString;
  commandString = "%s UID fetch";

  switch (whatToFetch) {
    case kEveryThingRFC822:
      m_flagChangeCount++;
      m_fetchingWholeMessage = true;
      if (m_trackingTime) AdjustChunkSize();  // we started another segment
      m_startTime = PR_Now();                 // save start of download time
      m_trackingTime = true;
      MOZ_LOG(IMAP, LogLevel::Debug,
              ("FetchMessage everything: curFetchSize %u numBytes %u",
               m_curFetchSize, numBytes));
      if (numBytes > 0) m_curFetchSize = numBytes;

      if (GetServerStateParser().ServerHasIMAP4Rev1Capability()) {
        if (GetServerStateParser().GetCapabilityFlag() & kHasXSenderCapability)
          commandString.AppendLiteral(" %s (XSENDER UID RFC822.SIZE BODY[]");
        else
          commandString.AppendLiteral(" %s (UID RFC822.SIZE BODY[]");
      } else {
        if (GetServerStateParser().GetCapabilityFlag() & kHasXSenderCapability)
          commandString.AppendLiteral(" %s (XSENDER UID RFC822.SIZE RFC822");
        else
          commandString.AppendLiteral(" %s (UID RFC822.SIZE RFC822");
      }
      if (numBytes > 0) {
        // if we are retrieving chunks
        char* byterangeString = PR_smprintf("<%ld.%ld>", startByte, numBytes);
        if (byterangeString) {
          commandString.Append(byterangeString);
          PR_Free(byterangeString);
        }
      }
      commandString.Append(')');

      break;

    case kEveryThingRFC822Peek: {
      MOZ_LOG(IMAP, LogLevel::Debug,
              ("FetchMessage peek: curFetchSize %u numBytes %u", m_curFetchSize,
               numBytes));
      if (numBytes > 0) m_curFetchSize = numBytes;
      const char* formatString = "";
      eIMAPCapabilityFlags server_capabilityFlags =
          GetServerStateParser().GetCapabilityFlag();

      m_fetchingWholeMessage = true;
      if (server_capabilityFlags & kIMAP4rev1Capability) {
        // use body[].peek since rfc822.peek is not in IMAP4rev1
        if (server_capabilityFlags & kHasXSenderCapability)
          formatString = " %s (XSENDER UID RFC822.SIZE BODY.PEEK[]";
        else
          formatString = " %s (UID RFC822.SIZE BODY.PEEK[]";
      } else {
        if (server_capabilityFlags & kHasXSenderCapability)
          formatString = " %s (XSENDER UID RFC822.SIZE RFC822.peek";
        else
          formatString = " %s (UID RFC822.SIZE RFC822.peek";
      }

      commandString.Append(formatString);
      if (numBytes > 0) {
        // if we are retrieving chunks
        char* byterangeString = PR_smprintf("<%ld.%ld>", startByte, numBytes);
        if (byterangeString) {
          commandString.Append(byterangeString);
          PR_Free(byterangeString);
        }
      }
      commandString.Append(')');
    } break;
    case kHeadersRFC822andUid:
      if (GetServerStateParser().ServerHasIMAP4Rev1Capability()) {
        bool downloadAllHeaders = false;
        // checks if we're filtering on "any header" or running a spam filter
        // requiring all headers
        GetShouldDownloadAllHeaders(&downloadAllHeaders);

        if (!downloadAllHeaders)  // if it's ok -- no filters on any header,
                                  // etc.
        {
          char* headersToDL = nullptr;
          char* what = nullptr;
          const char* dbHeaders =
              (gUseEnvelopeCmd) ? IMAP_DB_HEADERS : IMAP_ENV_AND_DB_HEADERS;
          nsCString arbitraryHeaders;
          GetArbitraryHeadersToDownload(arbitraryHeaders);
          for (uint32_t i = 0; i < mCustomDBHeaders.Length(); i++) {
            if (!FindInReadable(mCustomDBHeaders[i], arbitraryHeaders,
                                nsCaseInsensitiveCStringComparator)) {
              if (!arbitraryHeaders.IsEmpty()) arbitraryHeaders.Append(' ');
              arbitraryHeaders.Append(mCustomDBHeaders[i]);
            }
          }
          for (uint32_t i = 0; i < mCustomHeaders.Length(); i++) {
            if (!FindInReadable(mCustomHeaders[i], arbitraryHeaders,
                                nsCaseInsensitiveCStringComparator)) {
              if (!arbitraryHeaders.IsEmpty()) arbitraryHeaders.Append(' ');
              arbitraryHeaders.Append(mCustomHeaders[i]);
            }
          }
          if (arbitraryHeaders.IsEmpty())
            headersToDL = strdup(dbHeaders);
          else
            headersToDL =
                PR_smprintf("%s %s", dbHeaders, arbitraryHeaders.get());

          if (gUseEnvelopeCmd)
            what = PR_smprintf(" ENVELOPE BODY.PEEK[HEADER.FIELDS (%s)])",
                               headersToDL);
          else
            what = PR_smprintf(" BODY.PEEK[HEADER.FIELDS (%s)])", headersToDL);
          free(headersToDL);
          if (what) {
            commandString.AppendLiteral(" %s (UID ");
            if (m_isGmailServer)
              commandString.AppendLiteral("X-GM-MSGID X-GM-THRID X-GM-LABELS ");
            commandString.AppendLiteral("RFC822.SIZE FLAGS");
            commandString.Append(what);
            PR_Free(what);
          } else {
            commandString.AppendLiteral(
                " %s (UID RFC822.SIZE BODY.PEEK[HEADER] FLAGS)");
          }
        } else
          commandString.AppendLiteral(
              " %s (UID RFC822.SIZE BODY.PEEK[HEADER] FLAGS)");
      } else
        commandString.AppendLiteral(
            " %s (UID RFC822.SIZE RFC822.HEADER FLAGS)");
      break;
    case kUid:
      commandString.AppendLiteral(" %s (UID)");
      break;
    case kFlags:
      GetServerStateParser().SetFetchingFlags(true);
      commandString.AppendLiteral(" %s (FLAGS)");
      break;
    case kRFC822Size:
      commandString.AppendLiteral(" %s (RFC822.SIZE)");
      break;
    case kBodyStart: {
      int32_t numBytesToFetch;
      m_runningUrl->GetNumBytesToFetch(&numBytesToFetch);

      commandString.AppendLiteral(
          " %s (UID BODY.PEEK[HEADER.FIELDS (Content-Type "
          "Content-Transfer-Encoding)] BODY.PEEK[TEXT]<0.");
      commandString.AppendInt(numBytesToFetch);
      commandString.AppendLiteral(">)");
    } break;
    case kRFC822HeadersOnly:
      if (GetServerStateParser().ServerHasIMAP4Rev1Capability()) {
        if (part) {
          commandString.AppendLiteral(" %s (BODY[");
          char* what = PR_smprintf("%s.HEADER])", part);
          if (what) {
            commandString.Append(what);
            PR_Free(what);
          } else
            HandleMemoryFailure();
        } else {
          // headers for the top-level message
          commandString.AppendLiteral(" %s (BODY[HEADER])");
        }
      } else
        commandString.AppendLiteral(" %s (RFC822.HEADER)");
      break;
    case kMIMEPart:
      commandString.AppendLiteral(" %s (BODY.PEEK[%s]");
      if (numBytes > 0) {
        // if we are retrieving chunks
        char* byterangeString = PR_smprintf("<%ld.%ld>", startByte, numBytes);
        if (byterangeString) {
          commandString.Append(byterangeString);
          PR_Free(byterangeString);
        }
      }
      commandString.Append(')');
      break;
    case kMIMEHeader:
      commandString.AppendLiteral(" %s (BODY[%s.MIME])");
      break;
  }

  if (fetchModifier) commandString.Append(fetchModifier);

  commandString.Append(CRLF);

  // since messageIds can be infinitely long, use a dynamic buffer rather than
  // the fixed one
  const char* commandTag = GetServerCommandTag();
  int protocolStringSize = commandString.Length() + messageIds.Length() +
                           PL_strlen(commandTag) + 1 +
                           (part ? PL_strlen(part) : 0);
  char* protocolString = (char*)PR_CALLOC(protocolStringSize);

  if (protocolString) {
    char* cCommandStr = ToNewCString(commandString);
    if ((whatToFetch == kMIMEPart) || (whatToFetch == kMIMEHeader)) {
      PR_snprintf(protocolString,      // string to create
                  protocolStringSize,  // max size
                  cCommandStr,         // format string
                  commandTag,          // command tag
                  messageIds.get(), part);
    } else {
      PR_snprintf(protocolString,      // string to create
                  protocolStringSize,  // max size
                  cCommandStr,         // format string
                  commandTag,          // command tag
                  messageIds.get());
    }

    nsresult rv = SendData(protocolString);

    free(cCommandStr);
    if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail(protocolString);
    PR_Free(protocolString);
    GetServerStateParser().SetFetchingFlags(false);
    // Always clear this flag after every fetch.
    m_fetchingWholeMessage = false;
    if (GetServerStateParser().LastCommandSuccessful() && CheckNeeded())
      Check();
  } else
    HandleMemoryFailure();
}

void nsImapProtocol::FetchTryChunking(const nsCString& messageIds,
                                      nsIMAPeFetchFields whatToFetch,
                                      bool idIsUid, char* part,
                                      uint32_t downloadSize, bool tryChunking) {
  GetServerStateParser().SetTotalDownloadSize(downloadSize);
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("FetchTryChunking: curFetchSize %u", downloadSize));
  MOZ_ASSERT(!part, "fetching a part should no longer occur");
  m_curFetchSize = downloadSize;  // we'll change this if chunking.
  if (m_fetchByChunks && tryChunking &&
      GetServerStateParser().ServerHasIMAP4Rev1Capability() &&
      (downloadSize > (uint32_t)m_chunkThreshold)) {
    uint32_t startByte = 0;
    m_curFetchSize = m_chunkSize;
    GetServerStateParser().ClearLastFetchChunkReceived();
    while (!DeathSignalReceived() && !GetPseudoInterrupted() &&
           !GetServerStateParser().GetLastFetchChunkReceived() &&
           GetServerStateParser().ContinueParse()) {
      GetServerStateParser().ClearNumBytesFetched();
      // This chunk is a fetch of m_chunkSize bytes. But m_chunkSize can be
      // changed inside FetchMessage(). Save the original value of m_chunkSize
      // to set the correct offset (startByte) for the next chunk.
      int32_t bytesFetched = m_chunkSize;
      FetchMessage(messageIds, whatToFetch, nullptr, startByte, bytesFetched,
                   part);
      if (!GetServerStateParser().GetNumBytesFetched()) {
        // Fetch returned zero bytes chunk from server. This occurs if the
        // message was expunged during the fetch.
        MOZ_LOG(IMAP, LogLevel::Info,
                ("FetchTryChunking: Zero bytes chunk fetched; message probably "
                 "expunged"));
        break;
      }
      startByte += bytesFetched;
    }

    // Only abort the stream if this is a normal message download
    // Otherwise, let the body shell abort the stream.
    if ((whatToFetch == kEveryThingRFC822) &&
        ((startByte > 0 && (startByte < downloadSize) &&
          (DeathSignalReceived() || GetPseudoInterrupted())) ||
         !GetServerStateParser().ContinueParse())) {
      AbortMessageDownLoad();
      PseudoInterrupt(false);
    }
  } else {
    // small message, or (we're not chunking and not doing bodystructure),
    // or the server is not rev1.
    // Just fetch the whole thing.
    FetchMessage(messageIds, whatToFetch, nullptr, 0, 0, part);
  }
}

void nsImapProtocol::PostLineDownLoadEvent(const char* line,
                                           uint32_t uidOfMessage) {
  if (!GetServerStateParser().GetDownloadingHeaders()) {
    uint32_t byteCount = PL_strlen(line);
    bool echoLineToMessageSink = false;
    // if we have a channel listener, then just spool the message
    // directly to the listener
    if (m_channelListener) {
      uint32_t count = 0;
      if (m_channelOutputStream) {
        nsresult rv = m_channelOutputStream->Write(line, byteCount, &count);
        NS_ASSERTION(count == byteCount,
                     "IMAP channel pipe couldn't buffer entire write");
        if (NS_SUCCEEDED(rv)) {
          rv = m_channelListener->OnDataAvailable(
              m_mockChannel, m_channelInputStream, 0, count);
          NS_ENSURE_SUCCESS_VOID(rv);
        }
        // else some sort of explosion?
      }
    }
    if (m_runningUrl)
      m_runningUrl->GetStoreResultsOffline(&echoLineToMessageSink);

    m_bytesToChannel += byteCount;
    if (m_imapMessageSink && line && echoLineToMessageSink &&
        !GetPseudoInterrupted()) {
      nsresult rv = m_imapMessageSink->ParseAdoptedMsgLine(line, uidOfMessage,
                                                           m_runningUrl);
      if (NS_FAILED(rv)) {
        // If the folder failed to accept the message, stop piping it across!
        PseudoInterrupt(true);
      }
    }
  }
  // ***** We need to handle the pseudo interrupt here *****
}

// Handle a line seen by the parser.
// * The argument |lineCopy| must be nullptr or should contain the same string
//   as |line|.  |lineCopy| will be modified.
// * A line may be passed by parts, e.g., "part1 part2\r\n" may be passed as
//     HandleMessageDownLoadLine("part 1 ", 1);
//     HandleMessageDownLoadLine("part 2\r\n", 0);
//   However, it is assumed that a CRLF or a CRCRLF is never split (i.e., this
//   is ensured *before* invoking this method).
void nsImapProtocol::HandleMessageDownLoadLine(const char* line,
                                               bool isPartialLine,
                                               char* lineCopy) {
  NS_ENSURE_TRUE_VOID(line);
  NS_ASSERTION(lineCopy == nullptr || !PL_strcmp(line, lineCopy),
               "line and lineCopy must contain the same string");
  const char* messageLine = line;
  uint32_t lineLength = strlen(messageLine);
  const char* cEndOfLine = messageLine + lineLength;
  char* localMessageLine = nullptr;

  // If we obtain a partial line (due to fetching by chunks), we do not
  // add/modify the end-of-line terminator.
  if (!isPartialLine) {
    // Change this line to native line termination, duplicate if necessary.
    // Do not assume that the line really ends in CRLF
    // to start with, even though it is supposed to be RFC822

    // normalize line endings to CRLF unless we are saving the message to disk
    bool canonicalLineEnding = true;
    nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(m_runningUrl);

    if (m_imapAction == nsIImapUrl::nsImapSaveMessageToDisk && msgUrl)
      msgUrl->GetCanonicalLineEnding(&canonicalLineEnding);

    NS_ASSERTION(MSG_LINEBREAK_LEN == 1 || (MSG_LINEBREAK_LEN == 2 &&
                                            !PL_strcmp(CRLF, MSG_LINEBREAK)),
                 "violated assumptions on MSG_LINEBREAK");
    if (MSG_LINEBREAK_LEN == 1 && !canonicalLineEnding) {
      bool lineEndsWithCRorLF =
          lineLength >= 1 && (cEndOfLine[-1] == '\r' || cEndOfLine[-1] == '\n');
      char* endOfLine;
      if (lineCopy && lineEndsWithCRorLF)  // true for most lines
      {
        endOfLine = lineCopy + lineLength;
        messageLine = lineCopy;
      } else {
        // leave enough room for one more char, MSG_LINEBREAK[0]
        localMessageLine = (char*)PR_MALLOC(lineLength + 2);
        if (!localMessageLine)  // memory failure
          return;
        PL_strcpy(localMessageLine, line);
        endOfLine = localMessageLine + lineLength;
        messageLine = localMessageLine;
      }

      if (lineLength >= 2 && endOfLine[-2] == '\r' && endOfLine[-1] == '\n') {
        if (lineLength >= 3 && endOfLine[-3] == '\r')  // CRCRLF
        {
          endOfLine--;
          lineLength--;
        }
        /* CRLF -> CR or LF */
        endOfLine[-2] = MSG_LINEBREAK[0];
        endOfLine[-1] = '\0';
        lineLength--;
      } else if (lineLength >= 1 &&
                 ((endOfLine[-1] == '\r') || (endOfLine[-1] == '\n'))) {
        /* CR -> LF or LF -> CR */
        endOfLine[-1] = MSG_LINEBREAK[0];
      } else  // no eol characters at all
      {
        endOfLine[0] = MSG_LINEBREAK[0];  // CR or LF
        endOfLine[1] = '\0';
        lineLength++;
      }
    } else  // enforce canonical CRLF linebreaks
    {
      if (lineLength == 0 || (lineLength == 1 && cEndOfLine[-1] == '\n')) {
        messageLine = CRLF;
        lineLength = 2;
      } else if (cEndOfLine[-1] != '\n' || cEndOfLine[-2] != '\r' ||
                 (lineLength >= 3 && cEndOfLine[-3] == '\r')) {
        // The line does not end in CRLF (or it ends in CRCRLF).
        // Copy line and leave enough room for two more chars (CR and LF).
        localMessageLine = (char*)PR_MALLOC(lineLength + 3);
        if (!localMessageLine)  // memory failure
          return;
        PL_strcpy(localMessageLine, line);
        char* endOfLine = localMessageLine + lineLength;
        messageLine = localMessageLine;

        if (lineLength >= 3 && endOfLine[-1] == '\n' && endOfLine[-2] == '\r') {
          // CRCRLF -> CRLF
          endOfLine[-2] = '\n';
          endOfLine[-1] = '\0';
          lineLength--;
        } else if ((endOfLine[-1] == '\r') || (endOfLine[-1] == '\n')) {
          // LF -> CRLF or CR -> CRLF
          endOfLine[-1] = '\r';
          endOfLine[0] = '\n';
          endOfLine[1] = '\0';
          lineLength++;
        } else  // no eol characters at all
        {
          endOfLine[0] = '\r';
          endOfLine[1] = '\n';
          endOfLine[2] = '\0';
          lineLength += 2;
        }
      }
    }
  }
  NS_ASSERTION(lineLength == PL_strlen(messageLine), "lineLength not accurate");

  // check if sender obtained via XSENDER server extension matches "From:" field
  const char* xSenderInfo = GetServerStateParser().GetXSenderInfo();
  if (xSenderInfo && *xSenderInfo && !m_fromHeaderSeen) {
    if (!PL_strncmp("From: ", messageLine, 6)) {
      m_fromHeaderSeen = true;
      if (PL_strstr(messageLine, xSenderInfo) != NULL)
        // Adding a X-Mozilla-Status line here is not very elegant but it
        // works.  Another X-Mozilla-Status line is added to the message when
        // downloading to a local folder; this new line will also contain the
        // 'authed' flag we are adding here.  (If the message is again
        // uploaded to the server, this flag is lost.)
        // 0x0200 == nsMsgMessageFlags::SenderAuthed
        HandleMessageDownLoadLine("X-Mozilla-Status: 0200\r\n", false);
      GetServerStateParser().FreeXSenderInfo();
    }
  }

  if (GetServerStateParser().GetDownloadingHeaders()) {
    if (!m_curHdrInfo)
      BeginMessageDownLoad(GetServerStateParser().SizeOfMostRecentMessage(),
                           MESSAGE_RFC822);
    if (m_curHdrInfo) {
      if (NS_FAILED(m_curHdrInfo->CacheLine(
              messageLine, GetServerStateParser().CurrentResponseUID())))
        NS_ERROR("CacheLine for a header failed");
    }
    PR_Free(localMessageLine);
    return;
  }
  // if this line is for a different message, or the incoming line is too big
  if (((m_downloadLineCache->CurrentUID() !=
        GetServerStateParser().CurrentResponseUID()) &&
       !m_downloadLineCache->CacheEmpty()) ||
      (m_downloadLineCache->SpaceAvailable() < lineLength + 1))
    FlushDownloadCache();

  // so now the cache is flushed, but this string might still be too big
  if (m_downloadLineCache->SpaceAvailable() < lineLength + 1)
    PostLineDownLoadEvent(messageLine,
                          GetServerStateParser().CurrentResponseUID());
  else {
    NS_ASSERTION(
        (PL_strlen(messageLine) + 1) <= m_downloadLineCache->SpaceAvailable(),
        "Oops... line length greater than space available");
    if (NS_FAILED(m_downloadLineCache->CacheLine(
            messageLine, GetServerStateParser().CurrentResponseUID())))
      NS_ERROR("CacheLine for message body failed");
  }
  PR_Free(localMessageLine);
}

void nsImapProtocol::FlushDownloadCache() {
  if (!m_downloadLineCache->CacheEmpty()) {
    msg_line_info* downloadLine = m_downloadLineCache->GetCurrentLineInfo();
    PostLineDownLoadEvent(downloadLine->adoptedMessageLine,
                          downloadLine->uidOfMessage);
    m_downloadLineCache->ResetCache();
  }
}

void nsImapProtocol::NormalMessageEndDownload() {
  Log("STREAM", "CLOSE", "Normal Message End Download Stream");

  if (m_trackingTime) AdjustChunkSize();
  if (m_imapMailFolderSink && m_curHdrInfo &&
      GetServerStateParser().GetDownloadingHeaders()) {
    m_curHdrInfo->SetMsgSize(GetServerStateParser().SizeOfMostRecentMessage());
    m_curHdrInfo->SetMsgUid(GetServerStateParser().CurrentResponseUID());
    m_hdrDownloadCache->FinishCurrentHdr();
    int32_t numHdrsCached;
    m_hdrDownloadCache->GetNumHeaders(&numHdrsCached);
    if (numHdrsCached == kNumHdrsToXfer) {
      m_imapMailFolderSink->ParseMsgHdrs(this, m_hdrDownloadCache);
      m_hdrDownloadCache->ResetAll();
    }
  }
  FlushDownloadCache();

  if (!GetServerStateParser().GetDownloadingHeaders()) {
    int32_t updatedMessageSize = -1;
    if (m_fetchingWholeMessage) {
      updatedMessageSize = m_bytesToChannel;
      if (m_bytesToChannel !=
          GetServerStateParser().SizeOfMostRecentMessage()) {
        MOZ_LOG(IMAP, LogLevel::Debug,
                ("STREAM:CLOSE Server's RFC822.SIZE %u, actual size %u",
                 GetServerStateParser().SizeOfMostRecentMessage(),
                 m_bytesToChannel));
      }
    }
    // need to know if we're downloading for display or not. We'll use action ==
    // nsImapMsgFetch for now
    nsImapAction imapAction =
        nsIImapUrl::nsImapSelectFolder;  // just set it to some legal value
    if (m_runningUrl) m_runningUrl->GetImapAction(&imapAction);

    if (m_imapMessageSink) {
      if (m_mockChannel) {
        // Have a mock channel, tell channel that write to cache is done.
        m_mockChannel->SetWritingToCache(false);
        MOZ_LOG(IMAP, LogLevel::Debug, ("%s: End cache write", __func__));
      }
      m_imapMessageSink->NormalEndMsgWriteStream(
          m_downloadLineCache->CurrentUID(),
          imapAction == nsIImapUrl::nsImapMsgFetch, m_runningUrl,
          updatedMessageSize);
    }

    if (m_runningUrl && m_imapMailFolderSink) {
      nsCOMPtr<nsISupports> copyState;
      m_runningUrl->GetCopyState(getter_AddRefs(copyState));
      if (copyState)  // only need this notification during copy
      {
        nsCOMPtr<nsIMsgMailNewsUrl> mailUrl(do_QueryInterface(m_runningUrl));
        m_imapMailFolderSink->EndMessage(mailUrl,
                                         m_downloadLineCache->CurrentUID());
      }
    }
  }
  m_curHdrInfo = nullptr;
}

void nsImapProtocol::AbortMessageDownLoad() {
  Log("STREAM", "CLOSE", "Abort Message  Download Stream");

  if (m_trackingTime) AdjustChunkSize();
  FlushDownloadCache();
  if (GetServerStateParser().GetDownloadingHeaders()) {
    if (m_imapMailFolderSink)
      m_imapMailFolderSink->AbortHeaderParseStream(this);
  } else if (m_imapMessageSink)
    m_imapMessageSink->AbortMsgWriteStream();

  m_curHdrInfo = nullptr;
}

void nsImapProtocol::ProcessMailboxUpdate(bool handlePossibleUndo) {
  if (DeathSignalReceived()) return;

  // Update quota information
  char* boxName;
  GetSelectedMailboxName(&boxName);
  GetQuotaDataIfSupported(boxName);
  PR_Free(boxName);

  // fetch the flags and uids of all existing messages or new ones
  if (!DeathSignalReceived() && GetServerStateParser().NumberOfMessages()) {
    if (handlePossibleUndo) {
      // undo any delete flags we may have asked to
      nsCString undoIdsStr;
      nsAutoCString undoIds;

      GetCurrentUrl()->GetListOfMessageIds(undoIdsStr);
      undoIds.Assign(undoIdsStr);
      if (!undoIds.IsEmpty()) {
        char firstChar = (char)undoIds.CharAt(0);
        undoIds.Cut(0, 1);  // remove first character
        // if this string started with a '-', then this is an undo of a delete
        // if its a '+' its a redo
        if (firstChar == '-')
          Store(undoIds, "-FLAGS (\\Deleted)",
                true);  // most servers will fail silently on a failure, deal
                        // with it?
        else if (firstChar == '+')
          Store(undoIds, "+FLAGS (\\Deleted)",
                true);  // most servers will fail silently on a failure, deal
                        // with it?
        else
          NS_ASSERTION(false, "bogus undo Id's");
      }
    }

    // make the parser record these flags
    nsCString fetchStr;
    int32_t added = 0, deleted = 0;

    m_flagState->GetNumberOfMessages(&added);
    deleted = m_flagState->NumberOfDeletedMessages();
    bool flagStateEmpty = !added;
    bool useCS = UseCondStore();

    // Figure out if we need to do a full sync (UID Fetch Flags 1:*),
    // a partial sync using CHANGEDSINCE, or a sync from the previous
    // highwater mark.

    // If the folder doesn't know about the highest uid, or the flag state
    // is empty, and we're not using CondStore, we definitely need a full sync.
    //
    // Print to log items affecting needFullFolderSync:
    MOZ_LOG(IMAP_CS, LogLevel::Debug,
            ("Do full sync?: mFolderHighestUID=%" PRIu32 ", added=%" PRId32
             ", useCS=%s",
             mFolderHighestUID, added, useCS ? "true" : "false"));
    bool needFullFolderSync = !mFolderHighestUID || (flagStateEmpty && !useCS);
    bool needFolderSync = false;

    if (!needFullFolderSync) {
      // Figure out if we need to do a non-highwater mark sync.
      // Set needFolderSync true when at least 1 of these 3 cases is true:
      // 1. Have no uids in flag array or all flag elements are marked deleted
      // AND not using CONDSTORE.
      // 2. Have no uids in flag array or all flag elements are marked deleted
      // AND using "just mark as deleted" and EXISTS response count differs from
      // stored message count for folder.
      // 3. Using CONDSTORE and highest MODSEQ response is not equal to stored
      // mod seq for folder.

      // Print to log items affecting needFolderSync:
      // clang-format off
      MOZ_LOG(IMAP_CS, LogLevel::Debug,
              ("1. Do a sync?: added=%" PRId32 ", deleted=%" PRId32 ", useCS=%s",
               added, deleted, useCS ? "true" : "false"));
      MOZ_LOG(IMAP_CS, LogLevel::Debug,
              ("2. Do a sync?: ShowDeletedMsgs=%s, exists=%" PRId32
               ", mFolderTotalMsgCount=%" PRId32,
               GetShowDeletedMessages() ? "true" : "false",
               GetServerStateParser().NumberOfMessages(), mFolderTotalMsgCount));
      // clang-format on
      MOZ_LOG(IMAP_CS, LogLevel::Debug,
              ("3. Do a sync?: fHighestModSeq=%" PRIu64
               ", mFolderLastModSeq=%" PRIu64,
               GetServerStateParser().fHighestModSeq, mFolderLastModSeq));

      needFolderSync =
          ((flagStateEmpty || added == deleted) &&
           (!useCS || (GetShowDeletedMessages() &&
                       GetServerStateParser().NumberOfMessages() !=
                           mFolderTotalMsgCount))) ||
          (useCS && GetServerStateParser().fHighestModSeq != mFolderLastModSeq);
    }
    MOZ_LOG(IMAP_CS, LogLevel::Debug,
            ("needFullFolderSync=%s, needFolderSync=%s",
             needFullFolderSync ? "true" : "false",
             needFolderSync ? "true" : "false"));

    if (needFullFolderSync || needFolderSync) {
      nsCString idsToFetch("1:*");
      char fetchModifier[40] = "";
      if (!needFullFolderSync && !GetShowDeletedMessages() && useCS) {
        m_flagState->StartCapture();
        MOZ_LOG(IMAP_CS, LogLevel::Debug,
                ("Doing UID fetch 1:* (CHANGEDSINCE %" PRIu64 ")",
                 mFolderLastModSeq));
        PR_snprintf(fetchModifier, sizeof(fetchModifier),
                    " (CHANGEDSINCE %llu)", mFolderLastModSeq);
      } else
        m_flagState->SetPartialUIDFetch(false);

      FetchMessage(idsToFetch, kFlags, fetchModifier);
      // lets see if we should expunge during a full sync of flags.
      if (GetServerStateParser().LastCommandSuccessful()) {
        // if we did a CHANGEDSINCE fetch, do a sanity check on the msg counts
        // to see if some other client may have done an expunge.
        if (m_flagState->GetPartialUIDFetch()) {
          uint32_t numExists = GetServerStateParser().NumberOfMessages();
          uint32_t numPrevExists = mFolderTotalMsgCount;
          MOZ_LOG(IMAP_CS, LogLevel::Debug,
                  ("Sanity, deleted=%" PRId32 ", numPrevExists=%" PRIu32
                   ", numExists=%" PRIu32,
                   m_flagState->NumberOfDeletedMessages(), numPrevExists,
                   numExists));
          // Determine the number of new UIDs just fetched that are greater than
          // the saved highest UID for the folder. numToCheck will contain the
          // number of UIDs just fetched and, of course, not all are new.
          uint32_t numNewUIDs = 0;
          uint32_t numToCheck = m_flagState->GetNumAdded();
          bool flagChangeDetected = false;
          bool expungeHappened = false;
          MOZ_LOG(IMAP_CS, LogLevel::Debug,
                  ("numToCheck=%" PRIu32, numToCheck));
          if (numToCheck && mFolderHighestUID) {
            uint32_t uid;
            int32_t topIndex;
            m_flagState->GetNumberOfMessages(&topIndex);
            MOZ_LOG(
                IMAP_CS, LogLevel::Debug,
                ("Partial fetching. Number of UIDs stored=%" PRId32, topIndex));
            do {
              topIndex--;
              // Check for potential infinite loop here. This has happened but
              // don't know why. If topIndex is negative at this point, set
              // expungeHappened true to recover by doing a full flag fetch.
              if (topIndex < 0) {
                expungeHappened = true;
                MOZ_LOG(IMAP_CS, LogLevel::Error,
                        ("Zero or negative number of UIDs stored, do full flag "
                         "fetch"));
                break;
              }
              m_flagState->GetUidOfMessage(topIndex, &uid);
              if (uid && uid != nsMsgKey_None) {
                if (uid > mFolderHighestUID) {
                  numNewUIDs++;
                  MOZ_LOG(IMAP_CS, LogLevel::Debug,
                          ("numNewUIDs=%" PRIu32 ", Added new UID=%" PRIu32,
                           numNewUIDs, uid));
                  numToCheck--;
                } else {
                  // Just a flag change on an existing UID. No more new UIDs
                  // will be found. This does not detect an expunged message.
                  flagChangeDetected = true;
                  MOZ_LOG(IMAP_CS, LogLevel::Debug,
                          ("Not new uid=%" PRIu32, uid));
                  break;
                }
              } else {
                MOZ_LOG(IMAP_CS, LogLevel::Debug,
                        ("UID is 0 or a gap, uid=0x%" PRIx32, uid));
                break;
              }
            } while (numToCheck);
          }

          // Another client expunged at least one message if the number of new
          // UIDs is not equal to the observed change in the number of messages
          // existing in the folder.
          expungeHappened =
              expungeHappened || numNewUIDs != (numExists - numPrevExists);
          if (expungeHappened) {
            // Sanity check failed - need full fetch to remove expunged msgs.
            MOZ_LOG(IMAP_CS, LogLevel::Debug,
                    ("Other client expunged msgs, do full fetch to remove "
                     "expunged msgs"));
            m_flagState->Reset();
            m_flagState->SetPartialUIDFetch(false);
            FetchMessage("1:*"_ns, kFlags);
          } else if (numNewUIDs == 0) {
            // Nothing has been expunged and no new UIDs, so if just a flag
            // change on existing message(s), avoid unneeded fetch of flags for
            // messages with UIDs at and above uid (see var uid above) when
            // "highwater mark" fetch occurs below.
            if (mFolderHighestUID && flagChangeDetected) {
              MOZ_LOG(IMAP_CS, LogLevel::Debug,
                      ("Avoid unneeded fetches after just flag changes"));
              GetServerStateParser().ResetHighestRecordedUID();
            }
          }
        }
        int32_t numDeleted = m_flagState->NumberOfDeletedMessages();
        // Don't do expunge when we are lite selecting folder (because we
        // could be doing undo) or if gExpungeOption is kAutoExpungeNever.
        // Expunge if we're always expunging, or the number of deleted messages
        // is over the threshold, and we're either always respecting the
        // threshold, or we're expunging based on the delete model, and the
        // delete model is not "just mark it as deleted" (imap delete model).
        if (m_imapAction != nsIImapUrl::nsImapLiteSelectFolder &&
            gExpungeOption != kAutoExpungeNever &&
            (gExpungeOption == kAutoExpungeAlways ||
             (numDeleted >= gExpungeThreshold &&
              (gExpungeOption == kAutoExpungeOnThreshold ||
               (gExpungeOption == kAutoExpungeDeleteModel &&
                !GetShowDeletedMessages())))))
          Expunge();
      }
    } else {
      // Obtain the highest (highwater mark) UID seen since the last UIDVALIDITY
      // response occurred (associated with the most recent SELECT for the
      // folder).
      uint32_t highestRecordedUID = GetServerStateParser().HighestRecordedUID();
      // if we're using CONDSTORE, and the parser hasn't seen any UIDs, use
      // the highest UID previously seen and saved for the folder instead.
      if (useCS && !highestRecordedUID) highestRecordedUID = mFolderHighestUID;
      // clang-format off
      MOZ_LOG(IMAP_CS, LogLevel::Debug,
              ("Check for new messages above UID=%" PRIu32, highestRecordedUID));
      // clang-format on
      AppendUid(fetchStr, highestRecordedUID + 1);
      fetchStr.AppendLiteral(":*");
      FetchMessage(fetchStr, kFlags);  // only new messages please
    }
  } else if (GetServerStateParser().LastCommandSuccessful()) {
    GetServerStateParser().ResetFlagInfo();
    // the flag state is empty, but not partial.
    m_flagState->SetPartialUIDFetch(false);
  }

  if (GetServerStateParser().LastCommandSuccessful()) {
    nsImapAction imapAction;
    nsresult res = m_runningUrl->GetImapAction(&imapAction);
    if (NS_SUCCEEDED(res) && imapAction == nsIImapUrl::nsImapLiteSelectFolder)
      return;
  }

  nsTArray<nsMsgKey> msgIdList;

  if (GetServerStateParser().LastCommandSuccessful()) {
    ReentrantMonitorAutoEnter mon(m_waitForBodyIdsMonitor);
    RefPtr<nsImapMailboxSpec> new_spec =
        GetServerStateParser().CreateCurrentMailboxSpec();
    nsImapAction imapAction;
    nsresult res = m_runningUrl->GetImapAction(&imapAction);
    if (NS_SUCCEEDED(res) && imapAction == nsIImapUrl::nsImapExpungeFolder)
      new_spec->mBoxFlags |= kJustExpunged;

    if (m_imapMailFolderSink) {
      bool more;
      m_imapMailFolderSink->UpdateImapMailboxInfo(this, new_spec);
      m_imapMailFolderSink->GetMsgHdrsToDownload(
          &more, &m_progressExpectedNumber, msgIdList);
      // Assert that either it's empty string OR it must be header string.
      MOZ_ASSERT((m_stringIndex == IMAP_EMPTY_STRING_INDEX) ||
                 (m_stringIndex == IMAP_HEADERS_STRING_INDEX));
      m_progressCurrentNumber[m_stringIndex] = 0;
      m_runningUrl->SetMoreHeadersToDownload(more);
      // We're going to be re-running this url if there are more headers.
      if (more) m_runningUrl->SetRerunningUrl(true);
    }
  }

  if (GetServerStateParser().LastCommandSuccessful()) {
    if (msgIdList.Length() > 0) {
      FolderHeaderDump(msgIdList.Elements(), msgIdList.Length());
    }
    HeaderFetchCompleted();
    // this might be bogus, how are we going to do pane notification and stuff
    // when we fetch bodies without headers!
  }

  // wait for a list of bodies to fetch.
  if (GetServerStateParser().LastCommandSuccessful()) {
    nsTArray<nsMsgKey> msgIds;
    WaitForPotentialListOfBodysToFetch(msgIds);
    if (msgIds.Length() > 0 && GetServerStateParser().LastCommandSuccessful()) {
      // Tell the url that it should store the msg fetch results offline,
      // while we're dumping the messages, and then restore the setting.
      bool wasStoringOffline;
      m_runningUrl->GetStoreResultsOffline(&wasStoringOffline);
      m_runningUrl->SetStoreResultsOffline(true);
      // Assert that either it's empty string OR it must be message string.
      MOZ_ASSERT((m_stringIndex == IMAP_EMPTY_STRING_INDEX) ||
                 (m_stringIndex == IMAP_MESSAGES_STRING_INDEX));
      m_progressCurrentNumber[m_stringIndex] = 0;
      m_progressExpectedNumber = msgIds.Length();
      FolderMsgDump(msgIds.Elements(), msgIds.Length(), kEveryThingRFC822Peek);
      m_runningUrl->SetStoreResultsOffline(wasStoringOffline);
    }
  }
  if (!GetServerStateParser().LastCommandSuccessful())
    GetServerStateParser().ResetFlagInfo();
}

void nsImapProtocol::FolderHeaderDump(uint32_t* msgUids, uint32_t msgCount) {
  FolderMsgDump(msgUids, msgCount, kHeadersRFC822andUid);
}

void nsImapProtocol::FolderMsgDump(uint32_t* msgUids, uint32_t msgCount,
                                   nsIMAPeFetchFields fields) {
  // lets worry about this progress stuff later.
  switch (fields) {
    case kHeadersRFC822andUid:
      SetProgressString(IMAP_HEADERS_STRING_INDEX);
      break;
    case kFlags:
      SetProgressString(IMAP_FLAGS_STRING_INDEX);
      break;
    default:
      SetProgressString(IMAP_MESSAGES_STRING_INDEX);
      break;
  }

  FolderMsgDumpLoop(msgUids, msgCount, fields);

  SetProgressString(IMAP_EMPTY_STRING_INDEX);
}

void nsImapProtocol::WaitForPotentialListOfBodysToFetch(
    nsTArray<nsMsgKey>& msgIdList) {
  PRIntervalTime sleepTime = kImapSleepTime;

  ReentrantMonitorAutoEnter fetchListMon(m_fetchBodyListMonitor);
  while (!m_fetchBodyListIsNew && !DeathSignalReceived())
    fetchListMon.Wait(sleepTime);
  m_fetchBodyListIsNew = false;

  msgIdList = m_fetchBodyIdList.Clone();
}

// libmsg uses this to notify a running imap url about message bodies it should
// download. why not just have libmsg explicitly download the message bodies?
NS_IMETHODIMP nsImapProtocol::NotifyBodysToDownload(
    const nsTArray<nsMsgKey>& keys) {
  ReentrantMonitorAutoEnter fetchListMon(m_fetchBodyListMonitor);
  m_fetchBodyIdList = keys.Clone();
  m_fetchBodyListIsNew = true;
  fetchListMon.Notify();
  return NS_OK;
}

NS_IMETHODIMP nsImapProtocol::GetFlagsForUID(uint32_t uid, bool* foundIt,
                                             imapMessageFlagsType* resultFlags,
                                             char** customFlags) {
  int32_t i;

  imapMessageFlagsType flags =
      m_flagState->GetMessageFlagsFromUID(uid, foundIt, &i);
  if (*foundIt) {
    *resultFlags = flags;
    if ((flags & kImapMsgCustomKeywordFlag) && customFlags)
      m_flagState->GetCustomFlags(uid, customFlags);
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapProtocol::GetFlagAndUidState(
    nsIImapFlagAndUidState** aFlagState) {
  NS_ENSURE_ARG_POINTER(aFlagState);
  NS_IF_ADDREF(*aFlagState = m_flagState);
  return NS_OK;
}

NS_IMETHODIMP nsImapProtocol::GetSupportedUserFlags(uint16_t* supportedFlags) {
  if (!supportedFlags) return NS_ERROR_NULL_POINTER;

  *supportedFlags = m_flagState->GetSupportedUserFlags();
  return NS_OK;
}
void nsImapProtocol::FolderMsgDumpLoop(uint32_t* msgUids, uint32_t msgCount,
                                       nsIMAPeFetchFields fields) {
  int32_t msgCountLeft = msgCount;
  uint32_t msgsDownloaded = 0;
  do {
    nsCString idString;
    uint32_t msgsToDownload = msgCountLeft;
    AllocateImapUidString(msgUids + msgsDownloaded, msgsToDownload, m_flagState,
                          idString);  // 20 * 200
    FetchMessage(idString, fields);
    msgsDownloaded += msgsToDownload;
    msgCountLeft -= msgsToDownload;
  } while (msgCountLeft > 0 && !DeathSignalReceived());
}

void nsImapProtocol::HeaderFetchCompleted() {
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->ParseMsgHdrs(this, m_hdrDownloadCache);
  m_hdrDownloadCache->ReleaseAll();

  if (m_imapMailFolderSink) m_imapMailFolderSink->HeaderFetchCompleted(this);
}

// Use the noop to tell the server we are still here, and therefore we are
// willing to receive status updates. The recent or exists response from the
// server could tell us that there is more mail waiting for us, but we need to
// check the flags of the mail and the high water mark to make sure that we do
// not tell the user that there is new mail when perhaps they have already read
// it in another machine.

void nsImapProtocol::PeriodicBiff() {
  nsMsgBiffState startingState = m_currentBiffState;

  if (GetServerStateParser().GetIMAPstate() ==
      nsImapServerResponseParser::kFolderSelected) {
    Noop();  // check the latest number of messages
    int32_t numMessages = 0;
    m_flagState->GetNumberOfMessages(&numMessages);
    if (GetServerStateParser().NumberOfMessages() != numMessages) {
      uint32_t id = GetServerStateParser().HighestRecordedUID() + 1;
      nsCString fetchStr;  // only update flags
      uint32_t added = 0, deleted = 0;

      deleted = m_flagState->NumberOfDeletedMessages();
      added = numMessages;
      if (!added || (added == deleted))  // empty keys, get them all
        id = 1;

      // sprintf(fetchStr, "%ld:%ld", id, id +
      // GetServerStateParser().NumberOfMessages() -
      // fFlagState->GetNumberOfMessages());
      AppendUid(fetchStr, id);
      fetchStr.AppendLiteral(":*");
      FetchMessage(fetchStr, kFlags);
      if (((uint32_t)m_flagState->GetHighestNonDeletedUID() >= id) &&
          m_flagState->IsLastMessageUnseen())
        m_currentBiffState = nsIMsgFolder::nsMsgBiffState_NewMail;
      else
        m_currentBiffState = nsIMsgFolder::nsMsgBiffState_NoMail;
    } else
      m_currentBiffState = nsIMsgFolder::nsMsgBiffState_NoMail;
  } else
    m_currentBiffState = nsIMsgFolder::nsMsgBiffState_Unknown;

  if (startingState != m_currentBiffState)
    SendSetBiffIndicatorEvent(m_currentBiffState);
}

void nsImapProtocol::SendSetBiffIndicatorEvent(nsMsgBiffState newState) {
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->SetBiffStateAndUpdate(newState);
}

/* static */ void nsImapProtocol::LogImapUrl(const char* logMsg,
                                             nsIImapUrl* imapUrl) {
  if (MOZ_LOG_TEST(IMAP, LogLevel::Info)) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(imapUrl);
    if (mailnewsUrl) {
      nsAutoCString urlSpec, unescapedUrlSpec;
      nsresult rv = mailnewsUrl->GetSpec(urlSpec);
      if (NS_FAILED(rv)) return;
      MsgUnescapeString(urlSpec, 0, unescapedUrlSpec);
      MOZ_LOG(IMAP, LogLevel::Info, ("%s:%s", logMsg, unescapedUrlSpec.get()));
    }
  }
}

// log info including current state...
void nsImapProtocol::Log(const char* logSubName, const char* extraInfo,
                         const char* logData) {
  if (MOZ_LOG_TEST(IMAP, LogLevel::Info)) {
    static const char nonAuthStateName[] = "NA";
    static const char authStateName[] = "A";
    static const char selectedStateName[] = "S";
    const nsCString& hostName =
        GetImapHostName();  // initialize to empty string

    int32_t logDataLen = PL_strlen(logData);  // PL_strlen checks for null
    nsCString logDataLines;
    const char* logDataToLog;
    int32_t lastLineEnd;

    // nspr line length is 512, and we allow some space for the log preamble.
    const int kLogDataChunkSize = 400;

    // break up buffers > 400 bytes on line boundaries.
    if (logDataLen > kLogDataChunkSize) {
      logDataLines.Assign(logData);
      lastLineEnd = logDataLines.RFindChar('\n', kLogDataChunkSize);
      // null terminate the last line
      if (lastLineEnd == kNotFound) lastLineEnd = kLogDataChunkSize - 1;

      logDataLines.Insert('\0', lastLineEnd + 1);
      logDataToLog = logDataLines.get();
    } else {
      logDataToLog = logData;
      lastLineEnd = logDataLen;
    }
    switch (GetServerStateParser().GetIMAPstate()) {
      case nsImapServerResponseParser::kFolderSelected:
        if (extraInfo)
          MOZ_LOG(IMAP, LogLevel::Info,
                  ("%p:%s:%s-%s:%s:%s: %.400s", this, hostName.get(),
                   selectedStateName,
                   GetServerStateParser().GetSelectedMailboxName(), logSubName,
                   extraInfo, logDataToLog));
        else
          MOZ_LOG(IMAP, LogLevel::Info,
                  ("%p:%s:%s-%s:%s: %.400s", this, hostName.get(),
                   selectedStateName,
                   GetServerStateParser().GetSelectedMailboxName(), logSubName,
                   logDataToLog));
        break;
      case nsImapServerResponseParser::kNonAuthenticated:
      case nsImapServerResponseParser::kAuthenticated: {
        const char* stateName = (GetServerStateParser().GetIMAPstate() ==
                                 nsImapServerResponseParser::kNonAuthenticated)
                                    ? nonAuthStateName
                                    : authStateName;
        if (extraInfo)
          MOZ_LOG(IMAP, LogLevel::Info,
                  ("%p:%s:%s:%s:%s: %.400s", this, hostName.get(), stateName,
                   logSubName, extraInfo, logDataToLog));
        else
          MOZ_LOG(IMAP, LogLevel::Info,
                  ("%p:%s:%s:%s: %.400s", this, hostName.get(), stateName,
                   logSubName, logDataToLog));
      }
    }

    // dump the rest of the string in < 400 byte chunks
    while (logDataLen > kLogDataChunkSize) {
      logDataLines.Cut(
          0,
          lastLineEnd + 2);  // + 2 to account for the LF and the '\0' we added
      logDataLen = logDataLines.Length();
      lastLineEnd = (logDataLen > kLogDataChunkSize)
                        ? logDataLines.RFindChar('\n', kLogDataChunkSize)
                        : kNotFound;
      // null terminate the last line
      if (lastLineEnd == kNotFound) lastLineEnd = kLogDataChunkSize - 1;
      logDataLines.Insert('\0', lastLineEnd + 1);
      logDataToLog = logDataLines.get();
      MOZ_LOG(IMAP, LogLevel::Info, ("%.400s", logDataToLog));
    }
  }
}

// In 4.5, this posted an event back to libmsg and blocked until it got a
// response. We may still have to do this.It would be nice if we could preflight
// this value, but we may not always know when we'll need it.
uint32_t nsImapProtocol::GetMessageSize(const nsACString& messageId) {
  uint32_t size = 0;
  if (m_imapMessageSink)
    m_imapMessageSink->GetMessageSizeFromDB(PromiseFlatCString(messageId).get(),
                                            &size);
  if (DeathSignalReceived()) size = 0;
  return size;
}

// message id string utility functions
/* static */ bool nsImapProtocol::HandlingMultipleMessages(
    const nsCString& messageIdString) {
  return (MsgFindCharInSet(messageIdString, ",:") != kNotFound);
}

uint32_t nsImapProtocol::CountMessagesInIdString(const char* idString) {
  uint32_t numberOfMessages = 0;
  char* uidString = PL_strdup(idString);

  if (uidString) {
    // This is in the form <id>,<id>, or <id1>:<id2>
    char curChar = *uidString;
    bool isRange = false;
    int32_t curToken;
    int32_t saveStartToken = 0;

    for (char* curCharPtr = uidString; curChar && *curCharPtr;) {
      char* currentKeyToken = curCharPtr;
      curChar = *curCharPtr;
      while (curChar != ':' && curChar != ',' && curChar != '\0')
        curChar = *curCharPtr++;
      *(curCharPtr - 1) = '\0';
      curToken = atol(currentKeyToken);
      if (isRange) {
        while (saveStartToken < curToken) {
          numberOfMessages++;
          saveStartToken++;
        }
      }

      numberOfMessages++;
      isRange = (curChar == ':');
      if (isRange) saveStartToken = curToken + 1;
    }
    PR_Free(uidString);
  }
  return numberOfMessages;
}

// It would be really nice not to have to use this method nearly as much as we
// did in 4.5 - we need to think about this some. Some of it may just go away in
// the new world order
bool nsImapProtocol::DeathSignalReceived() {
  // ignore mock channel status if we've been pseudo interrupted
  // ### need to make sure we clear pseudo interrupted status appropriately.
  if (!GetPseudoInterrupted()) {
    ReentrantMonitorAutoEnter mon(mMonitor);
    if (m_mockChannel) {
      nsresult returnValue;
      m_mockChannel->GetStatus(&returnValue);
      if (NS_FAILED(returnValue)) return false;
    }
  }

  // Check the other way of cancelling.
  ReentrantMonitorAutoEnter threadDeathMon(m_threadDeathMonitor);
  return m_threadShouldDie;
}

NS_IMETHODIMP nsImapProtocol::ResetToAuthenticatedState() {
  GetServerStateParser().PreauthSetAuthenticatedState();
  return NS_OK;
}

NS_IMETHODIMP nsImapProtocol::GetSelectedMailboxName(char** folderName) {
  if (!folderName) return NS_ERROR_NULL_POINTER;
  if (GetServerStateParser().GetSelectedMailboxName())
    *folderName = PL_strdup((GetServerStateParser().GetSelectedMailboxName()));
  return NS_OK;
}

bool nsImapProtocol::GetPseudoInterrupted() {
  ReentrantMonitorAutoEnter pseudoInterruptMon(m_pseudoInterruptMonitor);
  return m_pseudoInterrupted;
}

NS_IMETHODIMP
nsImapProtocol::PseudoInterrupt(bool interrupt) {
  ReentrantMonitorAutoEnter pseudoInterruptMon(m_pseudoInterruptMonitor);
  m_pseudoInterrupted = interrupt;
  if (interrupt) Log("CONTROL", NULL, "PSEUDO-Interrupted");
  return NS_OK;
}

void nsImapProtocol::SetActive(bool active) {
  ReentrantMonitorAutoEnter dataMemberMon(m_dataMemberMonitor);
  m_active = active;
}

bool nsImapProtocol::GetActive() {
  ReentrantMonitorAutoEnter dataMemberMon(m_dataMemberMonitor);
  return m_active;
}

bool nsImapProtocol::GetShowAttachmentsInline() {
  bool showAttachmentsInline = true;
  if (m_imapServerSink)
    m_imapServerSink->GetShowAttachmentsInline(&showAttachmentsInline);
  return showAttachmentsInline;
}

// Adds a set of rights for a given user on a given mailbox on the current host.
// if userName is NULL, it means "me," or MYRIGHTS.
void nsImapProtocol::AddFolderRightsForUser(const char* mailboxName,
                                            const char* userName,
                                            const char* rights) {
  if (!userName) userName = "";
  if (m_imapServerSink)
    m_imapServerSink->AddFolderRights(nsDependentCString(mailboxName),
                                      nsDependentCString(userName),
                                      nsDependentCString(rights));
}

void nsImapProtocol::SetCopyResponseUid(const char* msgIdString) {
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->SetCopyResponseUid(msgIdString, m_runningUrl);
}

void nsImapProtocol::CommitNamespacesForHostEvent() {
  if (m_imapServerSink) m_imapServerSink->CommitNamespaces();
}

// notifies libmsg that we have new capability data for the current host
void nsImapProtocol::CommitCapability() {
  if (m_imapServerSink) {
    m_imapServerSink->SetCapability(GetServerStateParser().GetCapabilityFlag());
  }
}

// rights is a single string of rights, as specified by RFC2086, the IMAP ACL
// extension. Clears all rights for a given folder, for all users.
void nsImapProtocol::ClearAllFolderRights() {
  if (m_imapMailFolderSink) m_imapMailFolderSink->ClearFolderRights();
}

// Reads a line from the socket.
// Upon failure, the thread will be flagged for shutdown, and
// m_connectionStatus will be set to a failing code.
// Remember that some socket errors are deferred until the first read
// attempt, so this function could be the first place we hear about
// connection issues (e.g. bad certificates for SSL).
char* nsImapProtocol::CreateNewLineFromSocket() {
  bool needMoreData = false;
  char* newLine = nullptr;
  uint32_t numBytesInLine = 0;
  nsresult rv = NS_OK;
  // we hold a ref to the input stream in case we get cancelled from the
  // ui thread, which releases our ref to the input stream, and can
  // cause the pipe to get deleted before the monitor the read is
  // blocked on gets notified. When that happens, the imap thread
  // will stay blocked.
  nsCOMPtr<nsIInputStream> kungFuGrip = m_inputStream;

  if (m_mockChannel) {
    nsImapMockChannel* imapChannel =
        static_cast<nsImapMockChannel*>(m_mockChannel.get());

    mozilla::MonitorAutoLock lock(imapChannel->mSuspendedMonitor);

    bool suspended = imapChannel->mSuspended;
    if (suspended)
      MOZ_LOG(IMAP, LogLevel::Debug,
              ("Waiting until [imapChannel=%p] is resumed.", imapChannel));
    while (imapChannel->mSuspended) {
      lock.Wait();
    }
    if (suspended)
      MOZ_LOG(
          IMAP, LogLevel::Debug,
          ("Done waiting, [imapChannel=%p] has been resumed.", imapChannel));
  }

  do {
    newLine = m_inputStreamBuffer->ReadNextLine(m_inputStream, numBytesInLine,
                                                needMoreData, &rv);
    MOZ_LOG(IMAP, LogLevel::Verbose,
            ("ReadNextLine [rv=0x%" PRIx32 " stream=%p nb=%u needmore=%u]",
             static_cast<uint32_t>(rv), m_inputStream.get(), numBytesInLine,
             needMoreData));

  } while (!newLine && NS_SUCCEEDED(rv) &&
           !DeathSignalReceived());  // until we get the next line and haven't
                                     // been interrupted

  kungFuGrip = nullptr;

  if (NS_FAILED(rv)) {
    switch (rv) {
      case NS_ERROR_UNKNOWN_HOST:
      case NS_ERROR_UNKNOWN_PROXY_HOST:
        AlertUserEventUsingName("imapUnknownHostError");
        break;
      case NS_ERROR_CONNECTION_REFUSED:
      case NS_ERROR_PROXY_CONNECTION_REFUSED:
        AlertUserEventUsingName("imapConnectionRefusedError");
        break;
      case NS_ERROR_NET_TIMEOUT:
      case NS_ERROR_NET_RESET:
      case NS_BASE_STREAM_CLOSED:
      case NS_ERROR_NET_INTERRUPT:
        // we should retry on RESET, especially for SSL...
        if ((TestFlag(IMAP_RECEIVED_GREETING) || rv == NS_ERROR_NET_RESET) &&
            m_runningUrl && !m_retryUrlOnError) {
          bool rerunningUrl;
          nsImapAction imapAction;
          m_runningUrl->GetRerunningUrl(&rerunningUrl);
          m_runningUrl->GetImapAction(&imapAction);
          // don't rerun if we already were rerunning. And don't rerun
          // online move/copies that timeout.
          if (!rerunningUrl && (rv != NS_ERROR_NET_TIMEOUT ||
                                (imapAction != nsIImapUrl::nsImapOnlineCopy &&
                                 imapAction != nsIImapUrl::nsImapOnlineMove))) {
            m_runningUrl->SetRerunningUrl(true);
            m_retryUrlOnError = true;
            break;
          }
        }
        if (rv == NS_ERROR_NET_TIMEOUT)
          AlertUserEventUsingName("imapNetTimeoutError");
        else
          AlertUserEventUsingName(TestFlag(IMAP_RECEIVED_GREETING)
                                      ? "imapServerDisconnected"
                                      : "imapServerDroppedConnection2");
        break;
      default:
        // This is probably a TLS error. Usually TLS errors won't show up until
        // we do ReadNextLine() above. Since we're in the IMAP thread we can't
        // call NSSErrorsService::GetErrorClass() to determine if the error
        // should result in an non-fatal override dialog (usually certificate
        // issues) or if it's a fatal protocol error that the user must be
        // alerted to. Instead, we use some publicly-accessible macros and a
        // function to determine this.
        if (NS_ERROR_GET_MODULE(rv) == NS_ERROR_MODULE_SECURITY &&
            NS_ERROR_GET_SEVERITY(rv) == NS_ERROR_SEVERITY_ERROR) {
          // It's an error of class 21 (SSL/TLS/Security), e.g., overridable
          // SSL_ERROR_BAD_CERT_DOMAIN from security/nss/lib/ssl/sslerr.h
          // rv = 0x80000000 + 0x00450000 + 0x00150000 + 0x00002ff4 = 0x805A2ff4
          int32_t sec_error = -1 * NS_ERROR_GET_CODE(rv);  // = 0xFFFFD00C
          if (!mozilla::psm::ErrorIsOverridable(sec_error)) {
            AlertUserEventUsingName("imapTlsError");
          }

          // Stash the socket transport securityInfo on the URL so it will be
          // available in nsIUrlListener OnStopRunningUrl() callbacks to trigger
          // the override dialog or a security related error message.
          // Currently this is only used to trigger the override dialog.
          if (m_runningUrl) {
            MOZ_ASSERT(!NS_IsMainThread());
            nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl =
                do_QueryInterface(m_runningUrl);
            if (mailNewsUrl) {
              nsCOMPtr<nsITransportSecurityInfo> securityInfo;
              GetTransportSecurityInfo(getter_AddRefs(securityInfo));
              if (securityInfo) {
                nsAutoCString logMsg("Security error - error code=");
                nsAutoString errorCodeString;
                securityInfo->GetErrorCodeString(errorCodeString);
                logMsg.Append(NS_ConvertUTF16toUTF8(errorCodeString));
                Log("CreateNewLineFromSocket", nullptr, logMsg.get());

                mailNewsUrl->SetFailedSecInfo(securityInfo);
                AlertCertError(securityInfo);
              }
            }
          }
        }
        break;
    }

    nsAutoCString logMsg("clearing IMAP_CONNECTION_IS_OPEN - rv = ");
    logMsg.AppendInt(static_cast<uint32_t>(rv), 16);
    Log("CreateNewLineFromSocket", nullptr, logMsg.get());
    ClearFlag(IMAP_CONNECTION_IS_OPEN);
    TellThreadToDie();
  }
  Log("CreateNewLineFromSocket", nullptr, newLine);
  SetConnectionStatus(newLine && numBytesInLine
                          ? NS_OK
                          : rv);  // set > 0 if string is not null or empty
  return newLine;
}

nsresult nsImapProtocol::GetConnectionStatus() { return m_connectionStatus; }

void nsImapProtocol::SetConnectionStatus(nsresult status) {
  // Log failure at Debug level, otherwise use Verbose to avoid huge logs
  MOZ_LOG(
      IMAP, NS_SUCCEEDED(status) ? LogLevel::Verbose : LogLevel::Debug,
      ("SetConnectionStatus(0x%" PRIx32 ")", static_cast<uint32_t>(status)));
  m_connectionStatus = status;
}

void nsImapProtocol::NotifyMessageFlags(imapMessageFlagsType flags,
                                        const nsACString& keywords,
                                        nsMsgKey key, uint64_t highestModSeq) {
  if (m_imapMessageSink) {
    // if we're selecting the folder, don't need to report the flags; we've
    // already fetched them.
    if (m_imapAction != nsIImapUrl::nsImapSelectFolder)
      m_imapMessageSink->NotifyMessageFlags(flags, keywords, key,
                                            highestModSeq);
  }
}

void nsImapProtocol::NotifySearchHit(const char* hitLine) {
  nsresult rv;
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
      do_QueryInterface(m_runningUrl, &rv);
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->NotifySearchHit(mailnewsUrl, hitLine);
}

void nsImapProtocol::SetMailboxDiscoveryStatus(EMailboxDiscoverStatus status) {
  ReentrantMonitorAutoEnter mon(m_dataMemberMonitor);
  m_discoveryStatus = status;
}

EMailboxDiscoverStatus nsImapProtocol::GetMailboxDiscoveryStatus() {
  ReentrantMonitorAutoEnter mon(m_dataMemberMonitor);
  return m_discoveryStatus;
}

bool nsImapProtocol::GetSubscribingNow() {
  // ***** code me *****
  return false;  // ***** for now
}

void nsImapProtocol::DiscoverMailboxSpec(nsImapMailboxSpec* adoptedBoxSpec) {
  nsImapNamespace* ns = nullptr;

  NS_ASSERTION(m_hostSessionList, "fatal null host session list");
  if (!m_hostSessionList) return;

  m_hostSessionList->GetDefaultNamespaceOfTypeForHost(GetImapServerKey(),
                                                      kPersonalNamespace, ns);
  const char* nsPrefix = ns ? ns->GetPrefix() : 0;

  if (m_specialXListMailboxes.Count() > 0) {
    nsCString strHashKey(adoptedBoxSpec->mAllocatedPathName);
    int32_t hashValue = m_specialXListMailboxes.Get(strHashKey);
    adoptedBoxSpec->mBoxFlags |= hashValue;
  }

  switch (m_hierarchyNameState) {
    case kXListing:
      if (adoptedBoxSpec->mBoxFlags &
          (kImapXListTrash | kImapAllMail | kImapInbox | kImapSent | kImapSpam |
           kImapDrafts)) {
        nsCString mailboxName(adoptedBoxSpec->mAllocatedPathName);
        m_specialXListMailboxes.InsertOrUpdate(mailboxName,
                                               adoptedBoxSpec->mBoxFlags);
        // Remember hierarchy delimiter in case this is the first time we've
        // connected to the server and we need it to be correct for the
        // two-level XLIST we send (INBOX is guaranteed to be in the first
        // response).
        if (adoptedBoxSpec->mBoxFlags & kImapInbox)
          m_runningUrl->SetOnlineSubDirSeparator(
              adoptedBoxSpec->mHierarchySeparator);
      }
      break;
    case kListingForFolderFlags: {
      // store mailbox flags from LIST for use by LSUB
      nsCString mailboxName(adoptedBoxSpec->mAllocatedPathName);
      m_standardListMailboxes.InsertOrUpdate(mailboxName,
                                             adoptedBoxSpec->mBoxFlags);
    } break;
    case kListingForCreate:
    case kNoOperationInProgress:
    case kDiscoverTrashFolderInProgress:
    case kListingForInfoAndDiscovery: {
      // standard mailbox specs are stored in m_standardListMailboxes
      // because LSUB does necessarily return all mailbox flags.
      // count should be > 0 only when we are looking at response of LSUB
      if (m_standardListMailboxes.Count() > 0) {
        int32_t hashValue = 0;
        nsCString strHashKey(adoptedBoxSpec->mAllocatedPathName);
        if (m_standardListMailboxes.Get(strHashKey, &hashValue))
          adoptedBoxSpec->mBoxFlags |= hashValue;
        else
          // if mailbox is not in hash list, then it is subscribed but does not
          // exist, so we make sure it can't be selected
          adoptedBoxSpec->mBoxFlags |= kNoselect;
      }
      if (ns &&
          nsPrefix)  // if no personal namespace, there can be no Trash folder
      {
        bool onlineTrashFolderExists = false;
        if (m_hostSessionList) {
          if (adoptedBoxSpec->mBoxFlags & (kImapTrash | kImapXListTrash)) {
            m_hostSessionList->SetOnlineTrashFolderExistsForHost(
                GetImapServerKey(), true);
            onlineTrashFolderExists = true;
          } else {
            m_hostSessionList->GetOnlineTrashFolderExistsForHost(
                GetImapServerKey(), onlineTrashFolderExists);
          }
        }

        // Don't set the Trash flag if not using the Trash model
        if (GetDeleteIsMoveToTrash() && !onlineTrashFolderExists &&
            FindInReadable(m_trashFolderPath,
                           adoptedBoxSpec->mAllocatedPathName,
                           nsCaseInsensitiveCStringComparator)) {
          bool trashExists = false;
          if (StringBeginsWith(m_trashFolderPath, "INBOX/"_ns,
                               nsCaseInsensitiveCStringComparator)) {
            nsAutoCString pathName(adoptedBoxSpec->mAllocatedPathName.get() +
                                   6);
            trashExists =
                StringBeginsWith(
                    adoptedBoxSpec->mAllocatedPathName, m_trashFolderPath,
                    nsCaseInsensitiveCStringComparator) && /* "INBOX/" */
                pathName.Equals(Substring(m_trashFolderPath, 6),
                                nsCaseInsensitiveCStringComparator);
          } else
            trashExists = adoptedBoxSpec->mAllocatedPathName.Equals(
                m_trashFolderPath, nsCaseInsensitiveCStringComparator);

          if (m_hostSessionList)
            m_hostSessionList->SetOnlineTrashFolderExistsForHost(
                GetImapServerKey(), trashExists);

          if (trashExists) adoptedBoxSpec->mBoxFlags |= kImapTrash;
        }
      }

      // Discover the folder (shuttle over to libmsg, yay)
      // Do this only if the folder name is not empty (i.e. the root)
      if (!adoptedBoxSpec->mAllocatedPathName.IsEmpty()) {
        if (m_hierarchyNameState == kListingForCreate)
          adoptedBoxSpec->mBoxFlags |= kNewlyCreatedFolder;

        if (m_imapServerSink) {
          bool newFolder;

          m_imapServerSink->PossibleImapMailbox(
              adoptedBoxSpec->mAllocatedPathName,
              adoptedBoxSpec->mHierarchySeparator, adoptedBoxSpec->mBoxFlags,
              &newFolder);
          // if it's a new folder to the server sink, setting discovery status
          // to eContinueNew will cause us to get the ACL for the new folder.
          if (newFolder) SetMailboxDiscoveryStatus(eContinueNew);

          bool useSubscription = false;

          if (m_hostSessionList)
            m_hostSessionList->GetHostIsUsingSubscription(GetImapServerKey(),
                                                          useSubscription);

          if ((GetMailboxDiscoveryStatus() != eContinue) &&
              (GetMailboxDiscoveryStatus() != eContinueNew) &&
              (GetMailboxDiscoveryStatus() != eListMyChildren)) {
            SetConnectionStatus(NS_ERROR_FAILURE);
          } else if (!adoptedBoxSpec->mAllocatedPathName.IsEmpty() &&
                     (GetMailboxDiscoveryStatus() == eListMyChildren) &&
                     (!useSubscription || GetSubscribingNow())) {
            NS_ASSERTION(false, "we should never get here anymore");
            SetMailboxDiscoveryStatus(eContinue);
          } else if (GetMailboxDiscoveryStatus() == eContinueNew) {
            if (m_hierarchyNameState == kListingForInfoAndDiscovery &&
                !adoptedBoxSpec->mAllocatedPathName.IsEmpty() &&
                !(adoptedBoxSpec->mBoxFlags & kNameSpace)) {
              // remember the info here also
              nsIMAPMailboxInfo* mb =
                  new nsIMAPMailboxInfo(adoptedBoxSpec->mAllocatedPathName,
                                        adoptedBoxSpec->mHierarchySeparator);
              m_listedMailboxList.AppendElement(mb);
            }
            SetMailboxDiscoveryStatus(eContinue);
          }
        }
      }
    } break;
    case kDeleteSubFoldersInProgress: {
      NS_ASSERTION(m_deletableChildren, "Oops .. null m_deletableChildren");
      m_deletableChildren->AppendElement(adoptedBoxSpec->mAllocatedPathName);
    } break;
    case kListingForInfoOnly: {
      // UpdateProgressWindowForUpgrade(adoptedBoxSpec->allocatedPathName);
      ProgressEventFunctionUsingNameWithString(
          "imapDiscoveringMailbox", adoptedBoxSpec->mAllocatedPathName.get());
      nsIMAPMailboxInfo* mb =
          new nsIMAPMailboxInfo(adoptedBoxSpec->mAllocatedPathName,
                                adoptedBoxSpec->mHierarchySeparator);
      m_listedMailboxList.AppendElement(mb);
    } break;
    case kDiscoveringNamespacesOnly: {
    } break;
    default:
      NS_ASSERTION(false, "we aren't supposed to be here");
      break;
  }
}

void nsImapProtocol::AlertUserEventUsingName(const char* aMessageName) {
  if (m_imapServerSink) {
    bool suppressErrorMsg = false;

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
    if (mailnewsUrl) mailnewsUrl->GetSuppressErrorMsgs(&suppressErrorMsg);

    if (!suppressErrorMsg)
      m_imapServerSink->FEAlertWithName(aMessageName, mailnewsUrl);
  }
}

void nsImapProtocol::AlertUserEvent(const char* message) {
  if (m_imapServerSink) {
    bool suppressErrorMsg = false;

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
    if (mailnewsUrl) mailnewsUrl->GetSuppressErrorMsgs(&suppressErrorMsg);

    if (!suppressErrorMsg)
      m_imapServerSink->FEAlert(NS_ConvertASCIItoUTF16(message), mailnewsUrl);
  }
}

void nsImapProtocol::AlertUserEventFromServer(const char* aServerEvent,
                                              bool aForIdle) {
  if (aServerEvent) {
    // If called due to BAD/NO imap IDLE response, the server sink and running
    // url are typically null when IDLE command is sent. So use the stored
    // latest values for these so that the error alert notification occurs.
    if (aForIdle && !m_imapServerSink && !m_runningUrl &&
        m_imapServerSinkLatest) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
          do_QueryInterface(m_runningUrlLatest);
      m_imapServerSinkLatest->FEAlertFromServer(
          nsDependentCString(aServerEvent), mailnewsUrl, false);
    } else if (m_imapServerSink) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
      m_imapServerSink->FEAlertFromServer(nsDependentCString(aServerEvent),
                                          mailnewsUrl, false);
    }
  }
}

void nsImapProtocol::AlertCertError(nsITransportSecurityInfo* securityInfo) {
  if (m_imapServerSink) {
    bool suppressErrorMsg = false;

    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
    if (mailnewsUrl) mailnewsUrl->GetSuppressErrorMsgs(&suppressErrorMsg);

    if (!suppressErrorMsg)
      m_imapServerSink->FEAlertCertError(securityInfo, mailnewsUrl);
  }
}

void nsImapProtocol::ResetProgressInfo() {
  m_lastProgressTime = 0;
  m_lastPercent = -1;
  m_lastProgressStringName.Truncate();
}

void nsImapProtocol::SetProgressString(uint32_t aStringIndex) {
  m_stringIndex = aStringIndex;
  MOZ_ASSERT(m_stringIndex <= IMAP_EMPTY_STRING_INDEX);
  switch (m_stringIndex) {
    case IMAP_HEADERS_STRING_INDEX:
      m_progressStringName = "imapReceivingMessageHeaders3";
      break;
    case IMAP_MESSAGES_STRING_INDEX:
      m_progressStringName = "imapFolderReceivingMessageOf3";
      break;
    case IMAP_FLAGS_STRING_INDEX:
      m_progressStringName = "imapReceivingMessageFlags3";
      break;
    case IMAP_EMPTY_STRING_INDEX:
    default:
      break;
  }
  // Make sure header download progress starts at zero.
  m_progressCurrentNumber[aStringIndex] = 0;
}

// Called from parser
void nsImapProtocol::ShowProgress() {
  if (m_imapServerSink && (m_stringIndex != IMAP_EMPTY_STRING_INDEX)) {
    int32_t progressCurrentNumber = ++m_progressCurrentNumber[m_stringIndex];
    PercentProgressUpdateEvent(m_progressStringName, progressCurrentNumber,
                               m_progressExpectedNumber);
  }
}

void nsImapProtocol::ProgressEventFunctionUsingName(const char* aMsgName) {
  if (m_imapAction == nsIImapUrl::nsImapMsgDownloadForOffline &&
      !strcmp(aMsgName, "imapDownloadingMessage")) {
    // When downloading messages for offline don't display status line
    // "Downloading message..." to prevent this status line from being
    // interspersed with the download progress status "Downloading X of Y...".
    return;
  }
  if (m_imapMailFolderSink && !m_lastProgressStringName.Equals(aMsgName)) {
    m_imapMailFolderSink->ProgressStatusString(this, aMsgName, nullptr);
    m_lastProgressStringName.Assign(aMsgName);
    // who's going to free this? Does ProgressStatusString complete
    // synchronously?
  }
}

void nsImapProtocol::ProgressEventFunctionUsingNameWithString(
    const char* aMsgName, const char* aExtraInfo) {
  if (m_imapMailFolderSink) {
    nsString unicodeStr;
    nsresult rv =
        CopyFolderNameToUTF16(nsDependentCString(aExtraInfo), unicodeStr);
    if (NS_SUCCEEDED(rv))
      m_imapMailFolderSink->ProgressStatusString(this, aMsgName,
                                                 unicodeStr.get());
  }
}

void nsImapProtocol::PercentProgressUpdateEvent(nsACString const& fmtStringName,
                                                int64_t currentProgress,
                                                int64_t maxProgress) {
  int64_t nowMS = 0;
  int32_t percent = (100 * currentProgress) / maxProgress;
  if (percent == m_lastPercent)
    return;  // hasn't changed, right? So just return. Do we need to clear this
             // anywhere?

  if (percent < 100)  // always need to do 100%
  {
    nowMS = PR_IntervalToMilliseconds(PR_IntervalNow());
    if (nowMS - m_lastProgressTime < 750) return;
  }

  m_lastPercent = percent;
  m_lastProgressTime = nowMS;

  // set our max progress on the running URL
  if (m_runningUrl) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl(do_QueryInterface(m_runningUrl));
    mailnewsUrl->SetMaxProgress(maxProgress);
  }

  if (m_imapMailFolderSink) {
    m_imapMailFolderSink->PercentProgress(this, fmtStringName, currentProgress,
                                          maxProgress);
  }
}

// imap commands issued by the parser
void nsImapProtocol::Store(const nsCString& messageList,
                           const char* messageData, bool idsAreUid) {
  // turn messageList back into key array and then back into a message id list,
  // but use the flag state to handle ranges correctly.
  nsCString messageIdList;
  nsTArray<nsMsgKey> msgKeys;
  if (idsAreUid) ParseUidString(messageList.get(), msgKeys);

  int32_t msgCountLeft = msgKeys.Length();
  uint32_t msgsHandled = 0;
  do {
    nsCString idString;

    uint32_t msgsToHandle = msgCountLeft;
    if (idsAreUid)
      AllocateImapUidString(msgKeys.Elements() + msgsHandled, msgsToHandle,
                            m_flagState, idString);  // 20 * 200
    else
      idString.Assign(messageList);

    msgsHandled += msgsToHandle;
    msgCountLeft -= msgsToHandle;

    IncrementCommandTagNumber();
    const char* formatString;
    if (idsAreUid)
      formatString = "%s uid store %s %s\015\012";
    else
      formatString = "%s store %s %s\015\012";

    // we might need to close this mailbox after this
    m_closeNeededBeforeSelect =
        GetDeleteIsMoveToTrash() && (PL_strcasestr(messageData, "\\Deleted"));

    const char* commandTag = GetServerCommandTag();
    int protocolStringSize = PL_strlen(formatString) + messageList.Length() +
                             PL_strlen(messageData) + PL_strlen(commandTag) + 1;
    char* protocolString = (char*)PR_CALLOC(protocolStringSize);

    if (protocolString) {
      PR_snprintf(protocolString,      // string to create
                  protocolStringSize,  // max size
                  formatString,        // format string
                  commandTag,          // command tag
                  idString.get(), messageData);

      nsresult rv = SendData(protocolString);
      if (NS_SUCCEEDED(rv)) {
        m_flagChangeCount++;
        ParseIMAPandCheckForNewMail(protocolString);
        if (GetServerStateParser().LastCommandSuccessful() && CheckNeeded())
          Check();
      }
      PR_Free(protocolString);
    } else
      HandleMemoryFailure();
  } while (msgCountLeft > 0 && !DeathSignalReceived());
}

void nsImapProtocol::IssueUserDefinedMsgCommand(const char* command,
                                                const char* messageList) {
  IncrementCommandTagNumber();

  const char* formatString;
  formatString = "%s uid %s %s\015\012";

  const char* commandTag = GetServerCommandTag();
  int protocolStringSize = PL_strlen(formatString) + PL_strlen(messageList) +
                           PL_strlen(command) + PL_strlen(commandTag) + 1;
  char* protocolString = (char*)PR_CALLOC(protocolStringSize);

  if (protocolString) {
    PR_snprintf(protocolString,      // string to create
                protocolStringSize,  // max size
                formatString,        // format string
                commandTag,          // command tag
                command, messageList);

    nsresult rv = SendData(protocolString);
    if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail(protocolString);
    PR_Free(protocolString);
  } else
    HandleMemoryFailure();
}

void nsImapProtocol::UidExpunge(const nsCString& messageSet) {
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());
  command.AppendLiteral(" uid expunge ");
  command.Append(messageSet);
  command.Append(CRLF);
  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Expunge() {
  uint32_t aclFlags = 0;
  if (GetServerStateParser().ServerHasACLCapability() && m_imapMailFolderSink)
    m_imapMailFolderSink->GetAclFlags(&aclFlags);

  if (aclFlags && !(aclFlags & IMAP_ACL_EXPUNGE_FLAG)) return;
  ProgressEventFunctionUsingName("imapStatusExpungingMailbox");

  if (gCheckDeletedBeforeExpunge) {
    GetServerStateParser().ResetSearchResultSequence();
    Search("SEARCH DELETED", false, false);
    if (GetServerStateParser().LastCommandSuccessful()) {
      nsImapSearchResultIterator* search =
          GetServerStateParser().CreateSearchResultIterator();
      nsMsgKey key = search->GetNextMessageNumber();
      delete search;
      if (key == 0) return;  // no deleted messages to expunge (bug 235004)
    }
  }

  IncrementCommandTagNumber();
  nsAutoCString command(GetServerCommandTag());
  command.AppendLiteral(" expunge" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::HandleMemoryFailure() {
  PR_CEnterMonitor(this);
  // **** jefft fix me!!!!!! ******
  // m_imapThreadIsRunning = false;
  // SetConnectionStatus(-1);
  PR_CExitMonitor(this);
}

void nsImapProtocol::HandleCurrentUrlError() {
  // This is to handle a move/copy failing, especially because the user
  // cancelled the password prompt.
  (void)m_runningUrl->GetImapAction(&m_imapAction);
  if (m_imapAction == nsIImapUrl::nsImapOfflineToOnlineMove ||
      m_imapAction == nsIImapUrl::nsImapAppendMsgFromFile ||
      m_imapAction == nsIImapUrl::nsImapAppendDraftFromFile) {
    if (m_imapMailFolderSink)
      m_imapMailFolderSink->OnlineCopyCompleted(
          this, ImapOnlineCopyStateType::kFailedCopy);
  }
}

void nsImapProtocol::StartTLS() {
  IncrementCommandTagNumber();
  nsCString tag(GetServerCommandTag());
  nsCString command(tag);

  command.AppendLiteral(" STARTTLS" CRLF);
  nsresult rv = SendData(command.get());
  bool ok = false;
  if (NS_SUCCEEDED(rv)) {
    nsCString expectOkResponse = tag + " OK "_ns;
    char* serverResponse = nullptr;
    do {
      // This reads and discards lines not starting with "<tag> OK " or
      // "<tag> BAD " and exits when when either are found. Otherwise, this
      // exits on timeout when all lines in the buffer are read causing
      // serverResponse to be set null. Usually just "<tag> OK " is present.
      serverResponse = CreateNewLineFromSocket();
      ok = serverResponse &&
           !PL_strncasecmp(serverResponse, expectOkResponse.get(),
                           expectOkResponse.Length());
      if (!ok && serverResponse) {
        // Check for possible BAD response, e.g., server not STARTTLS capable.
        nsCString expectBadResponse = tag + " BAD "_ns;
        if (!PL_strncasecmp(serverResponse, expectBadResponse.get(),
                            expectBadResponse.Length())) {
          PR_Free(serverResponse);
          break;
        }
      }
      PR_Free(serverResponse);
    } while (serverResponse && !ok);
  }
  // ok == false implies a "<tag> BAD " response or time out on socket read.
  // It could also be due to failure on SendData() above.
  GetServerStateParser().SetCommandFailed(!ok);
}

void nsImapProtocol::Capability() {
  ProgressEventFunctionUsingName("imapStatusCheckCompat");
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());

  command.AppendLiteral(" capability" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::ID() {
  if (!gAppName[0]) return;
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());
  command.AppendLiteral(" ID (\"name\" \"");
  command.Append(gAppName);
  command.AppendLiteral("\" \"version\" \"");
  command.Append(gAppVersion);
  command.AppendLiteral("\")" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::EnableUTF8Accept() {
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());
  command.AppendLiteral(" ENABLE UTF8=ACCEPT" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::EnableCondStore() {
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());

  command.AppendLiteral(" ENABLE CONDSTORE" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::StartCompressDeflate() {
  // only issue a compression request if we haven't already
  if (!TestFlag(IMAP_ISSUED_COMPRESS_REQUEST)) {
    SetFlag(IMAP_ISSUED_COMPRESS_REQUEST);
    IncrementCommandTagNumber();
    nsCString command(GetServerCommandTag());

    command.AppendLiteral(" COMPRESS DEFLATE" CRLF);

    nsresult rv = SendData(command.get());
    if (NS_SUCCEEDED(rv)) {
      ParseIMAPandCheckForNewMail();
      if (GetServerStateParser().LastCommandSuccessful()) {
        rv = BeginCompressing();
        if (NS_FAILED(rv)) {
          Log("CompressDeflate", nullptr, "failed to enable compression");
          // we can't use this connection without compression any more, so die
          ClearFlag(IMAP_CONNECTION_IS_OPEN);
          TellThreadToDie();
          SetConnectionStatus(rv);
          return;
        }
      }
    }
  }
}

nsresult nsImapProtocol::BeginCompressing() {
  // wrap the streams in compression layers that compress or decompress
  // all traffic.
  RefPtr<nsMsgCompressIStream> new_in = new nsMsgCompressIStream();
  if (!new_in) return NS_ERROR_OUT_OF_MEMORY;

  nsresult rv = new_in->InitInputStream(m_inputStream);
  NS_ENSURE_SUCCESS(rv, rv);

  m_inputStream = new_in;

  RefPtr<nsMsgCompressOStream> new_out = new nsMsgCompressOStream();
  if (!new_out) return NS_ERROR_OUT_OF_MEMORY;

  rv = new_out->InitOutputStream(m_outputStream);
  NS_ENSURE_SUCCESS(rv, rv);

  m_outputStream = new_out;
  return rv;
}

void nsImapProtocol::Language() {
  // only issue the language request if we haven't done so already...
  if (!TestFlag(IMAP_ISSUED_LANGUAGE_REQUEST)) {
    SetFlag(IMAP_ISSUED_LANGUAGE_REQUEST);
    ProgressEventFunctionUsingName("imapStatusCheckCompat");
    IncrementCommandTagNumber();
    nsCString command(GetServerCommandTag());

    // extract the desired language attribute from prefs
    nsresult rv = NS_OK;

    // we need to parse out the first language out of this comma separated
    // list.... i.e if we have en,ja we only want to send en to the server.
    if (mAcceptLanguages.get()) {
      nsAutoCString extractedLanguage;
      LossyCopyUTF16toASCII(mAcceptLanguages, extractedLanguage);
      int32_t pos = extractedLanguage.FindChar(',');
      if (pos > 0)  // we have a comma separated list of languages...
        extractedLanguage.SetLength(pos);  // truncate everything after the
                                           // first comma (including the comma)

      if (extractedLanguage.IsEmpty()) return;

      command.AppendLiteral(" LANGUAGE ");
      command.Append(extractedLanguage);
      command.Append(CRLF);

      rv = SendData(command.get());
      if (NS_SUCCEEDED(rv))
        ParseIMAPandCheckForNewMail(nullptr, true /* ignore bad or no result from the server for this command */);
    }
  }
}

void nsImapProtocol::EscapeUserNamePasswordString(const char* strToEscape,
                                                  nsCString* resultStr) {
  if (strToEscape) {
    uint32_t i = 0;
    uint32_t escapeStrlen = strlen(strToEscape);
    for (i = 0; i < escapeStrlen; i++) {
      if (strToEscape[i] == '\\' || strToEscape[i] == '\"') {
        resultStr->Append('\\');
      }
      resultStr->Append(strToEscape[i]);
    }
  }
}

void nsImapProtocol::InitPrefAuthMethods(int32_t authMethodPrefValue,
                                         nsIMsgIncomingServer* aServer) {
  // for m_prefAuthMethods, using the same flags as server capabilities.
  switch (authMethodPrefValue) {
    case nsMsgAuthMethod::none:
      m_prefAuthMethods = kHasAuthNoneCapability;
      break;
    case nsMsgAuthMethod::old:
      m_prefAuthMethods = kHasAuthOldLoginCapability;
      break;
    case nsMsgAuthMethod::passwordCleartext:
      m_prefAuthMethods = kHasAuthOldLoginCapability | kHasAuthLoginCapability |
                          kHasAuthPlainCapability;
      break;
    case nsMsgAuthMethod::passwordEncrypted:
      m_prefAuthMethods = kHasCRAMCapability;
      break;
    case nsMsgAuthMethod::NTLM:
      m_prefAuthMethods = kHasAuthNTLMCapability | kHasAuthMSNCapability;
      break;
    case nsMsgAuthMethod::GSSAPI:
      m_prefAuthMethods = kHasAuthGssApiCapability;
      break;
    case nsMsgAuthMethod::External:
      m_prefAuthMethods = kHasAuthExternalCapability;
      break;
    case nsMsgAuthMethod::secure:
      m_prefAuthMethods = kHasCRAMCapability | kHasAuthGssApiCapability |
                          kHasAuthNTLMCapability | kHasAuthMSNCapability;
      break;
    case nsMsgAuthMethod::OAuth2:
      m_prefAuthMethods = kHasXOAuth2Capability;
      break;
    default:
      NS_ASSERTION(false, "IMAP: authMethod pref invalid");
      MOZ_LOG(IMAP, LogLevel::Error,
              ("IMAP: bad pref authMethod = %d", authMethodPrefValue));
      // fall to any
      [[fallthrough]];
    case nsMsgAuthMethod::anything:
      m_prefAuthMethods = kHasAuthOldLoginCapability | kHasAuthLoginCapability |
                          kHasAuthPlainCapability | kHasCRAMCapability |
                          kHasAuthGssApiCapability | kHasAuthNTLMCapability |
                          kHasAuthMSNCapability | kHasAuthExternalCapability |
                          kHasXOAuth2Capability;
      break;
  }

  if (m_prefAuthMethods & kHasXOAuth2Capability) {
    mOAuth2Support = new mozilla::mailnews::OAuth2ThreadHelper(aServer);
    if (!mOAuth2Support || !mOAuth2Support->SupportsOAuth2()) {
      // Disable OAuth2 support if we don't have the prefs installed.
      m_prefAuthMethods &= ~kHasXOAuth2Capability;
      mOAuth2Support = nullptr;
      MOZ_LOG(IMAP, LogLevel::Warning,
              ("IMAP: no OAuth2 support for this server."));
    }
  }
}

/**
 * Changes m_currentAuthMethod to pick the best remaining one
 * which is allowed by server and prefs and not marked failed.
 * The order of preference and trying of auth methods is encoded here.
 */
nsresult nsImapProtocol::ChooseAuthMethod() {
  eIMAPCapabilityFlags serverCaps = GetServerStateParser().GetCapabilityFlag();
  eIMAPCapabilityFlags availCaps =
      serverCaps & m_prefAuthMethods & ~m_failedAuthMethods;

  MOZ_LOG(IMAP, LogLevel::Debug,
          ("IMAP auth: server caps 0x%" PRIx64 ", pref 0x%" PRIx64
           ", failed 0x%" PRIx64 ", avail caps 0x%" PRIx64,
           serverCaps, m_prefAuthMethods, m_failedAuthMethods, availCaps));
  // clang-format off
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("(GSSAPI = 0x%" PRIx64 ", CRAM = 0x%" PRIx64 ", NTLM = 0x%" PRIx64
           ", MSN = 0x%" PRIx64 ", PLAIN = 0x%" PRIx64 ", LOGIN = 0x%" PRIx64
           ", old-style IMAP login = 0x%" PRIx64
           ", auth external IMAP login = 0x%" PRIx64 ", OAUTH2 = 0x%" PRIx64 ")",
           kHasAuthGssApiCapability, kHasCRAMCapability, kHasAuthNTLMCapability,
           kHasAuthMSNCapability, kHasAuthPlainCapability, kHasAuthLoginCapability,
           kHasAuthOldLoginCapability, kHasAuthExternalCapability,
           kHasXOAuth2Capability));
  // clang-format on

  if (kHasAuthExternalCapability & availCaps)
    m_currentAuthMethod = kHasAuthExternalCapability;
  else if (kHasAuthGssApiCapability & availCaps)
    m_currentAuthMethod = kHasAuthGssApiCapability;
  else if (kHasCRAMCapability & availCaps)
    m_currentAuthMethod = kHasCRAMCapability;
  else if (kHasAuthNTLMCapability & availCaps)
    m_currentAuthMethod = kHasAuthNTLMCapability;
  else if (kHasAuthMSNCapability & availCaps)
    m_currentAuthMethod = kHasAuthMSNCapability;
  else if (kHasXOAuth2Capability & availCaps)
    m_currentAuthMethod = kHasXOAuth2Capability;
  else if (kHasAuthPlainCapability & availCaps)
    m_currentAuthMethod = kHasAuthPlainCapability;
  else if (kHasAuthLoginCapability & availCaps)
    m_currentAuthMethod = kHasAuthLoginCapability;
  else if (kHasAuthOldLoginCapability & availCaps)
    m_currentAuthMethod = kHasAuthOldLoginCapability;
  else {
    MOZ_LOG(IMAP, LogLevel::Debug, ("No remaining auth method"));
    m_currentAuthMethod = kCapabilityUndefined;
    return NS_ERROR_FAILURE;
  }
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("Trying auth method 0x%" PRIx64, m_currentAuthMethod));
  return NS_OK;
}

void nsImapProtocol::MarkAuthMethodAsFailed(
    eIMAPCapabilityFlags failedAuthMethod) {
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("Marking auth method 0x%" PRIx64 " failed", failedAuthMethod));
  m_failedAuthMethods |= failedAuthMethod;
}

/**
 * Start over, trying all auth methods again
 */
void nsImapProtocol::ResetAuthMethods() {
  MOZ_LOG(IMAP, LogLevel::Debug, ("resetting (failed) auth methods"));
  m_currentAuthMethod = kCapabilityUndefined;
  m_failedAuthMethods = 0;
}

nsresult nsImapProtocol::SendDataParseIMAPandCheckForNewMail(
    const char* aData, const char* aCommand) {
  nsresult rv;
  bool isResend = false;
  while (true) {
    // Send authentication string (true: suppress logging the string).
    rv = SendData(aData, true);
    if (NS_FAILED(rv)) break;
    ParseIMAPandCheckForNewMail(aCommand);
    if (!GetServerStateParser().WaitingForMoreClientInput()) break;

    // The server is asking for the authentication string again. So we send
    // the same string again although we know that it might be rejected again.
    // We do that to get a firm authentication failure instead of a resend
    // request. That keeps things in order before failing authentication and
    // trying another method if capable.
    if (isResend) {
      rv = NS_ERROR_FAILURE;
      break;
    }
    isResend = true;
  }

  return rv;
}

nsresult nsImapProtocol::ClientID() {
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());
  command += " CLIENTID UUID ";
  command += m_clientId;
  command += CRLF;
  nsresult rv = SendDataParseIMAPandCheckForNewMail(command.get(), nullptr);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!GetServerStateParser().LastCommandSuccessful()) {
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

nsresult nsImapProtocol::AuthLogin(const char* userName,
                                   const nsString& aPassword,
                                   eIMAPCapabilityFlag flag) {
  nsresult rv;
  // If we're shutting down, bail out (usually).
  nsCOMPtr<nsIMsgAccountManager> accountMgr =
      mozilla::components::AccountManager::Service();
  bool shuttingDown = false;
  (void)accountMgr->GetShutdownInProgress(&shuttingDown);
  if (shuttingDown) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("AuthLogin() while shutdown in progress"));
    nsImapAction imapAction;
    rv = m_runningUrl->GetImapAction(&imapAction);
    // If we're shutting down, and not running the kinds of urls we run at
    // shutdown, then this should fail because running urls during
    // shutdown will very likely fail and potentially hang.
    if (NS_FAILED(rv) || (imapAction != nsIImapUrl::nsImapExpungeFolder &&
                          imapAction != nsIImapUrl::nsImapDeleteAllMsgs &&
                          imapAction != nsIImapUrl::nsImapDeleteFolder)) {
      return NS_ERROR_ABORT;
    }
  }

  ProgressEventFunctionUsingName("imapStatusSendingAuthLogin");
  IncrementCommandTagNumber();

  char* currentCommand = nullptr;
  NS_ConvertUTF16toUTF8 password(aPassword);
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("IMAP: trying auth method 0x%" PRIx64, m_currentAuthMethod));

  if (flag & kHasAuthExternalCapability) {
    char* base64UserName = PL_Base64Encode(userName, strlen(userName), nullptr);
    nsAutoCString command(GetServerCommandTag());
    command.AppendLiteral(" authenticate EXTERNAL ");
    command.Append(base64UserName);
    command.Append(CRLF);
    PR_Free(base64UserName);
    rv = SendData(command.get());
    ParseIMAPandCheckForNewMail();
    nsImapServerResponseParser& parser = GetServerStateParser();
    if (parser.LastCommandSuccessful()) return NS_OK;
    parser.SetCapabilityFlag(parser.GetCapabilityFlag() &
                             ~kHasAuthExternalCapability);
  } else if (flag & kHasCRAMCapability) {
    NS_ENSURE_TRUE(m_imapServerSink, NS_ERROR_NULL_POINTER);
    MOZ_LOG(IMAP, LogLevel::Debug, ("MD5 auth"));
    // inform the server that we want to begin a CRAM authentication
    // procedure...
    nsAutoCString command(GetServerCommandTag());
    command.AppendLiteral(" authenticate CRAM-MD5" CRLF);
    rv = SendData(command.get());
    NS_ENSURE_SUCCESS(rv, rv);
    ParseIMAPandCheckForNewMail();
    if (GetServerStateParser().LastCommandSuccessful()) {
      char* digest = nullptr;
      char* cramDigest = GetServerStateParser().fAuthChallenge;
      char* decodedChallenge =
          PL_Base64Decode(cramDigest, strlen(cramDigest), nullptr);
      rv = m_imapServerSink->CramMD5Hash(decodedChallenge, password.get(),
                                         &digest);
      PR_Free(decodedChallenge);
      NS_ENSURE_SUCCESS(rv, rv);
      NS_ENSURE_TRUE(digest, NS_ERROR_NULL_POINTER);
      // The encoded digest is the hexadecimal representation of
      // DIGEST_LENGTH characters, so it will be twice that length.
      nsAutoCStringN<2 * DIGEST_LENGTH> encodedDigest;

      for (uint32_t j = 0; j < DIGEST_LENGTH; j++) {
        char hexVal[3];
        PR_snprintf(hexVal, 3, "%.2x", 0x0ff & (unsigned short)(digest[j]));
        encodedDigest.Append(hexVal);
      }

      PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE, "%.255s %s", userName,
                  encodedDigest.get());
      char* base64Str =
          PL_Base64Encode(m_dataOutputBuf, strlen(m_dataOutputBuf), nullptr);
      PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE, "%s" CRLF, base64Str);
      PR_Free(base64Str);
      PR_Free(digest);
      rv = SendData(m_dataOutputBuf);
      NS_ENSURE_SUCCESS(rv, rv);
      ParseIMAPandCheckForNewMail(command.get());
    }
  }  // if CRAM response was received
  else if (flag & kHasAuthGssApiCapability) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("MD5 auth"));

    // Only try GSSAPI once - if it fails, its going to be because we don't
    // have valid credentials
    // MarkAuthMethodAsFailed(kHasAuthGssApiCapability);

    // We do step1 first, so we don't try GSSAPI against a server which
    // we can't get credentials for.
    nsAutoCString response;

    nsAutoCString service("imap@");
    service.Append(m_hostName);
    rv = DoGSSAPIStep1(service, userName, response);
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoCString command(GetServerCommandTag());
    command.AppendLiteral(" authenticate GSSAPI" CRLF);
    rv = SendData(command.get());
    NS_ENSURE_SUCCESS(rv, rv);

    ParseIMAPandCheckForNewMail("AUTH GSSAPI");
    if (GetServerStateParser().LastCommandSuccessful()) {
      response += CRLF;
      rv = SendData(response.get());
      NS_ENSURE_SUCCESS(rv, rv);
      ParseIMAPandCheckForNewMail(command.get());
      nsresult gssrv = NS_OK;

      while (GetServerStateParser().LastCommandSuccessful() &&
             NS_SUCCEEDED(gssrv) && gssrv != NS_SUCCESS_AUTH_FINISHED) {
        nsCString challengeStr(GetServerStateParser().fAuthChallenge);
        gssrv = DoGSSAPIStep2(challengeStr, response);
        if (NS_SUCCEEDED(gssrv)) {
          response += CRLF;
          rv = SendData(response.get());
        } else
          rv = SendData("*" CRLF);

        NS_ENSURE_SUCCESS(rv, rv);
        ParseIMAPandCheckForNewMail(command.get());
      }
      // TODO: whether it worked or not is shown by LastCommandSuccessful(), not
      // gssrv, right?
    }
  } else if (flag & (kHasAuthNTLMCapability | kHasAuthMSNCapability)) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("NTLM auth"));
    nsAutoCString command(GetServerCommandTag());
    command.Append((flag & kHasAuthNTLMCapability) ? " authenticate NTLM" CRLF
                                                   : " authenticate MSN" CRLF);
    rv = SendData(command.get());
    ParseIMAPandCheckForNewMail(
        "AUTH NTLM");  // this just waits for ntlm step 1
    if (GetServerStateParser().LastCommandSuccessful()) {
      nsAutoCString cmd;
      rv = DoNtlmStep1(nsDependentCString(userName), aPassword, cmd);
      NS_ENSURE_SUCCESS(rv, rv);
      cmd += CRLF;
      rv = SendData(cmd.get());
      NS_ENSURE_SUCCESS(rv, rv);
      ParseIMAPandCheckForNewMail(command.get());
      if (GetServerStateParser().LastCommandSuccessful()) {
        nsCString challengeStr(GetServerStateParser().fAuthChallenge);
        nsCString response;
        rv = DoNtlmStep2(challengeStr, response);
        NS_ENSURE_SUCCESS(rv, rv);
        response += CRLF;
        rv = SendData(response.get());
        ParseIMAPandCheckForNewMail(command.get());
      }
    }
  } else if (flag & kHasAuthPlainCapability) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("PLAIN auth"));
    PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE,
                "%s authenticate PLAIN" CRLF, GetServerCommandTag());
    rv = SendData(m_dataOutputBuf);
    NS_ENSURE_SUCCESS(rv, rv);
    currentCommand = PL_strdup(
        m_dataOutputBuf); /* StrAllocCopy(currentCommand, GetOutputBuffer()); */
    ParseIMAPandCheckForNewMail();
    if (GetServerStateParser().LastCommandSuccessful()) {
      // RFC 4616
      char plain_string[513];
      memset(plain_string, 0, 513);
      PR_snprintf(&plain_string[1], 256, "%.255s", userName);
      uint32_t len = std::min<uint32_t>(PL_strlen(userName), 255u) +
                     2;  // We include two <NUL> characters.
      PR_snprintf(&plain_string[len], 256, "%.255s", password.get());
      len += std::min<uint32_t>(password.Length(), 255u);
      char* base64Str = PL_Base64Encode(plain_string, len, nullptr);
      PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE, "%s" CRLF, base64Str);
      PR_Free(base64Str);

      rv = SendDataParseIMAPandCheckForNewMail(m_dataOutputBuf, currentCommand);
    }  // if the last command succeeded
  }  // if auth plain capability
  else if (flag & kHasAuthLoginCapability) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("LOGIN auth"));
    PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE,
                "%s authenticate LOGIN" CRLF, GetServerCommandTag());
    rv = SendData(m_dataOutputBuf);
    NS_ENSURE_SUCCESS(rv, rv);
    currentCommand = PL_strdup(m_dataOutputBuf);
    ParseIMAPandCheckForNewMail();

    if (GetServerStateParser().LastCommandSuccessful()) {
      char* base64Str = PL_Base64Encode(
          userName, std::min<uint32_t>(PL_strlen(userName), 255u), nullptr);
      PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE, "%s" CRLF, base64Str);
      PR_Free(base64Str);
      rv = SendData(m_dataOutputBuf, true /* suppress logging */);
      if (NS_SUCCEEDED(rv)) {
        ParseIMAPandCheckForNewMail(currentCommand);
        if (GetServerStateParser().LastCommandSuccessful()) {
          base64Str = PL_Base64Encode(
              password.get(), std::min<uint32_t>(password.Length(), 255u),
              nullptr);
          PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE, "%s" CRLF,
                      base64Str);
          PR_Free(base64Str);
          rv = SendData(m_dataOutputBuf, true /* suppress logging */);
          if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail(currentCommand);
        }  // if last command successful
      }  // if last command successful
    }  // if last command successful
  }  // if has auth login capability
  else if (flag & kHasAuthOldLoginCapability) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("old-style auth"));
    ProgressEventFunctionUsingName("imapStatusSendingLogin");
    IncrementCommandTagNumber();
    nsCString command(GetServerCommandTag());
    nsAutoCString escapedUserName;
    command.AppendLiteral(" login \"");
    EscapeUserNamePasswordString(userName, &escapedUserName);
    command.Append(escapedUserName);
    command.AppendLiteral("\" \"");

    // if the password contains a \, login will fail
    // turn foo\bar into foo\\bar
    nsAutoCString correctedPassword;
    // We're assuming old style login doesn't want UTF-8
    EscapeUserNamePasswordString(NS_LossyConvertUTF16toASCII(aPassword).get(),
                                 &correctedPassword);
    command.Append(correctedPassword);
    command.AppendLiteral("\"" CRLF);
    rv = SendData(command.get(), true /* suppress logging */);
    NS_ENSURE_SUCCESS(rv, rv);
    ParseIMAPandCheckForNewMail();
  } else if (flag & kHasXOAuth2Capability) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("XOAUTH2 auth"));

    // Get the XOAuth2 base64 string.
    NS_ASSERTION(mOAuth2Support,
                 "What are we doing here without OAuth2 helper?");
    if (!mOAuth2Support) return NS_ERROR_UNEXPECTED;
    nsAutoCString base64Str;
    mOAuth2Support->GetXOAuth2String(base64Str);
    mOAuth2Support = nullptr;  // Its purpose has been served.
    if (base64Str.IsEmpty()) {
      MOZ_LOG(IMAP, LogLevel::Debug, ("OAuth2 failed"));
      return NS_ERROR_FAILURE;
    }

    // Send the data on the network.
    nsAutoCString command(GetServerCommandTag());
    command += " AUTHENTICATE XOAUTH2 ";
    command += base64Str;
    command += CRLF;

    rv = SendDataParseIMAPandCheckForNewMail(command.get(), nullptr);
  } else if (flag & kHasAuthNoneCapability) {
    // TODO What to do? "login <username>" like POP?
    return NS_ERROR_NOT_IMPLEMENTED;
  } else {
    MOZ_LOG(IMAP, LogLevel::Error, ("flags param has no auth scheme selected"));
    return NS_ERROR_ILLEGAL_VALUE;
  }

  PR_Free(currentCommand);
  NS_ENSURE_SUCCESS(rv, rv);
  return GetServerStateParser().LastCommandSuccessful() ? NS_OK
                                                        : NS_ERROR_FAILURE;
}

void nsImapProtocol::OnLSubFolders() {
  // **** use to find out whether Drafts, Sent, & Templates folder
  // exists or not even the user didn't subscribe to it
  nsCString mailboxName = OnCreateServerSourceFolderPathString();
  if (!mailboxName.IsEmpty()) {
    ProgressEventFunctionUsingName("imapStatusLookingForMailbox");
    IncrementCommandTagNumber();
    PR_snprintf(m_dataOutputBuf, OUTPUT_BUFFER_SIZE, "%s list \"\" \"%s\"" CRLF,
                GetServerCommandTag(), mailboxName.get());
    nsresult rv = SendData(m_dataOutputBuf);
    if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
  } else {
    HandleMemoryFailure();
  }
}

void nsImapProtocol::OnAppendMsgFromFile() {
  nsCOMPtr<nsIFile> file;
  nsresult rv = NS_OK;
  rv = m_runningUrl->GetMsgFile(getter_AddRefs(file));
  if (NS_SUCCEEDED(rv) && file) {
    nsCString mailboxName = OnCreateServerSourceFolderPathString();
    if (!mailboxName.IsEmpty()) {
      imapMessageFlagsType flagsToSet = 0;
      uint32_t msgFlags = 0;
      PRTime date = 0;
      nsCString keywords;
      if (m_imapMessageSink)
        m_imapMessageSink->GetCurMoveCopyMessageInfo(m_runningUrl, &date,
                                                     keywords, &msgFlags);

      if (msgFlags & nsMsgMessageFlags::Read) flagsToSet |= kImapMsgSeenFlag;
      if (msgFlags & nsMsgMessageFlags::MDNReportSent)
        flagsToSet |= kImapMsgMDNSentFlag;
      // convert msg flag label (0xE000000) to imap flag label (0x0E00)
      if (msgFlags & nsMsgMessageFlags::Labels)
        flagsToSet |= (msgFlags & nsMsgMessageFlags::Labels) >> 16;
      if (msgFlags & nsMsgMessageFlags::Marked)
        flagsToSet |= kImapMsgFlaggedFlag;
      if (msgFlags & nsMsgMessageFlags::Replied)
        flagsToSet |= kImapMsgAnsweredFlag;
      if (msgFlags & nsMsgMessageFlags::Forwarded)
        flagsToSet |= kImapMsgForwardedFlag;

      // If the message copied was a draft, flag it as such
      nsImapAction imapAction;
      rv = m_runningUrl->GetImapAction(&imapAction);
      if (NS_SUCCEEDED(rv) &&
          (imapAction == nsIImapUrl::nsImapAppendDraftFromFile))
        flagsToSet |= kImapMsgDraftFlag;
      UploadMessageFromFile(file, mailboxName.get(), date, flagsToSet,
                            keywords);
    } else {
      HandleMemoryFailure();
    }
  }
}

void nsImapProtocol::UploadMessageFromFile(nsIFile* file,
                                           const char* mailboxName, PRTime date,
                                           imapMessageFlagsType flags,
                                           nsCString& keywords) {
  if (!file || !mailboxName) return;
  IncrementCommandTagNumber();

  int64_t fileSize = 0;
  int64_t totalSize;
  uint32_t readCount;
  char* dataBuffer = nullptr;
  nsCString command(GetServerCommandTag());
  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);
  nsresult rv;
  bool urlOk = false;
  nsCString flagString;

  nsCOMPtr<nsIInputStream> fileInputStream;

  if (!escapedName.IsEmpty()) {
    command.AppendLiteral(" append \"");
    command.Append(escapedName);
    command.Append('"');
    if (flags || keywords.Length()) {
      command.AppendLiteral(" (");

      if (flags) {
        SetupMessageFlagsString(flagString, flags,
                                GetServerStateParser().SupportsUserFlags());
        command.Append(flagString);
      }
      if (keywords.Length()) {
        if (flags) command.Append(' ');
        command.Append(keywords);
      }
      command.Append(')');
    }

    // date should never be 0, but just in case...
    if (date) {
      /* Use PR_FormatTimeUSEnglish() to format the date in US English format,
        then figure out what our local GMT offset is, and append it (since
        PR_FormatTimeUSEnglish() can't do that.) Generate four digit years as
        per RFC 1123 (superseding RFC 822.)
        */
      char szDateTime[64];
      char dateStr[100];
      PRExplodedTime exploded;
      PR_ExplodeTime(date, PR_LocalTimeParameters, &exploded);
      PR_FormatTimeUSEnglish(szDateTime, sizeof(szDateTime),
                             "%d-%b-%Y %H:%M:%S", &exploded);
      PRExplodedTime now;
      PR_ExplodeTime(PR_Now(), PR_LocalTimeParameters, &now);
      int gmtoffset =
          (now.tm_params.tp_gmt_offset + now.tm_params.tp_dst_offset) / 60;
      PR_snprintf(dateStr, sizeof(dateStr), " \"%s %c%02d%02d\"", szDateTime,
                  (gmtoffset >= 0 ? '+' : '-'),
                  ((gmtoffset >= 0 ? gmtoffset : -gmtoffset) / 60),
                  ((gmtoffset >= 0 ? gmtoffset : -gmtoffset) % 60));

      command.Append(dateStr);
    }
    if (m_allowUTF8Accept)
      command.AppendLiteral(" UTF8 (~{");
    else
      command.AppendLiteral(" {");

    dataBuffer = (char*)PR_CALLOC(COPY_BUFFER_SIZE + 1);
    if (!dataBuffer) goto done;
    rv = file->GetFileSize(&fileSize);
    NS_ASSERTION(fileSize, "got empty file in UploadMessageFromFile");
    if (NS_FAILED(rv) || !fileSize) goto done;
    rv = NS_NewLocalFileInputStream(getter_AddRefs(fileInputStream), file);
    if (NS_FAILED(rv) || !fileInputStream) goto done;
    command.AppendInt((int32_t)fileSize);

    // Set useLiteralPlus to true if server has capability LITERAL+ and
    // LITERAL+ usage is enabled in the config editor,
    // i.e., "mail.imap.use_literal_plus" = true.
    bool useLiteralPlus =
        (GetServerStateParser().GetCapabilityFlag() & kLiteralPlusCapability) &&
        gUseLiteralPlus;
    if (useLiteralPlus)
      command.AppendLiteral("+}" CRLF);
    else
      command.AppendLiteral("}" CRLF);

    rv = SendData(command.get());
    if (NS_FAILED(rv)) goto done;

    if (!useLiteralPlus) {
      ParseIMAPandCheckForNewMail();
      if (!GetServerStateParser().LastCommandSuccessful()) goto done;
    }

    totalSize = fileSize;
    readCount = 0;
    while (NS_SUCCEEDED(rv) && totalSize > 0) {
      if (DeathSignalReceived()) goto done;
      rv = fileInputStream->Read(dataBuffer, COPY_BUFFER_SIZE, &readCount);
      if (NS_SUCCEEDED(rv) && !readCount) rv = NS_ERROR_FAILURE;

      if (NS_SUCCEEDED(rv)) {
        NS_ASSERTION(readCount <= (uint32_t)totalSize,
                     "got more bytes than there should be");
        dataBuffer[readCount] = 0;
        rv = SendData(dataBuffer);
        totalSize -= readCount;
        PercentProgressUpdateEvent(""_ns, fileSize - totalSize, fileSize);
        if (!totalSize) {
          // The full message has been queued for sending, but the actual send
          // is just now starting and can still potentially fail. From this
          // point the progress cannot be determined, so just set the progress
          // to "indeterminate" so that the user does not see an incorrect 100%
          // complete on the progress bar while waiting for the retry dialog to
          // appear if the send should fail.
          m_lastProgressTime = 0;  // Force progress bar update
          m_lastPercent = -1;      // Force progress bar update
          PercentProgressUpdateEvent(""_ns, 0, -1);  // Indeterminate
        }
      }
    }  // end while appending chunks

    if (NS_SUCCEEDED(rv)) {  // complete the append
      if (m_allowUTF8Accept)
        rv = SendData(")" CRLF);
      else
        rv = SendData(CRLF);
      if (NS_FAILED(rv)) goto done;

      ParseIMAPandCheckForNewMail(command.get());
      if (!GetServerStateParser().LastCommandSuccessful()) goto done;

      // If reached, the append completed without error. No more goto's!
      // May still find problems in imap responses below so urlOk may still
      // become false.
      urlOk = true;

      nsImapAction imapAction;
      m_runningUrl->GetImapAction(&imapAction);

      if (imapAction == nsIImapUrl::nsImapAppendDraftFromFile ||
          imapAction == nsIImapUrl::nsImapAppendMsgFromFile) {
        if (GetServerStateParser().GetCapabilityFlag() & kUidplusCapability) {
          nsMsgKey newKey = GetServerStateParser().CurrentResponseUID();
          if (m_imapMailFolderSink)
            m_imapMailFolderSink->SetAppendMsgUid(newKey, m_runningUrl);

          // Courier imap server seems to have problems with recently
          // appended messages. Noop seems to clear its confusion.
          if (FolderIsSelected(mailboxName)) Noop();

          if (!GetServerStateParser().LastCommandSuccessful()) urlOk = false;
        } else if (m_imapMailFolderSink &&
                   imapAction == nsIImapUrl::nsImapAppendDraftFromFile) {
          // No UIDPLUS capability and just appended a message to draft folder.
          // Must search the folder using the Message-ID to find the UID of the
          // appended message. First, go to selected state.
          nsCString messageId;
          rv = m_imapMailFolderSink->GetMessageId(m_runningUrl, messageId);
          if (NS_SUCCEEDED(rv) && !messageId.IsEmpty()) {
            // if the appended to folder isn't selected in the connection,
            // select it.
            if (!FolderIsSelected(mailboxName))
              SelectMailbox(mailboxName);
            else
              Noop();  // See if this makes SEARCH work on the newly appended
                       // msg.

            if (GetServerStateParser().LastCommandSuccessful()) {
              command = "SEARCH UNDELETED HEADER Message-ID ";
              command.Append(messageId);

              // Clean up result sequence before issuing the cmd.
              GetServerStateParser().ResetSearchResultSequence();

              Search(command.get(), true, false);
              if (GetServerStateParser().LastCommandSuccessful()) {
                nsMsgKey newkey = nsMsgKey_None;
                nsImapSearchResultIterator* searchResult =
                    GetServerStateParser().CreateSearchResultIterator();
                newkey = searchResult->GetNextMessageNumber();
                delete searchResult;
                if (newkey != nsMsgKey_None)
                  m_imapMailFolderSink->SetAppendMsgUid(newkey, m_runningUrl);
              } else
                urlOk = false;
            } else
              urlOk = false;
          }
        }
      }
    }
  }
done:
  // If imap command fails or network goes down, make sure URL sees the failure.
  if (!urlOk) GetServerStateParser().SetCommandFailed(true);

  PR_Free(dataBuffer);
  if (fileInputStream) fileInputStream->Close();
}

nsCString nsImapProtocol::OnCreateServerSourceFolderPathString() {
  nsCString sourceMailbox;
  char hierarchyDelimiter = 0;
  char onlineDelimiter = 0;
  m_runningUrl->GetOnlineSubDirSeparator(&hierarchyDelimiter);
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->GetOnlineDelimiter(&onlineDelimiter);

  if (onlineDelimiter != kOnlineHierarchySeparatorUnknown &&
      onlineDelimiter != hierarchyDelimiter)
    m_runningUrl->SetOnlineSubDirSeparator(onlineDelimiter);

  m_runningUrl->CreateServerSourceFolderPathString(sourceMailbox);

  return sourceMailbox;
}

nsCString nsImapProtocol::GetFolderPathString() {
  nsCString sourceMailbox;
  char onlineSubDirDelimiter = 0;
  char hierarchyDelimiter = 0;
  nsCOMPtr<nsIMsgFolder> msgFolder;

  m_runningUrl->GetOnlineSubDirSeparator(&onlineSubDirDelimiter);
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_runningUrl);
  mailnewsUrl->GetFolder(getter_AddRefs(msgFolder));
  if (msgFolder) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(msgFolder);
    if (imapFolder) {
      imapFolder->GetHierarchyDelimiter(&hierarchyDelimiter);
      if (hierarchyDelimiter != kOnlineHierarchySeparatorUnknown &&
          onlineSubDirDelimiter != hierarchyDelimiter)
        m_runningUrl->SetOnlineSubDirSeparator(hierarchyDelimiter);
    }
  }
  m_runningUrl->CreateServerSourceFolderPathString(sourceMailbox);

  return sourceMailbox;
}

nsresult nsImapProtocol::CreateServerSourceFolderPathString(nsCString& result) {
  result = OnCreateServerSourceFolderPathString();
  return NS_OK;
}

nsCString nsImapProtocol::OnCreateServerDestinationFolderPathString() {
  nsCString destinationMailbox;
  char hierarchyDelimiter = 0;
  char onlineDelimiter = 0;
  m_runningUrl->GetOnlineSubDirSeparator(&hierarchyDelimiter);
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->GetOnlineDelimiter(&onlineDelimiter);
  if (onlineDelimiter != kOnlineHierarchySeparatorUnknown &&
      onlineDelimiter != hierarchyDelimiter)
    m_runningUrl->SetOnlineSubDirSeparator(onlineDelimiter);

  m_runningUrl->CreateServerDestinationFolderPathString(destinationMailbox);

  return destinationMailbox;
}

void nsImapProtocol::OnCreateFolder(const char* aSourceMailbox) {
  bool created = CreateMailboxRespectingSubscriptions(aSourceMailbox);
  if (created) {
    m_hierarchyNameState = kListingForCreate;
    nsCString mailboxWODelim(aSourceMailbox);
    RemoveHierarchyDelimiter(mailboxWODelim);
    List(mailboxWODelim.get(), false);
    m_hierarchyNameState = kNoOperationInProgress;
  } else
    FolderNotCreated(aSourceMailbox);
}

void nsImapProtocol::OnEnsureExistsFolder(const char* aSourceMailbox) {
  // We need to handle the following edge case where the destination server
  // wasn't authenticated when the folder name was encoded in
  // `EnsureFolderExists()'. In this case we always get MUTF-7. Here we are
  // authenticated and can rely on `m_allowUTF8Accept'. If the folder appears
  // to be MUTF-7 and we need UTF-8, we re-encode it. If it's not ASCII, it
  // must be already correct in UTF-8. And if it was ASCII to start with, it
  // doesn't matter that we MUTF-7 decode and UTF-8 re-encode.

  // `aSourceMailbox' is a path with hierarchy delimiters possibly. To determine
  // if the edge case is in effect, we only want to check the leaf node for
  // ASCII and this is only necessary when `m_allowUTF8Accept' is true.

  // `fullPath' is modified below if leaf re-encoding is necessary and it must
  // be defined here at top level so it stays in scope.
  nsAutoCString fullPath(aSourceMailbox);

  if (m_allowUTF8Accept) {
    char onlineDirSeparator = kOnlineHierarchySeparatorUnknown;
    m_runningUrl->GetOnlineSubDirSeparator(&onlineDirSeparator);

    int32_t leafStart = fullPath.RFindChar(onlineDirSeparator);
    nsAutoCString leafName;
    if (leafStart == kNotFound) {
      // This is a root level mailbox
      leafName = fullPath;
      fullPath.SetLength(0);
    } else {
      leafName = Substring(fullPath, leafStart + 1);
      fullPath.SetLength(leafStart + 1);
    }

    if (NS_IsAscii(leafName.get())) {
      MOZ_LOG(IMAP, LogLevel::Debug,
              ("re-encode leaf of mailbox %s to UTF-8", aSourceMailbox));
      nsAutoString utf16LeafName;
      CopyMUTF7toUTF16(leafName, utf16LeafName);

      // Convert UTF-16 to UTF-8 to create the folder.
      nsAutoCString utf8LeafName;
      CopyUTF16toUTF8(utf16LeafName, utf8LeafName);
      fullPath.Append(utf8LeafName);
      aSourceMailbox = fullPath.get();
      MOZ_LOG(IMAP, LogLevel::Debug,
              ("re-encoded leaf of mailbox %s to UTF-8", aSourceMailbox));
    }
  }
  List(aSourceMailbox, false);  // how to tell if that succeeded?
  // If List() produces OK tagged response and an untagged "* LIST" response
  // then the folder exists on the server. For simplicity, just look for
  // a general untagged response.
  bool folderExists = false;
  if (GetServerStateParser().LastCommandSuccessful())
    folderExists = GetServerStateParser().UntaggedResponse();

  // try converting aSourceMailbox to canonical format
  nsImapNamespace* nsForMailbox = nullptr;
  m_hostSessionList->GetNamespaceForMailboxForHost(
      GetImapServerKey(), aSourceMailbox, nsForMailbox);
  // NS_ASSERTION (nsForMailbox, "Oops .. null nsForMailbox");

  nsCString name;

  nsAutoCString sourceMailbox(aSourceMailbox);
  if (nsForMailbox)
    m_runningUrl->AllocateCanonicalPath(sourceMailbox,
                                        nsForMailbox->GetDelimiter(), name);
  else
    m_runningUrl->AllocateCanonicalPath(sourceMailbox,
                                        kOnlineHierarchySeparatorUnknown, name);

  // Also check that the folder has been verified to exist in server sink.
  bool verifiedExists = false;
  if (folderExists && m_imapServerSink)
    m_imapServerSink->FolderVerifiedOnline(name, &verifiedExists);

  // If folder exists on server and is verified and known to exists in server
  // sink, just subscribe the folder. Otherwise, create a new folder and
  // then subscribe and do list again to make sure it's created.
  if (folderExists && verifiedExists) {
    Subscribe(aSourceMailbox);
  } else {
    bool created = CreateMailboxRespectingSubscriptions(aSourceMailbox);
    if (created) {
      List(aSourceMailbox, false);
      // Check that we see an untagged response indicating folder now exists.
      folderExists = GetServerStateParser().UntaggedResponse();
    }
  }
  if (!GetServerStateParser().LastCommandSuccessful() || !folderExists)
    FolderNotCreated(aSourceMailbox);
}

void nsImapProtocol::OnSubscribe(const char* sourceMailbox) {
  Subscribe(sourceMailbox);
}

void nsImapProtocol::OnUnsubscribe(const char* sourceMailbox) {
  // When we try to auto-unsubscribe from \Noselect folders,
  // some servers report errors if we were already unsubscribed
  // from them.
  bool lastReportingErrors = GetServerStateParser().GetReportingErrors();
  GetServerStateParser().SetReportingErrors(false);
  Unsubscribe(sourceMailbox);
  GetServerStateParser().SetReportingErrors(lastReportingErrors);
}

void nsImapProtocol::RefreshACLForFolderIfNecessary(const char* mailboxName) {
  if (GetServerStateParser().ServerHasACLCapability()) {
    if (!m_folderNeedsACLRefreshed && m_imapMailFolderSink)
      m_imapMailFolderSink->GetFolderNeedsACLListed(&m_folderNeedsACLRefreshed);
    if (m_folderNeedsACLRefreshed) {
      RefreshACLForFolder(mailboxName);
      m_folderNeedsACLRefreshed = false;
    }
  }
}

void nsImapProtocol::RefreshACLForFolder(const char* mailboxName) {
  nsImapNamespace* ns = nullptr;
  m_hostSessionList->GetNamespaceForMailboxForHost(GetImapServerKey(),
                                                   mailboxName, ns);
  if (ns) {
    switch (ns->GetType()) {
      case kPersonalNamespace:
        // It's a personal folder, most likely.
        // I find it hard to imagine a server that supports ACL that doesn't
        // support NAMESPACE, so most likely we KNOW that this is a personal,
        // rather than the default, namespace.

        // First, clear what we have.
        ClearAllFolderRights();
        // Now, get the new one.
        GetMyRightsForFolder(mailboxName);
        if (m_imapMailFolderSink) {
          uint32_t aclFlags = 0;
          if (NS_SUCCEEDED(m_imapMailFolderSink->GetAclFlags(&aclFlags)) &&
              aclFlags & IMAP_ACL_ADMINISTER_FLAG)
            GetACLForFolder(mailboxName);
        }

        // We're all done, refresh the icon/flags for this folder
        RefreshFolderACLView(mailboxName, ns);
        break;
      default:
        // We know it's a public folder or other user's folder.
        // We only want our own rights

        // First, clear what we have
        ClearAllFolderRights();
        // Now, get the new one.
        GetMyRightsForFolder(mailboxName);
        // We're all done, refresh the icon/flags for this folder
        RefreshFolderACLView(mailboxName, ns);
        break;
    }
  } else {
    // no namespace, not even default... can this happen?
    NS_ASSERTION(false, "couldn't get namespace");
  }
}

void nsImapProtocol::RefreshFolderACLView(const char* mailboxName,
                                          nsImapNamespace* nsForMailbox) {
  nsCString canonicalMailboxName;

  nsCString mailbox(mailboxName);
  if (nsForMailbox)
    m_runningUrl->AllocateCanonicalPath(mailbox, nsForMailbox->GetDelimiter(),
                                        canonicalMailboxName);
  else
    m_runningUrl->AllocateCanonicalPath(
        mailbox, kOnlineHierarchySeparatorUnknown, canonicalMailboxName);

  if (m_imapServerSink)
    m_imapServerSink->RefreshFolderRights(canonicalMailboxName);
}

void nsImapProtocol::GetACLForFolder(const char* mailboxName) {
  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());
  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);
  command.AppendLiteral(" getacl \"");
  command.Append(escapedName);
  command.AppendLiteral("\"" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::OnRefreshAllACLs() {
  m_hierarchyNameState = kListingForInfoOnly;
  nsIMAPMailboxInfo* mb = NULL;

  // This will fill in the list
  List("*", true);

  int32_t total = m_listedMailboxList.Length(), count = 0;
  GetServerStateParser().SetReportingErrors(false);
  for (int32_t i = 0; i < total; i++) {
    mb = m_listedMailboxList.ElementAt(i);
    if (mb)  // paranoia
    {
      nsCString onlineName;
      m_runningUrl->AllocateServerPath(mb->GetMailboxName(), mb->GetDelimiter(),
                                       onlineName);
      if (!onlineName.IsEmpty()) {
        RefreshACLForFolder(onlineName.get());
      }
      PercentProgressUpdateEvent(""_ns, count, total);
      delete mb;
      count++;
    }
  }
  m_listedMailboxList.Clear();

  PercentProgressUpdateEvent(""_ns, 100, 100);
  GetServerStateParser().SetReportingErrors(true);
  m_hierarchyNameState = kNoOperationInProgress;
}

// any state commands
void nsImapProtocol::Logout(bool shuttingDown /* = false */,
                            bool waitForResponse /* = true */) {
  if (!shuttingDown) ProgressEventFunctionUsingName("imapStatusLoggingOut");

  /******************************************************************
   * due to the undo functionality we cannot issue ImapClose when logout; there
   * is no way to do an undo if the message has been permanently expunge
   * jt - 07/12/1999

      bool closeNeeded = GetServerStateParser().GetIMAPstate() ==
          nsImapServerResponseParser::kFolderSelected;

      if (closeNeeded && GetDeleteIsMoveToTrash())
          ImapClose();
  ********************/

  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());

  command.AppendLiteral(" logout" CRLF);

  nsresult rv = SendData(command.get());
  if (m_transport && shuttingDown)
    m_transport->SetTimeout(nsISocketTransport::TIMEOUT_READ_WRITE, 5);
  // the socket may be dead before we read the response, so drop it.
  if (NS_SUCCEEDED(rv) && waitForResponse) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Noop() {
  // ProgressUpdateEvent("noop...");
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());

  command.AppendLiteral(" noop" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::XServerInfo() {
  ProgressEventFunctionUsingName("imapGettingServerInfo");
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());

  command.AppendLiteral(
      " XSERVERINFO MANAGEACCOUNTURL MANAGELISTSURL MANAGEFILTERSURL" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Netscape() {
  ProgressEventFunctionUsingName("imapGettingServerInfo");
  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());

  command.AppendLiteral(" netscape" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::XMailboxInfo(const char* mailboxName) {
  ProgressEventFunctionUsingName("imapGettingMailboxInfo");
  IncrementCommandTagNumber();
  nsCString command(GetServerCommandTag());

  command.AppendLiteral(" XMAILBOXINFO \"");
  command.Append(mailboxName);
  command.AppendLiteral("\" MANAGEURL POSTURL" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Namespace() {
  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());
  command.AppendLiteral(" namespace" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::MailboxData() {
  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());
  command.AppendLiteral(" mailboxdata" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::GetMyRightsForFolder(const char* mailboxName) {
  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());
  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);

  if (MailboxIsNoSelectMailbox(escapedName))
    return;  // Don't issue myrights on Noselect folder

  command.AppendLiteral(" myrights \"");
  command.Append(escapedName);
  command.AppendLiteral("\"" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

bool nsImapProtocol::FolderIsSelected(const char* mailboxName) {
  return (GetServerStateParser().GetIMAPstate() ==
              nsImapServerResponseParser::kFolderSelected &&
          GetServerStateParser().GetSelectedMailboxName() &&
          PL_strcmp(GetServerStateParser().GetSelectedMailboxName(),
                    mailboxName) == 0);
}

void nsImapProtocol::OnStatusForFolder(const char* mailboxName) {
  bool untaggedResponse;
  // RFC 3501 says:
  // "the STATUS command SHOULD NOT be used on the currently selected mailbox",
  // so use NOOP instead if mailboxName is the selected folder on this
  // connection.
  // XXX: what if folder (mailboxName) is selected on another connection/thread?
  if (FolderIsSelected(mailboxName)) {
    Noop();
    // Did untagged responses occur during the NOOP response? If so, this
    // indicates new mail or other changes in the mailbox. Handle this like an
    // IDLE response which will cause a folder update.
    if ((untaggedResponse = GetServerStateParser().UntaggedResponse()) &&
        m_imapMailFolderSinkSelected) {
      Log("OnStatusForFolder", nullptr,
          "mailbox change on selected folder during noop");
      m_imapMailFolderSinkSelected->OnNewIdleMessages();
    }
    mailboxName = nullptr;  // for new_spec below. Obtain SELECTed mailbox data.
  } else {
    // Imap connection is not in selected state or imap connection is selected
    // on a mailbox other than than the mailbox folderstatus URL is requesting
    // status for.
    untaggedResponse = true;  // STATUS always produces an untagged response
    IncrementCommandTagNumber();

    nsAutoCString command(GetServerCommandTag());
    nsCString escapedName;
    CreateEscapedMailboxName(mailboxName, escapedName);

    command.AppendLiteral(" STATUS \"");
    command.Append(escapedName);
    command.AppendLiteral("\" (UIDNEXT MESSAGES UNSEEN RECENT)" CRLF);

    int32_t prevNumMessages = GetServerStateParser().NumberOfMessages();
    nsresult rv = SendData(command.get());
    if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();

    // Respond to possible untagged responses EXISTS and RECENT for the SELECTed
    // folder. Handle as though this were an IDLE response. Can't check for any
    // untagged as for Noop() above since STATUS always produces an untagged
    // response for the target mailbox and possibly also for the SELECTed box.
    // Of course, this won't occur if imap connection is not in selected state.
    if (GetServerStateParser().GetIMAPstate() ==
            nsImapServerResponseParser::kFolderSelected &&
        m_imapMailFolderSinkSelected &&
        (GetServerStateParser().NumberOfRecentMessages() ||
         prevNumMessages != GetServerStateParser().NumberOfMessages())) {
      Log("OnStatusForFolder", nullptr,
          "new mail on selected folder during status");
      m_imapMailFolderSinkSelected->OnNewIdleMessages();
    }
    MOZ_ASSERT(m_imapMailFolderSink != m_imapMailFolderSinkSelected);
  }

  // Do this to ensure autosync detects changes in server counts and thus
  // triggers a full body fetch for when NOOP or STATUS is sent above.
  // But if NOOP didn't produce an untagged response, no need to do this.
  // Note: For SELECTed noop() above, "folder sink" and "folder sink selected"
  // both reference the same folder but are not always equal. So OK to use
  // m_imapMailFolderSink below since it is correct for NOOP and STATUS cases.
  if (untaggedResponse && GetServerStateParser().LastCommandSuccessful()) {
    RefPtr<nsImapMailboxSpec> new_spec =
        GetServerStateParser().CreateCurrentMailboxSpec(mailboxName);
    if (new_spec && m_imapMailFolderSink) {
      if (new_spec->mFolderSelected)
        Log("OnStatusForFolder", nullptr,
            "call UpdateImapMailboxStatus did SELECT/noop");
      else
        Log("OnStatusForFolder", nullptr,
            "call UpdateImapMailboxStatus did STATUS");
      m_imapMailFolderSink->UpdateImapMailboxStatus(this, new_spec);
    }
  }
}

void nsImapProtocol::OnListFolder(const char* aSourceMailbox, bool aBool) {
  List(aSourceMailbox, aBool);
}

// Returns true if the mailbox is a NoSelect mailbox.
// If we don't know about it, returns false.
bool nsImapProtocol::MailboxIsNoSelectMailbox(const nsACString& mailboxName) {
  bool rv = false;

  nsImapNamespace* nsForMailbox = nullptr;
  m_hostSessionList->GetNamespaceForMailboxForHost(
      GetImapServerKey(), PromiseFlatCString(mailboxName).get(), nsForMailbox);
  // NS_ASSERTION (nsForMailbox, "Oops .. null nsForMailbox");

  nsCString name;

  if (nsForMailbox)
    m_runningUrl->AllocateCanonicalPath(mailboxName,
                                        nsForMailbox->GetDelimiter(), name);
  else
    m_runningUrl->AllocateCanonicalPath(mailboxName,
                                        kOnlineHierarchySeparatorUnknown, name);

  if (name.IsEmpty()) return false;

  NS_ASSERTION(m_imapServerSink,
               "unexpected, no imap server sink, see bug #194335");
  if (m_imapServerSink) m_imapServerSink->FolderIsNoSelect(name, &rv);
  return rv;
}

nsresult nsImapProtocol::SetFolderAdminUrl(const char* mailboxName) {
  nsresult rv =
      NS_ERROR_NULL_POINTER;  // if m_imapServerSink is null, rv will be this.

  nsImapNamespace* nsForMailbox = nullptr;
  m_hostSessionList->GetNamespaceForMailboxForHost(GetImapServerKey(),
                                                   mailboxName, nsForMailbox);

  nsCString name;

  if (nsForMailbox)
    m_runningUrl->AllocateCanonicalPath(nsDependentCString(mailboxName),
                                        nsForMailbox->GetDelimiter(), name);
  else
    m_runningUrl->AllocateCanonicalPath(nsDependentCString(mailboxName),
                                        kOnlineHierarchySeparatorUnknown, name);

  if (m_imapServerSink)
    rv = m_imapServerSink->SetFolderAdminURL(
        name, nsDependentCString(GetServerStateParser().GetManageFolderUrl()));
  return rv;
}

// returns true is the delete succeeded (regardless of subscription changes)
bool nsImapProtocol::DeleteMailboxRespectingSubscriptions(
    const char* mailboxName) {
  bool rv = true;
  if (!mailboxName) {
    return false;
  }

  // Try to delete it -- even if NoSelect. Most servers report that the mailbox
  // doesn't exist when trying to delete a NoSelect folder.
  DeleteMailbox(mailboxName);
  rv = GetServerStateParser().LastCommandSuccessful();
  if (!rv && MailboxIsNoSelectMailbox(nsDependentCString(mailboxName)))
    rv = true;  // Ignore possible error if NoSelect.

  // We can unsubscribe even if the mailbox doesn't exist.
  if (rv && m_autoUnsubscribe)  // auto-unsubscribe is on
  {
    bool reportingErrors = GetServerStateParser().GetReportingErrors();
    GetServerStateParser().SetReportingErrors(false);
    Unsubscribe(mailboxName);
    GetServerStateParser().SetReportingErrors(reportingErrors);
  }
  return (rv);
}

// returns true is the rename succeeded (regardless of subscription changes)
// reallyRename tells us if we should really do the rename (true) or if we
// should just move subscriptions (false)
bool nsImapProtocol::RenameMailboxRespectingSubscriptions(
    const char* existingName, const char* newName, bool reallyRename) {
  bool rv = true;
  if (!existingName) {
    return false;
  }
  if (reallyRename &&
      !MailboxIsNoSelectMailbox(nsDependentCString(existingName))) {
    RenameMailbox(existingName, newName);
    rv = GetServerStateParser().LastCommandSuccessful();
  }

  if (rv) {
    if (m_autoSubscribe)  // if auto-subscribe is on
    {
      bool reportingErrors = GetServerStateParser().GetReportingErrors();
      GetServerStateParser().SetReportingErrors(false);
      Subscribe(newName);
      GetServerStateParser().SetReportingErrors(reportingErrors);
    }
    if (m_autoUnsubscribe)  // if auto-unsubscribe is on
    {
      bool reportingErrors = GetServerStateParser().GetReportingErrors();
      GetServerStateParser().SetReportingErrors(false);
      Unsubscribe(existingName);
      GetServerStateParser().SetReportingErrors(reportingErrors);
    }
  }
  return (rv);
}

bool nsImapProtocol::RenameHierarchyByHand(const char* oldParentMailboxName,
                                           const char* newParentMailboxName) {
  NS_ENSURE_TRUE(oldParentMailboxName, false);
  NS_ENSURE_TRUE(newParentMailboxName, false);

  bool renameSucceeded = true;
  char onlineDirSeparator = kOnlineHierarchySeparatorUnknown;
  m_deletableChildren = new nsTArray<nsCString>();

  bool nonHierarchicalRename =
      ((GetServerStateParser().GetCapabilityFlag() & kNoHierarchyRename) ||
       MailboxIsNoSelectMailbox(nsDependentCString(oldParentMailboxName)));

  m_hierarchyNameState = kDeleteSubFoldersInProgress;
  nsImapNamespace* ns = nullptr;
  m_hostSessionList->GetNamespaceForMailboxForHost(GetImapServerKey(),
                                                   oldParentMailboxName,
                                                   ns);  // for delimiter
  if (!ns) {
    if (!PL_strcasecmp(oldParentMailboxName, "INBOX"))
      m_hostSessionList->GetDefaultNamespaceOfTypeForHost(
          GetImapServerKey(), kPersonalNamespace, ns);
  }
  if (ns) {
    nsCString pattern(oldParentMailboxName);
    pattern += ns->GetDelimiter();
    pattern += "*";
    bool isUsingSubscription = false;
    m_hostSessionList->GetHostIsUsingSubscription(GetImapServerKey(),
                                                  isUsingSubscription);

    if (isUsingSubscription)
      Lsub(pattern.get(), false);
    else
      List(pattern.get(), false);
  }
  m_hierarchyNameState = kNoOperationInProgress;

  if (GetServerStateParser().LastCommandSuccessful())
    renameSucceeded =  // rename this, and move subscriptions
        RenameMailboxRespectingSubscriptions(oldParentMailboxName,
                                             newParentMailboxName, true);

  size_t numberToDelete = m_deletableChildren->Length();

  for (size_t childIndex = 0; (childIndex < numberToDelete) && renameSucceeded;
       childIndex++) {
    nsCString name = m_deletableChildren->ElementAt(childIndex);
    nsCString serverName;
    m_runningUrl->AllocateServerPath(name, onlineDirSeparator, serverName);
    if (serverName.IsEmpty()) {
      renameSucceeded = false;
      break;
    }
    nsCString currentName = serverName;

    // calculate the new name and do the rename
    nsCString newChildName(newParentMailboxName);
    newChildName += (currentName.get() + PL_strlen(oldParentMailboxName));
    // Pass in 'nonHierarchicalRename' to determine if we should really
    // rename, or just move subscriptions.
    renameSucceeded = RenameMailboxRespectingSubscriptions(
        currentName.get(), newChildName.get(), nonHierarchicalRename);
  }

  delete m_deletableChildren;
  m_deletableChildren = nullptr;

  return renameSucceeded;
}

bool nsImapProtocol::DeleteSubFolders(const char* selectedMailbox,
                                      bool& aDeleteSelf) {
  bool deleteSucceeded = true;
  m_deletableChildren = new nsTArray<nsCString>;

  bool folderDeleted = false;

  m_hierarchyNameState = kDeleteSubFoldersInProgress;
  nsCString pattern(selectedMailbox);
  char onlineDirSeparator = kOnlineHierarchySeparatorUnknown;
  m_runningUrl->GetOnlineSubDirSeparator(&onlineDirSeparator);
  pattern.Append(onlineDirSeparator);
  pattern.Append('*');

  if (!pattern.IsEmpty()) {
    List(pattern.get(), false);
  }
  m_hierarchyNameState = kNoOperationInProgress;

  // this should be a short list so perform a sequential search for the
  // longest name mailbox.  Deleting the longest first will hopefully
  // prevent the server from having problems about deleting parents
  // ** jt - why? I don't understand this.
  size_t numberToDelete = m_deletableChildren->Length();
  size_t outerIndex, innerIndex;

  // intelligently decide if myself(either plain format or following the
  // dir-separator) is in the sub-folder list
  bool folderInSubfolderList = false;  // For Performance
  char* selectedMailboxDir = nullptr;
  {
    int32_t length = strlen(selectedMailbox);
    selectedMailboxDir = (char*)PR_MALLOC(length + 2);
    if (selectedMailboxDir)  // only do the intelligent test if there is
                             // enough memory
    {
      strcpy(selectedMailboxDir, selectedMailbox);
      selectedMailboxDir[length] = onlineDirSeparator;
      selectedMailboxDir[length + 1] = '\0';
      size_t i;
      for (i = 0; i < numberToDelete && !folderInSubfolderList; i++) {
        const char* currentName = m_deletableChildren->ElementAt(i).get();
        if (!strcmp(currentName, selectedMailbox) ||
            !strcmp(currentName, selectedMailboxDir))
          folderInSubfolderList = true;
      }
    }
  }

  deleteSucceeded = GetServerStateParser().LastCommandSuccessful();
  for (outerIndex = 0; (outerIndex < numberToDelete) && deleteSucceeded;
       outerIndex++) {
    nsCString longestName;
    size_t longestIndex = 0;  // fix bogus warning by initializing
    for (innerIndex = 0; innerIndex < m_deletableChildren->Length();
         innerIndex++) {
      nsCString currentName = m_deletableChildren->ElementAt(innerIndex);
      if (longestName.IsEmpty() ||
          longestName.Length() < currentName.Length()) {
        longestName = currentName;
        longestIndex = innerIndex;
      }
    }
    if (!longestName.IsEmpty()) {
      nsCString serverName;
      m_runningUrl->AllocateServerPath(longestName, onlineDirSeparator,
                                       serverName);
      m_deletableChildren->RemoveElementAt(longestIndex);
      longestName = serverName;
    }

    // some imap servers include the selectedMailbox in the list of
    // subfolders of the selectedMailbox.  Check for this so we don't
    // delete the selectedMailbox (usually the trash and doing an
    // empty trash)
    // The Cyrus imap server ignores the "INBOX.Trash" constraining
    // string passed to the list command.  Be defensive and make sure
    // we only delete children of the trash
    if (!longestName.IsEmpty() && strcmp(selectedMailbox, longestName.get()) &&
        !strncmp(selectedMailbox, longestName.get(), strlen(selectedMailbox))) {
      if (selectedMailboxDir &&
          !strcmp(selectedMailboxDir, longestName.get()))  // just myself
      {
        if (aDeleteSelf) {
          bool deleted =
              DeleteMailboxRespectingSubscriptions(longestName.get());
          if (deleted) FolderDeleted(longestName);
          folderDeleted = deleted;
          deleteSucceeded = deleted;
        }
      } else {
        if (m_imapServerSink)
          m_imapServerSink->ResetServerConnection(longestName);
        bool deleted = false;
        if (folderInSubfolderList)  // for performance
        {
          nsTArray<nsCString>* pDeletableChildren = m_deletableChildren;
          m_deletableChildren = nullptr;
          bool folderDeleted = true;
          deleted = DeleteSubFolders(longestName.get(), folderDeleted);
          // longestName may have subfolder list including itself
          if (!folderDeleted) {
            if (deleted)
              deleted = DeleteMailboxRespectingSubscriptions(longestName.get());
            if (deleted) FolderDeleted(longestName);
          }
          m_deletableChildren = pDeletableChildren;
        } else {
          deleted = DeleteMailboxRespectingSubscriptions(longestName.get());
          if (deleted) FolderDeleted(longestName);
        }
        deleteSucceeded = deleted;
      }
    }
  }

  aDeleteSelf = folderDeleted;  // feedback if myself is deleted
  PR_Free(selectedMailboxDir);

  delete m_deletableChildren;
  m_deletableChildren = nullptr;

  return deleteSucceeded;
}

void nsImapProtocol::FolderDeleted(const nsACString& mailboxName) {
  char onlineDelimiter = kOnlineHierarchySeparatorUnknown;
  nsCString orphanedMailboxName;

  if (!mailboxName.IsEmpty()) {
    m_runningUrl->AllocateCanonicalPath(mailboxName, onlineDelimiter,
                                        orphanedMailboxName);
    if (m_imapServerSink)
      m_imapServerSink->OnlineFolderDelete(orphanedMailboxName);
  }
}

void nsImapProtocol::FolderNotCreated(const char* folderName) {
  if (folderName && m_imapServerSink)
    m_imapServerSink->OnlineFolderCreateFailed(nsDependentCString(folderName));
}

void nsImapProtocol::FolderRenamed(const char* oldName, const char* newName) {
  char onlineDelimiter = kOnlineHierarchySeparatorUnknown;

  if ((m_hierarchyNameState == kNoOperationInProgress) ||
      (m_hierarchyNameState == kListingForInfoAndDiscovery))

  {
    nsCString canonicalOldName, canonicalNewName;
    m_runningUrl->AllocateCanonicalPath(nsDependentCString(oldName),
                                        onlineDelimiter, canonicalOldName);
    m_runningUrl->AllocateCanonicalPath(nsDependentCString(newName),
                                        onlineDelimiter, canonicalNewName);
    AutoProxyReleaseMsgWindow msgWindow;
    GetMsgWindow(getter_AddRefs(msgWindow));
    m_imapServerSink->OnlineFolderRename(msgWindow, canonicalOldName,
                                         canonicalNewName);
  }
}

void nsImapProtocol::OnDeleteFolder(const char* sourceMailbox) {
  // intelligently delete the folder
  bool folderDeleted = true;
  bool deleted = DeleteSubFolders(sourceMailbox, folderDeleted);
  if (!folderDeleted) {
    if (deleted) deleted = DeleteMailboxRespectingSubscriptions(sourceMailbox);
    if (deleted) FolderDeleted(nsDependentCString(sourceMailbox));
  }
}

void nsImapProtocol::RemoveMsgsAndExpunge() {
  uint32_t numberOfMessages = GetServerStateParser().NumberOfMessages();
  if (numberOfMessages) {
    // Remove all msgs and expunge the folder (ie, compact it).
    Store("1:*"_ns, "+FLAGS.SILENT (\\Deleted)",
          false);  // use sequence #'s
    if (GetServerStateParser().LastCommandSuccessful()) Expunge();
  }
}

void nsImapProtocol::DeleteFolderAndMsgs(const char* sourceMailbox) {
  RemoveMsgsAndExpunge();
  if (GetServerStateParser().LastCommandSuccessful()) {
    // All msgs are deleted successfully - let's remove the folder itself.
    bool reportingErrors = GetServerStateParser().GetReportingErrors();
    GetServerStateParser().SetReportingErrors(false);
    OnDeleteFolder(sourceMailbox);
    GetServerStateParser().SetReportingErrors(reportingErrors);
  }
}

void nsImapProtocol::OnRenameFolder(const char* sourceMailbox) {
  nsCString destinationMailbox = OnCreateServerDestinationFolderPathString();

  bool renamed = RenameHierarchyByHand(sourceMailbox, destinationMailbox.get());
  if (renamed) FolderRenamed(sourceMailbox, destinationMailbox.get());

  // Cause a LIST and re-discovery when slash and/or ^ are escaped. Also
  // needed when folder renamed to non-ASCII UTF-8 when UTF8=ACCEPT in
  // effect.
  m_hierarchyNameState = kListingForCreate;
  nsCString mailboxWODelim = destinationMailbox;
  RemoveHierarchyDelimiter(mailboxWODelim);
  List(mailboxWODelim.get(), false);
  m_hierarchyNameState = kNoOperationInProgress;
}

void nsImapProtocol::OnMoveFolderHierarchy(const char* sourceMailbox) {
  nsCString newBoxName = OnCreateServerDestinationFolderPathString();

  char onlineDirSeparator = kOnlineHierarchySeparatorUnknown;
  m_runningUrl->GetOnlineSubDirSeparator(&onlineDirSeparator);

  nsCString oldBoxName(sourceMailbox);
  int32_t leafStart = oldBoxName.RFindChar(onlineDirSeparator);
  nsCString leafName;

  if (-1 == leafStart)
    leafName = oldBoxName;  // this is a root level box
  else
    leafName = Substring(oldBoxName, leafStart + 1);

  if (!newBoxName.IsEmpty()) newBoxName.Append(onlineDirSeparator);
  newBoxName.Append(leafName);
  bool renamed = RenameHierarchyByHand(sourceMailbox, newBoxName.get());
  if (renamed) FolderRenamed(sourceMailbox, newBoxName.get());
}

// This is called to do mailbox discovery if discovery not already complete
// for the "host" (i.e., server or account). Discovery still only occurs if
// the imap action is appropriate and if discovery is not in progress due to
// a running "discoverallboxes" URL.
void nsImapProtocol::FindMailboxesIfNecessary() {
  // biff should not discover mailboxes
  nsImapAction imapAction;
  (void)m_runningUrl->GetImapAction(&imapAction);
  if ((imapAction != nsIImapUrl::nsImapBiff) &&
      (imapAction != nsIImapUrl::nsImapVerifylogon) &&
      (imapAction != nsIImapUrl::nsImapDiscoverAllBoxesUrl) &&
      (imapAction != nsIImapUrl::nsImapUpgradeToSubscription) &&
      !GetSubscribingNow()) {
    // If discovery in progress, don't kick-off another discovery.
    bool discoveryInProgress = false;
    m_hostSessionList->GetDiscoveryForHostInProgress(GetImapServerKey(),
                                                     discoveryInProgress);
    if (!discoveryInProgress) {
      m_hostSessionList->SetDiscoveryForHostInProgress(GetImapServerKey(),
                                                       true);
      DiscoverMailboxList();
    }
  }
}

void nsImapProtocol::DiscoverAllAndSubscribedBoxes() {
  // used for subscribe pane
  // iterate through all namespaces
  uint32_t count = 0;
  m_hostSessionList->GetNumberOfNamespacesForHost(GetImapServerKey(), count);

  for (uint32_t i = 0; i < count; i++) {
    nsImapNamespace* ns = nullptr;
    m_hostSessionList->GetNamespaceNumberForHost(GetImapServerKey(), i, ns);
    if (!ns) {
      continue;
    }
    if ((gHideOtherUsersFromList && (ns->GetType() != kOtherUsersNamespace)) ||
        !gHideOtherUsersFromList) {
      const char* prefix = ns->GetPrefix();
      if (prefix) {
        nsAutoCString inboxNameWithDelim("INBOX");
        inboxNameWithDelim.Append(ns->GetDelimiter());

        // Only do it for non-empty namespace prefixes.
        if (!gHideUnusedNamespaces && *prefix &&
            PL_strcasecmp(prefix, inboxNameWithDelim.get())) {
          // Explicitly discover each Namespace, just so they're
          // there in the subscribe UI
          RefPtr<nsImapMailboxSpec> boxSpec = new nsImapMailboxSpec;
          boxSpec->mFolderSelected = false;
          boxSpec->mHostName.Assign(GetImapHostName());
          boxSpec->mConnection = this;
          boxSpec->mFlagState = nullptr;
          boxSpec->mDiscoveredFromLsub = true;
          boxSpec->mOnlineVerified = true;
          boxSpec->mBoxFlags = kNoselect;
          boxSpec->mHierarchySeparator = ns->GetDelimiter();

          m_runningUrl->AllocateCanonicalPath(
              nsDependentCString(ns->GetPrefix()), ns->GetDelimiter(),
              boxSpec->mAllocatedPathName);
          boxSpec->mNamespaceForFolder = ns;
          boxSpec->mBoxFlags |= kNameSpace;

          switch (ns->GetType()) {
            case kPersonalNamespace:
              boxSpec->mBoxFlags |= kPersonalMailbox;
              break;
            case kPublicNamespace:
              boxSpec->mBoxFlags |= kPublicMailbox;
              break;
            case kOtherUsersNamespace:
              boxSpec->mBoxFlags |= kOtherUsersMailbox;
              break;
            default:  // (kUnknownNamespace)
              break;
          }

          DiscoverMailboxSpec(boxSpec);
        }

        nsAutoCString allPattern(prefix);
        allPattern += '*';

        if (!m_imapServerSink) return;

        m_imapServerSink->SetServerDoingLsub(true);
        Lsub(allPattern.get(), true);  // LSUB all the subscribed

        m_imapServerSink->SetServerDoingLsub(false);
        List(allPattern.get(), true);  // LIST all folders
      }
    }
  }
}

// DiscoverMailboxList() is used to actually do the discovery of folders
// for a host.  This is used both when we initially start up (and re-sync)
// and also when the user manually requests a re-sync, by collapsing and
// expanding a host in the folder pane.  This is not used for the subscribe
// pane.
// DiscoverMailboxList() also gets the ACLs for each newly discovered folder
void nsImapProtocol::DiscoverMailboxList() {
  bool usingSubscription = false;

  m_hostSessionList->GetHostIsUsingSubscription(GetImapServerKey(),
                                                usingSubscription);
  // Pretend that the Trash folder doesn't exist, so we will rediscover it if we
  // need to.
  m_hostSessionList->SetOnlineTrashFolderExistsForHost(GetImapServerKey(),
                                                       false);

  // should we check a pref here, to be able to turn off XList?
  bool hasXLIST =
      GetServerStateParser().GetCapabilityFlag() & kHasXListCapability;
  if (hasXLIST && usingSubscription) {
    m_hierarchyNameState = kXListing;
    nsAutoCString pattern("%");
    List("%", true, true);
    // We list the first and second levels since special folders are unlikely
    // to be more than 2 levels deep.
    char separator = 0;
    m_runningUrl->GetOnlineSubDirSeparator(&separator);
    pattern.Append(separator);
    pattern += '%';
    List(pattern.get(), true, true);
  }

  SetMailboxDiscoveryStatus(eContinue);
  if (GetServerStateParser().ServerHasACLCapability())
    m_hierarchyNameState = kListingForInfoAndDiscovery;
  else
    m_hierarchyNameState = kNoOperationInProgress;

  // iterate through all namespaces and LSUB them.
  uint32_t count = 0;
  m_hostSessionList->GetNumberOfNamespacesForHost(GetImapServerKey(), count);
  for (uint32_t i = 0; i < count; i++) {
    nsImapNamespace* ns = nullptr;
    m_hostSessionList->GetNamespaceNumberForHost(GetImapServerKey(), i, ns);
    if (ns) {
      const char* prefix = ns->GetPrefix();
      if (prefix) {
        nsAutoCString inboxNameWithDelim("INBOX");
        inboxNameWithDelim.Append(ns->GetDelimiter());

        // static bool gHideUnusedNamespaces = true;
        // mscott -> WARNING!!! i where are we going to get this
        // global variable for unused name spaces from???
        // dmb - we should get this from a per-host preference,
        // I'd say. But for now, just make it true.
        // Only do it for non-empty namespace prefixes, and for non-INBOX prefix
        if (!gHideUnusedNamespaces && *prefix &&
            PL_strcasecmp(prefix, inboxNameWithDelim.get())) {
          // Explicitly discover each Namespace, so that we can
          // create subfolders of them,
          RefPtr<nsImapMailboxSpec> boxSpec = new nsImapMailboxSpec;
          boxSpec->mFolderSelected = false;
          boxSpec->mHostName = GetImapHostName();
          boxSpec->mConnection = this;
          boxSpec->mFlagState = nullptr;
          boxSpec->mDiscoveredFromLsub = true;
          boxSpec->mOnlineVerified = true;
          boxSpec->mBoxFlags = kNoselect;
          boxSpec->mHierarchySeparator = ns->GetDelimiter();
          // Until |AllocateCanonicalPath()| gets updated:
          m_runningUrl->AllocateCanonicalPath(
              nsDependentCString(ns->GetPrefix()), ns->GetDelimiter(),
              boxSpec->mAllocatedPathName);
          boxSpec->mNamespaceForFolder = ns;
          boxSpec->mBoxFlags |= kNameSpace;

          switch (ns->GetType()) {
            case kPersonalNamespace:
              boxSpec->mBoxFlags |= kPersonalMailbox;
              break;
            case kPublicNamespace:
              boxSpec->mBoxFlags |= kPublicMailbox;
              break;
            case kOtherUsersNamespace:
              boxSpec->mBoxFlags |= kOtherUsersMailbox;
              break;
            default:  // (kUnknownNamespace)
              break;
          }

          DiscoverMailboxSpec(boxSpec);
        }

        // Now do the folders within this namespace

        // Note: It is important to make sure we are respecting the
        // server_sub_directory preference when calling List and Lsub (2nd arg =
        // true), otherwise we end up with performance issues or even crashes
        // when connecting to servers that expose the users entire home
        // directory (like UW-IMAP).
        nsCString pattern;
        pattern.Append(prefix);
        if (usingSubscription) {
          pattern.Append('*');

          if (GetServerStateParser().GetCapabilityFlag() &
              kHasListExtendedCapability)
            Lsub(pattern.get(), true);  // do LIST (SUBSCRIBED)
          else {
            // store mailbox flags from LIST
            EMailboxHierarchyNameState currentState = m_hierarchyNameState;
            m_hierarchyNameState = kListingForFolderFlags;
            List(pattern.get(), true);
            m_hierarchyNameState = currentState;
            // then do LSUB using stored flags
            Lsub(pattern.get(), true);
            m_standardListMailboxes.Clear();
          }
        } else {
          // Not using subscription. Need to list top level folders here so any
          // new folders at top level are discovered. Folders at all levels
          // will be set unverified and will be checked for new children in
          // nsImapIncomingServer::DiscoveryDone when discoverallboxes URL stop
          // is signaled. This must be done instead of 'list "" *' so that the
          // database for each individually listed folder at all levels is
          // is properly closed when discoverchildren URL stop is signaled.
          // Testing for database closing is done by test_listClosesDB.js.
          pattern += "%";
          List(pattern.get(), true, hasXLIST);
        }
      }
    }
  }

  // explicitly LIST the INBOX if (a) we're not using subscription, or (b) we
  // are using subscription and the user wants us to always show the INBOX.
  bool listInboxForHost = false;
  m_hostSessionList->GetShouldAlwaysListInboxForHost(GetImapServerKey(),
                                                     listInboxForHost);
  if (!usingSubscription || listInboxForHost) List("INBOX", true);

  m_hierarchyNameState = kNoOperationInProgress;

  MailboxDiscoveryFinished();

  // Get the ACLs for newly discovered folders
  if (GetServerStateParser().ServerHasACLCapability()) {
    int32_t total = m_listedMailboxList.Length(), cnt = 0;
    // Let's not turn this off here, since we don't turn it on after
    // GetServerStateParser().SetReportingErrors(false);
    if (total) {
      ProgressEventFunctionUsingName("imapGettingACLForFolder");
      nsIMAPMailboxInfo* mb = nullptr;
      do {
        if (m_listedMailboxList.Length() == 0) break;

        mb = m_listedMailboxList[0];  // get top element
        m_listedMailboxList.RemoveElementAt(
            0);  // XP_ListRemoveTopObject(fListedMailboxList);
        if (mb) {
          if (FolderNeedsACLInitialized(
                  PromiseFlatCString(mb->GetMailboxName()).get())) {
            nsCString onlineName;
            m_runningUrl->AllocateServerPath(mb->GetMailboxName(),
                                             mb->GetDelimiter(), onlineName);
            if (!onlineName.IsEmpty()) {
              RefreshACLForFolder(onlineName.get());
            }
          }
          PercentProgressUpdateEvent(""_ns, cnt, total);
          delete mb;  // this is the last time we're using the list, so delete
                      // the entries here
          cnt++;
        }
      } while (mb && !DeathSignalReceived());
    }
  }
}

bool nsImapProtocol::FolderNeedsACLInitialized(const char* folderName) {
  bool rv = false;
  m_imapServerSink->FolderNeedsACLInitialized(nsDependentCString(folderName),
                                              &rv);
  return rv;
}

void nsImapProtocol::MailboxDiscoveryFinished() {
  if (!DeathSignalReceived() && !GetSubscribingNow() &&
      ((m_hierarchyNameState == kNoOperationInProgress) ||
       (m_hierarchyNameState == kListingForInfoAndDiscovery))) {
    nsImapNamespace* ns = nullptr;
    m_hostSessionList->GetDefaultNamespaceOfTypeForHost(GetImapServerKey(),
                                                        kPersonalNamespace, ns);
    const char* personalDir = ns ? ns->GetPrefix() : 0;

    bool trashFolderExists = false;
    bool usingSubscription = false;
    m_hostSessionList->GetOnlineTrashFolderExistsForHost(GetImapServerKey(),
                                                         trashFolderExists);
    m_hostSessionList->GetHostIsUsingSubscription(GetImapServerKey(),
                                                  usingSubscription);
    if (!trashFolderExists && GetDeleteIsMoveToTrash() && usingSubscription) {
      // maybe we're not subscribed to the Trash folder
      if (personalDir) {
        m_hierarchyNameState = kDiscoverTrashFolderInProgress;
        List(m_trashFolderPath.get(), true);
        m_hierarchyNameState = kNoOperationInProgress;
      }
    }

    // There is no Trash folder (either LIST'd or LSUB'd), and we're using the
    // Delete-is-move-to-Trash model, and there is a personal namespace
    if (!trashFolderExists && GetDeleteIsMoveToTrash() && ns) {
      nsCString onlineTrashName;
      m_runningUrl->AllocateServerPath(m_trashFolderPath, ns->GetDelimiter(),
                                       onlineTrashName);

      GetServerStateParser().SetReportingErrors(false);
      bool created =
          CreateMailboxRespectingSubscriptions(onlineTrashName.get());
      GetServerStateParser().SetReportingErrors(true);

      // force discovery of new trash folder.
      if (created) {
        m_hierarchyNameState = kDiscoverTrashFolderInProgress;
        List(onlineTrashName.get(), false);
        m_hierarchyNameState = kNoOperationInProgress;
      } else
        m_hostSessionList->SetOnlineTrashFolderExistsForHost(GetImapServerKey(),
                                                             true);
    }  // if trash folder doesn't exist
    m_hostSessionList->SetHaveWeEverDiscoveredFoldersForHost(GetImapServerKey(),
                                                             true);
    // notify front end that folder discovery is complete....
    if (m_imapServerSink) m_imapServerSink->DiscoveryDone();

    // Clear the discovery in progress flag.
    m_hostSessionList->SetDiscoveryForHostInProgress(GetImapServerKey(), false);
  }
}

// returns the mailboxName with the IMAP delimiter removed from the tail end
void nsImapProtocol::RemoveHierarchyDelimiter(nsCString& mailboxName) {
  char onlineDelimiter[2] = {0, 0};
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->GetOnlineDelimiter(&onlineDelimiter[0]);
  // take the hierarchy delimiter off the end, if any.
  if (onlineDelimiter[0]) mailboxName.Trim(onlineDelimiter, false, true);
}

// returns true is the create succeeded (regardless of subscription changes)
bool nsImapProtocol::CreateMailboxRespectingSubscriptions(
    const char* mailboxName) {
  CreateMailbox(mailboxName);
  bool rv = GetServerStateParser().LastCommandSuccessful();
  if (rv && m_autoSubscribe)  // auto-subscribe is on
  {
    // create succeeded - let's subscribe to it
    bool reportingErrors = GetServerStateParser().GetReportingErrors();
    GetServerStateParser().SetReportingErrors(false);
    nsCString mailboxWODelim(mailboxName);
    RemoveHierarchyDelimiter(mailboxWODelim);
    OnSubscribe(mailboxWODelim.get());
    GetServerStateParser().SetReportingErrors(reportingErrors);
  }
  return rv;
}

void nsImapProtocol::CreateMailbox(const char* mailboxName) {
  ProgressEventFunctionUsingName("imapStatusCreatingMailbox");

  IncrementCommandTagNumber();

  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);
  nsCString command(GetServerCommandTag());
  command += " create \"";
  command += escapedName;
  command += "\"" CRLF;

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
  // If that failed, let's list the parent folder to see if
  // it allows inferiors, so we won't try to create sub-folders
  // of the parent folder again in the current session.
  if (GetServerStateParser().CommandFailed()) {
    // Figure out parent folder name.
    nsCString parentName(mailboxName);
    char hierarchyDelimiter;
    m_runningUrl->GetOnlineSubDirSeparator(&hierarchyDelimiter);
    int32_t leafPos = parentName.RFindChar(hierarchyDelimiter);
    if (leafPos > 0) {
      parentName.SetLength(leafPos);
      List(parentName.get(), false);
      // We still want the caller to know the create failed, so restore that.
      GetServerStateParser().SetCommandFailed(true);
    }
  }
}

void nsImapProtocol::DeleteMailbox(const char* mailboxName) {
  // check if this connection currently has the folder to be deleted selected.
  // If so, we should close it because at least some UW servers don't like you
  // deleting a folder you have open.
  if (FolderIsSelected(mailboxName)) ImapClose();

  ProgressEventFunctionUsingNameWithString("imapStatusDeletingMailbox",
                                           mailboxName);

  IncrementCommandTagNumber();

  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);
  nsCString command(GetServerCommandTag());
  command += " delete \"";
  command += escapedName;
  command += "\"" CRLF;

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::RenameMailbox(const char* existingName,
                                   const char* newName) {
  // just like DeleteMailbox; Some UW servers don't like it.
  if (FolderIsSelected(existingName)) ImapClose();

  ProgressEventFunctionUsingNameWithString("imapStatusRenamingMailbox",
                                           existingName);

  IncrementCommandTagNumber();

  nsCString escapedExistingName;
  nsCString escapedNewName;
  CreateEscapedMailboxName(existingName, escapedExistingName);
  CreateEscapedMailboxName(newName, escapedNewName);
  nsCString command(GetServerCommandTag());
  command += " rename \"";
  command += escapedExistingName;
  command += "\" \"";
  command += escapedNewName;
  command += "\"" CRLF;

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

bool nsImapProtocol::GetListSubscribedIsBrokenOnServer() {
  // This is a workaround for an issue with LIST(SUBSCRIBED) crashing older
  // versions of Zimbra
  if (FindInReadable("\"NAME\" \"Zimbra\""_ns,
                     GetServerStateParser().GetServerID(),
                     nsCaseInsensitiveCStringComparator)) {
    nsCString serverID(GetServerStateParser().GetServerID());
    int start = serverID.LowerCaseFindASCII("\"version\" \"") + 11;
    int length = serverID.LowerCaseFindASCII("\" ", start);
    const nsDependentCSubstring serverVersionSubstring =
        Substring(serverID, start, length);
    nsCString serverVersionStr(serverVersionSubstring);
    Version serverVersion(serverVersionStr.get());
    Version sevenTwoThree("7.2.3_");
    Version eightZeroZero("8.0.0_");
    Version eightZeroThree("8.0.3_");
    if ((serverVersion < sevenTwoThree) ||
        ((serverVersion >= eightZeroZero) && (serverVersion < eightZeroThree)))
      return true;
  }
  return false;
}

void nsImapProtocol::Lsub(const char* mailboxPattern,
                          bool addDirectoryIfNecessary) {
  ProgressEventFunctionUsingName("imapStatusLookingForMailbox");

  IncrementCommandTagNumber();

  char* boxnameWithOnlineDirectory = nullptr;
  if (addDirectoryIfNecessary)
    m_runningUrl->AddOnlineDirectoryIfNecessary(mailboxPattern,
                                                &boxnameWithOnlineDirectory);

  nsCString escapedPattern;
  CreateEscapedMailboxName(
      boxnameWithOnlineDirectory ? boxnameWithOnlineDirectory : mailboxPattern,
      escapedPattern);

  nsCString command(GetServerCommandTag());
  eIMAPCapabilityFlags flag = GetServerStateParser().GetCapabilityFlag();
  bool useListSubscribed = (flag & kHasListExtendedCapability) &&
                           !GetListSubscribedIsBrokenOnServer();
  if (useListSubscribed)
    command += " list (subscribed)";
  else
    command += " lsub";
  command += " \"\" \"";
  command += escapedPattern;
  if (useListSubscribed && (flag & kHasSpecialUseCapability))
    command += "\" return (special-use)" CRLF;
  else
    command += "\"" CRLF;

  PR_Free(boxnameWithOnlineDirectory);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail(command.get(), true);
}

void nsImapProtocol::List(const char* mailboxPattern,
                          bool addDirectoryIfNecessary, bool useXLIST) {
  ProgressEventFunctionUsingName("imapStatusLookingForMailbox");

  IncrementCommandTagNumber();

  char* boxnameWithOnlineDirectory = nullptr;
  if (addDirectoryIfNecessary)
    m_runningUrl->AddOnlineDirectoryIfNecessary(mailboxPattern,
                                                &boxnameWithOnlineDirectory);

  nsCString escapedPattern;
  CreateEscapedMailboxName(
      boxnameWithOnlineDirectory ? boxnameWithOnlineDirectory : mailboxPattern,
      escapedPattern);

  nsCString command(GetServerCommandTag());
  command += useXLIST ? " xlist \"\" \"" : " list \"\" \"";
  command += escapedPattern;
  command += "\"" CRLF;

  PR_Free(boxnameWithOnlineDirectory);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail(command.get(), true);
}

void nsImapProtocol::Subscribe(const char* mailboxName) {
  ProgressEventFunctionUsingNameWithString("imapStatusSubscribeToMailbox",
                                           mailboxName);

  IncrementCommandTagNumber();

  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);

  nsCString command(GetServerCommandTag());
  command += " subscribe \"";
  command += escapedName;
  command += "\"" CRLF;

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Unsubscribe(const char* mailboxName) {
  ProgressEventFunctionUsingNameWithString("imapStatusUnsubscribeMailbox",
                                           mailboxName);
  IncrementCommandTagNumber();

  nsCString escapedName;
  CreateEscapedMailboxName(mailboxName, escapedName);

  nsCString command(GetServerCommandTag());
  command += " unsubscribe \"";
  command += escapedName;
  command += "\"" CRLF;

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Idle() {
  IncrementCommandTagNumber();

  if (IsUrlInProgress()) {
    return;
  }
  nsAutoCString command(GetServerCommandTag());
  command += " IDLE" CRLF;
  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) {
    // Typically, we'll just get back only a continuation char on IDLE response,
    // "+ idling". However, it is possible untagged responses will occur before
    // and/or after the '+' which we treat the same as later untagged responses
    // signaled by the socket thread. If untagged responses occur on IDLE,
    // HandleIdleResponses() will trigger a select URL which will exit idle mode
    // and update the selected folder. Finally, if IDLE responds with tagged BAD
    // or NO, HandleIdleResponses() will return false.
    m_idle = HandleIdleResponses();
  }
}

// until we can fix the hang on shutdown waiting for server
// responses, we need to not wait for the server response
// on shutdown.
void nsImapProtocol::EndIdle(bool waitForResponse /* = true */) {
  // clear the async wait - otherwise, we have trouble doing a blocking read
  // below.
  nsCOMPtr<nsIAsyncInputStream> asyncInputStream =
      do_QueryInterface(m_inputStream);
  if (asyncInputStream) asyncInputStream->AsyncWait(nullptr, 0, 0, nullptr);
  nsresult rv = SendData("DONE" CRLF);
  // set a short timeout if we don't want to wait for a response
  if (m_transport && !waitForResponse)
    m_transport->SetTimeout(nsISocketTransport::TIMEOUT_READ_WRITE, 5);
  if (NS_SUCCEEDED(rv)) {
    m_idle = false;
    ParseIMAPandCheckForNewMail();
    // If waiting for response (i.e., not shutting down), check for IDLE
    // untagged response(s) occurring after DONE is sent, which can occur and is
    // mentioned in the IDLE rfc as a possibility. This is similar to the checks
    // done in OnStatusForFolder().
    if (waitForResponse && m_imapMailFolderSinkSelected &&
        GetServerStateParser().UntaggedResponse()) {
      Log("EndIdle", nullptr, "idle response after idle DONE");
      m_imapMailFolderSinkSelected->OnNewIdleMessages();
    }
  }
  // Set m_imapMailFolderSink null only if shutting down or if DONE succeeds.
  // We need to keep m_imapMailFolderSink if DONE fails or times out when not
  // shutting down so the URL that is attempting to run on this connection can
  // retry or signal a failed status when SetUrlState is called in
  // ProcessCurrentUrl to invoke nsIUrlListener.onStopRunningUrl.
  if (!waitForResponse || GetServerStateParser().LastCommandSuccessful())
    m_imapMailFolderSink = nullptr;
}

void nsImapProtocol::Search(const char* searchCriteria, bool useUID,
                            bool notifyHit /* true */) {
  m_notifySearchHit = notifyHit;
  ProgressEventFunctionUsingName("imapStatusSearchMailbox");
  IncrementCommandTagNumber();

  nsCString protocolString(GetServerCommandTag());
  // the searchCriteria string contains the 'search ....' string
  if (useUID) protocolString.AppendLiteral(" uid");
  protocolString.Append(' ');
  protocolString.Append(searchCriteria);
  // the search criteria can contain string literals, which means we
  // need to break up the protocol string by CRLF's, and after sending CRLF,
  // wait for the server to respond OK before sending more data
  nsresult rv;
  int32_t crlfIndex;
  while ((crlfIndex = protocolString.Find(CRLF)) != kNotFound &&
         !DeathSignalReceived()) {
    nsAutoCString tempProtocolString;
    tempProtocolString = StringHead(protocolString, crlfIndex + 2);
    rv = SendData(tempProtocolString.get());
    if (NS_FAILED(rv)) return;
    ParseIMAPandCheckForNewMail();
    protocolString.Cut(0, crlfIndex + 2);
  }
  protocolString.Append(CRLF);

  rv = SendData(protocolString.get());
  if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Copy(const char* messageList,
                          const char* destinationMailbox, bool idsAreUid) {
  IncrementCommandTagNumber();

  nsCString escapedDestination;
  CreateEscapedMailboxName(destinationMailbox, escapedDestination);

  // turn messageList back into key array and then back into a message id list,
  // but use the flag state to handle ranges correctly.
  nsCString messageIdList;
  nsTArray<nsMsgKey> msgKeys;
  if (idsAreUid) ParseUidString(messageList, msgKeys);

  int32_t msgCountLeft = msgKeys.Length();
  uint32_t msgsHandled = 0;

  do {
    nsCString idString;

    uint32_t msgsToHandle = msgCountLeft;
    if (idsAreUid)
      AllocateImapUidString(msgKeys.Elements() + msgsHandled, msgsToHandle,
                            m_flagState, idString);
    else
      idString.Assign(messageList);

    msgsHandled += msgsToHandle;
    msgCountLeft -= msgsToHandle;

    IncrementCommandTagNumber();
    nsAutoCString protocolString(GetServerCommandTag());
    if (idsAreUid) protocolString.AppendLiteral(" uid");
    if (m_imapAction == nsIImapUrl::nsImapOnlineMove &&
        GetServerStateParser().GetCapabilityFlag() & kHasMoveCapability)
      protocolString.AppendLiteral(" move ");
    else
      protocolString.AppendLiteral(" copy ");

    protocolString.Append(idString);
    protocolString.AppendLiteral(" \"");
    protocolString.Append(escapedDestination);
    protocolString.AppendLiteral("\"" CRLF);

    nsresult rv = SendData(protocolString.get());
    if (NS_SUCCEEDED(rv)) ParseIMAPandCheckForNewMail(protocolString.get());
  } while (msgCountLeft > 0 && !DeathSignalReceived());
}

void nsImapProtocol::NthLevelChildList(const char* onlineMailboxPrefix,
                                       int32_t depth) {
  NS_ASSERTION(depth >= 0, "Oops ... depth must be equal or greater than 0");
  if (depth < 0) return;

  nsCString truncatedPrefix(onlineMailboxPrefix);
  char16_t slash = '/';
  if (truncatedPrefix.Last() == slash)
    truncatedPrefix.SetLength(truncatedPrefix.Length() - 1);

  nsAutoCString pattern(truncatedPrefix);
  nsAutoCString suffix;
  int count = 0;
  char separator = 0;
  m_runningUrl->GetOnlineSubDirSeparator(&separator);
  suffix.Assign(separator);
  suffix += '%';

  while (count < depth) {
    pattern += suffix;
    count++;
    MOZ_LOG(IMAP_DC, LogLevel::Debug,
            ("NthLevelChildList: list pattern=%s", pattern.get()));
    List(pattern.get(), false);
  }
}

/**
 * ProcessAuthenticatedStateURL() is a helper for ProcessCurrentURL() which
 * handles running URLs which require the connection to be in the
 * Authenticated state.
 */
void nsImapProtocol::ProcessAuthenticatedStateURL() {
  nsImapAction imapAction;
  nsCString sourceMailbox;
  m_runningUrl->GetImapAction(&imapAction);
  // See nsIImapUrl.idl for imapAction values.
  MOZ_LOG(IMAP, LogLevel::Debug,
          ("ProcessAuthenticatedStateURL [this=%p], imapAction = 0x%" PRIx32,
           this, imapAction));

  // switch off of the imap url action and take an appropriate action
  switch (imapAction) {
    case nsIImapUrl::nsImapLsubFolders:
      OnLSubFolders();
      break;
    case nsIImapUrl::nsImapAppendMsgFromFile:
      OnAppendMsgFromFile();
      break;
    case nsIImapUrl::nsImapDiscoverAllBoxesUrl:
      NS_ASSERTION(!GetSubscribingNow(),
                   "Oops ... should not get here from subscribe UI");
      DiscoverMailboxList();
      break;
    case nsIImapUrl::nsImapDiscoverAllAndSubscribedBoxesUrl:
      DiscoverAllAndSubscribedBoxes();
      break;
    case nsIImapUrl::nsImapCreateFolder:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnCreateFolder(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapEnsureExistsFolder:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnEnsureExistsFolder(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapDiscoverChildrenUrl: {
      nsCString canonicalParent;
      m_runningUrl->CreateServerSourceFolderPathString(canonicalParent);
      if (!canonicalParent.IsEmpty()) {
        NthLevelChildList(canonicalParent.get(), 2);
      }
      break;
    }
    case nsIImapUrl::nsImapSubscribe:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnSubscribe(sourceMailbox.get());  // used to be called subscribe

      if (GetServerStateParser().LastCommandSuccessful()) {
        bool shouldList;
        // if url is an external click url, then we should list the folder
        // after subscribing to it, so we can select it.
        m_runningUrl->GetExternalLinkUrl(&shouldList);
        if (shouldList) OnListFolder(sourceMailbox.get(), true);
      }
      break;
    case nsIImapUrl::nsImapUnsubscribe:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnUnsubscribe(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapRefreshACL:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      RefreshACLForFolder(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapRefreshAllACLs:
      OnRefreshAllACLs();
      break;
    case nsIImapUrl::nsImapListFolder:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnListFolder(sourceMailbox.get(), false);
      break;
    case nsIImapUrl::nsImapFolderStatus:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnStatusForFolder(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapRefreshFolderUrls:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      XMailboxInfo(sourceMailbox.get());
      if (GetServerStateParser().LastCommandSuccessful())
        SetFolderAdminUrl(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapDeleteFolder:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnDeleteFolder(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapRenameFolder:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnRenameFolder(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapMoveFolderHierarchy:
      sourceMailbox = OnCreateServerSourceFolderPathString();
      OnMoveFolderHierarchy(sourceMailbox.get());
      break;
    case nsIImapUrl::nsImapVerifylogon:
      break;
    default:
      break;
  }
}

void nsImapProtocol::ProcessAfterAuthenticated() {
  // if we're a netscape server, and we haven't got the admin url, get it
  bool hasAdminUrl = true;

  // If a capability response didn't occur during authentication, request
  // the capabilities again to ensure the full capability set is known.
  if (!m_capabilityResponseOccurred) Capability();

  if (NS_SUCCEEDED(m_hostSessionList->GetHostHasAdminURL(GetImapServerKey(),
                                                         hasAdminUrl)) &&
      !hasAdminUrl) {
    if (GetServerStateParser().ServerHasServerInfo()) {
      XServerInfo();
      if (GetServerStateParser().LastCommandSuccessful() && m_imapServerSink) {
        m_imapServerSink->SetMailServerUrls(
            GetServerStateParser().GetMailAccountUrl(),
            GetServerStateParser().GetManageListsUrl(),
            GetServerStateParser().GetManageFiltersUrl());
        // we've tried to ask for it, so don't try again this session.
        m_hostSessionList->SetHostHasAdminURL(GetImapServerKey(), true);
      }
    } else if (GetServerStateParser().ServerIsNetscape3xServer()) {
      Netscape();
      if (GetServerStateParser().LastCommandSuccessful() && m_imapServerSink)
        m_imapServerSink->SetMailServerUrls(
            GetServerStateParser().GetMailAccountUrl(), EmptyCString(),
            EmptyCString());
    }
  }

  if (GetServerStateParser().ServerHasNamespaceCapability()) {
    bool nameSpacesOverridable = false;
    bool haveNameSpacesForHost = false;
    m_hostSessionList->GetNamespacesOverridableForHost(GetImapServerKey(),
                                                       nameSpacesOverridable);
    m_hostSessionList->GetGotNamespacesForHost(GetImapServerKey(),
                                               haveNameSpacesForHost);

    // mscott: VERIFY THIS CLAUSE!!!!!!!
    if (nameSpacesOverridable && !haveNameSpacesForHost) Namespace();
  }

  // If the server supports compression, turn it on now.
  // Choosing this spot (after login has finished) because
  // many proxies (e.g. perdition, nginx) talk IMAP to the
  // client until login is finished, then hand off to the
  // backend.  If we enable compression early the proxy
  // will be confused.
  if (UseCompressDeflate()) StartCompressDeflate();

  if ((GetServerStateParser().GetCapabilityFlag() & kHasEnableCapability) &&
      UseCondStore())
    EnableCondStore();

  if ((GetServerStateParser().GetCapabilityFlag() & kHasIDCapability) &&
      m_sendID) {
    ID();
    if (m_imapServerSink && !GetServerStateParser().GetServerID().IsEmpty())
      m_imapServerSink->SetServerID(GetServerStateParser().GetServerID());
  }

  bool utf8AcceptAllowed = m_allowUTF8Accept;
  m_allowUTF8Accept = false;
  if (utf8AcceptAllowed &&
      ((GetServerStateParser().GetCapabilityFlag() &
        (kHasEnableCapability | kHasUTF8AcceptCapability)) ==
       (kHasEnableCapability | kHasUTF8AcceptCapability))) {
    if (m_imapServerSink) {
      EnableUTF8Accept();
      m_allowUTF8Accept = GetServerStateParser().fUtf8AcceptEnabled;
      // m_allowUTF8Accept affects imap append handling. See
      // UploadMessageFromFile().
      m_imapServerSink->SetServerUtf8AcceptEnabled(m_allowUTF8Accept);
      GetServerStateParser().fUtf8AcceptEnabled = false;
    } else {
      NS_WARNING("UTF8=ACCEPT not enabled due to null m_imapServerSink");
    }
  }
}

void nsImapProtocol::SetupMessageFlagsString(nsCString& flagString,
                                             imapMessageFlagsType flags,
                                             uint16_t userFlags) {
  if (flags & kImapMsgSeenFlag) flagString.AppendLiteral("\\Seen ");
  if (flags & kImapMsgAnsweredFlag) flagString.AppendLiteral("\\Answered ");
  if (flags & kImapMsgFlaggedFlag) flagString.AppendLiteral("\\Flagged ");
  if (flags & kImapMsgDeletedFlag) flagString.AppendLiteral("\\Deleted ");
  if (flags & kImapMsgDraftFlag) flagString.AppendLiteral("\\Draft ");
  if (flags & kImapMsgRecentFlag) flagString.AppendLiteral("\\Recent ");
  if ((flags & kImapMsgForwardedFlag) &&
      (userFlags & kImapMsgSupportForwardedFlag))
    flagString.AppendLiteral("$Forwarded ");  // Not always available
  if ((flags & kImapMsgMDNSentFlag) && (userFlags & kImapMsgSupportMDNSentFlag))
    flagString.AppendLiteral("$MDNSent ");  // Not always available

  // eat the last space
  if (!flagString.IsEmpty()) flagString.SetLength(flagString.Length() - 1);
}

void nsImapProtocol::ProcessStoreFlags(const nsCString& messageIdsString,
                                       bool idsAreUids,
                                       imapMessageFlagsType flags,
                                       bool addFlags) {
  nsCString flagString;

  uint16_t userFlags = GetServerStateParser().SupportsUserFlags();
  uint16_t settableFlags = GetServerStateParser().SettablePermanentFlags();

  if (!addFlags && (flags & userFlags) && !(flags & settableFlags)) {
    if (m_runningUrl)
      m_runningUrl->SetExtraStatus(nsIImapUrl::ImapStatusFlagsNotSettable);
    return;  // if cannot set any of the flags bail out
  }

  if (addFlags)
    flagString = "+Flags (";
  else
    flagString = "-Flags (";

  if (flags & kImapMsgSeenFlag && kImapMsgSeenFlag & settableFlags)
    flagString.AppendLiteral("\\Seen ");
  if (flags & kImapMsgAnsweredFlag && kImapMsgAnsweredFlag & settableFlags)
    flagString.AppendLiteral("\\Answered ");
  if (flags & kImapMsgFlaggedFlag && kImapMsgFlaggedFlag & settableFlags)
    flagString.AppendLiteral("\\Flagged ");
  if (flags & kImapMsgDeletedFlag && kImapMsgDeletedFlag & settableFlags)
    flagString.AppendLiteral("\\Deleted ");
  if (flags & kImapMsgDraftFlag && kImapMsgDraftFlag & settableFlags)
    flagString.AppendLiteral("\\Draft ");
  if (flags & kImapMsgForwardedFlag && kImapMsgSupportForwardedFlag & userFlags)
    flagString.AppendLiteral("$Forwarded ");  // if supported
  if (flags & kImapMsgMDNSentFlag && kImapMsgSupportMDNSentFlag & userFlags)
    flagString.AppendLiteral("$MDNSent ");  // if supported

  if (flagString.Length() > 8)  // if more than "+Flags ("
  {
    // replace the final space with ')'
    flagString.SetCharAt(')', flagString.Length() - 1);

    Store(messageIdsString, flagString.get(), idsAreUids);
    if (m_runningUrl && idsAreUids) {
      nsCString messageIdString;
      m_runningUrl->GetListOfMessageIds(messageIdString);
      nsTArray<nsMsgKey> msgKeys;
      ParseUidString(messageIdString.get(), msgKeys);

      int32_t msgCount = msgKeys.Length();
      for (int32_t i = 0; i < msgCount; i++) {
        bool found;
        imapMessageFlagsType resultFlags;
        // check if the flags were added/removed, and if the uid really exists.
        nsresult rv = GetFlagsForUID(msgKeys[i], &found, &resultFlags, nullptr);
        if (NS_FAILED(rv) || !found ||
            (addFlags && ((flags & resultFlags) != flags)) ||
            (!addFlags && ((flags & resultFlags) != 0))) {
          m_runningUrl->SetExtraStatus(nsIImapUrl::ImapStatusFlagChangeFailed);
          break;
        }
      }
    }
  }
}

/**
 * This will cause all messages marked deleted to be expunged with no untagged
 * response so it can cause unexpected data loss if used improperly.
 */
void nsImapProtocol::ImapClose(bool shuttingDown /* = false */,
                               bool waitForResponse /* = true */) {
  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());
  command.AppendLiteral(" close" CRLF);

  if (!shuttingDown) ProgressEventFunctionUsingName("imapStatusCloseMailbox");

  GetServerStateParser().ResetFlagInfo();

  nsresult rv = SendData(command.get());
  if (m_transport && shuttingDown)
    m_transport->SetTimeout(nsISocketTransport::TIMEOUT_READ_WRITE, 5);

  if (NS_SUCCEEDED(rv) && waitForResponse) ParseIMAPandCheckForNewMail();
}

void nsImapProtocol::Check() {
  // ProgressUpdateEvent("Checking mailbox...");

  IncrementCommandTagNumber();

  nsCString command(GetServerCommandTag());
  command.AppendLiteral(" check" CRLF);

  nsresult rv = SendData(command.get());
  if (NS_SUCCEEDED(rv)) {
    m_flagChangeCount = 0;
    m_lastCheckTime = PR_Now();
    ParseIMAPandCheckForNewMail();
  }
}

nsresult nsImapProtocol::GetMsgWindow(nsIMsgWindow** aMsgWindow) {
  nsresult rv;
  *aMsgWindow = nullptr;
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
      do_QueryInterface(m_runningUrl, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!m_imapProtocolSink) return NS_ERROR_FAILURE;
  return m_imapProtocolSink->GetUrlWindow(mailnewsUrl, aMsgWindow);
}

/**
 * Get password from RAM, disk (password manager) or user (dialog)
 * @return NS_MSG_PASSWORD_PROMPT_CANCELLED
 *    (which is NS_SUCCEEDED!) when user cancelled
 *    NS_FAILED(rv) for other errors
 */
nsresult nsImapProtocol::GetPassword(nsString& password,
                                     bool newPasswordRequested) {
  // we are in the imap thread so *NEVER* try to extract the password with UI
  NS_ENSURE_TRUE(m_imapServerSink, NS_ERROR_NULL_POINTER);
  NS_ENSURE_TRUE(m_server, NS_ERROR_NULL_POINTER);
  nsresult rv;

  password = nsString();
  // Get the password already stored in mem
  rv = m_imapServerSink->GetServerPassword(password);
  if (NS_FAILED(rv) || password.IsEmpty()) {
    // First see if there's an associated window. We don't want to produce a
    // password prompt if there is no window, e.g., during biff.
    AutoProxyReleaseMsgWindow msgWindow;
    GetMsgWindow(getter_AddRefs(msgWindow));
    if (msgWindow) {
      m_passwordStatus = NS_OK;
      m_passwordObtained = false;

      // Get the password from pw manager (harddisk) or user (dialog)
      rv = m_imapServerSink->AsyncGetPassword(this, newPasswordRequested,
                                              password);

      if (NS_SUCCEEDED(rv)) {
        while (password.IsEmpty()) {
          bool shuttingDown = false;
          (void)m_imapServerSink->GetServerShuttingDown(&shuttingDown);
          if (shuttingDown) {
            // Note: If we fix bug 1783573 this check could be ditched.
            rv = NS_ERROR_FAILURE;
            break;
          }

          ReentrantMonitorAutoEnter mon(m_passwordReadyMonitor);
          if (!m_passwordObtained && !NS_FAILED(m_passwordStatus) &&
              m_passwordStatus != NS_MSG_PASSWORD_PROMPT_CANCELLED &&
              !DeathSignalReceived()) {
            mon.Wait(PR_MillisecondsToInterval(1000));
          }

          if (NS_FAILED(m_passwordStatus) ||
              m_passwordStatus == NS_MSG_PASSWORD_PROMPT_CANCELLED) {
            rv = m_passwordStatus;
            break;
          }

          if (DeathSignalReceived()) {
            rv = NS_ERROR_FAILURE;
            break;
          }

          if (m_passwordObtained) {
            rv = m_passwordStatus;
            password = m_password;
            break;
          }
        }  // end while
      }
    } else {
      // If no msgWindow (i.e., unattended operation like biff, filtering or
      // autosync) try to get the password directly from login mgr. If it's not
      // there, will return NS_ERROR_NOT_AVAILABLE and the connection will fail
      // with only the IMAP log message: `password prompt failed or user
      // canceled it'. No password prompt occurs.
      rv = m_imapServerSink->SyncGetPassword(password);
    }
  }
  if (!password.IsEmpty()) m_lastPasswordSent = password;
  return rv;
}

NS_IMETHODIMP nsImapProtocol::OnPromptStartAsync(
    nsIMsgAsyncPromptCallback* aCallback) {
  bool result = false;
  OnPromptStart(&result);
  return aCallback->OnAuthResult(result);
}

// This is called from the UI thread.
NS_IMETHODIMP
nsImapProtocol::OnPromptStart(bool* aResult) {
  nsresult rv;
  nsCOMPtr<nsIImapIncomingServer> imapServer = do_QueryReferent(m_server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgWindow> msgWindow;

  *aResult = false;
  GetMsgWindow(getter_AddRefs(msgWindow));
  nsString password = m_lastPasswordSent;
  rv = imapServer->PromptPassword(msgWindow, password);

  ReentrantMonitorAutoEnter passwordMon(m_passwordReadyMonitor);

  m_password = password;
  m_passwordStatus = rv;
  if (!m_password.IsEmpty()) *aResult = true;

  // Notify the imap thread that we have a password.
  m_passwordObtained = true;
  passwordMon.Notify();
  return rv;
}

NS_IMETHODIMP
nsImapProtocol::OnPromptAuthAvailable() {
  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> imapServer = do_QueryReferent(m_server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsresult status = imapServer->GetPassword(m_password);

  ReentrantMonitorAutoEnter passwordMon(m_passwordReadyMonitor);

  m_passwordStatus = status;
  // Notify the imap thread that we have a password.
  m_passwordObtained = true;
  passwordMon.Notify();
  return m_passwordStatus;
}

NS_IMETHODIMP
nsImapProtocol::OnPromptCanceled() {
  // A prompt was cancelled, so notify the imap thread.
  ReentrantMonitorAutoEnter passwordMon(m_passwordReadyMonitor);
  m_passwordStatus = NS_MSG_PASSWORD_PROMPT_CANCELLED;
  passwordMon.Notify();
  return NS_OK;
}

// Called when capability response is parsed.
void nsImapProtocol::SetCapabilityResponseOccurred() {
  m_capabilityResponseOccurred = true;
}

bool nsImapProtocol::TryToLogon() {
  MOZ_LOG(IMAP, LogLevel::Debug, ("Try to log in"));
  NS_ENSURE_TRUE(m_imapServerSink, false);
  bool loginSucceeded = false;
  bool skipLoop = false;
  nsAutoString password;
  nsAutoCString userName;

  // If remains false when authentication is complete it means that a
  // capability response didn't occur within the authentication response so
  // capabilities will be requested explicitly.
  m_capabilityResponseOccurred = false;

  nsresult rv = ChooseAuthMethod();
  if (NS_FAILED(rv))  // all methods failed
  {
    // are there any matching login schemes at all?
    if (!(GetServerStateParser().GetCapabilityFlag() & m_prefAuthMethods)) {
      // Pref doesn't match server. Now, find an appropriate error msg.

      // pref has plaintext pw & server claims to support encrypted pw
      if (m_prefAuthMethods ==
              (kHasAuthOldLoginCapability | kHasAuthLoginCapability |
               kHasAuthPlainCapability) &&
          GetServerStateParser().GetCapabilityFlag() & kHasCRAMCapability)
        // tell user to change to encrypted pw
        AlertUserEventUsingName("imapAuthChangePlainToEncrypt");
      // pref has encrypted pw & server claims to support plaintext pw
      else if (m_prefAuthMethods == kHasCRAMCapability &&
               GetServerStateParser().GetCapabilityFlag() &
                   (kHasAuthOldLoginCapability | kHasAuthLoginCapability |
                    kHasAuthPlainCapability)) {
        // have SSL
        if (m_socketType == nsMsgSocketType::SSL ||
            m_socketType == nsMsgSocketType::alwaysSTARTTLS)
          // tell user to change to plaintext pw
          AlertUserEventUsingName("imapAuthChangeEncryptToPlainSSL");
        else
          // tell user to change to plaintext pw, with big warning
          AlertUserEventUsingName("imapAuthChangeEncryptToPlainNoSSL");
      } else
        // just "change auth method"
        AlertUserEventUsingName("imapAuthMechNotSupported");

      skipLoop = true;
    } else {
      // try to reset failed methods and try them again
      ResetAuthMethods();
      rv = ChooseAuthMethod();
      if (NS_FAILED(rv))  // all methods failed
      {
        MOZ_LOG(IMAP, LogLevel::Error,
                ("huch? there are auth methods, and we reset failed ones, but "
                 "ChooseAuthMethod still fails."));
        return false;
      }
    }
  }

  // Check the uri host for localhost indicators to see if we
  // should bypass the SSL check for clientid.
  // Unfortunately we cannot call IsOriginPotentiallyTrustworthy
  // here because it can only be called from the main thread.
  bool isLocalhostConnection = false;
  if (m_mockChannel) {
    nsCOMPtr<nsIURI> uri;
    m_mockChannel->GetURI(getter_AddRefs(uri));
    if (uri) {
      nsCString uriHost;
      uri->GetHost(uriHost);
      if (uriHost.Equals("127.0.0.1") || uriHost.Equals("::1") ||
          uriHost.Equals("localhost")) {
        isLocalhostConnection = true;
      }
    }
  }

  // Whether our connection can be considered 'secure' and whether
  // we should allow the CLIENTID to be sent over this channel.
  bool isSecureConnection =
      (m_connectionType.EqualsLiteral("starttls") ||
       m_connectionType.EqualsLiteral("ssl") || isLocalhostConnection);

  // Before running the ClientID command we check for clientid
  // support by checking the server capability flags for the
  // flag kHasClientIDCapability.
  // We check that the m_clientId string is not empty, and
  // we ensure the connection can be considered secure.
  if ((GetServerStateParser().GetCapabilityFlag() & kHasClientIDCapability) &&
      !m_clientId.IsEmpty() && isSecureConnection) {
    rv = ClientID();
    if (NS_FAILED(rv)) {
      MOZ_LOG(IMAP, LogLevel::Error,
              ("TryToLogon: Could not issue CLIENTID command"));
      skipLoop = true;
    }
  }

  // Get username, either the stored one or from user
  rv = m_imapServerSink->GetLoginUsername(userName);
  if (NS_FAILED(rv) || userName.IsEmpty()) {
    // The user hit "Cancel" on the dialog box
    skipLoop = true;
  }

  // clang-format off
  /*
   * Login can fail for various reasons:
   * 1. Server claims to support GSSAPI, but it really doesn't.
   *    Or the client doesn't support GSSAPI, or is not logged in yet.
   *    (GSSAPI is a mechanism without password in apps).
   * 2. Server claims to support CRAM-MD5, but it's broken and will fail despite correct password.
   * 2.1. Some servers say they support CRAM but are so badly broken that trying it causes
   *    all subsequent login attempts to fail during this connection (bug 231303).
   *    So we use CRAM/NTLM/MSN only if enabled in prefs.
   *    Update: if it affects only some ISPs, we can maybe use the ISP DB
   *    and disable CRAM specifically for these.
   * 3. Prefs are set to require auth methods which the server doesn't support
   *     (per CAPS or we tried and they failed).
   * 4. User provided wrong password.
   * 5. We tried too often and the server shut us down, so even a correct attempt
   *    will now (currently) fail.
   * The above problems may overlap, e.g. 3. with 1. and 2., and we can't differentiate
   * between 2. and 4., which is really unfortunate.
   */
  // clang-format on

  bool newPasswordRequested = false;
  // remember the msgWindow before we start trying to logon, because if the
  // server drops the connection on errors, TellThreadToDie will null out the
  // protocolsink and we won't be able to get the msgWindow.
  AutoProxyReleaseMsgWindow msgWindow;
  GetMsgWindow(getter_AddRefs(msgWindow));

  // This loops over 1) auth methods (only one per loop) and 2) password tries
  // (with UI)
  while (!loginSucceeded && !skipLoop && !DeathSignalReceived()) {
    // Get password
    if (m_currentAuthMethod !=
            kHasAuthGssApiCapability &&  // GSSAPI uses no pw in apps
        m_currentAuthMethod != kHasAuthExternalCapability &&
        m_currentAuthMethod != kHasXOAuth2Capability &&
        m_currentAuthMethod != kHasAuthNoneCapability) {
      rv = GetPassword(password, newPasswordRequested);
      newPasswordRequested = false;
      if (rv == NS_MSG_PASSWORD_PROMPT_CANCELLED || NS_FAILED(rv)) {
        MOZ_LOG(IMAP, LogLevel::Error,
                ("IMAP: password prompt failed or user canceled it"));
        break;
      }
      MOZ_LOG(IMAP, LogLevel::Debug, ("got new password"));
    }

    bool lastReportingErrors = GetServerStateParser().GetReportingErrors();
    GetServerStateParser().SetReportingErrors(
        false);  // turn off errors - we'll put up our own.

    rv = AuthLogin(userName.get(), password, m_currentAuthMethod);

    GetServerStateParser().SetReportingErrors(
        lastReportingErrors);  // restore error reports
    loginSucceeded = NS_SUCCEEDED(rv);

    if (!loginSucceeded) {
      // If server gave reason for authentication failure as [UNAVAILABLE]
      // then we skip authentication retries, etc. The user will be notified by
      // pop-up with the reason, provided by the server, as to why it's
      // unavailable, e.g., too many connection to the server.
      if (GetServerStateParser().fServerUnavailable) break;

      MOZ_LOG(IMAP, LogLevel::Debug, ("authlogin failed"));
      MarkAuthMethodAsFailed(m_currentAuthMethod);
      rv = ChooseAuthMethod();  // change m_currentAuthMethod to try other one
                                // next round

      if (NS_FAILED(rv))  // all methods failed
      {
        if (m_prefAuthMethods == kHasAuthGssApiCapability) {
          // GSSAPI failed, and it's the only available method,
          // and it's password-less, so nothing left to do.
          AlertUserEventUsingName("imapAuthGssapiFailed");
          break;
        }

        if (m_prefAuthMethods & kHasXOAuth2Capability) {
          // OAuth2 failed. Entering password does not help.
          AlertUserEventUsingName("imapOAuth2Error");
          break;
        }

        // The reason that we failed might be a wrong password, so
        // ask user what to do
        MOZ_LOG(IMAP, LogLevel::Warning,
                ("IMAP: ask user what to do (after login failed): new "
                 "password, retry, cancel"));
        if (!m_imapServerSink) break;
        // if there's no msg window, don't forget the password
        if (!msgWindow) break;
        int32_t buttonPressed = 1;
        rv = m_imapServerSink->PromptLoginFailed(msgWindow, &buttonPressed);
        if (NS_FAILED(rv)) break;
        if (buttonPressed == 2)  // 'New password' button
        {
          MOZ_LOG(IMAP, LogLevel::Warning, ("new password button pressed."));
          // Forget the current password
          password.Truncate();
          m_hostSessionList->SetPasswordForHost(GetImapServerKey(),
                                                EmptyString());
          m_imapServerSink->ForgetPassword();
          m_password.Truncate();
          MOZ_LOG(IMAP, LogLevel::Warning, ("password reset (nulled)"));
          newPasswordRequested = true;
          // Will call GetPassword() in beginning of next loop

          // Try all possible auth methods again with the new password.
          ResetAuthMethods();
        } else if (buttonPressed == 0)  // Retry button
        {
          MOZ_LOG(IMAP, LogLevel::Warning, ("retry button pressed"));
          // Try all possible auth methods again
          ResetAuthMethods();
        } else if (buttonPressed == 1)  // Cancel button
        {
          MOZ_LOG(IMAP, LogLevel::Warning, ("cancel button pressed"));
          break;  // Abort quickly
        }

        // TODO what is this for? When does it get set to != unknown again?
        m_currentBiffState = nsIMsgFolder::nsMsgBiffState_Unknown;
        SendSetBiffIndicatorEvent(m_currentBiffState);
      }  // all methods failed
    }  // login failed
  }  // while

  if (loginSucceeded) {
    MOZ_LOG(IMAP, LogLevel::Debug, ("login succeeded"));
    bool passwordAlreadyVerified;
    m_hostSessionList->SetPasswordForHost(GetImapServerKey(), password);
    rv = m_hostSessionList->GetPasswordVerifiedOnline(GetImapServerKey(),
                                                      passwordAlreadyVerified);
    if (NS_SUCCEEDED(rv) && !passwordAlreadyVerified) {
      // First successful login for this server/host during this session.
      m_hostSessionList->SetPasswordVerifiedOnline(GetImapServerKey());
    }

    bool imapPasswordIsNew = !passwordAlreadyVerified;
    if (imapPasswordIsNew) {
      if (m_currentBiffState == nsIMsgFolder::nsMsgBiffState_Unknown) {
        m_currentBiffState = nsIMsgFolder::nsMsgBiffState_NoMail;
        SendSetBiffIndicatorEvent(m_currentBiffState);
      }
      m_imapServerSink->SetUserAuthenticated(true);
    }

    nsImapAction imapAction;
    m_runningUrl->GetImapAction(&imapAction);
    // We don't want to do any more processing if we're just
    // verifying the ability to logon because it can leave us in
    // a half-constructed state.
    if (imapAction != nsIImapUrl::nsImapVerifylogon)
      ProcessAfterAuthenticated();
  } else  // login failed
  {
    MOZ_LOG(IMAP, LogLevel::Error, ("login failed entirely"));
    m_currentBiffState = nsIMsgFolder::nsMsgBiffState_Unknown;
    SendSetBiffIndicatorEvent(m_currentBiffState);
    HandleCurrentUrlError();
    SetConnectionStatus(NS_ERROR_FAILURE);  // stop netlib
  }

  return loginSucceeded;
}

void nsImapProtocol::UpdateFolderQuotaData(nsImapQuotaAction aAction,
                                           nsCString& aQuotaRoot,
                                           uint64_t aUsed, uint64_t aMax) {
  NS_ASSERTION(m_imapMailFolderSink, "m_imapMailFolderSink is null!");

  m_imapMailFolderSink->SetFolderQuotaData(aAction, aQuotaRoot, aUsed, aMax);
}

void nsImapProtocol::GetQuotaDataIfSupported(const char* aBoxName) {
  // If server doesn't have quota support, don't do anything
  if (!(GetServerStateParser().GetCapabilityFlag() & kQuotaCapability)) return;

  nsCString escapedName;
  CreateEscapedMailboxName(aBoxName, escapedName);

  IncrementCommandTagNumber();

  nsAutoCString quotacommand(GetServerCommandTag());
  quotacommand.AppendLiteral(" getquotaroot \"");
  quotacommand.Append(escapedName);
  quotacommand.AppendLiteral("\"" CRLF);

  NS_ASSERTION(m_imapMailFolderSink, "m_imapMailFolderSink is null!");
  if (m_imapMailFolderSink)
    m_imapMailFolderSink->SetFolderQuotaCommandIssued(true);

  nsresult quotarv = SendData(quotacommand.get());
  if (NS_SUCCEEDED(quotarv))
    ParseIMAPandCheckForNewMail(nullptr, true);  // don't display errors.
}

bool nsImapProtocol::GetDeleteIsMoveToTrash() {
  bool rv = false;
  NS_ASSERTION(m_hostSessionList, "fatal... null host session list");
  if (m_hostSessionList)
    m_hostSessionList->GetDeleteIsMoveToTrashForHost(GetImapServerKey(), rv);
  return rv;
}

bool nsImapProtocol::GetShowDeletedMessages() {
  bool rv = false;
  if (m_hostSessionList)
    m_hostSessionList->GetShowDeletedMessagesForHost(GetImapServerKey(), rv);
  return rv;
}

bool nsImapProtocol::CheckNeeded() {
  if (m_flagChangeCount >= kFlagChangesBeforeCheck) return true;

  int32_t deltaInSeconds;

  PRTime2Seconds(PR_Now() - m_lastCheckTime, &deltaInSeconds);

  return (deltaInSeconds >= kMaxSecondsBeforeCheck);
}

bool nsImapProtocol::UseCondStore() {
  // Check that the server is capable of cond store, and the user
  // hasn't disabled the use of constore for this server.
  return m_useCondStore &&
         GetServerStateParser().GetCapabilityFlag() & kHasCondStoreCapability &&
         GetServerStateParser().fUseModSeq;
}

bool nsImapProtocol::UseCompressDeflate() {
  // Check that the server is capable of compression, and the user
  // hasn't disabled the use of compression for this server.
  return m_useCompressDeflate && GetServerStateParser().GetCapabilityFlag() &
                                     kHasCompressDeflateCapability;
}

//////////////////////////////////////////////////////////////////////////////////////////////
// The following is the implementation of nsImapMockChannel and an intermediary
// imap steam listener. The stream listener is used to make a clean binding
// between the imap mock channel and the memory cache channel (if we are reading
// from the cache)
// Used by both offline storage "cache" and by the system cache called "cache2".
//////////////////////////////////////////////////////////////////////////////////////////////

// WARNING: the cache stream listener is intended to be accessed from the UI
// thread! it will NOT create another proxy for the stream listener that gets
// passed in...
class nsImapCacheStreamListener : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  nsImapCacheStreamListener();

  nsresult Init(nsIStreamListener* aStreamListener,
                nsIImapMockChannel* aMockChannelToUse, bool cache2 = false);

 protected:
  virtual ~nsImapCacheStreamListener();
  nsCOMPtr<nsIImapMockChannel> mChannelToUse;
  nsCOMPtr<nsIStreamListener> mListener;
  bool mCache2;    // Initialized for cache2 usage
  bool mStarting;  // Used with cache2. Indicates 1st data segment is read.

 private:
  static bool mGoodCache2;
  static const uint32_t kPeekBufSize;
  static nsresult Peeker(nsIInputStream* aInStr, void* aClosure,
                         const char* aBuffer, uint32_t aOffset, uint32_t aCount,
                         uint32_t* aCountWritten);
};

NS_IMPL_ADDREF(nsImapCacheStreamListener)
NS_IMPL_RELEASE(nsImapCacheStreamListener)

NS_INTERFACE_MAP_BEGIN(nsImapCacheStreamListener)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIStreamListener)
  NS_INTERFACE_MAP_ENTRY(nsIRequestObserver)
  NS_INTERFACE_MAP_ENTRY(nsIStreamListener)
NS_INTERFACE_MAP_END

nsImapCacheStreamListener::nsImapCacheStreamListener() {
  mCache2 = false;
  mStarting = true;
}
bool nsImapCacheStreamListener::mGoodCache2 = false;
const uint32_t nsImapCacheStreamListener::kPeekBufSize = 101;

nsImapCacheStreamListener::~nsImapCacheStreamListener() { mStarting = true; }

nsresult nsImapCacheStreamListener::Init(nsIStreamListener* aStreamListener,
                                         nsIImapMockChannel* aMockChannelToUse,
                                         bool aCache2 /*false*/) {
  NS_ENSURE_ARG(aStreamListener);
  NS_ENSURE_ARG(aMockChannelToUse);

  MOZ_ASSERT(NS_IsMainThread());
  mChannelToUse = aMockChannelToUse;
  mListener = aStreamListener;
  mCache2 = aCache2;
  mStarting = true;

  return NS_OK;
}

NS_IMETHODIMP
nsImapCacheStreamListener::OnStartRequest(nsIRequest* request) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!mChannelToUse) {
    NS_ERROR("OnStartRequest called after OnStopRequest");
    return NS_ERROR_NULL_POINTER;
  }
  if (!mCache2 || !mStarting) {
    return mListener->OnStartRequest(mChannelToUse);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapCacheStreamListener::OnStopRequest(nsIRequest* request,
                                         nsresult aStatus) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!mListener) {
    NS_ERROR("OnStopRequest called twice");
    return NS_ERROR_NULL_POINTER;
  }

  nsresult rv = NS_OK;
  if (!mCache2 || !mStarting) {
    rv = mListener->OnStopRequest(mChannelToUse, aStatus);

    mListener = nullptr;
    mChannelToUse->Close();
    mChannelToUse = nullptr;
  }
  return rv;
}

/*
 * Called when cache2 is in effect on first available data segment returned
 * to check that cache entry looks like it it a valid email header. With
 * cache2 memory cache this could be done synchronously. But with disk cache
 * it can only be done asynchronously like this.
 * Note: If NS_OK returned, the peeked at bytes are consumed here and not passed
 * on to the listener so a special return value is used.
 */
nsresult nsImapCacheStreamListener::Peeker(nsIInputStream* aInStr,
                                           void* aClosure, const char* aBuffer,
                                           uint32_t aOffset, uint32_t aCount,
                                           uint32_t* aCountWritten) {
  char peekBuf[kPeekBufSize];
  aCount = aCount >= sizeof peekBuf ? sizeof peekBuf - 1 : aCount;
  memcpy(peekBuf, aBuffer, aCount);
  peekBuf[aCount] = '\0';  // Null terminate the starting header data.
  int32_t findPos = MsgFindCharInSet(nsDependentCString(peekBuf), ":\n\r", 0);
  // Check that the first line is a header line, i.e., with a ':' in it
  // Or that it begins with "From " because some IMAP servers allow that,
  // even though it's technically invalid.
  mGoodCache2 = ((findPos != -1 && peekBuf[findPos] == ':') ||
                 !(strncmp(peekBuf, "From ", 5)));
  return NS_BASE_STREAM_WOULD_BLOCK;  // So stream buffer not "consumed"
}

NS_IMETHODIMP
nsImapCacheStreamListener::OnDataAvailable(nsIRequest* request,
                                           nsIInputStream* aInStream,
                                           uint64_t aSourceOffset,
                                           uint32_t aCount) {
  MOZ_ASSERT(NS_IsMainThread());
  if (mCache2 && mStarting) {
    // Peeker() does check of leading bytes and sets mGoodCache2.
    uint32_t numRead;
    aInStream->ReadSegments(Peeker, nullptr, kPeekBufSize - 1, &numRead);
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("%s: mGoodCache2=%d(bool)", __func__, mGoodCache2));

    if (mGoodCache2) {
      // Do deferred setup of loadGroup and OnStartRequest and then forward
      // the verified first segment to the actual listener.
      mStarting = false;
      mListener->OnStartRequest(mChannelToUse);
    } else {
      MOZ_LOG(IMAPCache, LogLevel::Error,
              ("%s: cache entry bad so just read imap here", __func__));
      mChannelToUse->ReadFromImapConnection();
      return NS_ERROR_FAILURE;  // no more starts, one more stop occurs
    }
  }
  // Forward the segment to the actual listener.
  return mListener->OnDataAvailable(mChannelToUse, aInStream, aSourceOffset,
                                    aCount);
}

//
// ImapOfflineMsgStreamListener
//
// Listener wrapper, helper for ReadFromLocalCache().
// It knows which offline message it's streaming out, and if the operation
// fails it'll cause the local copy to be discarded (on the grounds that it's
// likely damaged) before letting the underlying listener proceed with it's
// own error handling.
// Works on the Main thread.
//
// ***NOTE*** (BenC 2024-11-12):
// We pass in the underlying channel to use as the request param to the
// underlying listener callbacks. I'm not totally sure this is required.
// It'd be nicer to just pass along whatever request that we're called
// with.
// But nsImapCacheStreamListener (which this is based upon) did it, so I'm
// cargo-culting it. For now.
//
class ImapOfflineMsgStreamListener : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS

  ImapOfflineMsgStreamListener() = delete;
  ImapOfflineMsgStreamListener(nsIMsgFolder* folder, nsMsgKey msgKey,
                               nsIStreamListener* listener,
                               nsIImapMockChannel* channel)
      : mFolder(folder),
        mMsgKey(msgKey),
        mAlreadyStarted(false),
        mListener(listener),
        mChannel(channel) {
    MOZ_RELEASE_ASSERT(mFolder);
    MOZ_RELEASE_ASSERT(mListener);
    MOZ_RELEASE_ASSERT(mChannel);
  }

  NS_IMETHOD OnStartRequest(nsIRequest* request) override {
    MOZ_RELEASE_ASSERT(NS_IsMainThread());
    MOZ_RELEASE_ASSERT(!mAlreadyStarted);
    mAlreadyStarted = true;
    return mListener->OnStartRequest(mChannel);
  }

  NS_IMETHOD OnDataAvailable(nsIRequest* request, nsIInputStream* stream,
                             uint64_t offset, uint32_t count) override {
    AUTO_PROFILER_LABEL("ImapOfflineMsgStreamListener::OnDataAvailable",
                        MAILNEWS);
    MOZ_RELEASE_ASSERT(NS_IsMainThread());
    return mListener->OnDataAvailable(mChannel, stream, offset, count);
  }

  NS_IMETHOD OnStopRequest(nsIRequest* request, nsresult status) override {
    AUTO_PROFILER_LABEL("ImapOfflineMsgStreamListener::OnStopRequest",
                        MAILNEWS);
    MOZ_RELEASE_ASSERT(NS_IsMainThread());
    nsresult rv = mListener->OnStopRequest(mChannel, status);
    mListener = nullptr;
    mChannel->Close();
    mChannel = nullptr;
    if (NS_FAILED(status) &&
        Preferences::GetBool("mail.discard_offline_msg_on_failure", true)) {
      // The streaming failed, discard the offline copy of the message.
      mFolder->DiscardOfflineMsg(mMsgKey);
    }
    return rv;
  }

 protected:
  virtual ~ImapOfflineMsgStreamListener() {}
  // Remember the folder and key of the offline message we're streaming out,
  // so if anything goes wrong we can discard it on the grounds that it's
  // damaged.
  nsCOMPtr<nsIMsgFolder> mFolder;
  nsMsgKey mMsgKey;
  bool mAlreadyStarted;
  nsCOMPtr<nsIStreamListener> mListener;  // The listener we're wrapping.
  nsCOMPtr<nsIImapMockChannel> mChannel;
};

NS_IMPL_ISUPPORTS(ImapOfflineMsgStreamListener, nsIStreamListener);

//
// nsImapMockChannel implementation
//

NS_IMPL_ISUPPORTS_INHERITED(nsImapMockChannel, nsHashPropertyBag,
                            nsIImapMockChannel, nsIMailChannel, nsIChannel,
                            nsIRequest, nsICacheEntryOpenCallback,
                            nsITransportEventSink, nsISupportsWeakReference)

nsImapMockChannel::nsImapMockChannel()
    : mSuspendedMonitor("nsImapMockChannel"), mSuspended(false) {
  m_cancelStatus = NS_OK;
  mLoadFlags = 0;
  mChannelClosed = false;
  mReadingFromCache = false;
  mContentLength = mozilla::dom::InternalResponse::UNKNOWN_BODY_SIZE;
  mContentDisposition = nsIChannel::DISPOSITION_INLINE;
  mWritingToCache = false;
}

nsImapMockChannel::~nsImapMockChannel() {
  // if we're offline, we may not get to close the channel correctly.
  // we need to do this to send the url state change notification in
  // the case of mem and disk cache reads.
  MOZ_DIAGNOSTIC_ASSERT(NS_IsMainThread(),
                        "should only access mock channel on ui thread");
  if (!mChannelClosed) Close();
}

nsresult nsImapMockChannel::NotifyStartEndReadFromCache(bool start) {
  nsresult rv = NS_OK;
  mReadingFromCache = start;
  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(m_url, &rv);
  nsCOMPtr<nsIImapProtocol> imapProtocol = do_QueryReferent(mProtocol);
  if (imapUrl) {
    nsCOMPtr<nsIImapMailFolderSink> folderSink;
    rv = imapUrl->GetImapMailFolderSink(getter_AddRefs(folderSink));
    if (folderSink) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(m_url);
      rv = folderSink->SetUrlState(nullptr /* we don't know the protocol */,
                                   mailUrl, start, false, m_cancelStatus);

      // Required for killing ImapProtocol thread
      if (NS_FAILED(m_cancelStatus) && imapProtocol)
        imapProtocol->TellThreadToDie(false);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMockChannel::Close() {
  if (mReadingFromCache)
    NotifyStartEndReadFromCache(false);
  else {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_url);
    if (mailnewsUrl) {
      nsCOMPtr<nsICacheEntry> cacheEntry;
      mailnewsUrl->GetMemCacheEntry(getter_AddRefs(cacheEntry));
      // remove the channel from the load group
      nsCOMPtr<nsILoadGroup> loadGroup;
      GetLoadGroup(getter_AddRefs(loadGroup));
      // if the mock channel wasn't initialized with a load group then
      // use our load group (they may differ)
      if (!loadGroup) mailnewsUrl->GetLoadGroup(getter_AddRefs(loadGroup));
      if (loadGroup)
        loadGroup->RemoveRequest((nsIRequest*)this, nullptr, NS_OK);
    }
  }

  m_channelListener = nullptr;
  mChannelClosed = true;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetProgressEventSink(
    nsIProgressEventSink** aProgressEventSink) {
  NS_IF_ADDREF(*aProgressEventSink = mProgressEventSink);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetProgressEventSink(
    nsIProgressEventSink* aProgressEventSink) {
  mProgressEventSink = aProgressEventSink;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetChannelListener(
    nsIStreamListener** aChannelListener) {
  NS_IF_ADDREF(*aChannelListener = m_channelListener);
  return NS_OK;
}

// now implement our mock implementation of the channel interface...we forward
// all calls to the real channel if we have one...otherwise we return something
// bogus...

NS_IMETHODIMP nsImapMockChannel::SetLoadGroup(nsILoadGroup* aLoadGroup) {
  m_loadGroup = aLoadGroup;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetLoadGroup(nsILoadGroup** aLoadGroup) {
  NS_IF_ADDREF(*aLoadGroup = m_loadGroup);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetTRRMode(nsIRequest::TRRMode* aTRRMode) {
  return GetTRRModeImpl(aTRRMode);
}

NS_IMETHODIMP nsImapMockChannel::SetTRRMode(nsIRequest::TRRMode aTRRMode) {
  return SetTRRModeImpl(aTRRMode);
}

NS_IMETHODIMP nsImapMockChannel::GetLoadInfo(nsILoadInfo** aLoadInfo) {
  NS_IF_ADDREF(*aLoadInfo = m_loadInfo);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetLoadInfo(nsILoadInfo* aLoadInfo) {
  m_loadInfo = aLoadInfo;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetOriginalURI(nsIURI** aURI) {
  // IMap does not seem to have the notion of an original URI :-(
  //  *aURI = m_originalUrl ? m_originalUrl : m_url;
  NS_IF_ADDREF(*aURI = m_url);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetOriginalURI(nsIURI* aURI) {
  // IMap does not seem to have the notion of an original URI :-(
  //    MOZ_ASSERT_UNREACHABLE("nsImapMockChannel::SetOriginalURI");
  //    return NS_ERROR_NOT_IMPLEMENTED;
  return NS_OK;  // ignore
}

NS_IMETHODIMP nsImapMockChannel::GetURI(nsIURI** aURI) {
  NS_IF_ADDREF(*aURI = m_url);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetURI(nsIURI* aURI) {
  m_url = aURI;
  if (m_url) {
    // if we don't have a progress event sink yet, get it from the url for
    // now...
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_url);
    if (mailnewsUrl && !mProgressEventSink) {
      nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;
      mailnewsUrl->GetStatusFeedback(getter_AddRefs(statusFeedback));
      mProgressEventSink = do_QueryInterface(statusFeedback);
    }
    // If this is a fetch URL and we can, get the message size from the message
    // header and set it to be the content length.
    // Note that for an attachment URL, this will set the content length to be
    // equal to the size of the entire message.
    nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(m_url));
    nsImapAction imapAction;
    imapUrl->GetImapAction(&imapAction);
    if (imapAction == nsIImapUrl::nsImapMsgFetch) {
      nsCOMPtr<nsIMsgMessageUrl> msgUrl(do_QueryInterface(m_url));
      if (msgUrl) {
        nsCOMPtr<nsIMsgDBHdr> msgHdr;
        // A failure to get a message header isn't an error
        msgUrl->GetMessageHeader(getter_AddRefs(msgHdr));
        if (msgHdr) {
          uint32_t messageSize;
          if (NS_SUCCEEDED(msgHdr->GetMessageSize(&messageSize)))
            SetContentLength(messageSize);
        }
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::Open(nsIInputStream** _retval) {
  nsCOMPtr<nsIStreamListener> listener;
  nsresult rv =
      nsContentSecurityManager::doContentSecurityCheck(this, listener);
  NS_ENSURE_SUCCESS(rv, rv);
  if (m_url) {
    nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(m_url, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    nsImapAction imapAction;
    imapUrl->GetImapAction(&imapAction);
    // If we're shutting down, and not running the kinds of urls we run at
    // shutdown, then this should fail because running urls during
    // shutdown will very likely fail and potentially hang.
    nsCOMPtr<nsIMsgAccountManager> accountMgr =
        mozilla::components::AccountManager::Service();
    bool shuttingDown = false;
    (void)accountMgr->GetShutdownInProgress(&shuttingDown);
    if (shuttingDown && imapAction != nsIImapUrl::nsImapExpungeFolder &&
        imapAction != nsIImapUrl::nsImapDeleteAllMsgs &&
        imapAction != nsIImapUrl::nsImapDeleteFolder)
      return NS_ERROR_FAILURE;
  }
  return NS_ImplementChannelOpen(this, _retval);
}

NS_IMETHODIMP
nsImapMockChannel::OnCacheEntryAvailable(nsICacheEntry* entry, bool aNew,
                                         nsresult status) {
  if (MOZ_LOG_TEST(IMAPCache, LogLevel::Debug)) {
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("%s: Create/write new cache entry=%s", __func__,
             aNew ? "true" : "false"));
    if (NS_SUCCEEDED(status)) {
      nsAutoCString key;
      entry->GetKey(key);
      MOZ_LOG(IMAPCache, LogLevel::Debug,
              ("%s: Cache entry key = |%s|", __func__, key.get()));
    }
  }

  // make sure we didn't close the channel before the async call back came in...
  // hmmm....if we had write access and we canceled this mock channel then I
  // wonder if we should be invalidating the cache entry before kicking out...
  if (mChannelClosed) {
    if (NS_SUCCEEDED(status)) {
      entry->AsyncDoom(nullptr);
    }
    return NS_OK;
  }

  if (!m_url) {
    // Something has gone terribly wrong.
    NS_WARNING("m_url is null in OnCacheEntryAvailable");
    return Cancel(NS_ERROR_UNEXPECTED);
  }

  do {
    // For "normal" read/write access we always see status == NS_OK here. aNew
    // indicates whether the cache entry is new and needs to be written, or not
    // new and can be read. If AsyncOpenURI() was called with access read-only,
    // status == NS_ERROR_CACHE_KEY_NOT_FOUND can be received here and we just
    // read the data directly from imap.
    if (NS_FAILED(status)) {
      MOZ_LOG(IMAPCache, LogLevel::Debug,
              ("%s: status parameter bad, preference "
               "browser.cache.memory.enable not true?",
               __func__));
      break;
    }

    nsresult rv = NS_OK;
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_url, &rv);
    mailnewsUrl->SetMemCacheEntry(entry);

    if (aNew) {
      // Writing cache so insert a "stream listener Tee" into the stream from
      // the imap fetch to direct the message into the cache and to our current
      // channel listener. But first get the size of the message to be fetched.
      // If message too big to fit in cache, the message just goes to the
      // stream listener. If unable to get the size, messageSize remains 0 so
      // assume it fits in cache, right or wrong.
      uint32_t messageSize = 0;
      nsCOMPtr<nsIMsgMessageUrl> msgUrl(do_QueryInterface(m_url));
      if (msgUrl) {
        nsCOMPtr<nsIMsgDBHdr> msgHdr;
        msgUrl->GetMessageHeader(getter_AddRefs(msgHdr));
        if (msgHdr) {
          msgHdr->GetMessageSize(&messageSize);
          MOZ_LOG(IMAPCache, LogLevel::Debug,
                  ("%s: messageSize=%d", __func__, messageSize));
        } else
          MOZ_LOG(IMAPCache, LogLevel::Debug,
                  ("%s: Can't get msgHdr", __func__));
      }
      // Check if message fits in a cache entry. If too big, or if unable to
      // create or initialize the tee or open the stream to the entry, will
      // fall thought and only do ReadFromImapConnection() called below and the
      // message will not be cached.
      bool tooBig =
          net::CacheObserver::EntryIsTooBig(messageSize, gUseDiskCache2);
      if (!tooBig) {
        // Message fits in cache. Create the tee.
        nsCOMPtr<nsIStreamListenerTee> tee =
            do_CreateInstance(NS_STREAMLISTENERTEE_CONTRACTID, &rv);
        if (NS_SUCCEEDED(rv)) {
          nsCOMPtr<nsIOutputStream> out;
          rv = entry->OpenOutputStream(0, -1, getter_AddRefs(out));
          if (NS_SUCCEEDED(rv)) {
            rv = tee->Init(m_channelListener, out, nullptr);
            m_channelListener = tee;
          } else
            NS_WARNING(
                "IMAP Protocol failed to open output stream to Necko cache");
        }
      }
      if (tooBig || NS_FAILED(rv)) {
        // Need this so next OpenCacheEntry() triggers OnCacheEntryAvailable()
        // since nothing was actually written to cache. Without this there is no
        // response to next OpenCacheEntry call.
        entry->AsyncDoom(nullptr);
        MOZ_LOG(IMAPCache, LogLevel::Debug,
                ("%s: Not writing to cache, msg too big or other errors",
                 __func__));
      } else {
        mWritingToCache = true;
        MOZ_LOG(IMAPCache, LogLevel::Debug,
                ("%s: Begin cache WRITE", __func__));
      }
    } else {
      // We are reading cache (!aNew)
      mWritingToCache = false;
      if (MOZ_LOG_TEST(IMAPCache, LogLevel::Debug)) {
        int64_t size = 0;
        rv = entry->GetDataSize(&size);
        if (rv == NS_ERROR_IN_PROGRESS)
          MOZ_LOG(IMAPCache, LogLevel::Debug,
                  ("%s: Concurrent cache READ, no size available", __func__));
        MOZ_LOG(IMAPCache, LogLevel::Debug,
                ("%s: Begin cache READ, size=%" PRIi64, __func__, size));
      }
      rv = ReadFromCache2(entry);
      if (NS_SUCCEEDED(rv)) {
        NotifyStartEndReadFromCache(true);
        return NS_OK;  // Return here since reading from the cache succeeded.
      }
      entry->AsyncDoom(nullptr);  // Doom entry if we failed to read from cache.
      mailnewsUrl->SetMemCacheEntry(
          nullptr);  // We aren't going to be reading from the cache.
    }
  } while (false);

  // If reading from the cache failed or if we are writing into the cache, or if
  // or message is too big for cache or other errors occur, do
  // ReadFromImapConnection to fetch message from imap server.
  if (!aNew)
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("%s: Cache READ failed so read from imap", __func__));
  return ReadFromImapConnection();
}

NS_IMETHODIMP
nsImapMockChannel::OnCacheEntryCheck(nsICacheEntry* entry, uint32_t* aResult) {
  *aResult = nsICacheEntryOpenCallback::ENTRY_WANTED;

  // Check concurrent read: We can't read concurrently since we don't know
  // that the entry will ever be written successfully. It may be aborted
  // due to a size limitation. If reading concurrently, the following function
  // will return NS_ERROR_IN_PROGRESS. Then we tell the cache to wait until
  // the write is finished.
  int64_t size = 0;
  nsresult rv = entry->GetDataSize(&size);
  if (rv == NS_ERROR_IN_PROGRESS) {
    *aResult = nsICacheEntryOpenCallback::RECHECK_AFTER_WRITE_FINISHED;
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("OnCacheEntryCheck(): Attempted cache write while reading, will "
             "try again"));
  }
  return NS_OK;
}

nsresult nsImapMockChannel::OpenCacheEntry() {
  nsresult rv;
  nsCOMPtr<nsICacheStorage> cache2Storage;
  nsCOMPtr<nsIImapService> imapService = mozilla::components::Imap::Service();

  // Obtain the cache storage object used by all channels in this session.
  // This will return disk cache (default) or memory cache as determined by
  // the boolean pref "mail.imap.use_disk_cache2"
  rv = imapService->GetCacheStorage(getter_AddRefs(cache2Storage));
  NS_ENSURE_SUCCESS(rv, rv);
  MOZ_LOG(IMAPCache, LogLevel::Debug,
          ("%s: Obtained storage obj for |%s| cache2", __func__,
           gUseDiskCache2 ? "disk" : "mem"));

  int32_t uidValidity = -1;
  uint32_t cacheAccess = nsICacheStorage::OPEN_NORMALLY;

  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(m_url, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImapMailFolderSink> folderSink;
  rv = imapUrl->GetImapMailFolderSink(getter_AddRefs(folderSink));
  if (folderSink) folderSink->GetUidValidity(&uidValidity);

  // If we're storing the message in the offline store, don't
  // write/save to cache2 cache. (Not sure if this even happens!)
  bool storeResultsOffline;
  imapUrl->GetStoreResultsOffline(&storeResultsOffline);
  if (storeResultsOffline) cacheAccess = nsICacheStorage::OPEN_READONLY;

  // clang-format off
  MOZ_LOG(IMAPCache, LogLevel::Debug,
          ("%s: For URL = |%s|", __func__, m_url->GetSpecOrDefault().get()));
  // clang-format on

  // Use the uid validity as part of the cache key, so that if the uid validity
  // changes, we won't reuse the wrong cache entries.
  nsAutoCString extension;
  extension.AppendInt(uidValidity, 16);

  // Open a cache entry where the key is the potentially modified URL.
  nsAutoCString path;
  m_url->GetPathQueryRef(path);

  // First we need to "normalise" the URL by extracting ?part= and &filename.
  // The path should only contain: ?part=x.y&filename=file.ext
  // These are seen in the wild:
  // /;section=2?part=1.2&filename=A01.JPG
  // ?section=2?part=1.2&filename=A01.JPG&type=image/jpeg&filename=A01.JPG
  // ?part=1.2&type=image/jpeg&filename=IMG_C0030.jpg
  // ?header=quotebody&part=1.2&filename=lijbmghmkilicioj.png
  nsCString partQuery = MsgExtractQueryPart(path, "?part=");
  if (partQuery.IsEmpty()) {
    partQuery = MsgExtractQueryPart(path, "&part=");
    if (!partQuery.IsEmpty()) {
      // ? indicates a part query, so set the first character to that.
      partQuery.SetCharAt('?', 0);
    }
  }
  nsCString filenameQuery = MsgExtractQueryPart(path, "&filename=");
  MOZ_LOG(IMAPCache, LogLevel::Debug,
          ("%s: part = |%s|, filename = |%s|", __func__, partQuery.get(),
           filenameQuery.get()));

  // Truncate path at either /; or ?
  MsgRemoveQueryPart(path);

  nsCOMPtr<nsIURI> newUri;
  rv = NS_MutateURI(m_url).SetPathQueryRef(path).Finalize(newUri);
  NS_ENSURE_SUCCESS(rv, rv);
  if (partQuery.IsEmpty()) {
    // Not accessing a part but the whole message.
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("%s: Call AsyncOpenURI on entire message", __func__));
  } else {
    // Access just a part. Set up part extraction and read in the part from the
    // whole cached message. Note: Parts are now never individually written to
    // or read from cache.
    SetupPartExtractorListener(imapUrl, m_channelListener);
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("%s: Call AsyncOpenURI to read part from entire message cache",
             __func__));
  }
  return cache2Storage->AsyncOpenURI(newUri, extension, cacheAccess, this);
}

// Pumps content of cache2 entry to channel listener. If a part was
// requested in the original URL seen in OpenCacheEntry(), it will be extracted
// from the whole message by the channel listener. So to obtain a single part
// always requires reading the complete message from cache.
nsresult nsImapMockChannel::ReadFromCache2(nsICacheEntry* entry) {
  NS_ENSURE_ARG(entry);

  bool useCacheEntry = true;
  nsresult rv;
  nsAutoCString entryKey;

  entry->GetKey(entryKey);

  // Compare cache entry size with message size. Init to an invalid value.
  int64_t entrySize = -1;

  // We don't expect concurrent read here, so this call should always work.
  rv = entry->GetDataSize(&entrySize);

  nsCOMPtr<nsIMsgMessageUrl> msgUrl(do_QueryInterface(m_url));
  if (msgUrl && NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    // A failure to get a message header isn't an automatic error
    msgUrl->GetMessageHeader(getter_AddRefs(msgHdr));
    if (msgHdr) {
      uint32_t messageSize;
      if (NS_SUCCEEDED(rv = msgHdr->GetMessageSize(&messageSize)) &&
          messageSize != entrySize) {
        // clang-format off
        MOZ_LOG(IMAP, LogLevel::Warning,
                ("%s: Size mismatch for %s: message %" PRIu32
                 ", cache %" PRIi64,
                 __func__, entryKey.get(), messageSize, entrySize));
        MOZ_LOG(IMAPCache, LogLevel::Debug,
                ("%s: Size mismatch for %s: message %" PRIu32
                 ", cache %" PRIi64,
                 __func__, entryKey.get(), messageSize, entrySize));
        // clang-format on
        useCacheEntry = false;
      }
    }
  }
  // Cache entry is invalid if GetDataSize() or GetMessageSize failed or if
  // otherwise unable to obtain the cache entry size. (Not sure if it's possible
  // to have a 0 length cache entry but negative is definitely invalid.)
  if (NS_FAILED(rv) || entrySize < 1) useCacheEntry = false;

  nsCOMPtr<nsIInputStream> ins;
  if (useCacheEntry) {
    if (NS_SUCCEEDED(rv = entry->OpenInputStream(0, getter_AddRefs(ins)))) {
      uint64_t bytesAvailable = 0;
      rv = ins->Available(&bytesAvailable);
      // Note: bytesAvailable will usually be zero (at least for disk cache
      // since only async access occurs) so don't check it.
      if (NS_FAILED(rv)) {
        MOZ_LOG(IMAPCache, LogLevel::Debug,
                ("%s: Input stream for disk cache not usable", __func__));
        useCacheEntry = false;
      }
    }
  }

  if (NS_SUCCEEDED(rv) && useCacheEntry) {
    nsCOMPtr<nsIInputStreamPump> pump;
    if (NS_SUCCEEDED(
            rv = NS_NewInputStreamPump(getter_AddRefs(pump), ins.forget()))) {
      // Create and use a cache listener object.
      RefPtr<nsImapCacheStreamListener> cacheListener =
          new nsImapCacheStreamListener();

      cacheListener->Init(m_channelListener, this, true);
      rv = pump->AsyncRead(cacheListener);
      if (NS_SUCCEEDED(rv)) {
        nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(m_url);
        imapUrl->SetMsgLoadingFromCache(true);
        // Set the cache entry's security info status as our security
        // info status...
        nsCOMPtr<nsITransportSecurityInfo> securityInfo;
        entry->GetSecurityInfo(getter_AddRefs(securityInfo));
        SetSecurityInfo(securityInfo);
        MOZ_LOG(IMAPCache, LogLevel::Debug,
                ("%s: Cache entry accepted and being read", __func__));
      }  // if AsyncRead succeeded.
    }  // new pump
  }  // if useCacheEntry

  if (!useCacheEntry || NS_FAILED(rv)) {
    // Cache entry appears to be unusable. Return an error so will still attempt
    // to read the data via just an imap fetch (the "old fashioned" way).
    if (NS_SUCCEEDED(rv)) rv = NS_ERROR_FAILURE;
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("%s: Cache entry rejected, returning error %" PRIx32, __func__,
             static_cast<uint32_t>(rv)));
  }
  return rv;
}

class nsReadFromImapConnectionFailure : public mozilla::Runnable {
 public:
  explicit nsReadFromImapConnectionFailure(nsImapMockChannel* aChannel)
      : mozilla::Runnable("nsReadFromImapConnectionFailure"),
        mImapMockChannel(aChannel) {}

  NS_IMETHOD Run() {
    if (mImapMockChannel) {
      mImapMockChannel->RunOnStopRequestFailure();
    }
    return NS_OK;
  }

 private:
  RefPtr<nsImapMockChannel> mImapMockChannel;
};

nsresult nsImapMockChannel::RunOnStopRequestFailure() {
  if (m_channelListener) {
    m_channelListener->OnStopRequest(this, NS_MSG_ERROR_MSG_NOT_OFFLINE);
  }
  return NS_OK;
}

// This is called when the message requested by the url isn't yet in offline
// store or not yet in cache. It is also called if the storage is corrupt. This
// creates an imap connection to process the url. This is usually called from
// the mock channel or possibly from nsImapCacheStreamListener::OnDataAvailable.
NS_IMETHODIMP nsImapMockChannel::ReadFromImapConnection() {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(m_url);
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_url);

  bool localOnly = false;
  imapUrl->GetLocalFetchOnly(&localOnly);
  if (localOnly) {
    // This will cause an OnStartRunningUrl, and the subsequent close
    // will then cause an OnStopRunningUrl with the cancel status.
    NotifyStartEndReadFromCache(true);
    Cancel(NS_MSG_ERROR_MSG_NOT_OFFLINE);

    // Dispatch error notification, so ReadFromImapConnection() returns *before*
    // the error is sent to the listener's OnStopRequest(). This avoids
    // endless recursion where the caller relies on async execution.
    nsCOMPtr<nsIRunnable> event = new nsReadFromImapConnectionFailure(this);
    NS_DispatchToCurrentThread(event);
    return NS_MSG_ERROR_MSG_NOT_OFFLINE;
  }

  nsCOMPtr<nsILoadGroup> loadGroup;
  GetLoadGroup(getter_AddRefs(loadGroup));
  if (!loadGroup)  // if we don't have one, the url will snag one from the msg
                   // window...
    mailnewsUrl->GetLoadGroup(getter_AddRefs(loadGroup));

  // okay, add the mock channel to the load group..
  if (loadGroup)
    loadGroup->AddRequest((nsIRequest*)this, nullptr /* context isupports */);

  // loading the url consists of asking the server to add the url to it's imap
  // event queue....
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = mailnewsUrl->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIImapIncomingServer> imapServer(do_QueryInterface(server, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // Assume AsyncRead is always called from the UI thread.....
  return imapServer->GetImapConnectionAndLoadUrl(imapUrl, m_channelListener);
}

// for messages stored in our offline cache, we have special code to handle
// that... If it's in the local cache, we return true and we can abort the
// download because this method does the rest of the work.
bool nsImapMockChannel::ReadFromLocalCache() {
  MOZ_ASSERT(NS_IsMainThread());
  nsresult rv = NS_OK;

  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(m_url);
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_url, &rv);

  bool useLocalCache = false;
  mailnewsUrl->GetMsgIsInLocalCache(&useLocalCache);
  if (!useLocalCache) {
    return false;
  }

  nsAutoCString messageIdString;

  // The following call may set a new/replacement m_channelListener.
  SetupPartExtractorListener(imapUrl, m_channelListener);

  // The code below assumes that m_channelListener is non-null,
  if (!m_channelListener) {
    return false;
  }

  imapUrl->GetListOfMessageIds(messageIdString);
  nsCOMPtr<nsIMsgFolder> folder;
  rv = mailnewsUrl->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, false);
  if (!folder) {
    return false;
  }
  // we want to create a file channel and read the msg from there.
  nsMsgKey msgKey = strtoul(messageIdString.get(), nullptr, 10);
  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = folder->GetMessageHeader(msgKey, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, false);

  // Attempt to open the local message and pump it out asynchronously.
  // If any of this fails we assume the local message is damaged.
  // In that case we'll discard it and tell the caller there is no local
  // copy.
  nsCOMPtr<nsIInputStream> msgStream;
  rv = folder->GetLocalMsgStream(hdr, getter_AddRefs(msgStream));
  NS_ENSURE_SUCCESS(rv, false);

  // Create a stream pump that will async read the message.
  nsCOMPtr<nsIInputStreamPump> pump;
  rv = NS_NewInputStreamPump(getter_AddRefs(pump), msgStream.forget());
  NS_ENSURE_SUCCESS(rv, false);

  // Wrap the listener with another one which knows which message offline
  // message we're reading from. If the read fails, our wrapper will discard
  // the offline copy as damaged.
  // We use a wrapper around the real listener because we don't know who is
  // consuming this data (A docshell, gloda indexing, calendar, whatever), so
  // we don't have any control over how read errors are handled. This lets
  // us intercept errors in OnStopRequest() and respond by discarding the
  // offline copy on the grounds that it's likely damaged.
  // Then the underlying listener can proceed with it's own OnStopRequest()
  // handling.
  RefPtr<ImapOfflineMsgStreamListener> offlineMsgListener =
      new ImapOfflineMsgStreamListener(folder, msgKey, m_channelListener, this);

  rv = pump->AsyncRead(offlineMsgListener);
  NS_ENSURE_SUCCESS(rv, false);

  // if the msg is unread, we should mark it read on the server. This lets
  // the code running this url know we're loading from the cache, if it cares.
  imapUrl->SetMsgLoadingFromCache(true);
  return true;
}

NS_IMETHODIMP nsImapMockChannel::AsyncOpen(nsIStreamListener* aListener) {
  MOZ_ASSERT(NS_IsMainThread(),
             "nsIChannel methods must be called from main thread");
  mLoadFlags |= nsIChannel::LOAD_REPLACE;
  nsCOMPtr<nsIStreamListener> listener = aListener;
  nsresult rv =
      nsContentSecurityManager::doContentSecurityCheck(this, listener);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t port;
  if (!m_url) return NS_ERROR_NULL_POINTER;
  rv = m_url->GetPort(&port);
  if (NS_FAILED(rv)) return rv;

  rv = NS_CheckPortSafety(port, "imap");
  if (NS_FAILED(rv)) return rv;

  // set the stream listener and then load the url
  NS_ASSERTION(!m_channelListener, "shouldn't already have a listener");
  m_channelListener = listener;
  nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(m_url));

  nsImapAction imapAction;
  imapUrl->GetImapAction(&imapAction);

  bool externalLink = true;
  imapUrl->GetExternalLinkUrl(&externalLink);

  if (externalLink) {
    // for security purposes, only allow imap urls originating from external
    // sources perform a limited set of actions. Currently the allowed set
    // includes: 1) folder selection 2) message fetch 3) message part fetch

    if (!(imapAction == nsIImapUrl::nsImapSelectFolder ||
          imapAction == nsIImapUrl::nsImapMsgFetch ||
          imapAction == nsIImapUrl::nsImapOpenMimePart ||
          imapAction == nsIImapUrl::nsImapMsgFetchPeek))
      return NS_ERROR_FAILURE;  // abort the running of this url....it failed a
                                // security check
  }

  if (ReadFromLocalCache()) {
    (void)NotifyStartEndReadFromCache(true);
    return NS_OK;
  }

  // okay, it's not in the local cache, now check the memory cache...
  // but we can't download for offline use from the memory cache
  if (imapAction != nsIImapUrl::nsImapMsgDownloadForOffline) {
    rv = OpenCacheEntry();
    if (NS_SUCCEEDED(rv)) return rv;
  }

  SetupPartExtractorListener(imapUrl, m_channelListener);
  // if for some reason open cache entry failed then just default to opening an
  // imap connection for the url
  return ReadFromImapConnection();
}

nsresult nsImapMockChannel::SetupPartExtractorListener(
    nsIImapUrl* aUrl, nsIStreamListener* aConsumer) {
  // if the url we are loading refers to a specific part then we need
  // libmime to extract that part from the message for us.
  bool refersToPart = false;
  aUrl->GetMimePartSelectorDetected(&refersToPart);
  if (refersToPart) {
    nsCOMPtr<nsIStreamConverterService> converter =
        mozilla::components::StreamConverter::Service();
    if (converter && aConsumer) {
      nsCOMPtr<nsIStreamListener> newConsumer;
      converter->AsyncConvertData("message/rfc822", "*/*", aConsumer,
                                  static_cast<nsIChannel*>(this),
                                  getter_AddRefs(newConsumer));
      if (newConsumer) m_channelListener = newConsumer;
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetLoadFlags(nsLoadFlags* aLoadFlags) {
  //*aLoadFlags = nsIRequest::LOAD_NORMAL;
  *aLoadFlags = mLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetLoadFlags(nsLoadFlags aLoadFlags) {
  mLoadFlags = aLoadFlags;
  return NS_OK;  // don't fail when trying to set this
}

NS_IMETHODIMP nsImapMockChannel::GetContentType(nsACString& aContentType) {
  if (mContentType.IsEmpty()) {
    nsImapAction imapAction = 0;
    if (m_url) {
      nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(m_url);
      if (imapUrl) {
        imapUrl->GetImapAction(&imapAction);
      }
    }
    if (imapAction == nsIImapUrl::nsImapSelectFolder)
      aContentType.AssignLiteral("x-application-imapfolder");
    else
      aContentType.AssignLiteral("message/rfc822");
  } else
    aContentType = mContentType;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetContentType(
    const nsACString& aContentType) {
  nsAutoCString charset;
  nsresult rv =
      NS_ParseResponseContentType(aContentType, mContentType, charset);
  if (NS_FAILED(rv) || mContentType.IsEmpty())
    mContentType.AssignLiteral(UNKNOWN_CONTENT_TYPE);
  return rv;
}

NS_IMETHODIMP nsImapMockChannel::GetContentCharset(
    nsACString& aContentCharset) {
  aContentCharset.Assign(mCharset);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetContentCharset(
    const nsACString& aContentCharset) {
  mCharset.Assign(aContentCharset);
  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::GetContentDisposition(uint32_t* aContentDisposition) {
  *aContentDisposition = mContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::SetContentDisposition(uint32_t aContentDisposition) {
  mContentDisposition = aContentDisposition;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::GetContentDispositionFilename(
    nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP
nsImapMockChannel::SetContentDispositionFilename(
    const nsAString& aContentDispositionFilename) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP
nsImapMockChannel::GetContentDispositionHeader(
    nsACString& aContentDispositionHeader) {
  return NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsImapMockChannel::GetContentLength(int64_t* aContentLength) {
  *aContentLength = mContentLength;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::SetContentLength(int64_t aContentLength) {
  mContentLength = aContentLength;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetOwner(nsISupports** aPrincipal) {
  NS_IF_ADDREF(*aPrincipal = mOwner);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetOwner(nsISupports* aPrincipal) {
  mOwner = aPrincipal;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetSecurityInfo(
    nsITransportSecurityInfo** aSecurityInfo) {
  NS_IF_ADDREF(*aSecurityInfo = mSecurityInfo);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetSecurityInfo(
    nsITransportSecurityInfo* aSecurityInfo) {
  mSecurityInfo = aSecurityInfo;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::GetIsDocument(bool* aIsDocument) {
  return NS_GetIsDocumentChannel(this, aIsDocument);
}

////////////////////////////////////////////////////////////////////////////////
// From nsIRequest
////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsImapMockChannel::GetName(nsACString& result) {
  if (m_url) return m_url->GetSpec(result);
  result.Truncate();
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::IsPending(bool* result) {
  *result = m_channelListener != nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetStatus(nsresult* status) {
  *status = m_cancelStatus;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetWritingToCache(bool aWriting) {
  mWritingToCache = aWriting;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetWritingToCache(bool* result) {
  *result = mWritingToCache;
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetImapProtocol(nsIImapProtocol* aProtocol) {
  mProtocol = do_GetWeakReference(aProtocol);
  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::SetCanceledReason(const nsACString& aReason) {
  return SetCanceledReasonImpl(aReason);
}

NS_IMETHODIMP nsImapMockChannel::GetCanceledReason(nsACString& aReason) {
  return GetCanceledReasonImpl(aReason);
}

NS_IMETHODIMP nsImapMockChannel::CancelWithReason(nsresult aStatus,
                                                  const nsACString& aReason) {
  return CancelWithReasonImpl(aStatus, aReason);
}

NS_IMETHODIMP nsImapMockChannel::Cancel(nsresult status) {
  MOZ_DIAGNOSTIC_ASSERT(
      NS_IsMainThread(),
      "nsImapMockChannel::Cancel should only be called from UI thread");
  MOZ_LOG(IMAPCache, LogLevel::Debug,
          ("nsImapMockChannel::%s: entering", __func__));
  m_cancelStatus = status;
  nsCOMPtr<nsIImapProtocol> imapProtocol = do_QueryReferent(mProtocol);

  // if we aren't reading from the cache and we get canceled...doom our cache
  // entry if write is still in progress...
  if (m_url) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_url);
    MOZ_LOG(IMAPCache, LogLevel::Debug,
            ("%s: Doom cache entry only if writing=%d(bool), url=%s", __func__,
             mWritingToCache, m_url->GetSpecOrDefault().get()));
    if (mWritingToCache) DoomCacheEntry(mailnewsUrl);
  }

  // The associated ImapProtocol thread must be unblocked before being killed.
  // Otherwise, it will be deadlocked.
  ResumeAndNotifyOne();

  // Required for killing ImapProtocol thread
  if (imapProtocol) imapProtocol->TellThreadToDie(false);

  return NS_OK;
}

NS_IMETHODIMP nsImapMockChannel::GetCanceled(bool* aCanceled) {
  nsresult status = NS_ERROR_FAILURE;
  GetStatus(&status);
  *aCanceled = NS_FAILED(status);
  return NS_OK;
}

/**
 * Suspends the current request.  This may have the effect of closing
 * any underlying transport (in order to free up resources), although
 * any open streams remain logically opened and will continue delivering
 * data when the transport is resumed.
 *
 * Calling cancel() on a suspended request must not send any
 * notifications (such as onstopRequest) until the request is resumed.
 *
 * NOTE: some implementations are unable to immediately suspend, and
 * may continue to deliver events already posted to an event queue. In
 * general, callers should be capable of handling events even after
 * suspending a request.
 */
NS_IMETHODIMP nsImapMockChannel::Suspend() {
  MOZ_LOG(IMAP, LogLevel::Debug, ("Suspending [this=%p].", this));

  mozilla::MonitorAutoLock lock(mSuspendedMonitor);
  NS_ENSURE_TRUE(!mSuspended, NS_ERROR_NOT_AVAILABLE);
  mSuspended = true;

  MOZ_LOG(IMAP, LogLevel::Debug, ("Suspended [this=%p].", this));

  return NS_OK;
}

/**
 * Resumes the current request.  This may have the effect of re-opening
 * any underlying transport and will resume the delivery of data to
 * any open streams.
 */
NS_IMETHODIMP nsImapMockChannel::Resume() {
  MOZ_LOG(IMAP, LogLevel::Debug, ("Resuming [this=%p].", this));

  nsresult rv = ResumeAndNotifyOne();

  MOZ_LOG(IMAP, LogLevel::Debug, ("Resumed [this=%p].", this));

  return rv;
}

nsresult nsImapMockChannel::ResumeAndNotifyOne() {
  mozilla::MonitorAutoLock lock(mSuspendedMonitor);
  NS_ENSURE_TRUE(mSuspended, NS_ERROR_NOT_AVAILABLE);
  mSuspended = false;
  lock.Notify();

  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::GetNotificationCallbacks(
    nsIInterfaceRequestor** aNotificationCallbacks) {
  NS_IF_ADDREF(*aNotificationCallbacks = mCallbacks.get());
  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::SetNotificationCallbacks(
    nsIInterfaceRequestor* aNotificationCallbacks) {
  mCallbacks = aNotificationCallbacks;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMockChannel::OnTransportStatus(nsITransport* transport, nsresult status,
                                     int64_t progress, int64_t progressMax) {
  if (NS_FAILED(m_cancelStatus) || (mLoadFlags & LOAD_BACKGROUND) || !m_url)
    return NS_OK;

  // these transport events should not generate any status messages
  if (status == NS_NET_STATUS_RECEIVING_FROM ||
      status == NS_NET_STATUS_SENDING_TO)
    return NS_OK;

  if (!mProgressEventSink) {
    NS_QueryNotificationCallbacks(mCallbacks, m_loadGroup, mProgressEventSink);
    if (!mProgressEventSink) return NS_OK;
  }

  nsAutoCString host;
  m_url->GetHost(host);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(m_url);
  if (mailnewsUrl) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    mailnewsUrl->GetServer(getter_AddRefs(server));
    if (server) server->GetHostName(host);
  }
  mProgressEventSink->OnStatus(this, status, NS_ConvertUTF8toUTF16(host).get());

  return NS_OK;
}

nsIMAPMailboxInfo::nsIMAPMailboxInfo(const nsACString& aName, char aDelimiter) {
  mMailboxName.Assign(aName);
  mDelimiter = aDelimiter;
  mChildrenListed = false;
}

nsIMAPMailboxInfo::~nsIMAPMailboxInfo() {}

void nsIMAPMailboxInfo::SetChildrenListed(bool childrenListed) {
  mChildrenListed = childrenListed;
}

bool nsIMAPMailboxInfo::GetChildrenListed() { return mChildrenListed; }

const nsACString& nsIMAPMailboxInfo::GetMailboxName() { return mMailboxName; }

char nsIMAPMailboxInfo::GetDelimiter() { return mDelimiter; }
