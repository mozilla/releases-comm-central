/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAutoSyncState.h"

#include "nsImapMailFolder.h"
#include "nsIImapService.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgMailSession.h"
#include "nsMsgFolderFlags.h"
#include "nsIAutoSyncManager.h"
#include "nsIAutoSyncMsgStrategy.h"
#include "nsServiceManagerUtils.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"

using namespace mozilla;

extern LazyLogModule gAutoSyncLog;  // defined in nsAutoSyncManager.cpp

MsgStrategyComparatorAdaptor::MsgStrategyComparatorAdaptor(
    nsIAutoSyncMsgStrategy* aStrategy, nsIMsgFolder* aFolder,
    nsIMsgDatabase* aDatabase)
    : mStrategy(aStrategy), mFolder(aFolder), mDatabase(aDatabase) {}

/** @return True if the elements are equals; false otherwise. */
bool MsgStrategyComparatorAdaptor::Equals(const nsMsgKey& a,
                                          const nsMsgKey& b) const {
  nsCOMPtr<nsIMsgDBHdr> hdrA;
  nsCOMPtr<nsIMsgDBHdr> hdrB;

  mDatabase->GetMsgHdrForKey(a, getter_AddRefs(hdrA));
  mDatabase->GetMsgHdrForKey(b, getter_AddRefs(hdrB));

  if (hdrA && hdrB) {
    nsresult rv = NS_OK;
    nsAutoSyncStrategyDecisionType decision = nsAutoSyncStrategyDecisions::Same;

    if (mStrategy) rv = mStrategy->Sort(mFolder, hdrA, hdrB, &decision);

    if (NS_SUCCEEDED(rv))
      return (decision == nsAutoSyncStrategyDecisions::Same);
  }

  return false;
}

/** @return True if (a < b); false otherwise. */
bool MsgStrategyComparatorAdaptor::LessThan(const nsMsgKey& a,
                                            const nsMsgKey& b) const {
  nsCOMPtr<nsIMsgDBHdr> hdrA;
  nsCOMPtr<nsIMsgDBHdr> hdrB;

  mDatabase->GetMsgHdrForKey(a, getter_AddRefs(hdrA));
  mDatabase->GetMsgHdrForKey(b, getter_AddRefs(hdrB));

  if (hdrA && hdrB) {
    nsresult rv = NS_OK;
    nsAutoSyncStrategyDecisionType decision = nsAutoSyncStrategyDecisions::Same;

    if (mStrategy) rv = mStrategy->Sort(mFolder, hdrA, hdrB, &decision);

    if (NS_SUCCEEDED(rv))
      return (decision == nsAutoSyncStrategyDecisions::Lower);
  }

  return false;
}

nsAutoSyncState::nsAutoSyncState(nsImapMailFolder* aOwnerFolder,
                                 PRTime aLastSyncTime)
    : mSyncState(stCompletedIdle),
      mOffset(0U),
      mLastOffset(0U),
      mLastServerTotal(0),
      mLastServerRecent(0),
      mLastServerUnseen(0),
      mLastNextUID(0),
      mLastSyncTime(aLastSyncTime),
      mLastUpdateTime(0UL),
      mProcessPointer(0U),
      mIsDownloadQChanged(false),
      mRetryCounter(0U) {
  mOwnerFolder =
      do_GetWeakReference(static_cast<nsIMsgImapMailFolder*>(aOwnerFolder));
  mHaveAStatusResponse = false;
}

nsAutoSyncState::~nsAutoSyncState() {}

// TODO:XXXemre should be implemented when we start
// doing space management
nsresult nsAutoSyncState::ManageStorageSpace() { return NS_OK; }

nsresult nsAutoSyncState::PlaceIntoDownloadQ(
    const nsTArray<nsMsgKey>& aMsgKeyList) {
  nsresult rv = NS_OK;
  if (!aMsgKeyList.IsEmpty()) {
    nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(mOwnerFolder, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgDatabase> database;
    rv = folder->GetMsgDatabase(getter_AddRefs(database));
    if (!database) return NS_ERROR_FAILURE;

    nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
        do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAutoSyncMsgStrategy> msgStrategy;
    autoSyncMgr->GetMsgStrategy(getter_AddRefs(msgStrategy));

    // increase the array size
    mDownloadQ.SetCapacity(mDownloadQ.Length() + aMsgKeyList.Length());

    // remove excluded messages
    int32_t elemCount = aMsgKeyList.Length();
    for (int32_t idx = 0; idx < elemCount; idx++) {
      nsCOMPtr<nsIMsgDBHdr> hdr;
      bool containsKey;
      database->ContainsKey(aMsgKeyList[idx], &containsKey);
      if (!containsKey) continue;
      rv = database->GetMsgHdrForKey(aMsgKeyList[idx], getter_AddRefs(hdr));
      if (!hdr)
        continue;  // can't get message header, continue with the next one

      bool doesFit = true;
      rv = autoSyncMgr->DoesMsgFitDownloadCriteria(hdr, &doesFit);
      if (NS_SUCCEEDED(rv) && !mDownloadSet.Contains(aMsgKeyList[idx]) &&
          doesFit) {
        bool excluded = false;
        if (msgStrategy) {
          rv = msgStrategy->IsExcluded(folder, hdr, &excluded);

          if (NS_SUCCEEDED(rv) && !excluded) {
            mIsDownloadQChanged = true;
            mDownloadSet.PutEntry(aMsgKeyList[idx]);
            mDownloadQ.AppendElement(aMsgKeyList[idx]);
          }
        }
      }
    }  // endfor

    if (mIsDownloadQChanged) {
      LogOwnerFolderName("Download Q is created for ");
      LogQWithSize(mDownloadQ, 0);
      rv = autoSyncMgr->OnDownloadQChanged(this);
    }
  }
  return rv;
}

nsresult nsAutoSyncState::SortQueueBasedOnStrategy(nsTArray<nsMsgKey>& aQueue) {
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(mOwnerFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDatabase> database;
  rv = folder->GetMsgDatabase(getter_AddRefs(database));
  if (!database) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
      do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAutoSyncMsgStrategy> msgStrategy;
  rv = autoSyncMgr->GetMsgStrategy(getter_AddRefs(msgStrategy));
  NS_ENSURE_SUCCESS(rv, rv);

  MsgStrategyComparatorAdaptor strategyComp(msgStrategy, folder, database);
  aQueue.Sort(strategyComp);

  return rv;
}

// This method is a hack to prioritize newly inserted messages,
// without changing the size of the queue. It is required since
// we cannot sort ranges in nsTArray.
nsresult nsAutoSyncState::SortSubQueueBasedOnStrategy(
    nsTArray<nsMsgKey>& aQueue, uint32_t aStartingOffset) {
  NS_ASSERTION(aStartingOffset < aQueue.Length(),
               "*** Starting offset is out of range");

  // Copy already downloaded messages into a temporary queue,
  // we want to exclude them from the sort.
  nsTArray<nsMsgKey> tmpQ;
  tmpQ.AppendElements(aQueue.Elements(), aStartingOffset);

  // Remove already downloaded messages and sort the resulting queue
  aQueue.RemoveElementsAt(0, aStartingOffset);

  nsresult rv = SortQueueBasedOnStrategy(aQueue);

  // copy excluded messages back
  aQueue.InsertElementsAt(0, tmpQ);

  return rv;
}

NS_IMETHODIMP nsAutoSyncState::GetNextGroupOfMessages(
    uint32_t aSuggestedGroupSizeLimit, uint32_t* aActualGroupSize,
    nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages) {
  NS_ENSURE_ARG_POINTER(aActualGroupSize);

  aMessages.Clear();
  *aActualGroupSize = 0;

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(mOwnerFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDatabase> database;
  folder->GetMsgDatabase(getter_AddRefs(database));

  if (database) {
    if (!mDownloadQ.IsEmpty()) {
      // sort the download queue if new items are added since the last time
      if (mIsDownloadQChanged) {
        // we want to sort only pending messages. mOffset is
        // the position of the first pending message in the download queue
        rv = (mOffset > 0) ? SortSubQueueBasedOnStrategy(mDownloadQ, mOffset)
                           : SortQueueBasedOnStrategy(mDownloadQ);

        if (NS_SUCCEEDED(rv)) mIsDownloadQChanged = false;
      }

      nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
          do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
      NS_ENSURE_SUCCESS(rv, rv);

      uint32_t msgCount = mDownloadQ.Length();
      uint32_t idx = mOffset;

      nsCOMPtr<nsIAutoSyncMsgStrategy> msgStrategy;
      autoSyncMgr->GetMsgStrategy(getter_AddRefs(msgStrategy));

      for (; idx < msgCount; idx++) {
        bool containsKey = false;
        database->ContainsKey(mDownloadQ[idx], &containsKey);
        if (!containsKey) {
          mDownloadSet.RemoveEntry(mDownloadQ[idx]);
          mDownloadQ.RemoveElementAt(idx--);
          msgCount--;
          continue;
        }
        nsCOMPtr<nsIMsgDBHdr> qhdr;
        database->GetMsgHdrForKey(mDownloadQ[idx], getter_AddRefs(qhdr));
        if (!qhdr) continue;  // maybe deleted, skip it!

        // ensure that we don't have this message body offline already,
        // possible if the user explicitly selects this message prior
        // to auto-sync kicks in
        bool hasMessageOffline;
        folder->HasMsgOffline(mDownloadQ[idx], &hasMessageOffline);
        if (hasMessageOffline) continue;

        // this check point allows msg strategy function
        // to do last minute decisions based on the current
        // state of TB such as the size of the message store etc.
        if (msgStrategy) {
          bool excluded = false;
          if (NS_SUCCEEDED(msgStrategy->IsExcluded(folder, qhdr, &excluded)) &&
              excluded)
            continue;
        }

        uint32_t msgSize;
        qhdr->GetMessageSize(&msgSize);
        // ignore 0 byte messages; the imap parser asserts when we try
        // to download them, and there's no point anyway.
        if (!msgSize) continue;

        if (!*aActualGroupSize && msgSize >= aSuggestedGroupSizeLimit) {
          *aActualGroupSize = msgSize;
          aMessages.AppendElement(qhdr);
          idx++;
          break;
        }
        if ((*aActualGroupSize) + msgSize > aSuggestedGroupSizeLimit) break;

        aMessages.AppendElement(qhdr);
        *aActualGroupSize += msgSize;
      }  // endfor

      mLastOffset = mOffset;
      mOffset = idx;
    }

    LogOwnerFolderName("Next group of messages to be downloaded.");
    LogQWithSize(aMessages, 0);
  }  // endif

  return NS_OK;
}

/**
 * Called by nsAutoSyncManager::TimerCallback to process message headers for a
 * folder in the discovery queue. The queue is created on the kAutoSyncFreq
 * time base (1 hour). Headers lacking offline store are placed in download
 * queue.
 */
NS_IMETHODIMP nsAutoSyncState::ProcessExistingHeaders(
    uint32_t aNumOfHdrsToProcess, uint32_t* aLeftToProcess) {
  NS_ENSURE_ARG_POINTER(aLeftToProcess);

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(mOwnerFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDatabase> database;
  rv = folder->GetMsgDatabase(getter_AddRefs(database));
  if (!database) return NS_ERROR_FAILURE;

  // create a queue to process existing headers for the first time
  if (mExistingHeadersQ.IsEmpty()) {
    nsTArray<nsMsgKey> keys;
    rv = database->ListAllKeys(keys);
    NS_ENSURE_SUCCESS(rv, rv);
    keys.Sort();
    mExistingHeadersQ.AppendElements(keys);
    mProcessPointer = 0;
  }

  // process the existing headers and find the messages not downloaded yet
  uint32_t lastIdx = mProcessPointer;
  nsTArray<nsMsgKey> msgKeys;
  uint32_t keyCount = mExistingHeadersQ.Length();
  for (; mProcessPointer < (lastIdx + aNumOfHdrsToProcess) &&
         mProcessPointer < keyCount;
       mProcessPointer++) {
    bool hasMessageOffline;
    folder->HasMsgOffline(mExistingHeadersQ[mProcessPointer],
                          &hasMessageOffline);
    if (!hasMessageOffline)
      msgKeys.AppendElement(mExistingHeadersQ[mProcessPointer]);
  }
  if (!msgKeys.IsEmpty()) {
    nsCString folderName;
    folder->GetURI(folderName);
    MOZ_LOG(
        gAutoSyncLog, LogLevel::Debug,
        ("%s: %zu messages will be added into the download q of folder %s\n",
         __func__, msgKeys.Length(), folderName.get()));

    rv = PlaceIntoDownloadQ(msgKeys);
    if (NS_FAILED(rv)) mProcessPointer = lastIdx;
  }

  *aLeftToProcess = keyCount - mProcessPointer;

  // cleanup if we are done processing
  if (0 == *aLeftToProcess) {
    mLastSyncTime = PR_Now();
    mExistingHeadersQ.Clear();
    mProcessPointer = 0;
    folder->SetMsgDatabase(nullptr);
  }

  return rv;
}

void nsAutoSyncState::OnNewHeaderFetchCompleted(
    const nsTArray<nsMsgKey>& aMsgKeyList) {
  SetLastUpdateTime(PR_Now());
  if (!aMsgKeyList.IsEmpty()) PlaceIntoDownloadQ(aMsgKeyList);
  MOZ_LOG(
      gAutoSyncLog, LogLevel::Debug,
      ("%s: %zu msg keys put into download q", __func__, aMsgKeyList.Length()));
}

NS_IMETHODIMP nsAutoSyncState::UpdateFolder() {
  nsresult rv;
  nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
      do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIUrlListener> autoSyncMgrListener =
      do_QueryInterface(autoSyncMgr, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
      do_QueryReferent(mOwnerFolder, &rv);
  SetState(nsAutoSyncState::stUpdateIssued);
  return imapFolder->UpdateFolderWithListener(nullptr, autoSyncMgrListener);
}

NS_IMETHODIMP nsAutoSyncState::OnStartRunningUrl(nsIURI* aUrl) {
  nsresult rv = NS_OK;

  // if there is a problem to start the download, set rv with the
  // corresponding error code. In that case, AutoSyncManager is going to
  // set the autosync state to nsAutoSyncState::stReadyToDownload
  // to resume downloading another time

  // TODO: is there a way to make sure that download started without
  // problem through nsIURI interface?

  nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
      do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return autoSyncMgr->OnDownloadStarted(this, rv);
}

/**
 * This is called when a folder status URL finishes. It is also called when
 * needed message downloads (imap fetch) for a folder completes.
 */
NS_IMETHODIMP nsAutoSyncState::OnStopRunningUrl(nsIURI* aUrl,
                                                nsresult aExitCode) {
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> ownerFolder = do_QueryReferent(mOwnerFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
      do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIUrlListener> autoSyncMgrListener =
      do_QueryInterface(autoSyncMgr, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (mSyncState == stStatusIssued) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
        do_QueryReferent(mOwnerFolder, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    int32_t serverTotal, serverUnseen, serverRecent, serverNextUID;
    imapFolder->GetServerTotal(&serverTotal);
    imapFolder->GetServerUnseen(&serverUnseen);
    imapFolder->GetServerRecent(&serverRecent);
    imapFolder->GetServerNextUID(&serverNextUID);
    // Note: UNSEEN often shows a change when nothing else changes. This is
    // because UNSEEN produced by SELECT is not the number of unseen messages.
    // So ignore change to UNSEEN to avoid spurious folder updates. Commented
    // out below.
    MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
            ("%s: serverUnseen=%d lastServerUnseen=%d", __func__, serverUnseen,
             mLastServerUnseen));
    if (serverNextUID != mLastNextUID || serverTotal != mLastServerTotal ||
        serverRecent != mLastServerRecent  //||
        /*(serverUnseen != mLastServerUnseen)*/) {
      if (MOZ_LOG_TEST(gAutoSyncLog, LogLevel::Debug)) {
        nsCString folderName;
        ownerFolder->GetURI(folderName);
        MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                ("%s: folder %s status changed serverNextUID=%d lastNextUID=%d",
                 __func__, folderName.get(), serverNextUID, mLastNextUID));
        MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                ("%s: serverTotal = %d lastServerTotal = %d serverRecent = %d "
                 "lastServerRecent = %d\n",
                 __func__, serverTotal, mLastServerTotal, serverRecent,
                 mLastServerRecent));
      }
      SetServerCounts(serverTotal, serverRecent, serverUnseen, serverNextUID);
      SetState(nsAutoSyncState::stUpdateIssued);
      rv = imapFolder->UpdateFolderWithListener(nullptr, autoSyncMgrListener);
    } else  // folderstatus detected no change
    {
      if (MOZ_LOG_TEST(gAutoSyncLog, LogLevel::Debug)) {
        nsCString folderName;
        ownerFolder->GetURI(folderName);
        MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                ("%s: folder %s status or noop issued, no change", __func__,
                 folderName.get()));
      }
      // Status detected no change. This may be due to an previously deleted and
      // now empty database so change compares above could be invalid. If so,
      // force an update which will re-populate the database (.msf) and download
      // all the message to mbox/maildir store. This check is only done on the
      // first imap STATUS response after start-up and if the server response
      // reports that the folder is not empty.
      if (!mHaveAStatusResponse && serverTotal != 0) {
        nsCOMPtr<nsIMsgDatabase> database;
        ownerFolder->GetMsgDatabase(getter_AddRefs(database));
        bool hasHeader = false;
        if (database) {
          nsCOMPtr<nsIMsgEnumerator> hdrs;
          database->EnumerateMessages(getter_AddRefs(hdrs));
          if (hdrs) hdrs->HasMoreElements(&hasHeader);
        }
        if (!hasHeader) {
          if (MOZ_LOG_TEST(gAutoSyncLog, LogLevel::Debug)) {
            nsCString folderName;
            ownerFolder->GetURI(folderName);
            MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                    ("%s: folder %s has empty DB, force an update", __func__,
                     folderName.get()));
          }
          SetServerCounts(serverTotal, serverRecent, serverUnseen,
                          serverNextUID);
          SetState(nsAutoSyncState::stUpdateIssued);
          rv = imapFolder->UpdateFolderWithListener(nullptr,
                                                    autoSyncMgrListener);
        }
      }
      if (mSyncState == stStatusIssued) {
        // Didn't force an update above so transition back to stCompletedIdle
        ownerFolder->SetMsgDatabase(nullptr);
        // nothing more to do.
        SetState(nsAutoSyncState::stCompletedIdle);
        // autoSyncMgr needs this notification, so manufacture it.
        rv = autoSyncMgrListener->OnStopRunningUrl(aUrl, NS_OK);
      }
    }  // end no change detected
    mHaveAStatusResponse = true;
  } else  // URL not folderstatus but FETCH of message body
  {
    // XXXemre how we recover from this error?
    rv = ownerFolder->ReleaseSemaphore(ownerFolder,
                                       "nsAutoSyncState::OnStopRunningUrl"_ns);
    NS_ASSERTION(NS_SUCCEEDED(rv), "*** Cannot release folder semaphore");

    nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(aUrl);
    if (mailUrl) rv = mailUrl->UnRegisterListener(this);

    if (MOZ_LOG_TEST(gAutoSyncLog, LogLevel::Debug)) {
      nsCString folderName;
      ownerFolder->GetURI(folderName);
      MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
              ("%s: URL for FETCH of msg body/bodies complete, folder %s",
               __func__, folderName.get()));
    }
    rv = autoSyncMgr->OnDownloadCompleted(this, aExitCode);
  }
  return rv;
}

NS_IMETHODIMP nsAutoSyncState::GetState(int32_t* aState) {
  NS_ENSURE_ARG_POINTER(aState);
  *aState = mSyncState;
  return NS_OK;
}

// clang-format off
const char* stateStrings[] = {
  "stCompletedIdle:0",       // Initial state
  "stStatusIssued:1",        // Imap STATUS or NOOP to occur to detect new msgs
  "stUpdateNeeded:2",        // Imap SELECT to occur due to "pending" msgs
  "stUpdateIssued:3",        // Imap SELECT to occur then fetch new headers
  "stReadyToDownload:4",     // Ready to download a group of new messages
  "stDownloadInProgress:5"   // Download, go to 4 if more msgs then 0 when all done
};
// clang-format on

NS_IMETHODIMP nsAutoSyncState::SetState(int32_t aState) {
  mSyncState = aState;
  if (aState == stCompletedIdle) {
    ResetDownloadQ();
    // tell folder to let go of its cached msg db pointer
    nsresult rv;
    nsCOMPtr<nsIMsgFolder> ownerFolder = do_QueryReferent(mOwnerFolder, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    bool folderOpen;
    ownerFolder->GetDatabaseOpen(&folderOpen);
    uint32_t folderFlags;
    ownerFolder->GetFlags(&folderFlags);
    if (!folderOpen && !(folderFlags & nsMsgFolderFlags::Inbox))
      ownerFolder->SetMsgDatabase(nullptr);
  }
  nsCString logStr("Sync State set to |");
  logStr.Append(stateStrings[aState]);
  logStr.AppendLiteral("| for ");
  LogOwnerFolderName(logStr.get());
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::TryCurrentGroupAgain(uint32_t aRetryCount) {
  SetState(stReadyToDownload);

  nsresult rv;
  if (++mRetryCounter > aRetryCount) {
    ResetRetryCounter();
    rv = NS_ERROR_FAILURE;
  } else
    rv = Rollback();

  return rv;
}

NS_IMETHODIMP nsAutoSyncState::ResetRetryCounter() {
  mRetryCounter = 0;
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::GetPendingMessageCount(int32_t* aMsgCount) {
  NS_ENSURE_ARG_POINTER(aMsgCount);
  *aMsgCount = mDownloadQ.Length() - mOffset;
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::GetTotalMessageCount(int32_t* aMsgCount) {
  NS_ENSURE_ARG_POINTER(aMsgCount);
  *aMsgCount = mDownloadQ.Length();
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::GetOwnerFolder(nsIMsgFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> ownerFolder = do_QueryReferent(mOwnerFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  ownerFolder.forget(aFolder);
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::Rollback() {
  mOffset = mLastOffset;
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::ResetDownloadQ() {
  mOffset = mLastOffset = 0;
  mDownloadSet.Clear();
  mDownloadQ.Clear();
  mDownloadQ.Compact();

  return NS_OK;
}

/**
 * Test whether the download queue is empty.
 */
NS_IMETHODIMP nsAutoSyncState::IsDownloadQEmpty(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = mDownloadQ.IsEmpty();
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::DownloadMessagesForOffline(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& messages) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService = mozilla::components::Imap::Service();

  nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(mOwnerFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Acquire semaphore for offline store. If it fails, we won't download.
  rv = folder->AcquireSemaphore(
      folder, "nsAutoSyncState::DownloadMessagesForOffline"_ns);
  NS_ENSURE_SUCCESS(rv, rv);
  auto guard = mozilla::MakeScopeExit([=] {
    folder->ReleaseSemaphore(
        folder, "nsAutoSyncState::DownloadMessagesForOffline failure"_ns);
  });

  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(folder);
  if (imapFolder) {
    // The keys are IMAP UIDs we can send to the server.
    nsAutoCString messageIds;
    nsTArray<nsMsgKey> msgKeys;
    rv = nsImapMailFolder::BuildIdsAndKeyArray(messages, messageIds, msgKeys);
    NS_ENSURE_SUCCESS(rv, rv);
    if (messageIds.IsEmpty()) {
      return NS_OK;
    }

    if (MOZ_LOG_TEST(gAutoSyncLog, LogLevel::Debug)) {
      nsCString folderName;
      folder->GetURI(folderName);
      MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
              ("%s: downloading UIDs %s for folder %s", __func__,
               messageIds.get(), folderName.get()));
    }

    // Start downloading, passing the nsAutoSyncState as listener.
    // So OnStopRunningUrl() is called when the download completes.
    rv = imapService->DownloadMessagesForOffline(messageIds, folder, this,
                                                 nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    NS_WARNING(
        "nsAutoSyncState::DownloadMessagesForOffline() used on non-imap "
        "folder");
    return NS_ERROR_UNEXPECTED;
  }

  rv = SetState(stDownloadInProgress);
  NS_ENSURE_SUCCESS(rv, rv);
  guard.release();

  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::GetLastSyncTime(PRTime* aLastSyncTime) {
  NS_ENSURE_ARG_POINTER(aLastSyncTime);
  *aLastSyncTime = mLastSyncTime;
  return NS_OK;
}

void nsAutoSyncState::SetLastSyncTimeInSec(int32_t aLastSyncTime) {
  mLastSyncTime = ((PRTime)aLastSyncTime * PR_USEC_PER_SEC);
}

NS_IMETHODIMP nsAutoSyncState::GetLastUpdateTime(PRTime* aLastUpdateTime) {
  NS_ENSURE_ARG_POINTER(aLastUpdateTime);
  *aLastUpdateTime = mLastUpdateTime;
  return NS_OK;
}

NS_IMETHODIMP nsAutoSyncState::SetLastUpdateTime(PRTime aLastUpdateTime) {
  mLastUpdateTime = aLastUpdateTime;
  return NS_OK;
}

void nsAutoSyncState::SetServerCounts(int32_t total, int32_t recent,
                                      int32_t unseen, int32_t nextUID) {
  mLastServerTotal = total;
  mLastServerRecent = recent;
  mLastServerUnseen = unseen;
  mLastNextUID = nextUID;
}

NS_IMPL_ISUPPORTS(nsAutoSyncState, nsIAutoSyncState, nsIUrlListener)

void nsAutoSyncState::LogQWithSize(nsTArray<nsMsgKey>& q, uint32_t toOffset) {
  nsCOMPtr<nsIMsgFolder> ownerFolder = do_QueryReferent(mOwnerFolder);
  if (ownerFolder) {
    nsCOMPtr<nsIMsgDatabase> database;
    ownerFolder->GetMsgDatabase(getter_AddRefs(database));

    uint32_t x = q.Length();
    while (x > toOffset && database) {
      x--;
      nsCOMPtr<nsIMsgDBHdr> h;
      database->GetMsgHdrForKey(q[x], getter_AddRefs(h));
      uint32_t s;
      if (h) {
        h->GetMessageSize(&s);
        MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                ("Elem #%d, size: %u bytes\n", x + 1, s));
      } else
        MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                ("unable to get header for key %ul", q[x]));
    }
  }
}

void nsAutoSyncState::LogQWithSize(nsTArray<RefPtr<nsIMsgDBHdr>> const& q,
                                   uint32_t toOffset) {
  nsCOMPtr<nsIMsgFolder> ownerFolder = do_QueryReferent(mOwnerFolder);
  if (ownerFolder) {
    nsCOMPtr<nsIMsgDatabase> database;
    ownerFolder->GetMsgDatabase(getter_AddRefs(database));

    uint32_t x = q.Length();
    while (x > toOffset && database) {
      x--;
      if (q[x]) {
        uint32_t s;
        q[x]->GetMessageSize(&s);
        MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                ("Elem #%d, size: %u bytes\n", x + 1, s));
      } else
        MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
                ("null header in q at index %ul", x));
    }
  }
}

void nsAutoSyncState::LogOwnerFolderName(const char* s) {
  nsCOMPtr<nsIMsgFolder> ownerFolder = do_QueryReferent(mOwnerFolder);
  if (ownerFolder) {
    nsCString folderName;
    ownerFolder->GetURI(folderName);
    MOZ_LOG(gAutoSyncLog, LogLevel::Debug,
            ("*** %s Folder: %s ***\n", s, folderName.get()));
  }
}
