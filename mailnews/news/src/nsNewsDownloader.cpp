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
