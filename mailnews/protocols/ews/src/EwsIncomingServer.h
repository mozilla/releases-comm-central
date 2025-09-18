/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSINCOMINGSERVER_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSINCOMINGSERVER_H_

#include "IEwsIncomingServer.h"
#include "msgIOAuth2Module.h"
#include "nsMsgIncomingServer.h"

#define EWS_INCOMING_SERVER_IID \
  {0x6eaa0a24, 0x78f6, 0x4ad7, {0xa2, 0x8a, 0x07, 0x7d, 0x24, 0x02, 0x2c, 0xd2}}

class FolderSyncListener;

class EwsIncomingServer : public nsMsgIncomingServer,
                          public IEwsIncomingServer {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_IEWSINCOMINGSERVER

  EwsIncomingServer();

  NS_INLINE_DECL_STATIC_IID(EWS_INCOMING_SERVER_IID)

 protected:
  virtual ~EwsIncomingServer();

  /**
   * Locally creates a folder with the given properties. Intended to be called
   * by a friend class such as `FolderSyncListener`.
   */
  nsresult MaybeCreateFolderWithDetails(const nsACString& id,
                                        const nsACString& parentId,
                                        const nsACString& name, uint32_t flags);
  // Delete the folder with the given id. Intended to be called by a friend
  // class such as `FolderSyncListener`.
  nsresult DeleteFolderWithId(const nsACString& id);

  nsresult UpdateFolderWithDetails(const nsACString& id,
                                   const nsACString& parentId,
                                   const nsACString& name,
                                   nsIMsgWindow* msgWindow);

  // nsIMsgIncomingServer
  NS_IMETHOD GetPassword(nsAString& password) override;
  NS_IMETHOD GetPort(int32_t* aPort) override;
  NS_IMETHOD GetLocalStoreType(nsACString& aLocalStoreType) override;
  NS_IMETHOD GetLocalDatabaseType(nsACString& aLocalDatabaseType) override;
  NS_IMETHOD GetCanBeDefaultServer(bool* canBeDefaultServer) override;

  NS_IMETHOD GetNewMessages(nsIMsgFolder* aFolder, nsIMsgWindow* aMsgWindow,
                            nsIUrlListener* aUrlListener) override;
  NS_IMETHOD PerformBiff(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD PerformExpand(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD VerifyLogon(nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow,
                         nsIURI** _retval) override;

 private:
  /**
   * Retrieve the folder associated with the given EWS ID. If no such folder
   * could be found, `NS_ERROR_FAILURE` is returned.
   */
  nsresult FindFolderWithId(const nsACString& id, nsIMsgFolder** _retval);

  /**
   * Synchronize the list of folders for this account, then call the given
   * callback function.
   */
  nsresult SyncFolderList(nsIMsgWindow* aMsgWindow,
                          std::function<nsresult()> postSyncCallback);

  /**
   * Synchronize the message list for the given list of folders.
   */
  nsresult SyncFolders(const nsTArray<RefPtr<nsIMsgFolder>>& folders,
                       nsIMsgWindow* aMsgWindow, nsIUrlListener* urlListener);
  /**
   * Synchronize the message list for every folder in the account.
   */
  nsresult SyncAllFolders(nsIMsgWindow* aMsgWindow,
                          nsIUrlListener* urlListener);

  RefPtr<msgIOAuth2Module> mOAuth2Module;

  friend class FolderSyncListener;

  nsresult GetTrashFolder(nsIMsgFolder** trashFolder);
  nsresult UpdateTrashFolder();
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSINCOMINGSERVER_H_
