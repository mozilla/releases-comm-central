/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_

#include "IEwsClient.h"
#include "nsICopyMessageListener.h"
#include "nsMsgDBFolder.h"
#include "nscore.h"

class EwsFolder : public nsMsgDBFolder {
 public:
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

 private:
  friend class ItemCopyMoveCallbacks;

  bool mHasLoadedSubfolders;

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
   * Looks up the trash folder for the current account.
   */
  nsresult GetTrashFolder(nsIMsgFolder** result);

  /**
   * Synchronize the message list for the current folder.
   */
  nsresult SyncMessages(nsIMsgWindow* window);
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDER_H_
