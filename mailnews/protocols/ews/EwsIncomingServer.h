/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_INCOMING_SERVER_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_INCOMING_SERVER_H

#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "msgIOAuth2Module.h"
#include "nsMsgIncomingServer.h"

#define EWS_INCOMING_SERVER_IID                      \
  {                                                  \
    0x6eaa0a24, 0x78f6, 0x4ad7, {                    \
      0xa2, 0x8a, 0x07, 0x7d, 0x24, 0x02, 0x2c, 0xd2 \
    }                                                \
  }

class FolderSyncListener;

class EwsIncomingServer : public nsMsgIncomingServer,
                          public IEwsIncomingServer {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_IEWSINCOMINGSERVER

  EwsIncomingServer();

  NS_DECLARE_STATIC_IID_ACCESSOR(EWS_INCOMING_SERVER_IID)

 protected:
  virtual ~EwsIncomingServer();

  // nsMsgIncomingServer
  nsresult CreateFolderWithDetails(const nsACString& id,
                                   const nsACString& parentId,
                                   const nsAString& name, uint32_t flags);

  // nsIMsgIncomingServer
  NS_IMETHOD GetLocalStoreType(nsACString& aLocalStoreType) override;
  NS_IMETHOD GetLocalDatabaseType(nsACString& aLocalDatabaseType) override;

  NS_IMETHOD GetNewMessages(nsIMsgFolder* aFolder, nsIMsgWindow* aMsgWindow,
                            nsIUrlListener* aUrlListener) override;
  NS_IMETHOD PerformBiff(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD PerformExpand(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD VerifyLogon(nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow,
                         nsIURI** _retval) override;

 private:
  nsresult FindFolderWithId(const nsACString& id, nsIMsgFolder** _retval);

  RefPtr<msgIOAuth2Module> mOAuth2Module;

  friend class FolderSyncListener;
};

NS_DEFINE_STATIC_IID_ACCESSOR(EwsIncomingServer, EWS_INCOMING_SERVER_IID)

#endif
