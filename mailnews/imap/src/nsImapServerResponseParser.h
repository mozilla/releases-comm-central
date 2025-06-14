/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMAP_SRC_NSIMAPSERVERRESPONSEPARSER_H_
#define COMM_MAILNEWS_IMAP_SRC_NSIMAPSERVERRESPONSEPARSER_H_

#include "../public/nsIImapHostSessionList.h"
#include "nsImapSearchResults.h"
#include "MailNewsTypes2.h"
#include "nsTArray.h"
#include "nsImapUtils.h"
#include "prmem.h"

class nsImapSearchResultIterator;
class nsIImapFlagAndUidState;

#include "nsImapGenericParser.h"

class nsImapServerResponseParser : public nsImapGenericParser {
 public:
  explicit nsImapServerResponseParser(nsImapProtocol& imapConnection);
  virtual ~nsImapServerResponseParser();

  // Overridden from the base parser class
  virtual bool LastCommandSuccessful() override;
  virtual void HandleMemoryFailure() override;

  // aignoreBadAndNOResponses --> don't throw a error dialog if this command
  // results in a NO or Bad response from the server..in other words the command
  // is "exploratory" and we don't really care if it succeeds or fails. This
  // value is typically FALSE for almost all cases.
  virtual void ParseIMAPServerResponse(const char* aCurrentCommand,
                                       bool aIgnoreBadAndNOResponses,
                                       char* aGreetingWithCapability = NULL);
  virtual void InitializeState();
  bool CommandFailed();
  void SetCommandFailed(bool failed);
  bool UntaggedResponse();

  enum eIMAPstate { kNonAuthenticated, kAuthenticated, kFolderSelected };

  virtual eIMAPstate GetIMAPstate();
  virtual bool WaitingForMoreClientInput() {
    return fWaitingForMoreClientInput;
  }
  const char* GetSelectedMailboxName();  // can be NULL
  bool IsStdJunkNotJunkUseOk() { return fStdJunkNotJunkUseOk; }

  // if we get a PREAUTH greeting from the server, initialize the parser to
  // begin in the kAuthenticated state
  void PreauthSetAuthenticatedState();

  // these functions represent the state of the currently selected
  // folder
  bool CurrentFolderReadOnly();
  int32_t NumberOfMessages();
  int32_t NumberOfRecentMessages();
  int32_t FolderUID();
  uint32_t CurrentResponseUID();
  uint32_t HighestRecordedUID();
  void ResetHighestRecordedUID();
  void SetCurrentResponseUID(uint32_t uid);
  bool IsNumericString(const char* string);
  uint32_t SizeOfMostRecentMessage();
  void SetTotalDownloadSize(int32_t newSize) { fTotalDownloadSize = newSize; }

  nsImapSearchResultIterator* CreateSearchResultIterator();
  void ResetSearchResultSequence() { fSearchResults->ResetSequence(); }

  // create a struct mailbox_spec from our info, used in
  // libmsg c interface
  already_AddRefed<nsImapMailboxSpec> CreateCurrentMailboxSpec(
      const char* mailboxName = nullptr);

  // Resets the flags state.
  void ResetFlagInfo();

  // set this to false if you don't want to alert the user to server
  // error messages
  void SetReportingErrors(bool reportThem) { fReportingErrors = reportThem; }
  bool GetReportingErrors() { return fReportingErrors; }

  eIMAPCapabilityFlags GetCapabilityFlag() { return fCapabilityFlag; }
  void SetCapabilityFlag(eIMAPCapabilityFlags capability) {
    fCapabilityFlag = capability;
  }
  bool ServerHasIMAP4Rev1Capability() {
    return ((fCapabilityFlag & kIMAP4rev1Capability) != 0);
  }
  bool ServerHasACLCapability() {
    return ((fCapabilityFlag & kACLCapability) != 0);
  }
  bool ServerHasNamespaceCapability() {
    return ((fCapabilityFlag & kNamespaceCapability) != 0);
  }
  bool ServerIsNetscape3xServer() { return fServerIsNetscape3xServer; }
  bool ServerHasServerInfo() {
    return ((fCapabilityFlag & kXServerInfoCapability) != 0);
  }
  void SetFetchingFlags(bool aFetchFlags) { fFetchingAllFlags = aFetchFlags; }
  void ResetCapabilityFlag();

  nsCString& GetMailAccountUrl() { return fMailAccountUrl; }
  const char* GetXSenderInfo() { return fXSenderInfo; }
  void FreeXSenderInfo() { PR_FREEIF(fXSenderInfo); }
  nsCString& GetManageListsUrl() { return fManageListsUrl; }
  nsCString& GetManageFiltersUrl() { return fManageFiltersUrl; }
  const char* GetManageFolderUrl() { return fFolderAdminUrl; }
  nsCString& GetServerID() { return fServerIdResponse; }

  // Call this when adding a pipelined command to the session
  void IncrementNumberOfTaggedResponsesExpected(const char* newExpectedTag);

  // Interrupt a Fetch, without really Interrupting (through netlib)
  bool GetLastFetchChunkReceived();
  void ClearLastFetchChunkReceived();
  int32_t GetNumBytesFetched();
  void ClearNumBytesFetched();
  virtual uint16_t SupportsUserFlags() { return fSupportsUserDefinedFlags; }
  virtual uint16_t SettablePermanentFlags() { return fSettablePermanentFlags; }
  void SetFlagState(nsIImapFlagAndUidState* state);
  bool GetDownloadingHeaders();
  void SetHostSessionList(nsIImapHostSessionList* aHostSession);
  char* fAuthChallenge;  // the challenge returned by the server in
                         // response to authenticate using CRAM-MD5 or NTLM
  bool fUtf8AcceptEnabled;
  bool fUseModSeq;  // can use mod seq for currently selected folder
  uint64_t fHighestModSeq;
  bool fServerUnavailable;  // Server returned response code [UNAVAILABLE].

  // Set of new UIDs at a destination folder obtained from UID COPY response
  // when a message or messages are successfully copied or moved from a source
  // folder.  Only set when server supports UIDPLUS capability and the response
  // contains response code COPYUID. Currently only used when gmail messages are
  // shift-deleted to trash.
  nsCString fCopyUidSet;

 protected:
  virtual void flags();
  virtual void envelope_data();
  virtual void parse_address(nsAutoCString& addressLine);
  virtual void internal_date();
  virtual nsresult BeginMessageDownload(const char* content_type);

  virtual void response_data();
  virtual void resp_text();
  virtual void resp_cond_state(bool isTagged);
  virtual void text_mime2();
  virtual void text();
  virtual void parse_folder_flags(bool calledForFlags);
  virtual void enable_data();
  virtual void language_data();
  virtual void authChallengeResponse_data();
  virtual void resp_text_code();
  virtual void response_done();
  virtual void response_tagged();
  virtual void response_fatal();
  virtual void resp_cond_bye();
  virtual void id_data();
  virtual void mailbox_data();
  virtual void numeric_mailbox_data();
  virtual void capability_data();
  virtual void xserverinfo_data();
  virtual void xmailboxinfo_data();
  virtual void namespace_data();
  virtual void myrights_data(bool unsolicited);
  virtual void acl_data();
  virtual void mime_part_data();
  virtual void quota_data();
  virtual void msg_fetch();
  virtual void msg_obsolete();
  virtual void msg_fetch_headers(const char* partNum);
  virtual void msg_fetch_content(bool chunk, int32_t origin,
                                 const char* content_type);
  virtual bool msg_fetch_quoted();
  virtual bool msg_fetch_literal(bool chunk, int32_t origin);
  virtual void mailbox_list(bool discoveredFromLsub);
  virtual void mailbox(nsImapMailboxSpec* boxSpec);

  virtual void ProcessOkCommand(const char* commandToken);
  virtual void ProcessBadCommand(const char* commandToken);
  virtual void PreProcessCommandToken(const char* commandToken,
                                      const char* currentCommand);
  virtual void PostProcessEndOfLine();

  // Overridden from the nsImapGenericParser, to retrieve the next line
  // from the open socket.
  virtual bool GetNextLineForParser(char** nextLine) override;
  // overridden to do logging
  virtual void SetSyntaxError(bool error, const char* msg = nullptr) override;

 private:
  bool fCurrentCommandFailed;
  bool fUntaggedResponse;
  bool fReportingErrors;

  bool fCurrentFolderReadOnly;
  bool fCurrentLineContainedFlagInfo;
  bool fFetchingAllFlags;
  bool fWaitingForMoreClientInput;
  // Is the server a Netscape 3.x Messaging Server?
  bool fServerIsNetscape3xServer;
  bool fDownloadingHeaders;
  bool fCurrentCommandIsSingleMessageFetch;
  bool fGotPermanentFlags;
  bool fStdJunkNotJunkUseOk;
  imapMessageFlagsType fSavedFlagInfo;
  nsTArray<nsCString> fCustomFlags;

  uint16_t fSupportsUserDefinedFlags;
  uint16_t fSettablePermanentFlags;

  int32_t fFolderUIDValidity;
  int32_t fSeqNumOfFirstUnseenMsg;
  int32_t fNumberOfExistingMessages;
  int32_t fNumberOfRecentMessages;
  uint32_t fCurrentResponseUID;
  uint32_t fHighestRecordedUID;
  // used to handle server that sends msg size after headers
  uint32_t fReceivedHeaderOrSizeForUID;
  int32_t fSizeOfMostRecentMessage;
  int32_t fTotalDownloadSize;

  int32_t fStatusUnseenMessages;
  int32_t fStatusRecentMessages;
  uint32_t fStatusNextUID;
  int32_t fStatusExistingMessages;
  uint32_t fNextUID;

  int fNumberOfTaggedResponsesExpected;

  char* fCurrentCommandTag;

  nsCString fZeroLengthMessageUidString;

  // The lock was introduced to protect parallel access to
  // fSelectedMailboxName. It hasn't been researched if additional
  // locking is required for other member variables.
  // Please update this comment if additional variables are covered.
  mozilla::Mutex mLock;
  char* fSelectedMailboxName;

  nsImapSearchResultSequence* fSearchResults;

  nsCOMPtr<nsIImapFlagAndUidState>
      fFlagState;  // NOT owned by us, it's a copy, do not destroy

  eIMAPstate fIMAPstate;

  eIMAPCapabilityFlags fCapabilityFlag;
  nsCString fMailAccountUrl;
  char* fNetscapeServerVersionString;
  char* fXSenderInfo; /* changed per message download */
  char* fLastAlert; /* used to avoid displaying the same alert over and over */
  char* fMsgID;     /* MessageID for Gmail only (X-GM-MSGID) */
  char* fThreadID;  /* ThreadID for Gmail only (X-GM-THRID) */
  char* fLabels;    /* Labels for Gmail only (X-GM-LABELS) [will include parens,
                       removed while passing to hashTable ]*/
  nsCString fManageListsUrl;
  nsCString fManageFiltersUrl;
  char* fFolderAdminUrl;
  nsCString fServerIdResponse;  // RFC

  int32_t fFetchResponseIndex;

  // used for aborting a fetch stream when we're pseudo-Interrupted
  int32_t numberOfCharsInThisChunk;
  int32_t charsReadSoFar;
  bool fLastChunk;

  // Flags split of \r and \n between chunks in msg_fetch_literal().
  bool fNextChunkStartsWithNewline;

  // The connection object
  nsImapProtocol& fServerConnection;

  RefPtr<nsIImapHostSessionList> fHostSessionList;
  nsTArray<nsMsgKey> fCopyResponseKeyArray;
};

#endif  // COMM_MAILNEWS_IMAP_SRC_NSIMAPSERVERRESPONSEPARSER_H_
