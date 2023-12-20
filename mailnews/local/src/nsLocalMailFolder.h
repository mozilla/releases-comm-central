/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Interface for representing Local Mail folders.
*/

#ifndef nsMsgLocalMailFolder_h__
#define nsMsgLocalMailFolder_h__

#include "LineReader.h"
#include "mozilla/Array.h"
#include "mozilla/Attributes.h"
#include "nsMsgDBFolder.h" /* include the interface we are going to support */
#include "nsICopyMessageListener.h"
#include "nsMsgTxn.h"
#include "nsIMsgMessageService.h"
#include "nsIMsgPluggableStore.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgFolder.h"
#include "nsIMsgWindow.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgStatusFeedback.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsISeekableStream.h"
#include "nsIStringBundle.h"
#include "nsLocalUndoTxn.h"

#define COPY_BUFFER_SIZE 16384

class nsParseMailMessageState;

struct nsLocalMailCopyState {
  nsLocalMailCopyState();
  virtual ~nsLocalMailCopyState();

  nsCOMPtr<nsIOutputStream> m_fileStream;
  nsCOMPtr<nsIMsgPluggableStore> m_msgStore;
  nsCOMPtr<nsISupports> m_srcSupport;
  /// Source nsIMsgDBHdr instances.
  nsTArray<RefPtr<nsIMsgDBHdr>> m_messages;
  /// Destination nsIMsgDBHdr instances.
  nsTArray<RefPtr<nsIMsgDBHdr>> m_destMessages;
  RefPtr<nsLocalMoveCopyMsgTxn> m_undoMsgTxn;
  nsCOMPtr<nsIMsgDBHdr> m_message;  // current copy message
  nsMsgMessageFlagType m_flags;     // current copy message flags
  RefPtr<nsParseMailMessageState> m_parseMsgState;
  nsCOMPtr<nsIMsgCopyServiceListener> m_listener;
  nsCOMPtr<nsIMsgWindow> m_msgWindow;
  nsCOMPtr<nsIMsgDatabase> m_destDB;

  // for displaying status;
  nsCOMPtr<nsIMsgStatusFeedback> m_statusFeedback;
  nsCOMPtr<nsIStringBundle> m_stringBundle;
  int64_t m_lastProgressTime;

  nsMsgKey m_curDstKey;
  uint32_t m_curCopyIndex;
  nsCOMPtr<nsIMsgMessageService> m_messageService;
  /// The number of messages in m_messages.
  uint32_t m_totalMsgCount;
  mozilla::Array<char, COPY_BUFFER_SIZE> m_dataBuffer;
  LineReader m_LineReader;
  bool m_isMove;
  bool m_isFolder;            // isFolder move/copy
  bool m_addXMozillaHeaders;  // Should prepend X-Mozilla-Status et al?
  bool m_copyingMultipleMessages;
  bool m_fromLineSeen;
  bool m_allowUndo;
  bool m_writeFailed;
  bool m_notifyFolderLoaded;
  nsCString m_newMsgKeywords;
  nsCOMPtr<nsIMsgDBHdr> m_newHdr;
};

struct nsLocalFolderScanState {
  nsLocalFolderScanState();
  ~nsLocalFolderScanState();

  nsCOMPtr<nsIInputStream> m_inputStream;
  nsCOMPtr<nsIMsgPluggableStore> m_msgStore;
  nsCString m_header;
  nsCString m_accountKey;
  const char* m_uidl;  // memory is owned by m_header
};

class nsMsgLocalMailFolder : public nsMsgDBFolder,
                             public nsIMsgLocalMailFolder,
                             public nsICopyMessageListener {
 public:
  nsMsgLocalMailFolder(void);
  NS_DECL_NSICOPYMESSAGELISTENER
  NS_DECL_NSIMSGLOCALMAILFOLDER
  NS_DECL_NSIJUNKMAILCLASSIFICATIONLISTENER
  NS_DECL_ISUPPORTS_INHERITED

  // nsIUrlListener methods
  NS_IMETHOD OnStartRunningUrl(nsIURI* aUrl) override;
  NS_IMETHOD OnStopRunningUrl(nsIURI* aUrl, nsresult aExitCode) override;

  // nsIMsgFolder methods:
  NS_IMETHOD GetSubFolders(nsTArray<RefPtr<nsIMsgFolder>>& folders) override;
  NS_IMETHOD GetMsgDatabase(nsIMsgDatabase** aMsgDatabase) override;

  NS_IMETHOD OnAnnouncerGoingAway(nsIDBChangeAnnouncer* instigator) override;
  NS_IMETHOD UpdateFolder(nsIMsgWindow* aWindow) override;

  NS_IMETHOD CreateSubfolder(const nsAString& folderName,
                             nsIMsgWindow* msgWindow) override;

  NS_IMETHOD Compact(nsIUrlListener* aListener,
                     nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD CompactAll(nsIUrlListener* aListener,
                        nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD EmptyTrash(nsIUrlListener* aListener) override;
  NS_IMETHOD DeleteSelf(nsIMsgWindow* msgWindow) override;
  NS_IMETHOD CreateStorageIfMissing(nsIUrlListener* urlListener) override;
  NS_IMETHOD Rename(const nsAString& aNewName,
                    nsIMsgWindow* msgWindow) override;
  NS_IMETHOD RenameSubFolders(nsIMsgWindow* msgWindow,
                              nsIMsgFolder* oldFolder) override;

  NS_IMETHOD GetPrettyName(nsAString& prettyName)
      override;  // Override of the base, for top-level mail folder
  NS_IMETHOD SetPrettyName(const nsAString& aName) override;

  NS_IMETHOD GetFolderURL(nsACString& url) override;

  NS_IMETHOD GetManyHeadersToDownload(bool* retval) override;

  NS_IMETHOD GetDeletable(bool* deletable) override;
  NS_IMETHOD GetSizeOnDisk(int64_t* size) override;

  NS_IMETHOD GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                  nsIMsgDatabase** db) override;

  NS_IMETHOD DeleteMessages(nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
                            nsIMsgWindow* msgWindow, bool deleteStorage,
                            bool isMove, nsIMsgCopyServiceListener* listener,
                            bool allowUndo) override;
  MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHOD CopyMessages(
      nsIMsgFolder* srcFolder, nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
      bool isMove, nsIMsgWindow* msgWindow, nsIMsgCopyServiceListener* listener,
      bool isFolder, bool allowUndo) override;
  NS_IMETHOD CopyFolder(nsIMsgFolder* srcFolder, bool isMoveFolder,
                        nsIMsgWindow* msgWindow,
                        nsIMsgCopyServiceListener* listener) override;
  NS_IMETHOD CopyFileMessage(nsIFile* aFile, nsIMsgDBHdr* msgToReplace,
                             bool isDraftOrTemplate, uint32_t newMsgFlags,
                             const nsACString& aNewMsgKeywords,
                             nsIMsgWindow* msgWindow,
                             nsIMsgCopyServiceListener* listener) override;

  NS_IMETHOD AddMessageDispositionState(
      nsIMsgDBHdr* aMessage, nsMsgDispositionState aDispositionFlag) override;
  NS_IMETHOD MarkMessagesRead(const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
                              bool aMarkRead) override;
  NS_IMETHOD MarkMessagesFlagged(const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
                                 bool aMarkFlagged) override;
  NS_IMETHOD MarkAllMessagesRead(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD MarkThreadRead(nsIMsgThread* thread) override;
  NS_IMETHOD GetNewMessages(nsIMsgWindow* aWindow,
                            nsIUrlListener* aListener) override;
  NS_IMETHOD NotifyCompactCompleted() override;
  NS_IMETHOD Shutdown(bool shutdownChildren) override;

  NS_IMETHOD WriteToFolderCacheElem(nsIMsgFolderCacheElement* element) override;
  NS_IMETHOD ReadFromFolderCacheElem(
      nsIMsgFolderCacheElement* element) override;

  NS_IMETHOD GetName(nsAString& aName) override;

  // Used when headers_only is TRUE
  NS_IMETHOD DownloadMessagesForOffline(
      nsTArray<RefPtr<nsIMsgDBHdr>> const& aMessages,
      nsIMsgWindow* aWindow) override;
  NS_IMETHOD HasMsgOffline(nsMsgKey msgKey, bool* result) override;
  NS_IMETHOD GetLocalMsgStream(nsIMsgDBHdr* hdr,
                               nsIInputStream** stream) override;
  NS_IMETHOD FetchMsgPreviewText(nsTArray<nsMsgKey> const& aKeysToFetch,
                                 nsIUrlListener* aUrlListener,
                                 bool* aAsyncResults) override;
  NS_IMETHOD AddKeywordsToMessages(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
      const nsACString& aKeywords) override;
  NS_IMETHOD RemoveKeywordsFromMessages(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
      const nsACString& aKeywords) override;
  NS_IMETHOD GetIncomingServerType(nsACString& serverType) override;

 protected:
  virtual ~nsMsgLocalMailFolder();
  nsresult CopyFolderAcrossServer(nsIMsgFolder* srcFolder,
                                  nsIMsgWindow* msgWindow,
                                  nsIMsgCopyServiceListener* listener,
                                  bool moveMsgs);

  nsresult CreateSubFolders(nsIFile* path);
  nsresult GetTrashFolder(nsIMsgFolder** trashFolder);
  nsresult WriteStartOfNewMessage();

  // CreateSubfolder, but without the nsIMsgFolderListener notification
  nsresult CreateSubfolderInternal(const nsAString& folderName,
                                   nsIMsgWindow* msgWindow,
                                   nsIMsgFolder** aNewFolder);

  nsresult IsChildOfTrash(bool* result);
  nsresult RecursiveSetDeleteIsMoveTrash(bool bVal);
  nsresult ConfirmFolderDeletion(nsIMsgWindow* aMsgWindow,
                                 nsIMsgFolder* aFolder, bool* aResult);

  nsresult GetDatabase() override;
  // this will set mDatabase, if successful. It will also create a .msf file
  // for an empty local mail folder. It will leave invalid DBs in place, and
  // return an error.
  nsresult OpenDatabase();

  // copy message helper
  nsresult DisplayMoveCopyStatusMsg();

  nsresult CopyMessageTo(nsISupports* message, nsIMsgWindow* msgWindow,
                         bool isMove);

  /**
   * Checks if there's room in the target folder to copy message(s) into.
   * If not, handles alerting the user, and sending the copy notifications.
   */
  bool CheckIfSpaceForCopy(nsIMsgWindow* msgWindow, nsIMsgFolder* srcFolder,
                           nsISupports* srcSupports, bool isMove,
                           int64_t totalMsgSize);

  // copy multiple messages at a time from this folder
  nsresult CopyMessagesTo(nsTArray<nsMsgKey>& keyArray,
                          nsIMsgWindow* aMsgWindow, bool isMove);
  nsresult InitCopyState(nsISupports* aSupport,
                         nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
                         bool isMove, nsIMsgCopyServiceListener* listener,
                         nsIMsgWindow* msgWindow, bool isMoveFolder,
                         bool allowUndo);
  nsresult InitCopyMsgHdrAndFileStream();
  // preserve message metadata when moving or copying messages
  void CopyPropertiesToMsgHdr(nsIMsgDBHdr* destHdr, nsIMsgDBHdr* srcHdr,
                              bool isMove);
  virtual nsresult CreateBaseMessageURI(const nsACString& aURI) override;
  nsresult ChangeKeywordForMessages(
      nsTArray<RefPtr<nsIMsgDBHdr>> const& aMessages,
      const nsACString& aKeyword, bool add);
  bool GetDeleteFromServerOnMove();
  void CopyHdrPropertiesWithSkipList(nsIMsgDBHdr* destHdr, nsIMsgDBHdr* srcHdr,
                                     const nsCString& skipList);
  bool CopyLine(mozilla::Span<const char> line);

  nsLocalMailCopyState* mCopyState;  // We only allow one of these at a time
  nsCString mType;
  bool mHaveReadNameFromDB;
  bool mInitialized;
  bool mCheckForNewMessagesAfterParsing;
  bool m_parsingFolder;
  nsCOMPtr<nsIUrlListener> mReparseListener;
  nsTArray<nsMsgKey> mSpamKeysToMove;
  nsresult setSubfolderFlag(const nsAString& aFolderName, uint32_t flags);

  // Helper fn used by ParseFolder().
  void FinishUpAfterParseFolder(nsresult status);

  // state variables for DownloadMessagesForOffline

  nsCOMArray<nsIMsgDBHdr> mDownloadMessages;
  nsCOMPtr<nsIMsgWindow> mDownloadWindow;
  nsMsgKey mDownloadSelectKey;
  uint32_t mDownloadState;
#define DOWNLOAD_STATE_NONE 0
#define DOWNLOAD_STATE_INITED 1
#define DOWNLOAD_STATE_GOTMSG 2
#define DOWNLOAD_STATE_DIDSEL 3
};

#endif  // nsMsgLocalMailFolder_h__
