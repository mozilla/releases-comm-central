/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsParseMailbox_H
#define nsParseMailbox_H

#include "nsIMsgParseMailMsgState.h"
#include "nsIStreamListener.h"
#include "nsMsgLineBuffer.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "nsIMsgStatusFeedback.h"
#include "nsCOMPtr.h"
#include "nsCOMArray.h"
#include "nsIDBChangeListener.h"
#include "nsIWeakReferenceUtils.h"
#include "nsIMsgWindow.h"
#include "nsImapMoveCoalescer.h"
#include "nsString.h"
#include "nsIMsgFilterList.h"
#include "nsIMsgFilter.h"
#include "nsIMsgFilterHitNotify.h"
#include "nsTArray.h"
#include "nsTHashMap.h"
#include "mozilla/UniquePtr.h"

class nsOutputFileStream;
class nsIMsgFolder;

/* Used for the various things that parse RFC822 headers...
 */
typedef struct message_header {
  const char* value; /* The contents of a header (after ": ") */
  int32_t length;    /* The length of the data (it is not NULL-terminated.) */
} message_header;

// This object maintains the parse state for a single mail message.
class nsParseMailMessageState : public nsIMsgParseMailMsgState,
                                public nsIDBChangeListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGPARSEMAILMSGSTATE
  NS_DECL_NSIDBCHANGELISTENER

  nsParseMailMessageState();

  nsresult ParseFolderLine(const char* line, uint32_t lineLength);
  nsresult ParseHeaders();
  nsresult FinalizeHeaders();
  nsresult InternSubject(struct message_header* header);

  // Helpers for dealing with multi-value headers.
  struct message_header* GetNextHeaderInAggregate(
      nsTArray<struct message_header*>& list);
  void GetAggregateHeader(nsTArray<struct message_header*>& list,
                          struct message_header*);
  void ClearAggregateHeader(nsTArray<struct message_header*>& list);

  nsCOMPtr<nsIMsgDBHdr> m_newMsgHdr; /* current message header we're building */
  nsCOMPtr<nsIMsgDatabase> m_mailDB;
  nsCOMPtr<nsIMsgDatabase> m_backupMailDB;

  nsMailboxParseState m_state;
  int64_t m_position;
  // The start of the "From " line (the line before the start of the message).
  uint64_t m_envelope_pos;
  // The start of the message headers (immediately follows "From " line).
  uint64_t m_headerstartpos;
  nsMsgKey m_new_key;  // DB key for the new header.

  // The "From " line, if any.
  ::nsByteArray m_envelope;

  // These two point into the m_envelope buffer.
  struct message_header m_envelope_from;
  struct message_header m_envelope_date;

  // The raw header data.
  ::nsByteArray m_headers;

  // These all point into the m_headers buffer.
  struct message_header m_message_id;
  struct message_header m_references;
  struct message_header m_date;
  struct message_header m_delivery_date;
  struct message_header m_from;
  struct message_header m_sender;
  struct message_header m_newsgroups;
  struct message_header m_subject;
  struct message_header m_status;
  struct message_header m_mozstatus;
  struct message_header m_mozstatus2;
  struct message_header m_in_reply_to;
  struct message_header m_replyTo;
  struct message_header m_content_type;
  struct message_header m_bccList;

  // Support for having multiple To or Cc header lines in a message
  nsTArray<struct message_header*> m_toList;
  nsTArray<struct message_header*> m_ccList;

  struct message_header m_priority;
  struct message_header m_account_key;
  struct message_header m_keywords;

  // Mdn support
  struct message_header m_mdn_original_recipient;
  struct message_header m_return_path;
  struct message_header m_mdn_dnt; /* MDN Disposition-Notification-To: header */

  PRTime m_receivedTime;
  uint16_t m_body_lines;

  // this enables extensions to add the values of particular headers to
  // the .msf file as properties of nsIMsgHdr. It is initialized from a
  // pref, mailnews.customDBHeaders
  nsTArray<nsCString> m_customDBHeaders;
  struct message_header* m_customDBHeaderValues;
  nsCString m_receivedValue;  // accumulated received header
 protected:
  virtual ~nsParseMailMessageState();
};

// NOTE:
// nsMsgMailboxParser is a vestigial class, no longer used directly.
// It's been left in because it's a base class for nsParseNewMailState, but
// ultimately it should be removed completely.
// Originally, a single parser instance was used to handle multiple
// messages. But that made lots of inherent mbox-specific assumptions, and
// the carried-between-messages state made it very hard to follow.
class nsMsgMailboxParser : public nsIStreamListener,
                           public nsParseMailMessageState,
                           public nsMsgLineBuffer {
 public:
  explicit nsMsgMailboxParser(nsIMsgFolder*);
  nsMsgMailboxParser();
  nsresult Init();

  NS_DECL_ISUPPORTS_INHERITED

  ////////////////////////////////////////////////////////////////////////////////////////
  // we support the nsIStreamListener interface
  ////////////////////////////////////////////////////////////////////////////////////////
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  void SetDB(nsIMsgDatabase* mailDB) { m_mailDB = mailDB; }

  // message socket libnet callbacks, which come through folder pane
  nsresult ProcessMailboxInputStream(nsIInputStream* aIStream,
                                     uint32_t aLength);

  virtual void DoneParsingFolder(nsresult status);
  virtual void AbortNewHeader();

  // for nsMsgLineBuffer
  virtual nsresult HandleLine(const char* line, uint32_t line_length) override;

  void UpdateDBFolderInfo();
  void UpdateDBFolderInfo(nsIMsgDatabase* mailDB);
  void UpdateStatusText(const char* stringName);

  // Update the progress bar based on what we know.
  virtual void UpdateProgressPercent();
  virtual void OnNewMessage(nsIMsgWindow* msgWindow);

 protected:
  virtual ~nsMsgMailboxParser();
  nsCOMPtr<nsIMsgStatusFeedback> m_statusFeedback;

  virtual void PublishMsgHeader(nsIMsgWindow* msgWindow);

  // data
  nsString m_folderName;
  nsCString m_inboxUri;
  ::nsByteArray m_inputStream;
  uint64_t m_graph_progress_total;
  uint64_t m_graph_progress_received;

 private:
  nsWeakPtr m_folder;
  void ReleaseFolderLock();
  nsresult AcquireFolderLock();
};

class nsParseNewMailState : public nsMsgMailboxParser,
                            public nsIMsgFilterHitNotify {
 public:
  nsParseNewMailState();
  NS_DECL_ISUPPORTS_INHERITED

  nsresult Init(nsIMsgFolder* rootFolder, nsIMsgFolder* downloadFolder,
                nsIMsgWindow* aMsgWindow, nsIMsgDBHdr* aHdr,
                nsIOutputStream* aOutputStream);

  virtual void DoneParsingFolder(nsresult status) override;

  void DisableFilters() { m_disableFilters = true; }

  NS_DECL_NSIMSGFILTERHITNOTIFY

  nsOutputFileStream* GetLogFile();
  virtual void PublishMsgHeader(nsIMsgWindow* msgWindow) override;
  void GetMsgWindow(nsIMsgWindow** aMsgWindow);
  nsresult EndMsgDownload();

  nsresult AppendMsgFromStream(nsIInputStream* fileStream, nsIMsgDBHdr* aHdr,
                               nsIMsgFolder* destFolder);

  void ApplyFilters(bool* pMoved, nsIMsgWindow* msgWindow);
  nsresult ApplyForwardAndReplyFilter(nsIMsgWindow* msgWindow);
  virtual void OnNewMessage(nsIMsgWindow* msgWindow) override;

  // These three vars are public because they need to be carried between
  // messages.

  // this keeps track of how many messages we downloaded that
  // aren't new - e.g., marked read, or moved to an other server.
  int32_t m_numNotNewMessages;
  // Filter-initiated moves are collected to run all at once.
  RefPtr<nsImapMoveCoalescer> m_moveCoalescer;
  mozilla::UniquePtr<nsTHashMap<nsCStringHashKey, int32_t>>
      m_filterTargetFoldersMsgMovedCount;

 protected:
  virtual ~nsParseNewMailState();
  virtual nsresult GetTrashFolder(nsIMsgFolder** pTrashFolder);
  virtual nsresult MoveIncorporatedMessage(nsIMsgDBHdr* mailHdr,
                                           nsIMsgDatabase* sourceDB,
                                           nsIMsgFolder* destIFolder,
                                           nsIMsgFilter* filter,
                                           nsIMsgWindow* msgWindow);
  virtual void MarkFilteredMessageRead(nsIMsgDBHdr* msgHdr);
  virtual void MarkFilteredMessageUnread(nsIMsgDBHdr* msgHdr);

  nsCOMPtr<nsIMsgFilterList> m_filterList;
  nsCOMPtr<nsIMsgFilterList> m_deferredToServerFilterList;
  nsCOMPtr<nsIMsgFolder> m_rootFolder;
  nsCOMPtr<nsIMsgWindow> m_msgWindow;
  nsCOMPtr<nsIMsgFolder> m_downloadFolder;
  nsCOMPtr<nsIOutputStream> m_outputStream;
  nsCOMArray<nsIMsgFolder> m_filterTargetFolders;

  bool m_msgMovedByFilter;
  bool m_msgCopiedByFilter;
  bool m_disableFilters;

  // we have to apply the reply/forward filters in a second pass, after
  // msg quarantining and moving to other local folders, so we remember the
  // info we'll need to apply them with these vars.
  // these need to be arrays in case we have multiple reply/forward filters.
  nsTArray<nsCString> m_forwardTo;
  nsTArray<nsCString> m_replyTemplateUri;
  nsCOMPtr<nsIMsgDBHdr> m_msgToForwardOrReply;
  nsCOMPtr<nsIMsgFilter> m_filter;
  nsCOMPtr<nsIMsgRuleAction> m_ruleAction;
};

#endif
