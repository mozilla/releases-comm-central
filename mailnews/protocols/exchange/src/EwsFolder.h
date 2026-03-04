/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_

#include "IEwsClient.h"
#include "IEwsFolder.h"
#include "mozilla/HashTable.h"
#include "nsMsgDBFolder.h"
#include "nscore.h"

/**
 * Create a new local folder with the given EWS ID and name under the given
 * parent.
 */
nsresult CreateNewLocalEwsFolder(nsIMsgFolder* parent, const nsACString& ewsId,
                                 const nsACString& folderName,
                                 nsIMsgFolder** createdFolder);

class nsAutoSyncState;
class IHeaderBlock;

/**
 * The EWS implementation for `nsIMsgFolder` which represents a folder in an EWS
 * account.
 */
class EwsFolder : public nsMsgDBFolder, public IEwsFolder {
 public:
  NS_DECL_IEWSFOLDER
  NS_DECL_ISUPPORTS_INHERITED

  EwsFolder();

  friend class MessageDeletionCallbacks;
  friend class MessageOperationCallbacks;

  /**
   * Locally look up the EWS ID for the current folder.
   */
  nsresult GetEwsId(nsACString& ewsId);

 public:
  // The XPCOM interface(s).
  NS_IMETHOD CreateStorageIfMissing(nsIUrlListener* urlListener) override;
  NS_IMETHOD CreateSubfolder(const nsACString& folderName,
                             nsIMsgWindow* msgWindow) override;
  NS_IMETHOD CopyFileMessage(nsIFile* aFile, nsIMsgDBHdr* msgToReplace,
                             bool isDraftOrTemplate, uint32_t newMsgFlags,
                             const nsACString& aNewMsgKeywords,
                             nsIMsgWindow* msgWindow,
                             nsIMsgCopyServiceListener* listener) override;
  NS_IMETHOD CopyMessages(nsIMsgFolder* srcFolder,
                          nsTArray<RefPtr<nsIMsgDBHdr>> const& srcHdrs,
                          bool isMove, nsIMsgWindow* msgWindow,
                          nsIMsgCopyServiceListener* listener, bool isFolder,
                          bool allowUndo) override;
  NS_IMETHOD DeleteMessages(const nsTArray<RefPtr<nsIMsgDBHdr>>& msgHeaders,
                            nsIMsgWindow* msgWindow, bool deleteStorage,
                            bool isMove, nsIMsgCopyServiceListener* listener,
                            bool allowUndo) override;
  NS_IMETHOD EmptyTrash(nsIUrlListener* aListener) override;
  NS_IMETHOD CopyFolder(nsIMsgFolder* srcFolder, bool isMoveFolder,
                        nsIMsgWindow* window,
                        nsIMsgCopyServiceListener* listener) override;
  NS_IMETHOD DeleteSelf(nsIMsgWindow* aWindow) override;
  NS_IMETHOD GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                  nsIMsgDatabase** _retval) override;
  NS_IMETHOD GetSupportsOffline(bool* supportsOffline) override;
  NS_IMETHOD GetDeletable(bool* deletable) override;
  NS_IMETHOD GetIncomingServerType(nsACString& aIncomingServerType) override;
  NS_IMETHOD GetNewMessages(nsIMsgWindow* aWindow,
                            nsIUrlListener* aListener) override;
  NS_IMETHOD GetSubFolders(
      nsTArray<RefPtr<nsIMsgFolder>>& aSubFolders) override;
  NS_IMETHOD MarkMessagesRead(const nsTArray<RefPtr<nsIMsgDBHdr>>& messages,
                              bool markRead) override;
  NS_IMETHOD MarkAllMessagesRead(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD RenameSubFolders(nsIMsgWindow* msgWindow,
                              nsIMsgFolder* oldFolder) override;
  NS_IMETHOD Rename(const nsACString& aNewName,
                    nsIMsgWindow* msgWindow) override;
  NS_IMETHOD UpdateFolder(nsIMsgWindow* aWindow) override;
  NS_IMETHOD Compact(nsIUrlListener* aListener,
                     nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD CompactAll(nsIUrlListener* aListener,
                        nsIMsgWindow* aMsgWindow) override;

  NS_IMETHOD AddSubfolder(const nsACString& name,
                          nsIMsgFolder** newFolder) override;

  NS_IMETHOD OnMessageClassified(const nsACString& aMsgURI,
                                 nsMsgJunkStatus aClassification,
                                 uint32_t aJunkPercent) override;

  NS_IMETHOD HandleViewCommand(nsMsgViewCommandTypeValue command,
                               const nsTArray<nsMsgKey>& messageKeys,
                               nsIMsgWindow* window,
                               nsIMsgCopyServiceListener* listener) override;

  NS_IMETHOD FetchMsgPreviewText(nsTArray<nsMsgKey> const& aKeysToFetch,
                                 nsIUrlListener* aUrlListener,
                                 bool* aAsyncResults) override;
  NS_IMETHOD GetAutoSyncStateObj(nsIAutoSyncState** autoSyncStateObj) override;

  NS_IMETHOD WriteToFolderCacheElem(nsIMsgFolderCacheElement* element) override;
  NS_IMETHOD ReadFromFolderCacheElem(
      nsIMsgFolderCacheElement* element) override;

  NS_IMETHOD MarkMessagesFlagged(const nsTArray<RefPtr<nsIMsgDBHdr>>& messages,
                                 bool markFlagged) override;

 protected:
  virtual ~EwsFolder();

  virtual nsresult CreateBaseMessageURI(const nsACString& aURI) override;
  virtual nsresult GetDatabase() override;

 private:
  nsresult CreateChildrenFromStore();
  bool mHasLoadedSubfolders;

  // The OnMessageClassified() implementation uses this to accumulate the
  // list of messages to move to the junk folder.
  // OnMessageClassified() is called once per message, then one last time
  // to indicate the end of the batch. At that point it performs a move
  // of the accumulated messages.
  nsTArray<nsMsgKey> mSpamKeysToMove;

  /**
   * Generate or retrieve an EWS API client capable of interacting with the EWS
   * server this folder depends from.
   */
  nsresult GetProtocolClient(IEwsClient** ewsClient);

  /**
   * Look up the trash folder for the current account.
   */
  nsresult GetTrashFolder(nsIMsgFolder** result);

  /**
   * Synchronize the message list for the current folder.
   */
  nsresult SyncMessages(nsIMsgWindow* window, nsIUrlListener* urlListener);

  /**
   * Look up the message database entry matching a given EWS ID.
   *
   * `NS_ERROR_NOT_AVAILABLE` is returned if no such database entry was found.
   */
  nsresult GetHdrForEwsId(const nsACString& ewsId, nsIMsgDBHdr** hdr);

  /**
   * Handle a generic message or folder delete operation.
   *
   * If `forceHardDelete` is true, then this will call `onHardDelete`, otherwise
   * whether `onHardDelete` or `onSoftDelete` is called will depend on the
   * server delete model configuration and whether this is the configured trash
   * folder for the server.
   */
  nsresult HandleDeleteOperation(
      bool forceHardDelete, std::function<nsresult()>&& onHardDelete,
      std::function<nsresult(IEwsFolder* trashFolder)>&& onSoftDelete);

  /**
   * Get the nsAutoSyncState for this folder, used for interacting with
   * AutoSyncManager (for downloading messages in the background etc...)
   * Created lazily, so use this instead of mAutoSyncState!
   */
  nsAutoSyncState* AutoSyncState();

  // Don't use this directly - it's created lazily by AutoSyncState().
  RefPtr<nsAutoSyncState> mAutoSyncState;

  /**
   * Tracks the set of messages which require filtering. New messages are
   * added to this when their headers are first received from the server,
   * then removed when they've been filtered - see PerformFiltering().
   * Messages copied in from other folders wouldn't appear here.
   * Note that it's perfectly reasonable to have a null headerblock here -
   * if the filters require the full message body, that'll include the
   * headers, so there's no point accumulating them here.
   */
  mozilla::HashMap<nsMsgKey, RefPtr<IHeaderBlock>> mFilterQueue;

  /**
   * PerformFiltering() attempts to apply filtering to as many messages in the
   * mFilterQueue set as possible.
   * It's a best-effort approach - if the filterlist requires full message
   * bodies for matching, only messages which have local (offline) copies
   * can be processed.
   *
   * Messages which are filtered are removed from mFilterQueue, and
   * the rest are left, in the hopes that the next time PerformFiltering() is
   * called, things might have changed.
   */
  nsresult PerformFiltering();

  /** Which exchange protocol this folder was created with. */
  nsAutoCString mExchangeProtocol;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_
