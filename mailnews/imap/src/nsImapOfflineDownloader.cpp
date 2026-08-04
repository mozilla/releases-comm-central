/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsImapOfflineDownloader.h"

#include "mozilla/Components.h"
#include "msgCore.h"
#include "nsIAppStartup.h"
#include "nsIAutoSyncManager.h"
#include "nsImapMailFolder.h"
#include "nsImapProtocol.h"  // For logging
#include "nsIMsgAccountManager.h"
#include "nsINntpIncomingServer.h"
#include "nsMsgUtils.h"
#include "nsMsgFolderFlags.h"

NS_IMPL_ISUPPORTS(nsImapOfflineDownloader, nsIUrlListener)

nsImapOfflineDownloader::nsImapOfflineDownloader(nsIMsgWindow* window,
                                                 nsIUrlListener* listener)
    : m_window(window), m_listener(listener) {
  // pause auto-sync service
  nsresult rv;
  nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
      do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv)) {
    autoSyncMgr->Pause();
  }
}

nsImapOfflineDownloader::~nsImapOfflineDownloader() {}

nsresult nsImapOfflineDownloader::ProcessNextOperation() {
  nsresult rv = NS_OK;

  if (!m_mailboxupdatesFinished) {
    if (AdvanceToNextServer()) {
      nsCOMPtr<nsIMsgFolder> rootMsgFolder;
      m_currentServer->GetRootFolder(getter_AddRefs(rootMsgFolder));
      nsCOMPtr<nsIMsgFolder> inbox;
      if (rootMsgFolder) {
        // Update the INBOX first so the updates on the remaining
        // folders pickup the results of any filter moves.
        rootMsgFolder->GetFolderWithFlags(nsMsgFolderFlags::Inbox,
                                          getter_AddRefs(inbox));
        if (inbox) {
          nsCOMPtr<nsIMsgFolder> offlineImapFolder;
          nsCOMPtr<nsIMsgImapMailFolder> imapInbox = do_QueryInterface(inbox);
          if (imapInbox) {
            rootMsgFolder->GetFolderWithFlags(
                nsMsgFolderFlags::Offline, getter_AddRefs(offlineImapFolder));
            if (!offlineImapFolder) {
              // no imap folders configured for offline use - check if the
              // account is set up so that we always download inbox msg bodies
              // for offline use
              nsCOMPtr<nsIImapIncomingServer> imapServer =
                  do_QueryInterface(m_currentServer);
              if (imapServer) {
                bool downloadBodiesOnGetNewMail = false;
                imapServer->GetDownloadBodiesOnGetNewMail(
                    &downloadBodiesOnGetNewMail);
                if (downloadBodiesOnGetNewMail) offlineImapFolder = inbox;
              }
            }
          }
          // if this isn't an imap inbox, or we have an offline imap sub-folder,
          // then update the inbox. otherwise, it's an imap inbox for an account
          // with no folders configured for offline use, so just advance to the
          // next server.
          if (!imapInbox || offlineImapFolder) {
            // here we should check if this a pop3 server/inbox, and the user
            // doesn't want to download pop3 mail for offline use.
            if (!imapInbox) {
            }
            rv = inbox->GetNewMessages(m_window, this);
            if (NS_SUCCEEDED(rv)) return rv;  // otherwise, fall through.
          }
        }
      }
      return ProcessNextOperation();  // recurse and do next server.
    }
    m_allServers.Clear();
    m_mailboxupdatesFinished = true;
  }

  while (AdvanceToNextFolder()) {
    uint32_t folderFlags;

    nsCOMPtr<nsIMsgImapMailFolder> imapFolder;
    if (m_currentFolder) imapFolder = do_QueryInterface(m_currentFolder);
    m_currentFolder->GetFlags(&folderFlags);
    // need to check if folder has offline events, or is configured for offline
    if (imapFolder && folderFlags & nsMsgFolderFlags::Offline &&
        !(folderFlags & nsMsgFolderFlags::Virtual)) {
      rv = m_currentFolder->DownloadAllForOffline(this, m_window);
      if (NS_SUCCEEDED(rv) || rv == NS_BINDING_ABORTED) return rv;
      // if this fails and the user didn't cancel/stop, fall through to code
      // that advances to next folder
    }
  }
  if (m_listener) m_listener->OnStopRunningUrl(nullptr, NS_OK);
  return rv;
}

NS_IMETHODIMP nsImapOfflineDownloader::OnStartRunningUrl(nsIURI* url) {
  return NS_OK;
}

NS_IMETHODIMP
nsImapOfflineDownloader::OnStopRunningUrl(nsIURI* url, nsresult exitCode) {
  nsresult rv = exitCode;

  bool isShuttingDown = false;
  nsCOMPtr<nsIAppStartup> appStartup(
      mozilla::components::AppStartup::Service());
  NS_ENSURE_TRUE(appStartup, NS_ERROR_FAILURE);
  appStartup->GetShuttingDown(&isShuttingDown);
  if (isShuttingDown) {
    if (m_listener) m_listener->OnStopRunningUrl(url, NS_BINDING_ABORTED);
    return NS_OK;
  }

  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(url);

  if (imapUrl)
    nsImapProtocol::LogImapUrl(NS_SUCCEEDED(rv) ? "offline imap url succeeded "
                                                : "offline imap url failed ",
                               imapUrl);

  if (NS_SUCCEEDED(exitCode) || exitCode == NS_MSG_ERROR_IMAP_COMMAND_FAILED) {
    rv = ProcessNextOperation();
  } else {
    // Else it's a non-stop error,  go to the next folder.
    if (AdvanceToNextFolder()) {
      rv = ProcessNextOperation();
    } else if (m_listener) {
      m_listener->OnStopRunningUrl(url, rv);
    }
  }

  return rv;
}

/**
 * Leaves m_currentServer at the next imap or local mail "server" that
 * might have offline events to playback, and m_folderQueue holding
 * a (reversed) list of all the folders to consider for that server.
 * If no more servers, m_currentServer will be left at nullptr and the
 * function returns false.
 */
bool nsImapOfflineDownloader::AdvanceToNextServer() {
  nsresult rv = NS_OK;

  if (m_allServers.IsEmpty()) {
    NS_ASSERTION(!m_currentServer, "this shouldn't be set");
    m_currentServer = nullptr;
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        mozilla::components::AccountManager::Service();
    rv = accountManager->GetAllServers(m_allServers);
    NS_ENSURE_SUCCESS(rv, false);
  }
  size_t serverIndex = 0;
  if (m_currentServer) {
    serverIndex = m_allServers.IndexOf(m_currentServer);
    if (serverIndex == m_allServers.NoIndex) {
      serverIndex = 0;
    } else {
      // Move to the next server
      ++serverIndex;
    }
  }
  m_currentServer = nullptr;
  nsCOMPtr<nsIMsgFolder> rootFolder;

  while (serverIndex < m_allServers.Length()) {
    nsCOMPtr<nsIMsgIncomingServer> server(m_allServers[serverIndex]);
    serverIndex++;

    nsCOMPtr<nsINntpIncomingServer> newsServer = do_QueryInterface(server);
    if (newsServer)  // news servers aren't involved in offline imap
      continue;

    if (server) {
      m_currentServer = server;
      server->GetRootFolder(getter_AddRefs(rootFolder));
      if (rootFolder) {
        rv = rootFolder->GetDescendants(m_folderQueue);
        if (NS_SUCCEEDED(rv)) {
          if (!m_folderQueue.IsEmpty()) {
            // We'll be popping folders off the end as they are processed.
            m_folderQueue.Reverse();
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Sets m_currentFolder to the next folder to process.
 *
 * @return  True if next folder to process was found, otherwise false.
 */
bool nsImapOfflineDownloader::AdvanceToNextFolder() {
  if (m_currentFolder) {
    m_currentFolder->SetMsgDatabase(nullptr);
    m_currentFolder = nullptr;
  }

  bool hasMore = false;
  if (m_currentServer) {
    hasMore = !m_folderQueue.IsEmpty();
  }
  if (!hasMore) {
    hasMore = AdvanceToNextServer();
  }
  if (hasMore) {
    m_currentFolder = m_folderQueue.PopLastElement();
  }
  return m_currentFolder;
}
