/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nntpCore.h"
#include "netCore.h"
#include "nsIMsgNewsFolder.h"
#include "nsIStringBundle.h"
#include "nsNewsDownloader.h"
#include "nsINntpService.h"
#include "nsIMsgSearchSession.h"
#include "nsIMsgSearchTerm.h"
#include "nsIMsgAccountManager.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgMailSession.h"
#include "nsMsgMessageFlags.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgUtils.h"
#include "mozilla/Components.h"

// This file contains the news article download state machine.

// if pIds is not null, download the articles whose id's are passed in.
// Otherwise, which articles to download is determined by nsNewsDownloader
// object, or subclasses thereof. News can download marked objects, for example.
nsresult nsNewsDownloader::DownloadArticles(nsIMsgWindow* window,
                                            nsIMsgFolder* folder,
                                            nsTArray<nsMsgKey>* pIds) {
  if (pIds != nullptr)
    m_keysToDownload.InsertElementsAt(0, pIds->Elements(), pIds->Length());

  if (!m_keysToDownload.IsEmpty()) m_downloadFromKeys = true;

  m_folder = folder;
  m_window = window;
  m_numwrote = 0;

  bool headersToDownload = GetNextHdrToRetrieve();
  // should we have a special error code for failure here?
  return (headersToDownload) ? DownloadNext(true) : NS_ERROR_FAILURE;
}

/* Saving news messages
 */

NS_IMPL_ISUPPORTS(nsNewsDownloader, nsIUrlListener, nsIMsgSearchNotify)

nsNewsDownloader::nsNewsDownloader(nsIMsgWindow* window, nsIMsgDatabase* msgDB,
                                   nsIUrlListener* listener) {
  m_numwrote = 0;
  m_downloadFromKeys = false;
  m_newsDB = msgDB;
  m_abort = false;
  m_listener = listener;
  m_window = window;
  m_lastPercent = -1;
  m_lastProgressTime = 0;
  // not the perfect place for this, but I think it will work.
  if (m_window) m_window->SetStopped(false);
}

nsNewsDownloader::~nsNewsDownloader() {
  if (m_listener)
    m_listener->OnStopRunningUrl(/* don't have a url */ nullptr, m_status);
  if (m_newsDB) {
    m_newsDB->Commit(nsMsgDBCommitType::kLargeCommit);
    m_newsDB = nullptr;
  }
}

NS_IMETHODIMP nsNewsDownloader::OnStartRunningUrl(nsIURI* url) { return NS_OK; }

NS_IMETHODIMP nsNewsDownloader::OnStopRunningUrl(nsIURI* url,
                                                 nsresult exitCode) {
  bool stopped = false;
  if (m_window) m_window->GetStopped(&stopped);
  if (stopped) exitCode = NS_BINDING_ABORTED;

  nsresult rv = exitCode;
  if (NS_SUCCEEDED(exitCode) || exitCode == NS_MSG_NEWS_ARTICLE_NOT_FOUND)
    rv = DownloadNext(false);

  return rv;
}

nsresult nsNewsDownloader::DownloadNext(bool firstTimeP) {
  nsresult rv;
  if (!firstTimeP) {
    bool moreHeaders = GetNextHdrToRetrieve();
    if (!moreHeaders) {
      if (m_listener) m_listener->OnStopRunningUrl(nullptr, NS_OK);
      return NS_OK;
    }
  }
  StartDownload();
  m_wroteAnyP = false;
  nsCOMPtr<nsINntpService> nntpService =
      do_GetService("@mozilla.org/messenger/nntpservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> uri;
  return nntpService->FetchMessage(m_folder, m_keyToDownload, m_window, nullptr,
                                   this, getter_AddRefs(uri));
}

bool DownloadNewsArticlesToOfflineStore::GetNextHdrToRetrieve() {
  nsresult rv;

  if (m_downloadFromKeys) return nsNewsDownloader::GetNextHdrToRetrieve();

  if (m_headerEnumerator == nullptr)
    rv = m_newsDB->EnumerateMessages(getter_AddRefs(m_headerEnumerator));

  bool hasMore = false;

  while (NS_SUCCEEDED(rv = m_headerEnumerator->HasMoreElements(&hasMore)) &&
         hasMore) {
    rv = m_headerEnumerator->GetNext(getter_AddRefs(m_newsHeader));
    NS_ENSURE_SUCCESS(rv, false);
    uint32_t hdrFlags;
    m_newsHeader->GetFlags(&hdrFlags);
    if (hdrFlags & nsMsgMessageFlags::Marked) {
      m_newsHeader->GetMessageKey(&m_keyToDownload);
      break;
    } else {
      m_newsHeader = nullptr;
    }
  }
  return hasMore;
}

void nsNewsDownloader::Abort() {}
void nsNewsDownloader::Complete() {}

bool nsNewsDownloader::GetNextHdrToRetrieve() {
  nsresult rv;
  if (m_downloadFromKeys) {
    if (m_numwrote >= (int32_t)m_keysToDownload.Length()) return false;

    m_keyToDownload = m_keysToDownload[m_numwrote++];
    int32_t percent;
    percent = (100 * m_numwrote) / (int32_t)m_keysToDownload.Length();

    int64_t nowMS = 0;
    if (percent < 100)  // always need to do 100%
    {
      nowMS = PR_IntervalToMilliseconds(PR_IntervalNow());
      if (nowMS - m_lastProgressTime < 750) return true;
    }

    m_lastProgressTime = nowMS;
    nsCOMPtr<nsIStringBundleService> bundleService =
        mozilla::components::StringBundle::Service();
    NS_ENSURE_TRUE(bundleService, false);
    nsCOMPtr<nsIStringBundle> bundle;
    rv = bundleService->CreateBundle(NEWS_MSGS_URL, getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS(rv, false);

    nsAutoString firstStr;
    firstStr.AppendInt(m_numwrote);
    nsAutoString totalStr;
    totalStr.AppendInt(int(m_keysToDownload.Length()));
    nsString prettyName;
    nsString statusString;

    m_folder->GetPrettyName(prettyName);

    AutoTArray<nsString, 3> formatStrings = {firstStr, totalStr, prettyName};
    rv = bundle->FormatStringFromName("downloadingArticlesForOffline",
                                      formatStrings, statusString);
    NS_ENSURE_SUCCESS(rv, false);
    ShowProgress(statusString.get(), percent);
    return true;
  }
  NS_ASSERTION(false, "shouldn't get here if we're not downloading from keys.");
  return false;  // shouldn't get here if we're not downloading from keys.
}

nsresult nsNewsDownloader::ShowProgress(const char16_t* progressString,
                                        int32_t percent) {
  if (!m_statusFeedback) {
    if (m_window) m_window->GetStatusFeedback(getter_AddRefs(m_statusFeedback));
  }
  if (m_statusFeedback) {
    m_statusFeedback->ShowStatusString(nsDependentString(progressString));
    if (percent != m_lastPercent) {
      m_statusFeedback->ShowProgress(percent);
      m_lastPercent = percent;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP DownloadNewsArticlesToOfflineStore::OnStartRunningUrl(
    nsIURI* url) {
  return NS_OK;
}

NS_IMETHODIMP DownloadNewsArticlesToOfflineStore::OnStopRunningUrl(
    nsIURI* url, nsresult exitCode) {
  m_status = exitCode;
  if (m_newsHeader != nullptr) {
#ifdef DEBUG_bienvenu
    //    XP_Trace("finished retrieving %ld\n", m_newsHeader->GetMessageKey());
#endif
    if (m_newsDB) {
      nsMsgKey msgKey;
      m_newsHeader->GetMessageKey(&msgKey);
      m_newsDB->MarkMarked(msgKey, false, nullptr);
    }
  }
  m_newsHeader = nullptr;
  return nsNewsDownloader::OnStopRunningUrl(url, exitCode);
}

int DownloadNewsArticlesToOfflineStore::FinishDownload() { return 0; }

NS_IMETHODIMP nsNewsDownloader::OnSearchHit(nsIMsgDBHdr* header,
                                            nsIMsgFolder* folder) {
  NS_ENSURE_ARG(header);

  uint32_t msgFlags;
  header->GetFlags(&msgFlags);
  // only need to download articles we don't already have...
  if (!(msgFlags & nsMsgMessageFlags::Offline)) {
    nsMsgKey key;
    header->GetMessageKey(&key);
    m_keysToDownload.AppendElement(key);
  }
  return NS_OK;
}

NS_IMETHODIMP nsNewsDownloader::OnSearchDone(nsresult status) {
  if (m_keysToDownload.IsEmpty()) {
    if (m_listener) return m_listener->OnStopRunningUrl(nullptr, NS_OK);
  }
  nsresult rv = DownloadArticles(
      m_window, m_folder,
      /* we've already set m_keysToDownload, so don't pass it in */ nullptr);
  if (NS_FAILED(rv))
    if (m_listener) m_listener->OnStopRunningUrl(nullptr, rv);

  return rv;
}
NS_IMETHODIMP nsNewsDownloader::OnNewSearch() { return NS_OK; }

int DownloadNewsArticlesToOfflineStore::StartDownload() {
  m_newsDB->GetMsgHdrForKey(m_keyToDownload, getter_AddRefs(m_newsHeader));
  return 0;
}

DownloadNewsArticlesToOfflineStore::DownloadNewsArticlesToOfflineStore(
    nsIMsgWindow* window, nsIMsgDatabase* db, nsIUrlListener* listener)
    : nsNewsDownloader(window, db, listener) {
  m_newsDB = db;
}

DownloadNewsArticlesToOfflineStore::~DownloadNewsArticlesToOfflineStore() {}

DownloadMatchingNewsArticlesToNewsDB::DownloadMatchingNewsArticlesToNewsDB(
    nsIMsgWindow* window, nsIMsgFolder* folder, nsIMsgDatabase* newsDB,
    nsIUrlListener* listener)
    : DownloadNewsArticlesToOfflineStore(window, newsDB, listener) {
  m_window = window;
  m_folder = folder;
  m_newsDB = newsDB;
  m_downloadFromKeys = true;  // search term matching means downloadFromKeys.
}

DownloadMatchingNewsArticlesToNewsDB::~DownloadMatchingNewsArticlesToNewsDB() {}

NS_IMPL_ISUPPORTS(nsMsgDownloadAllNewsgroups, nsIUrlListener)

nsMsgDownloadAllNewsgroups::nsMsgDownloadAllNewsgroups(
    nsIMsgWindow* window, nsIUrlListener* listener) {
  m_window = window;
  m_listener = listener;
  m_downloaderForGroup =
      new DownloadMatchingNewsArticlesToNewsDB(window, nullptr, nullptr, this);
  m_downloadedHdrsForCurGroup = false;
}

nsMsgDownloadAllNewsgroups::~nsMsgDownloadAllNewsgroups() {}

NS_IMETHODIMP nsMsgDownloadAllNewsgroups::OnStartRunningUrl(nsIURI* url) {
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDownloadAllNewsgroups::OnStopRunningUrl(nsIURI* url, nsresult exitCode) {
  nsresult rv = exitCode;
  if (NS_SUCCEEDED(exitCode) || exitCode == NS_MSG_NEWS_ARTICLE_NOT_FOUND) {
    if (m_downloadedHdrsForCurGroup) {
      bool savingArticlesOffline = false;
      nsCOMPtr<nsIMsgNewsFolder> newsFolder =
          do_QueryInterface(m_currentFolder);
      if (newsFolder) newsFolder->GetSaveArticleOffline(&savingArticlesOffline);

      m_downloadedHdrsForCurGroup = false;
      if (savingArticlesOffline)  // skip this group - we're saving to it
                                  // already
        rv = ProcessNextGroup();
      else
        rv = DownloadMsgsForCurrentGroup();
    } else {
      rv = ProcessNextGroup();
    }
  } else if (m_listener)  // notify main observer.
    m_listener->OnStopRunningUrl(url, exitCode);

  return rv;
}

/**
 * Leaves m_currentServer at the next nntp "server" that
 * might have folders to download for offline use. If no more servers,
 * m_currentServer will be left at nullptr and the function returns false.
 * Also, sets up m_folderQueue to hold a (reversed) list of all the folders
 * to consider for the current server.
 * If no servers found, returns false.
 */
bool nsMsgDownloadAllNewsgroups::AdvanceToNextServer() {
  nsresult rv;

  if (m_allServers.IsEmpty()) {
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
    NS_ASSERTION(accountManager && NS_SUCCEEDED(rv),
                 "couldn't get account mgr");
    if (!accountManager || NS_FAILED(rv)) return false;

    rv = accountManager->GetAllServers(m_allServers);
    NS_ENSURE_SUCCESS(rv, false);
  }
  size_t serverIndex = 0;
  if (m_currentServer) {
    serverIndex = m_allServers.IndexOf(m_currentServer);
    if (serverIndex == m_allServers.NoIndex) {
      serverIndex = 0;
    } else {
      ++serverIndex;
    }
  }
  m_currentServer = nullptr;
  uint32_t numServers = m_allServers.Length();
  nsCOMPtr<nsIMsgFolder> rootFolder;

  while (serverIndex < numServers) {
    nsCOMPtr<nsIMsgIncomingServer> server(m_allServers[serverIndex]);
    serverIndex++;

    nsCOMPtr<nsINntpIncomingServer> newsServer = do_QueryInterface(server);
    if (!newsServer)  // we're only looking for news servers
      continue;

    if (server) {
      m_currentServer = server;
      server->GetRootFolder(getter_AddRefs(rootFolder));
      if (rootFolder) {
        rv = rootFolder->GetDescendants(m_folderQueue);
        if (NS_SUCCEEDED(rv)) {
          if (!m_folderQueue.IsEmpty()) {
            // We'll be popping folders from the end of the queue as we go.
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
 * Sets m_currentFolder to the next usable folder.
 *
 * @return  False if no more folders found, otherwise true.
 */
bool nsMsgDownloadAllNewsgroups::AdvanceToNextGroup() {
  nsresult rv = NS_OK;

  if (m_currentFolder) {
    nsCOMPtr<nsIMsgNewsFolder> newsFolder = do_QueryInterface(m_currentFolder);
    if (newsFolder) newsFolder->SetSaveArticleOffline(false);

    nsCOMPtr<nsIMsgMailSession> session =
        do_GetService("@mozilla.org/messenger/services/session;1", &rv);
    if (NS_SUCCEEDED(rv) && session) {
      bool folderOpen;
      uint32_t folderFlags;
      m_currentFolder->GetFlags(&folderFlags);
      session->IsFolderOpenInWindow(m_currentFolder, &folderOpen);
      if (!folderOpen &&
          !(folderFlags & (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Inbox)))
        m_currentFolder->SetMsgDatabase(nullptr);
    }
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

nsresult DownloadMatchingNewsArticlesToNewsDB::RunSearch(
    nsIMsgFolder* folder, nsIMsgDatabase* newsDB,
    nsIMsgSearchSession* searchSession) {
  m_folder = folder;
  m_newsDB = newsDB;
  m_searchSession = searchSession;

  m_keysToDownload.Clear();

  NS_ENSURE_ARG(searchSession);
  NS_ENSURE_ARG(folder);

  searchSession->RegisterListener(this, nsIMsgSearchSession::allNotifications);
  nsresult rv =
      searchSession->AddScopeTerm(nsMsgSearchScope::localNews, folder);
  NS_ENSURE_SUCCESS(rv, rv);

  return searchSession->Search(m_window);
}

nsresult nsMsgDownloadAllNewsgroups::ProcessNextGroup() {
  bool done = false;

  while (!done) {
    done = !AdvanceToNextGroup();
    if (!done && m_currentFolder) {
      uint32_t folderFlags;
      m_currentFolder->GetFlags(&folderFlags);
      if (folderFlags & nsMsgFolderFlags::Offline) break;
    }
  }
  if (done) {
    if (m_listener) return m_listener->OnStopRunningUrl(nullptr, NS_OK);
  }
  m_downloadedHdrsForCurGroup = true;
  return m_currentFolder ? m_currentFolder->GetNewMessages(m_window, this)
                         : NS_ERROR_NOT_INITIALIZED;
}

nsresult nsMsgDownloadAllNewsgroups::DownloadMsgsForCurrentGroup() {
  NS_ENSURE_TRUE(m_downloaderForGroup, NS_ERROR_OUT_OF_MEMORY);
  nsCOMPtr<nsIMsgDatabase> db;
  nsCOMPtr<nsIMsgDownloadSettings> downloadSettings;
  m_currentFolder->GetMsgDatabase(getter_AddRefs(db));
  nsresult rv =
      m_currentFolder->GetDownloadSettings(getter_AddRefs(downloadSettings));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgNewsFolder> newsFolder = do_QueryInterface(m_currentFolder);
  if (newsFolder) newsFolder->SetSaveArticleOffline(true);

  nsCOMPtr<nsIMsgSearchSession> searchSession =
      do_CreateInstance("@mozilla.org/messenger/searchSession;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  bool downloadByDate, downloadUnreadOnly;
  uint32_t ageLimitOfMsgsToDownload;

  downloadSettings->GetDownloadByDate(&downloadByDate);
  downloadSettings->GetDownloadUnreadOnly(&downloadUnreadOnly);
  downloadSettings->GetAgeLimitOfMsgsToDownload(&ageLimitOfMsgsToDownload);

  nsCOMPtr<nsIMsgSearchTerm> term;
  nsCOMPtr<nsIMsgSearchValue> value;

  rv = searchSession->CreateTerm(getter_AddRefs(term));
  NS_ENSURE_SUCCESS(rv, rv);
  term->GetValue(getter_AddRefs(value));

  if (downloadUnreadOnly) {
    value->SetAttrib(nsMsgSearchAttrib::MsgStatus);
    value->SetStatus(nsMsgMessageFlags::Read);
    searchSession->AddSearchTerm(nsMsgSearchAttrib::MsgStatus,
                                 nsMsgSearchOp::Isnt, value, true, nullptr);
  }
  if (downloadByDate) {
    value->SetAttrib(nsMsgSearchAttrib::AgeInDays);
    value->SetAge(ageLimitOfMsgsToDownload);
    searchSession->AddSearchTerm(nsMsgSearchAttrib::AgeInDays,
                                 nsMsgSearchOp::IsLessThan, value,
                                 nsMsgSearchBooleanOp::BooleanAND, nullptr);
  }
  value->SetAttrib(nsMsgSearchAttrib::MsgStatus);
  value->SetStatus(nsMsgMessageFlags::Offline);
  searchSession->AddSearchTerm(nsMsgSearchAttrib::MsgStatus,
                               nsMsgSearchOp::Isnt, value,
                               nsMsgSearchBooleanOp::BooleanAND, nullptr);

  m_downloaderForGroup->RunSearch(m_currentFolder, db, searchSession);
  return rv;
}
