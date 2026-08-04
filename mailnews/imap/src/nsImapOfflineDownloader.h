/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMAP_SRC_NSIMAPOFFLINEDOWNLOADER_H_
#define COMM_MAILNEWS_IMAP_SRC_NSIMAPOFFLINEDOWNLOADER_H_

#include "nsIMsgDatabase.h"
#include "nsIMsgIncomingServer.h"
#include "nsIUrlListener.h"
#include "nsCOMPtr.h"
#include "nsTArray.h"

class nsIMsgWindow;
class nsIMsgFolder;
class nsIMsgIncomingServer;
class nsIMsgOfflineOpsDatabase;

/**
 * nsImapOfflineDownloader is a helper class which goes through all the IMAP
 * folders and attempts to download the messages for offline use, depending
 * on various folder settings.
 * Its only known use is by nsIMsgOfflineManager.SynchronizeForOffline(),
 * when the downloadMail param is true.
 *
 * It pauses any ongoing nsAutoSyncManager activity while it works.

 * NOTES for future work:
 * This functionality should just be merged into whatever ends up
 * replacing nsAutoSyncManager. We could merge it in right now, but
 * nsAutoSyncManager is already so overcomplicated and in need of
 * a rewrite that it's better to wait.
 */
class nsImapOfflineDownloader : public nsIUrlListener {
 public:
  nsImapOfflineDownloader(nsIMsgWindow* window, nsIUrlListener* listener);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIURLLISTENER

  virtual nsresult ProcessNextOperation();  // this kicks off download
 protected:
  virtual ~nsImapOfflineDownloader();

 private:
  nsCOMPtr<nsIMsgWindow> m_window;
  nsCOMPtr<nsIUrlListener> m_listener;

  nsTArray<RefPtr<nsIMsgIncomingServer>> m_allServers;
  nsCOMPtr<nsIMsgIncomingServer> m_currentServer;
  // Folders left to consider on m_currentServer.
  nsTArray<RefPtr<nsIMsgFolder>> m_folderQueue;
  nsCOMPtr<nsIMsgFolder> m_currentFolder;
  bool m_mailboxupdatesFinished;

  bool AdvanceToNextServer();
  bool AdvanceToNextFolder();
};

#endif  // COMM_MAILNEWS_IMAP_SRC_NSIMAPOFFLINEDOWNLOADER_H_
