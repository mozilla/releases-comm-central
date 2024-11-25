/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsImapProtocol_h___
#define nsImapProtocol_h___

#include "nsIImapProtocol.h"
#include "nsIImapUrl.h"

#include "nsMsgProtocol.h"
#include "nsIStreamListener.h"
#include "nsIAsyncOutputStream.h"
#include "nsIAsyncInputStream.h"
#include "nsImapCore.h"
#include "nsIProgressEventSink.h"
#include "nsIInterfaceRequestor.h"
#include "nsISocketTransport.h"

// UI Thread proxy helper
#include "nsIImapProtocolSink.h"

#include "../public/nsIImapHostSessionList.h"
#include "nsImapServerResponseParser.h"
#include "nsImapFlagAndUidState.h"
#include "nsImapNamespace.h"
#include "nsTArray.h"
#include "nsIWeakReferenceUtils.h"
#include "nsMsgLineBuffer.h"  // we need this to use the nsMsgLineStreamBuffer helper class...
#include "nsIInputStream.h"
#include "nsIMsgIncomingServer.h"
#include "nsCOMArray.h"
#include "nsIImapMockChannel.h"
#include "nsILoadGroup.h"
#include "nsCOMPtr.h"
#include "nsIMsgWindow.h"
#include "nsIImapHeaderXferInfo.h"
#include "nsMsgLineBuffer.h"
#include "nsIAsyncInputStream.h"
#include "nsIMsgFolder.h"
#include "nsIMsgAsyncPrompter.h"
#include "mozilla/ReentrantMonitor.h"
#include "nsSyncRunnableHelpers.h"
#include "nsICacheEntryOpenCallback.h"
#include "nsIProtocolProxyCallback.h"
#include "nsHashPropertyBag.h"
#include "nsMailChannel.h"

#include "mozilla/Monitor.h"

class nsIMAPMessagePartID;
class nsIPrefBranch;

#define kDownLoadCacheSize 16000u  // was 1536 - try making it bigger

using msg_line_info = struct _msg_line_info {
  const char* adoptedMessageLine;
  uint32_t uidOfMessage;
};

class nsMsgImapLineDownloadCache : public nsIImapHeaderInfo,
                                   public nsByteArray {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPHEADERINFO
  nsMsgImapLineDownloadCache();
  uint32_t CurrentUID();
  uint32_t SpaceAvailable();
  bool CacheEmpty();

  msg_line_info* GetCurrentLineInfo();

 private:
  virtual ~nsMsgImapLineDownloadCache();

  msg_line_info* fLineInfo;
  int32_t m_msgSize;
};

#define kNumHdrsToXfer 10

class nsMsgImapHdrXferInfo : public nsIImapHeaderXferInfo {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIIMAPHEADERXFERINFO
  nsMsgImapHdrXferInfo();
  void ResetAll();    // reset HeaderInfos for re-use
  void ReleaseAll();  // release HeaderInfos (frees up memory)
  // this will return null if we're full, in which case the client code
  // should transfer the headers and retry.
  nsIImapHeaderInfo* StartNewHdr();
  // call when we've finished adding lines to current hdr
  void FinishCurrentHdr();

 private:
  virtual ~nsMsgImapHdrXferInfo();
  nsCOMArray<nsIImapHeaderInfo> m_hdrInfos;
  int32_t m_nextFreeHdrInfo;
};

// This class contains the name of a mailbox and whether or not
// its children have been listed.
class nsIMAPMailboxInfo {
 public:
  nsIMAPMailboxInfo(const nsACString& aName, char aDelimiter);
  virtual ~nsIMAPMailboxInfo();

  void SetChildrenListed(bool childrenListed);
  bool GetChildrenListed();
  const nsACString& GetMailboxName();
  char GetDelimiter();

 protected:
  nsCString mMailboxName;
  bool mChildrenListed;
  char mDelimiter;
};

// State Flags (Note, I use the word state in terms of storing
// state information about the connection (authentication, have we sent
// commands, etc. I do not intend it to refer to protocol state)
// Use these flags in conjunction with SetFlag/TestFlag/ClearFlag instead
// of creating PRBools for everything....
// clang-format off
#define IMAP_RECEIVED_GREETING        0x00000001  // should we pause for the next read
#define  IMAP_CONNECTION_IS_OPEN      0x00000004  // is the connection currently open?
#define IMAP_WAITING_FOR_DATA         0x00000008
#define IMAP_CLEAN_UP_URL_STATE       0x00000010  // processing clean up url state
#define IMAP_ISSUED_LANGUAGE_REQUEST  0x00000020  // make sure we only issue the language
                                                  // request once per connection...
#define IMAP_ISSUED_COMPRESS_REQUEST  0x00000040  // make sure we only request compression once

// There are 3 types of progress strings for items downloaded from IMAP servers.
// An index is needed to keep track of the current count of the number of each
// item type downloaded. The IMAP_EMPTY_STRING_INDEX means no string displayed.
#define IMAP_NUMBER_OF_PROGRESS_STRINGS 4
#define IMAP_HEADERS_STRING_INDEX       0
#define IMAP_FLAGS_STRING_INDEX         1
#define IMAP_MESSAGES_STRING_INDEX      2
#define IMAP_EMPTY_STRING_INDEX         3
// clang-format on

/**
 * nsImapProtocol is, among other things, the underlying nsIChannel
 * implementation for the IMAP protocol. However, it's usually hidden away
 * behind nsImapMockChannel objects. It also represents the 'real' connection
 * to the IMAP server - it maintains the nsISocketTransport.
 * Because there can be multiple IMAP requests queued up, NS_NewChannel()
 * will return nsImapMockChannel objects instead, to keep the request in a
 * holding pattern until the connection is free. At which time the mock
 * channel will just forward calls onward to the nsImapProtocol.
 *
 * The url scheme we implement here encodes various IMAP commands as URLs.
 * Some URLs are just traditional I/O based nsIChannel transactions, but
 * many others have side effects. For example, an IMAP folder discovery
 * command might cause the creation of the nsImapMailFolder hierarchy under
 * the the nsImapIncomingServer.
 * Such side effects are communicated via the various "Sink" interfaces. This
 * helps decouple the IMAP code from the rest of the system:
 *
 * - nsIImapServerSink      (implemented by nsImapIncomingServer)
 * - nsIImapMailFolderSink  (implemented by nsImapMailFolder)
 * - nsIImapMessageSink     (implemented by nsImapMailFolder)
 *
 * Internal to nsImapProtocol, these sink classes all have corresponding proxy
 * implementations (ImapServerSinkProxy, ImapMailFolderSinkProxy and
 * ImapMessageSinkProxy). These allow us to safely call the sink objects, in
 * a synchronous fashion, from I/O threads (threads other than the main one).
 * When an IMAP routine calls a member function of one of these sink proxies,
 * it dispatches a call to the real sink object on the main thread, then
 * blocks until the call is completed.
 */
class nsImapProtocol : public nsIImapProtocol,
                       public nsIInputStreamCallback,
                       public nsSupportsWeakReference,
                       public nsMsgProtocol,
                       public nsIImapProtocolSink,
                       public nsIMsgAsyncPromptListener,
                       public nsIProtocolProxyCallback {
 public:
  struct TCPKeepalive {
    // For enabling and setting TCP keepalive (not related to IMAP IDLE).
    std::atomic<bool> enabled;
    std::atomic<int32_t> idleTimeS;
    std::atomic<int32_t> retryIntervalS;
  };

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIINPUTSTREAMCALLBACK
  NS_DECL_NSIPROTOCOLPROXYCALLBACK
  nsImapProtocol();

  virtual nsresult ProcessProtocolState(nsIURI* url,
                                        nsIInputStream* inputStream,
                                        uint64_t sourceOffset,
                                        uint32_t length) override;

  //////////////////////////////////////////////////////////////////////////////////
  // we support the nsIImapProtocol interface
  //////////////////////////////////////////////////////////////////////////////////
  NS_DECL_NSIIMAPPROTOCOL

  //////////////////////////////////////////////////////////////////////////////////
  // we support the nsIImapProtocolSink interface
  //////////////////////////////////////////////////////////////////////////////////
  NS_DECL_NSIIMAPPROTOCOLSINK

  NS_DECL_NSIMSGASYNCPROMPTLISTENER

  // message id string utilities.
  uint32_t CountMessagesInIdString(const char* idString);
  static bool HandlingMultipleMessages(const nsCString& messageIdString);
  // escape slashes and double quotes in username/passwords for insecure login.
  static void EscapeUserNamePasswordString(const char* strToEscape,
                                           nsCString* resultStr);

  // used to start fetching a message.
  void GetShouldDownloadAllHeaders(bool* aResult);
  void GetArbitraryHeadersToDownload(nsCString& aResult);
  virtual void AdjustChunkSize();
  virtual void FetchMessage(const nsCString& messageIds,
                            nsIMAPeFetchFields whatToFetch,
                            const char* fetchModifier = nullptr,
                            uint32_t startByte = 0, uint32_t numBytes = 0,
                            char* part = 0);
  void FetchTryChunking(const nsCString& messageIds,
                        nsIMAPeFetchFields whatToFetch, bool idIsUid,
                        char* part, uint32_t downloadSize, bool tryChunking);
  void FallbackToFetchWholeMsg(const nsCString& messageId,
                               uint32_t messageSize);
  // used when streaming a message fetch
  virtual nsresult BeginMessageDownLoad(
      uint32_t totalSize,        // for user, headers and body
      const char* contentType);  // some downloads are header only
  virtual void HandleMessageDownLoadLine(const char* line, bool isPartialLine,
                                         char* lineCopy = nullptr);
  virtual void NormalMessageEndDownload();
  virtual void AbortMessageDownLoad();
  virtual void PostLineDownLoadEvent(const char* line, uint32_t uid);
  void FlushDownloadCache();

  virtual void SetMailboxDiscoveryStatus(EMailboxDiscoverStatus status);
  virtual EMailboxDiscoverStatus GetMailboxDiscoveryStatus();

  virtual void ProcessMailboxUpdate(bool handlePossibleUndo);
  // Send log output...
  void Log(const char* logSubName, const char* extraInfo, const char* logData);
  static void LogImapUrl(const char* logMsg, nsIImapUrl* imapUrl);
  // Comment from 4.5: We really need to break out the thread synchronizer from
  // the connection class...Not sure what this means
  bool GetPseudoInterrupted();

  uint32_t GetMessageSize(const nsACString& messageId);
  bool GetSubscribingNow();

  bool DeathSignalReceived();
  void ResetProgressInfo();
  void SetActive(bool active);
  bool GetActive();

  bool GetShowAttachmentsInline();

  // Sets whether or not the content referenced by the current ActiveEntry has
  // been modified. Used for MIME parts on demand.
  void SetContentModified(IMAP_ContentModifiedType modified);
  bool GetShouldFetchAllParts();
  bool GetIgnoreExpunges() { return m_ignoreExpunges; }
  // Generic accessors required by the imap parser
  char* CreateNewLineFromSocket();
  nsresult GetConnectionStatus();
  void SetConnectionStatus(nsresult status);

  // Cleanup the connection and shutdown the thread.
  void TellThreadToDie();

  const nsCString&
  GetImapHostName();  // return the host name from the url for the
  // current connection
  const nsCString& GetImapUserName();  // return the user name from the identity
  const char*
  GetImapServerKey();  // return the user name from the incoming server;

  // state set by the imap parser...
  void NotifyMessageFlags(imapMessageFlagsType flags,
                          const nsACString& keywords, nsMsgKey key,
                          uint64_t highestModSeq);
  void NotifySearchHit(const char* hitLine);

  // Event handlers for the imap parser.
  void DiscoverMailboxSpec(nsImapMailboxSpec* adoptedBoxSpec);
  void AlertUserEventUsingName(const char* aMessageId);
  void AlertUserEvent(const char* message);
  void AlertUserEventFromServer(const char* aServerEvent,
                                bool aForIdle = false);
  void AlertCertError(nsITransportSecurityInfo* securityInfo);

  void ProgressEventFunctionUsingName(const char* aMsgId);
  void ProgressEventFunctionUsingNameWithString(const char* aMsgName,
                                                const char* aExtraInfo);
  void PercentProgressUpdateEvent(nsACString const& fmtStringName,
                                  int64_t currentProgress, int64_t maxProgress);
  void ShowProgress();

  // utility function calls made by the server

  void Copy(const char* messageList, const char* destinationMailbox,
            bool idsAreUid);
  void Search(const char* searchCriteria, bool useUID, bool notifyHit = true);
  // imap commands issued by the parser
  void Store(const nsCString& aMessageList, const char* aMessageData,
             bool aIdsAreUid);
  void ProcessStoreFlags(const nsCString& messageIds, bool idsAreUids,
                         imapMessageFlagsType flags, bool addFlags);
  void IssueUserDefinedMsgCommand(const char* command, const char* messageList);
  void FetchMsgAttribute(const nsCString& messageIds,
                         const nsCString& attribute);
  void Expunge();
  void UidExpunge(const nsCString& messageSet);
  void ImapClose(bool shuttingDown = false, bool waitForResponse = true);
  void Check();
  void SelectMailbox(const char* mailboxName);
  // more imap commands
  void Logout(bool shuttingDown = false, bool waitForResponse = true);
  void Noop();
  void XServerInfo();
  void Netscape();
  void XMailboxInfo(const char* mailboxName);
  void MailboxData();
  void GetMyRightsForFolder(const char* mailboxName);
  void Bodystructure(const nsCString& messageId, bool idIsUid);

  // this function does not ref count!!! be careful!!!
  nsIImapUrl* GetCurrentUrl() { return m_runningUrl; }

  // acl and namespace stuff
  // notifies libmsg that we have a new personal/default namespace that we're
  // using
  void CommitNamespacesForHostEvent();
  // notifies libmsg that we have new capability data for the current host
  void CommitCapability();

  // Adds a set of rights for a given user on a given mailbox on the current
  // host. if userName is NULL, it means "me," or MYRIGHTS. rights is a single
  // string of rights, as specified by RFC2086, the IMAP ACL extension.
  void AddFolderRightsForUser(const char* mailboxName, const char* userName,
                              const char* rights);
  // Clears all rights for the current folder, for all users.
  void ClearAllFolderRights();
  void RefreshFolderACLView(const char* mailboxName,
                            nsImapNamespace* nsForMailbox);

  nsresult SetFolderAdminUrl(const char* mailboxName);
  void HandleMemoryFailure();
  void HandleCurrentUrlError();

  // UIDPLUS extension
  void SetCopyResponseUid(const char* msgIdString);

  // Quota support
  void UpdateFolderQuotaData(nsImapQuotaAction aAction, nsCString& aQuotaRoot,
                             uint64_t aUsed, uint64_t aMax);

  bool GetPreferPlainText() { return m_preferPlainText; }

  int32_t GetCurFetchSize() { return m_curFetchSize; }

  const nsString& GetEmptyMimePartString() { return m_emptyMimePartString; }
  void SetCapabilityResponseOccurred();

  // Start event loop. This is called on IMAP thread
  bool RunImapThreadMainLoop();

 private:
  virtual ~nsImapProtocol();
  // the following flag is used to determine when a url is currently being run.
  // It is cleared when we finish processng a url and it is set whenever we call
  // Load on a url
  bool m_urlInProgress;

  /** The nsIImapURL that is currently running. */
  nsCOMPtr<nsIImapUrl> m_runningUrl;
  nsCOMPtr<nsIImapUrl> m_runningUrlLatest;
  /** Current imap action associated with this connection. */
  nsImapAction m_imapAction;

  nsCString m_hostName;
  nsCString m_userName;
  nsCString m_serverKey;
  char* m_dataOutputBuf;
  RefPtr<nsMsgLineStreamBuffer> m_inputStreamBuffer;
  nsCString m_trashFolderPath;

  /** The socket connection to the IMAP server. */
  nsCOMPtr<nsISocketTransport> m_transport;
  nsCOMPtr<nsITransportSecurityInfo> m_securityInfo;

  /** Stream to handle data coming in from the IMAP server. */
  nsCOMPtr<nsIInputStream> m_inputStream;

  nsCOMPtr<nsIAsyncInputStream> m_channelInputStream;
  nsCOMPtr<nsIAsyncOutputStream> m_channelOutputStream;

  /** The currently running request. */
  nsCOMPtr<nsIImapMockChannel> m_mockChannel;

  uint32_t m_bytesToChannel;
  bool m_fetchingWholeMessage;
  // nsCOMPtr<nsIRequest> mAsyncReadRequest; // we're going to cancel this when
  // we're done with the conn.

  // ******* Thread support *******
  PRThread* m_thread;
  mozilla::ReentrantMonitor
      m_dataAvailableMonitor;  // used to notify the arrival of data from the
                               // server
  mozilla::ReentrantMonitor
      m_urlReadyToRunMonitor;  // used to notify the arrival of a new url to be
                               // processed
  mozilla::ReentrantMonitor m_pseudoInterruptMonitor;
  mozilla::ReentrantMonitor m_dataMemberMonitor;
  mozilla::ReentrantMonitor m_threadDeathMonitor;
  mozilla::ReentrantMonitor m_waitForBodyIdsMonitor;
  mozilla::ReentrantMonitor m_fetchBodyListMonitor;
  mozilla::ReentrantMonitor m_passwordReadyMonitor;
  mozilla::Mutex mLock;
  // If we get an async password prompt, this is where the UI thread
  // stores the password, before notifying the imap thread of the password
  // via the m_passwordReadyMonitor.
  nsString m_password;
  // Set to the result of nsImapServer::PromptPassword
  nsresult m_passwordStatus;
  bool m_passwordObtained;

  bool m_imapThreadIsRunning;
  void ImapThreadMainLoop(void);
  nsresult m_connectionStatus;
  nsCString m_connectionType;

  bool m_nextUrlReadyToRun;
  bool m_idleResponseReadyToHandle;
  nsWeakPtr m_server;

  RefPtr<ImapMailFolderSinkProxy> m_imapMailFolderSink;
  RefPtr<ImapMailFolderSinkProxy> m_imapMailFolderSinkSelected;
  RefPtr<ImapMessageSinkProxy> m_imapMessageSink;
  RefPtr<ImapServerSinkProxy> m_imapServerSink;
  RefPtr<ImapServerSinkProxy> m_imapServerSinkLatest;
  RefPtr<ImapProtocolSinkProxy> m_imapProtocolSink;

  // helper function to setup imap sink interface proxies
  nsresult SetupSinkProxy();
  // End thread support stuff
  nsresult LoadImapUrlInternal();

  bool GetDeleteIsMoveToTrash();
  bool GetShowDeletedMessages();
  nsCString m_currentCommand;
  nsImapServerResponseParser m_parser;
  nsImapServerResponseParser& GetServerStateParser() { return m_parser; }

  bool HandleIdleResponses();
  virtual bool ProcessCurrentURL();
  void EstablishServerConnection();
  virtual void ParseIMAPandCheckForNewMail(const char* commandString = nullptr,
                                           bool ignoreBadNOResponses = false);
  // biff
  void PeriodicBiff();
  void SendSetBiffIndicatorEvent(nsMsgBiffState newState);

  // folder opening and listing header functions
  void FolderHeaderDump(uint32_t* msgUids, uint32_t msgCount);
  void FolderMsgDump(uint32_t* msgUids, uint32_t msgCount,
                     nsIMAPeFetchFields fields);
  void FolderMsgDumpLoop(uint32_t* msgUids, uint32_t msgCount,
                         nsIMAPeFetchFields fields);
  void WaitForPotentialListOfBodysToFetch(nsTArray<nsMsgKey>& msgIdList);
  void HeaderFetchCompleted();
  void UploadMessageFromFile(nsIFile* file, const char* mailboxName,
                             PRTime date, imapMessageFlagsType flags,
                             nsCString& keywords);

  // mailbox name utilities.
  void CreateEscapedMailboxName(const char* rawName, nsCString& escapedName);
  void SetupMessageFlagsString(nsCString& flagString,
                               imapMessageFlagsType flags, uint16_t userFlags);

  // body fetching listing data
  bool m_fetchBodyListIsNew;
  nsTArray<nsMsgKey> m_fetchBodyIdList;

  // initialization function given a new url and transport layer
  nsresult SetupWithUrl(nsIURI* aURL, nsISupports* aConsumer);
  nsresult SetupWithUrlCallback(nsIProxyInfo* proxyInfo);
  void ReleaseUrlState(bool rerunningUrl);  // release any state that is stored
                                            // on a per action basis.
  /**
   * Last ditch effort to run the url without using an imap connection.
   * If it turns out that we don't need to run the url at all (e.g., we're
   * trying to download a single message for offline use and it has already
   * been downloaded, this function will send the appropriate notifications.
   *
   * @returns true if the url has been run locally, or doesn't need to be run.
   */
  bool TryToRunUrlLocally(nsIURI* aURL, nsISupports* aConsumer);

  ////////////////////////////////////////////////////////////////////////////////////////
  // Communication methods --> Reading and writing protocol
  ////////////////////////////////////////////////////////////////////////////////////////

  // SendData not only writes the NULL terminated data in dataBuffer to our
  // output stream but it also informs the consumer that the data has been
  // written to the stream. aSuppressLogging --> set to true if you wish to
  // suppress logging for this particular command. this is useful for making
  // sure we don't log authentication information like the user's password
  // (which was encoded anyway), but still we shouldn't add that information to
  // the log.
  nsresult SendData(const char* dataBuffer, bool aSuppressLogging = false);

  // state ported over from 4.5
  bool m_pseudoInterrupted;
  bool m_active;
  bool m_folderNeedsSubscribing;
  bool m_folderNeedsACLRefreshed;

  bool m_threadShouldDie;

  // use to prevent re-entering TellThreadToDie.
  bool m_inThreadShouldDie;
  // If the UI thread has signalled the IMAP thread to die, and the
  // connection has timed out, this will be set to FALSE.
  bool m_safeToCloseConnection;

  RefPtr<nsImapFlagAndUidState> m_flagState;
  nsMsgBiffState m_currentBiffState;
  // manage the IMAP server command tags
  // 11 = enough memory for the decimal representation of MAX_UINT + trailing
  // nul
  char m_currentServerCommandTag[11];
  uint32_t m_currentServerCommandTagNumber;
  void IncrementCommandTagNumber();
  const char* GetServerCommandTag();

  void StartTLS();

  // login related methods.
  nsresult GetPassword(nsString& password, bool aNewPasswordRequested);
  void InitPrefAuthMethods(int32_t authMethodPrefValue,
                           nsIMsgIncomingServer* aServer);
  nsresult ChooseAuthMethod();
  void MarkAuthMethodAsFailed(eIMAPCapabilityFlags failedAuthMethod);
  void ResetAuthMethods();

  // All of these methods actually issue protocol
  void Capability();  // query host for capabilities.
  void ID();          // send RFC 2971 app info to server
  void EnableUTF8Accept();
  void EnableCondStore();
  void StartCompressDeflate();
  nsresult BeginCompressing();
  void Language();  // set the language on the server if it supports it
  void Namespace();
  void InsecureLogin(const char* userName, const nsCString& password);
  nsresult ClientID();
  nsresult AuthLogin(const char* userName, const nsString& password,
                     eIMAPCapabilityFlag flag);
  nsresult SendDataParseIMAPandCheckForNewMail(const char* data,
                                               const char* command);
  void ProcessAuthenticatedStateURL();
  void ProcessAfterAuthenticated();
  void ProcessSelectedStateURL();
  bool TryToLogon();

  // ProcessAuthenticatedStateURL() used to be one giant if statement. I've
  // broken out a set of actions based on the imap action passed into the url.
  // The following functions are imap protocol handlers for each action. They
  // are called by ProcessAuthenticatedStateUrl.
  void OnLSubFolders();
  void OnAppendMsgFromFile();

  nsCString GetFolderPathString();  // OK to call from UI thread

  nsCString OnCreateServerSourceFolderPathString();
  nsCString OnCreateServerDestinationFolderPathString();
  nsresult CreateServerSourceFolderPathString(nsCString& result);
  void OnCreateFolder(const char* aSourceMailbox);
  void OnEnsureExistsFolder(const char* aSourceMailbox);
  void OnSubscribe(const char* aSourceMailbox);
  void OnUnsubscribe(const char* aSourceMailbox);
  void RefreshACLForFolderIfNecessary(const char* mailboxName);
  void RefreshACLForFolder(const char* aSourceMailbox);
  void GetACLForFolder(const char* aMailboxName);
  void OnRefreshAllACLs();
  void OnListFolder(const char* aSourceMailbox, bool aBool);
  void OnStatusForFolder(const char* sourceMailbox);
  void OnDeleteFolder(const char* aSourceMailbox);
  void OnRenameFolder(const char* aSourceMailbox);
  void OnMoveFolderHierarchy(const char* aSourceMailbox);
  void DeleteFolderAndMsgs(const char* aSourceMailbox);
  void RemoveMsgsAndExpunge();
  void FindMailboxesIfNecessary();
  void CreateMailbox(const char* mailboxName);
  void DeleteMailbox(const char* mailboxName);
  void RenameMailbox(const char* existingName, const char* newName);
  void RemoveHierarchyDelimiter(nsCString& mailboxName);
  bool CreateMailboxRespectingSubscriptions(const char* mailboxName);
  bool DeleteMailboxRespectingSubscriptions(const char* mailboxName);
  bool RenameMailboxRespectingSubscriptions(const char* existingName,
                                            const char* newName,
                                            bool reallyRename);
  // notify the fe that a folder was deleted
  void FolderDeleted(const nsACString& mailboxName);
  // notify the fe that a folder creation failed
  void FolderNotCreated(const char* mailboxName);
  // notify the fe that a folder was deleted
  void FolderRenamed(const char* oldName, const char* newName);

  bool FolderIsSelected(const char* mailboxName);

  bool MailboxIsNoSelectMailbox(const nsACString& mailboxName);
  bool FolderNeedsACLInitialized(const char* folderName);
  void DiscoverMailboxList();
  void DiscoverAllAndSubscribedBoxes();
  void MailboxDiscoveryFinished();
  void NthLevelChildList(const char* onlineMailboxPrefix, int32_t depth);
  // LIST SUBSCRIBED command (from RFC 5258) crashes some servers. so we need to
  // identify those servers
  bool GetListSubscribedIsBrokenOnServer();
  void Lsub(const char* mailboxPattern, bool addDirectoryIfNecessary);
  void List(const char* mailboxPattern, bool addDirectoryIfNecessary,
            bool useXLIST = false);
  void Subscribe(const char* mailboxName);
  void Unsubscribe(const char* mailboxName);
  void Idle();
  void EndIdle(bool waitForResponse = true);
  // Some imap servers include the mailboxName following the dir-separator in
  // the list of subfolders of the mailboxName. In fact, they are the same. So
  // we should decide if we should delete such subfolder and provide feedback if
  // the delete operation succeed.
  bool DeleteSubFolders(const char* aMailboxName, bool& aDeleteSelf);
  bool RenameHierarchyByHand(const char* oldParentMailboxName,
                             const char* newParentMailboxName);
  bool RetryUrl();

  nsresult GlobalInitialization(nsIPrefBranch* aPrefBranch);
  nsresult Configure(int32_t TooFastTime, int32_t IdealTime,
                     int32_t ChunkAddSize, int32_t ChunkSize,
                     int32_t ChunkThreshold, bool FetchByChunks);
  nsresult GetMsgWindow(nsIMsgWindow** aMsgWindow);
  // End Process AuthenticatedState Url helper methods

  virtual char const* GetType() override { return "imap"; }

  // Quota support
  void GetQuotaDataIfSupported(const char* aBoxName);

  // CondStore support - true if server supports it, and the user hasn't
  // disabled it.
  bool UseCondStore();
  // false if pref "mail.server.serverxxx.use_condstore" is false;
  bool m_useCondStore;
  // COMPRESS=DEFLATE support - true if server supports it, and the user hasn't
  // disabled it.
  bool UseCompressDeflate();
  // false if pref "mail.server.serverxxx.use_compress_deflate" is false;
  bool m_useCompressDeflate;
  // these come from the nsIDBFolderInfo in the msgDatabase and
  // are initialized in nsImapProtocol::SetupWithUrl.
  uint64_t mFolderLastModSeq;
  int32_t mFolderTotalMsgCount;
  uint32_t mFolderHighestUID;
  bool m_allowUTF8Accept;

  bool m_isGmailServer;
  nsTArray<nsCString> mCustomDBHeaders;
  nsTArray<nsCString> mCustomHeaders;
  bool m_trackingTime;
  PRTime m_startTime;
  PRTime m_endTime;
  PRTime m_lastActiveTime;
  int32_t m_tooFastTime;
  int32_t m_idealTime;
  int32_t m_chunkAddSize;
  int32_t m_chunkStartSize;
  bool m_fetchByChunks;
  bool m_sendID;
  int32_t m_curFetchSize;
  bool m_ignoreExpunges;
  eIMAPCapabilityFlags m_prefAuthMethods;    // set of capability flags (in
                                             // nsImapCore.h) for auth methods
  eIMAPCapabilityFlags m_failedAuthMethods;  // ditto
  eIMAPCapabilityFlag m_currentAuthMethod;  // exactly one capability flag, or 0
  int32_t m_socketType;
  int32_t m_chunkSize;
  int32_t m_chunkThreshold;
  RefPtr<nsMsgImapLineDownloadCache> m_downloadLineCache;
  RefPtr<nsMsgImapHdrXferInfo> m_hdrDownloadCache;
  nsCOMPtr<nsIImapHeaderInfo> m_curHdrInfo;
  // mapping between mailboxes and the corresponding folder flags
  nsTHashMap<nsCStringHashKey, int32_t> m_standardListMailboxes;
  // mapping between special xlist mailboxes and the corresponding folder flags
  nsTHashMap<nsCStringHashKey, int32_t> m_specialXListMailboxes;

  nsCOMPtr<nsIImapHostSessionList> m_hostSessionList;

  bool m_fromHeaderSeen;

  nsString mAcceptLanguages;

  nsCString m_clientId;

  // progress stuff
  void SetProgressString(uint32_t aStringIndex);

  nsCString m_progressStringName;
  uint32_t m_stringIndex;
  int32_t m_progressCurrentNumber[IMAP_NUMBER_OF_PROGRESS_STRINGS];
  int32_t m_progressExpectedNumber;
  nsCString m_lastProgressStringName;
  int32_t m_lastPercent;
  int64_t m_lastProgressTime;

  bool m_notifySearchHit;
  bool m_needNoop;
  bool m_idle;
  bool m_useIdle;
  int32_t m_noopCount;
  bool m_autoSubscribe, m_autoUnsubscribe, m_autoSubscribeOnOpen;
  bool m_closeNeededBeforeSelect;
  bool m_retryUrlOnError;
  bool m_preferPlainText;
  bool m_forceSelect;

  int32_t m_uidValidity;  // stored uid validity for the selected folder.

  enum EMailboxHierarchyNameState {
    kNoOperationInProgress,
    // kDiscoverBaseFolderInProgress, - Unused. Keeping for historical reasons.
    kDiscoverTrashFolderInProgress,
    kDeleteSubFoldersInProgress,
    kListingForInfoOnly,
    kListingForInfoAndDiscovery,
    kDiscoveringNamespacesOnly,
    kXListing,
    kListingForFolderFlags,
    kListingForCreate
  };
  EMailboxHierarchyNameState m_hierarchyNameState;
  EMailboxDiscoverStatus m_discoveryStatus;
  nsTArray<nsIMAPMailboxInfo*> m_listedMailboxList;
  nsTArray<nsCString>* m_deletableChildren;
  uint32_t m_flagChangeCount;
  PRTime m_lastCheckTime;

  bool CheckNeeded();

  nsString m_emptyMimePartString;

  RefPtr<mozilla::mailnews::OAuth2ThreadHelper> mOAuth2Support;
  bool m_capabilityResponseOccurred;

  nsresult IsTransportAlive(bool* alive);
  nsresult TransportStartTLS();
  void GetTransportSecurityInfo(nsITransportSecurityInfo** aSecurityInfo);
};

// This small class is a "mock" channel because it is a mockery of the imap
// channel's implementation... it's a light weight channel that we can return to
// necko when they ask for a channel on a url before we actually have an imap
// protocol instance around which can run the url. Please see my comments in
// nsIImapMockChannel.idl for more details..
//
// Threading concern: This class lives entirely in the UI thread.

class nsICacheEntry;

class nsImapMockChannel : public nsIImapMockChannel,
                          public nsICacheEntryOpenCallback,
                          public nsITransportEventSink,
                          public nsSupportsWeakReference,
                          public nsMailChannel,
                          public nsHashPropertyBag {
 public:
  friend class nsImapProtocol;

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIIMAPMOCKCHANNEL
  NS_DECL_NSICHANNEL
  NS_DECL_NSIREQUEST
  NS_DECL_NSICACHEENTRYOPENCALLBACK
  NS_DECL_NSITRANSPORTEVENTSINK

  nsImapMockChannel();
  static nsresult Create(const nsIID& iid, void** result);
  nsresult RunOnStopRequestFailure();

 protected:
  virtual ~nsImapMockChannel();
  nsCOMPtr<nsIURI> m_url;

  nsCOMPtr<nsIURI> m_originalUrl;
  nsCOMPtr<nsILoadGroup> m_loadGroup;
  nsCOMPtr<nsILoadInfo> m_loadInfo;
  nsCOMPtr<nsIStreamListener> m_channelListener;
  nsresult m_cancelStatus;
  nsLoadFlags mLoadFlags;
  nsCOMPtr<nsIProgressEventSink> mProgressEventSink;
  nsCOMPtr<nsIInterfaceRequestor> mCallbacks;
  nsCOMPtr<nsISupports> mOwner;
  nsCOMPtr<nsITransportSecurityInfo> mSecurityInfo;
  nsCString mContentType;
  nsCString mCharset;
  nsWeakPtr mProtocol;

  bool mChannelClosed;
  bool mReadingFromCache;
  int64_t mContentLength;
  bool mWritingToCache;

  mozilla::Monitor mSuspendedMonitor;
  bool mSuspended;

  nsresult ResumeAndNotifyOne();

  // cache related helper methods
  nsresult OpenCacheEntry();  // makes a request to the cache service for a
                              // cache entry for a url
  bool ReadFromLocalCache();  // attempts to read the url out of our local
                              // (offline) cache....
  nsresult ReadFromCache2(nsICacheEntry* entry);  // pipes message from cache2
                                                  // entry to channel listener
  nsresult NotifyStartEndReadFromCache(bool start);

  // we end up daisy chaining multiple nsIStreamListeners into the load process.
  nsresult SetupPartExtractorListener(nsIImapUrl* aUrl,
                                      nsIStreamListener* aConsumer);

  uint32_t mContentDisposition;
};

#endif  // nsImapProtocol_h___
