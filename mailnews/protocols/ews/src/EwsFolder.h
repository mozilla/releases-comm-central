/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_FOLDER_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_FOLDER_H

#include "IEwsClient.h"
#include "nsMsgDBFolder.h"
#include "nscore.h"

class EwsFolder : public nsMsgDBFolder {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  EwsFolder();

 protected:
  virtual ~EwsFolder();

  virtual nsresult CreateBaseMessageURI(const nsACString& aURI) override;
  virtual nsresult GetDatabase() override;

  NS_IMETHOD CreateStorageIfMissing(nsIUrlListener* urlListener) override;
  NS_IMETHOD CreateSubfolder(const nsAString& folderName,
                             nsIMsgWindow* msgWindow) override;
  NS_IMETHOD CopyFileMessage(nsIFile* aFile, nsIMsgDBHdr* msgToReplace,
                             bool isDraftOrTemplate, uint32_t newMsgFlags,
                             const nsACString& aNewMsgKeywords,
                             nsIMsgWindow* msgWindow,
                             nsIMsgCopyServiceListener* listener) override;
  NS_IMETHOD GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                  nsIMsgDatabase** _retval) override;

  NS_IMETHOD GetFolderURL(nsACString& aFolderURL) override;
  NS_IMETHOD GetIncomingServerType(nsACString& aIncomingServerType) override;
  NS_IMETHOD GetNewMessages(nsIMsgWindow* aWindow,
                            nsIUrlListener* aListener) override;
  NS_IMETHOD GetSubFolders(
      nsTArray<RefPtr<nsIMsgFolder>>& aSubFolders) override;
  NS_IMETHOD RenameSubFolders(nsIMsgWindow* msgWindow,
                              nsIMsgFolder* oldFolder) override;
  NS_IMETHOD UpdateFolder(nsIMsgWindow* aWindow) override;
  NS_IMETHOD MarkMessagesRead(const nsTArray<RefPtr<nsIMsgDBHdr>>& messages,
                              bool markRead) override;
  NS_IMETHOD DeleteMessages(nsTArray<RefPtr<nsIMsgDBHdr>> const& msgHeaders,
                            nsIMsgWindow* msgWindow, bool deleteStorage,
                            bool isMove, nsIMsgCopyServiceListener* listener,
                            bool allowUndo) override;
  NS_IMETHOD DeleteSelf(nsIMsgWindow* aWindow) override;
  NS_IMETHOD GetDeletable(bool* deletable) override;

 private:
  bool mHasLoadedSubfolders;

  // Generate or retrieve an EWS API client capable of interacting with the EWS
  // server this folder depends from.
  nsresult GetEwsClient(IEwsClient** ewsClient);

  // Locally look up the EWS ID for the current folder.
  nsresult GetEwsId(nsACString& ewsId);
};

#endif
