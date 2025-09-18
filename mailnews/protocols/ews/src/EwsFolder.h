/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_

#include "IEwsClient.h"
#include "IEwsFolder.h"
#include "nsICopyMessageListener.h"
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

 protected:
  virtual ~EwsFolder();

  virtual nsresult CreateBaseMessageURI(const nsACString& aURI) override;
  virtual nsresult GetDatabase() override;

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
  NS_IMETHOD CopyFolder(nsIMsgFolder* srcFolder, bool isMoveFolder,
                        nsIMsgWindow* window,
                        nsIMsgCopyServiceListener* listener) override;
  NS_IMETHOD DeleteSelf(nsIMsgWindow* aWindow) override;
  NS_IMETHOD GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                  nsIMsgDatabase** _retval) override;
  NS_IMETHOD GetDeletable(bool* deletable) override;
  NS_IMETHOD GetIncomingServerType(nsACString& aIncomingServerType) override;
  NS_IMETHOD GetNewMessages(nsIMsgWindow* aWindow,
                            nsIUrlListener* aListener) override;
  NS_IMETHOD GetSubFolders(
      nsTArray<RefPtr<nsIMsgFolder>>& aSubFolders) override;
  NS_IMETHOD MarkMessagesRead(const nsTArray<RefPtr<nsIMsgDBHdr>>& messages,
                              bool markRead) override;
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

 private:
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
  nsresult GetEwsClient(IEwsClient** ewsClient);

  /**
   * Locally look up the EWS ID for the current folder.
   */
  nsresult GetEwsId(nsACString& ewsId);

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
   * Apply the current filters to a list of new messages.
   */
  nsresult ApplyFilters(const nsTArray<RefPtr<nsIMsgDBHdr>>& newMessages);

  /**
   * Get the nsAutoSyncState for this folder, used for interacting with
   * AutoSyncManager (for downloading messages in the background etc...)
   * Created lazily, so use this instead of mAutoSyncState!
   */
  nsAutoSyncState* AutoSyncState();

  // Don't use this directly - it's created lazily by AutoSyncState().
  RefPtr<nsAutoSyncState> mAutoSyncState;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_
