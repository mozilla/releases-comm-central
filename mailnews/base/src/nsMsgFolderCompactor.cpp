/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsCOMPtr.h"
#include "nsIMsgFolder.h"
#include "nsIFile.h"
#include "nsNetUtil.h"
#include "nsIMsgHdr.h"
#include "nsIChannel.h"
#include "nsIStreamListener.h"
#include "nsIMsgMessageService.h"
#include "nsMsgDBCID.h"
#include "nsMsgUtils.h"
#include "nsISeekableStream.h"
#include "nsIDBFolderInfo.h"
#include "nsIDocShell.h"
#include "nsIPrompt.h"
#include "nsIInterfaceRequestorUtils.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgImapMailFolder.h"
#include "nsMailHeaders.h"
#include "nsMsgI18N.h"
#include "prprf.h"
#include "nsMsgLocalFolderHdrs.h"
#include "nsIMsgDatabase.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgStatusFeedback.h"
#include "nsMsgBaseCID.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgPluggableStore.h"
#include "nsMsgFolderCompactor.h"
#include "nsIOutputStream.h"
#include "nsIInputStream.h"
#include "nsPrintfCString.h"

//////////////////////////////////////////////////////////////////////////////
// nsFolderCompactState
//////////////////////////////////////////////////////////////////////////////

NS_IMPL_ISUPPORTS(nsFolderCompactState, nsIMsgFolderCompactor,
                  nsIRequestObserver, nsIStreamListener,
                  nsICopyMessageStreamListener, nsIUrlListener)

nsFolderCompactState::nsFolderCompactState() {
  m_fileStream = nullptr;
  m_curIndex = 0;
  m_status = NS_OK;
  m_compactAll = false;
  m_compactOfflineAlso = false;
  m_compactingOfflineFolders = false;
  m_parsingFolder = false;
  m_folderIndex = 0;
  m_startOfMsg = true;
  m_needStatusLine = false;
  m_totalExpungedBytes = 0;
  m_alreadyWarnedDiskSpace = false;
}

nsFolderCompactState::~nsFolderCompactState() {
  CloseOutputStream();
  if (NS_FAILED(m_status)) {
    CleanupTempFilesAfterError();
    // if for some reason we failed remove the temp folder and database
  }
}

nsresult GetBaseStringBundle(nsIStringBundle** aBundle) {
  NS_ENSURE_ARG_POINTER(aBundle);
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::services::GetStringBundleService();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIStringBundle> bundle;
  return bundleService->CreateBundle(
      "chrome://messenger/locale/messenger.properties", aBundle);
}

void nsFolderCompactState::CloseOutputStream() {
  if (m_fileStream) {
    m_fileStream->Close();
    m_fileStream = nullptr;
  }
}

void nsFolderCompactState::CleanupTempFilesAfterError() {
  CloseOutputStream();
  if (m_db) m_db->ForceClosed();
  nsCOMPtr<nsIFile> summaryFile;
  GetSummaryFileLocation(m_file, getter_AddRefs(summaryFile));
  m_file->Remove(false);
  summaryFile->Remove(false);
}

nsresult nsFolderCompactState::BuildMessageURI(const char* baseURI,
                                               nsMsgKey key, nsCString& uri) {
  uri.Append(baseURI);
  uri.Append('#');
  uri.AppendInt(key);

  return NS_OK;
}

nsresult nsFolderCompactState::InitDB(nsIMsgDatabase* db) {
  nsCOMPtr<nsIMsgDatabase> mailDBFactory;
  nsresult rv = db->ListAllKeys(m_keys);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService(NS_MSGDB_SERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgDBService->OpenMailDBFromFile(m_file, m_folder, true, false,
                                        getter_AddRefs(m_db));

  if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE ||
      rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING)
    // if it's out of date then reopen with upgrade.
    return msgDBService->OpenMailDBFromFile(m_file, m_folder, true, true,
                                            getter_AddRefs(m_db));
  return rv;
}

NS_IMETHODIMP nsFolderCompactState::CompactFolders(
    const nsTArray<RefPtr<nsIMsgFolder>>& aArrayOfFoldersToCompact,
    const nsTArray<RefPtr<nsIMsgFolder>>& aOfflineFolderArray,
    nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow) {
  m_window = aMsgWindow;
  m_listener = aUrlListener;
  if (!aArrayOfFoldersToCompact.IsEmpty()) {
    m_folderArray = aArrayOfFoldersToCompact.Clone();
    if (!aOfflineFolderArray.IsEmpty()) {
      // Also compacting offline folders.
      m_compactOfflineAlso = true;
      m_offlineFolderArray = aOfflineFolderArray.Clone();
    }
  } else if (!aOfflineFolderArray.IsEmpty()) {
    // Only compacting offline folders.
    m_folderArray = aOfflineFolderArray.Clone();
    m_compactingOfflineFolders = true;
  } else {
    // Nothing to compact.
    return NS_OK;
  }

  m_compactAll = true;

  m_folderIndex = 0;
  nsCOMPtr<nsIMsgFolder> firstFolder(m_folderArray[m_folderIndex]);
  // Make a start on the first folder.
  return Compact(firstFolder, m_compactingOfflineFolders, aUrlListener,
                 aMsgWindow);
}

NS_IMETHODIMP
nsFolderCompactState::Compact(nsIMsgFolder* folder, bool aOfflineStore,
                              nsIUrlListener* aListener,
                              nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(folder);
  m_listener = aListener;
  if (!m_compactingOfflineFolders && !aOfflineStore) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(folder);
    if (imapFolder) return imapFolder->Expunge(this, aMsgWindow);
  }

  m_window = aMsgWindow;
  nsresult rv;
  nsCOMPtr<nsIMsgDatabase> db;
  nsCOMPtr<nsIFile> path;
  nsCString baseMessageURI;

  nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(folder, &rv);
  if (NS_SUCCEEDED(rv) && localFolder) {
    rv = localFolder->GetDatabaseWOReparse(getter_AddRefs(db));
    if (NS_FAILED(rv) || !db) {
      if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING ||
          rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE) {
        m_folder = folder;  // will be used to compact
        m_parsingFolder = true;
        rv = localFolder->ParseFolder(m_window, this);
      }
      return rv;
    } else {
      bool valid;
      rv = db->GetSummaryValid(&valid);
      if (!valid)  // we are probably parsing the folder because we selected it.
      {
        folder->NotifyCompactCompleted();
        if (m_compactAll)
          return CompactNextFolder();
        else
          return NS_OK;
      }
    }
  } else {
    rv = folder->GetMsgDatabase(getter_AddRefs(db));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = folder->GetFilePath(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  do {
    bool exists = false;
    rv = path->Exists(&exists);
    if (!exists) {
      // No need to compact if the local file does not exist.
      // Can happen e.g. on IMAP when the folder is not marked for offline use.
      break;
    }

    int64_t expunged = 0;
    folder->GetExpungedBytes(&expunged);
    if (expunged == 0) {
      // No need to compact if nothing would be expunged.
      break;
    }

    int64_t diskSize;
    rv = folder->GetSizeOnDisk(&diskSize);
    NS_ENSURE_SUCCESS(rv, rv);

    int64_t diskFree;
    rv = path->GetDiskSpaceAvailable(&diskFree);
    if (NS_FAILED(rv)) {
      // If GetDiskSpaceAvailable() failed, better bail out fast.
      if (rv != NS_ERROR_NOT_IMPLEMENTED) return rv;
      // Some platforms do not have GetDiskSpaceAvailable implemented.
      // In that case skip the preventive free space analysis and let it
      // fail in compact later if space actually wasn't available.
    } else {
      // Let's try to not even start compact if there is really low free space.
      // It may still fail later as we do not know how big exactly the folder DB
      // will end up being. The DB already doesn't contain references to
      // messages that are already deleted. So theoretically it shouldn't shrink
      // with compact. But in practice, the automatic shrinking of the DB may
      // still have not yet happened. So we cap the final size at 1KB per
      // message.
      db->Commit(nsMsgDBCommitType::kCompressCommit);

      int64_t dbSize;
      rv = db->GetDatabaseSize(&dbSize);
      NS_ENSURE_SUCCESS(rv, rv);

      int32_t totalMsgs;
      rv = folder->GetTotalMessages(false, &totalMsgs);
      NS_ENSURE_SUCCESS(rv, rv);
      int64_t expectedDBSize =
          std::min<int64_t>(dbSize, ((int64_t)totalMsgs) * 1024);
      if (diskFree < diskSize - expunged + expectedDBSize) {
        if (!m_alreadyWarnedDiskSpace) {
          folder->ThrowAlertMsg("compactFolderInsufficientSpace", m_window);
          m_alreadyWarnedDiskSpace = true;
        }
        break;
      }
    }

    rv = folder->GetBaseMessageURI(baseMessageURI);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = Init(folder, baseMessageURI.get(), db, path, m_window);
    NS_ENSURE_SUCCESS(rv, rv);

    bool isLocked = true;
    m_folder->GetLocked(&isLocked);
    if (isLocked) {
      CleanupTempFilesAfterError();
      m_folder->ThrowAlertMsg("compactFolderDeniedLock", m_window);
      break;
    }

    // If we got here start the real compacting.
    nsCOMPtr<nsISupports> supports =
        do_QueryInterface(static_cast<nsIMsgFolderCompactor*>(this));
    m_folder->AcquireSemaphore(supports);
    m_totalExpungedBytes += expunged;
    return StartCompacting();

  } while (false);  // block for easy skipping the compaction using 'break'

  folder->NotifyCompactCompleted();
  if (m_compactAll)
    return CompactNextFolder();
  else
    return NS_OK;
}

nsresult nsFolderCompactState::ShowStatusMsg(const nsString& aMsg) {
  if (!m_window || aMsg.IsEmpty()) return NS_OK;

  nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;
  nsresult rv = m_window->GetStatusFeedback(getter_AddRefs(statusFeedback));
  if (NS_FAILED(rv) || !statusFeedback) return NS_OK;

  // Try to prepend account name to the message.
  nsString statusMessage;
  do {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = m_folder->GetServer(getter_AddRefs(server));
    if (NS_FAILED(rv)) break;
    nsAutoString accountName;
    rv = server->GetPrettyName(accountName);
    if (NS_FAILED(rv)) break;
    nsCOMPtr<nsIStringBundle> bundle;
    rv = GetBaseStringBundle(getter_AddRefs(bundle));
    if (NS_FAILED(rv)) break;
    AutoTArray<nsString, 2> params = {accountName, aMsg};
    rv = bundle->FormatStringFromName("statusMessage", params, statusMessage);
  } while (false);

  // If fetching any of the needed info failed, just show the original message.
  if (NS_FAILED(rv)) statusMessage.Assign(aMsg);
  return statusFeedback->SetStatusString(statusMessage);
}

nsresult nsFolderCompactState::Init(nsIMsgFolder* folder,
                                    const char* baseMsgUri, nsIMsgDatabase* db,
                                    nsIFile* path, nsIMsgWindow* aMsgWindow) {
  nsresult rv;

  m_folder = folder;
  m_baseMessageUri = baseMsgUri;
  m_file = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  m_file->InitWithFile(path);

  m_file->SetNativeLeafName("nstmp"_ns);
  // Make sure we are not crunching existing nstmp file.
  rv = m_file->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 00600);
  NS_ENSURE_SUCCESS(rv, rv);

  m_window = aMsgWindow;
  m_totalMsgSize = 0;
  rv = InitDB(db);
  if (NS_FAILED(rv)) {
    CleanupTempFilesAfterError();
    return rv;
  }

  m_curIndex = 0;

  rv = MsgNewBufferedFileOutputStream(getter_AddRefs(m_fileStream), m_file, -1,
                                      00600);
  if (NS_FAILED(rv))
    m_folder->ThrowAlertMsg("compactFolderWriteFailed", m_window);
  else
    rv = GetMessageServiceFromURI(nsDependentCString(baseMsgUri),
                                  getter_AddRefs(m_messageService));
  if (NS_FAILED(rv)) {
    m_status = rv;
  }
  return rv;
}

void nsFolderCompactState::ShowCompactingStatusMsg() {
  nsString statusString;
  nsresult rv = m_folder->GetStringWithFolderNameFromBundle("compactingFolder",
                                                            statusString);
  if (!statusString.IsEmpty() && NS_SUCCEEDED(rv)) ShowStatusMsg(statusString);
}

NS_IMETHODIMP nsFolderCompactState::OnStartRunningUrl(nsIURI* url) {
  return NS_OK;
}

NS_IMETHODIMP nsFolderCompactState::OnStopRunningUrl(nsIURI* url,
                                                     nsresult status) {
  if (m_parsingFolder) {
    m_parsingFolder = false;
    if (NS_SUCCEEDED(status)) {
      status =
          Compact(m_folder, m_compactingOfflineFolders, m_listener, m_window);
    } else if (m_compactAll) {
      CompactNextFolder();
    }
  } else if (m_compactAll) {
    // this should be the imap case only
    if (m_folderIndex < m_folderArray.Length()) {
      m_folderArray[m_folderIndex]->SetMsgDatabase(nullptr);
    }
    CompactNextFolder();
  } else if (m_listener) {
    CompactCompleted(status);
  }
  return NS_OK;
}

nsresult nsFolderCompactState::StartCompacting() {
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsCOMPtr<nsIMsgIncomingServer> server;

  nsresult rv = m_folder->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = server->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Notify that compaction is beginning.  We do this even if there are no
  // messages to be copied because the summary database still gets blown away
  // which is still pretty interesting.  (And we like consistency.)
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService(NS_MSGNOTIFICATIONSERVICE_CONTRACTID));
  if (notifier) {
    notifier->NotifyFolderCompactStart(m_folder);
  }

  // TODO: test whether sorting the messages (m_keys) by messageOffset
  // would improve performance on large files (less seeks).
  // The m_keys array is in the order as stored in DB and on IMAP or News
  // the messages stored on the mbox file are not necessarily in the same order.
  if (m_keys.Length() > 0) {
    nsCOMPtr<nsIURI> notUsed;
    ShowCompactingStatusMsg();
    NS_ADDREF_THIS();
    rv = m_messageService->CopyMessages(m_keys, m_folder, this, false, nullptr,
                                        m_window, getter_AddRefs(notUsed));
  } else {  // no messages to copy with
    FinishCompact();
  }
  return rv;
}

nsresult nsFolderCompactState::FinishCompact() {
  NS_ENSURE_TRUE(m_folder, NS_ERROR_NOT_INITIALIZED);
  NS_ENSURE_TRUE(m_file, NS_ERROR_NOT_INITIALIZED);

  // All okay time to finish up the compact process
  nsCOMPtr<nsIFile> path;
  nsCOMPtr<nsIDBFolderInfo> folderInfo;

  // get leaf name and database name of the folder
  nsresult rv = m_folder->GetFilePath(getter_AddRefs(path));
  nsCOMPtr<nsIFile> folderPath =
      do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folderPath->InitWithFile(path);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> oldSummaryFile;
  rv = GetSummaryFileLocation(folderPath, getter_AddRefs(oldSummaryFile));
  NS_ENSURE_SUCCESS(rv, rv);
  nsAutoCString dbName;
  oldSummaryFile->GetNativeLeafName(dbName);
  nsAutoCString folderName;
  path->GetNativeLeafName(folderName);

  // close down the temp file stream; preparing for deleting the old folder
  // and its database; then rename the temp folder and database
  if (m_fileStream) {
    m_fileStream->Flush();
    m_fileStream->Close();
    m_fileStream = nullptr;
  }

  // make sure the new database is valid.
  // Close it so we can rename the .msf file.
  if (m_db) {
    m_db->ForceClosed();
    m_db = nullptr;
  }

  nsCOMPtr<nsIFile> newSummaryFile;
  rv = GetSummaryFileLocation(m_file, getter_AddRefs(newSummaryFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDBFolderInfo> transferInfo;
  m_folder->GetDBTransferInfo(getter_AddRefs(transferInfo));

  // close down database of the original folder
  m_folder->ForceDBClosed();

  nsCOMPtr<nsIFile> cloneFile;
  int64_t fileSize = 0;
  rv = m_file->Clone(getter_AddRefs(cloneFile));
  if (NS_SUCCEEDED(rv)) rv = cloneFile->GetFileSize(&fileSize);
  bool tempFileRightSize = ((uint64_t)fileSize == m_totalMsgSize);
  NS_WARNING_ASSERTION(tempFileRightSize,
                       "temp file not of expected size in compact");

  bool folderRenameSucceeded = false;
  bool msfRenameSucceeded = false;
  if (NS_SUCCEEDED(rv) && tempFileRightSize) {
    // First we're going to try and move the old summary file out the way.
    // We don't delete it yet, as we want to keep the files in sync.
    nsCOMPtr<nsIFile> tempSummaryFile;
    rv = oldSummaryFile->Clone(getter_AddRefs(tempSummaryFile));
    if (NS_SUCCEEDED(rv))
      rv = tempSummaryFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);

    nsAutoCString tempSummaryFileName;
    if (NS_SUCCEEDED(rv))
      rv = tempSummaryFile->GetNativeLeafName(tempSummaryFileName);

    if (NS_SUCCEEDED(rv))
      rv = oldSummaryFile->MoveToNative((nsIFile*)nullptr, tempSummaryFileName);

    NS_WARNING_ASSERTION(NS_SUCCEEDED(rv),
                         "error moving compacted folder's db out of the way");
    if (NS_SUCCEEDED(rv)) {
      // Now we've successfully moved the summary file out the way, try moving
      // the newly compacted message file over the old one.
      rv = m_file->MoveToNative((nsIFile*)nullptr, folderName);
      folderRenameSucceeded = NS_SUCCEEDED(rv);
      NS_WARNING_ASSERTION(folderRenameSucceeded,
                           "error renaming compacted folder");
      if (folderRenameSucceeded) {
        // That worked, so land the new summary file in the right place.
        nsCOMPtr<nsIFile> renamedCompactedSummaryFile;
        newSummaryFile->Clone(getter_AddRefs(renamedCompactedSummaryFile));
        if (renamedCompactedSummaryFile) {
          rv = renamedCompactedSummaryFile->MoveToNative((nsIFile*)nullptr,
                                                         dbName);
          msfRenameSucceeded = NS_SUCCEEDED(rv);
        }
        NS_WARNING_ASSERTION(msfRenameSucceeded,
                             "error renaming compacted folder's db");
      }

      if (!msfRenameSucceeded) {
        // Do our best to put the summary file back to where it was
        rv = tempSummaryFile->MoveToNative((nsIFile*)nullptr, dbName);
        if (NS_SUCCEEDED(rv)) {
          // Flagging that a renamed db no longer exists.
          tempSummaryFile = nullptr;
        } else {
          NS_WARNING("error restoring uncompacted folder's db");
        }
      }
    }
    // We don't want any temporarily renamed summary file to lie around
    if (tempSummaryFile) tempSummaryFile->Remove(false);
  }

  NS_WARNING_ASSERTION(msfRenameSucceeded, "compact failed");
  nsresult rvReleaseFolderLock = ReleaseFolderLock();
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rvReleaseFolderLock),
                       "folder lock not released successfully");
  rv = NS_FAILED(rv) ? rv : rvReleaseFolderLock;

  // Cleanup of nstmp-named compacted files if failure
  if (!folderRenameSucceeded) {
    // remove the abandoned compacted version with the wrong name
    m_file->Remove(false);
  }
  if (!msfRenameSucceeded) {
    // remove the abandoned compacted summary file
    newSummaryFile->Remove(false);
  }

  if (msfRenameSucceeded) {
    // Transfer local db information from transferInfo
    nsCOMPtr<nsIMsgDBService> msgDBService =
        do_GetService(NS_MSGDB_SERVICE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = msgDBService->OpenFolderDB(m_folder, true, getter_AddRefs(m_db));
    NS_ENSURE_TRUE(m_db, NS_FAILED(rv) ? rv : NS_ERROR_FAILURE);
    // These errors are expected.
    rv = (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING ||
          rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE)
             ? NS_OK
             : rv;
    m_db->SetSummaryValid(true);
    m_folder->SetDBTransferInfo(transferInfo);

    // since we're transferring info from the old db, we need to reset the
    // expunged bytes
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    m_db->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
    if (dbFolderInfo) dbFolderInfo->SetExpungedBytes(0);
  }
  if (m_db) m_db->Close(true);
  m_db = nullptr;

  // Notify that compaction of the folder is completed.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService(NS_MSGNOTIFICATIONSERVICE_CONTRACTID));
  if (notifier) {
    notifier->NotifyFolderCompactFinish(m_folder);
  }
  m_folder->NotifyCompactCompleted();

  if (m_compactAll)
    rv = CompactNextFolder();
  else
    CompactCompleted(rv);

  return rv;
}

void nsFolderCompactState::CompactCompleted(nsresult exitCode) {
  NS_WARNING_ASSERTION(NS_SUCCEEDED(exitCode),
                       "nsFolderCompactState::CompactCompleted failed");
  if (m_listener) m_listener->OnStopRunningUrl(nullptr, exitCode);
  ShowDoneStatus();
}

nsresult nsFolderCompactState::ReleaseFolderLock() {
  nsresult result = NS_OK;
  if (!m_folder) return result;
  bool haveSemaphore;
  nsCOMPtr<nsISupports> supports =
      do_QueryInterface(static_cast<nsIMsgFolderCompactor*>(this));
  result = m_folder->TestSemaphore(supports, &haveSemaphore);
  if (NS_SUCCEEDED(result) && haveSemaphore)
    result = m_folder->ReleaseSemaphore(supports);
  return result;
}

void nsFolderCompactState::ShowDoneStatus() {
  if (m_folder) {
    nsString statusString;
    nsCOMPtr<nsIStringBundle> bundle;
    nsresult rv = GetBaseStringBundle(getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS_VOID(rv);
    nsAutoString expungedAmount;
    FormatFileSize(m_totalExpungedBytes, true, expungedAmount);
    AutoTArray<nsString, 1> params = {expungedAmount};
    rv = bundle->FormatStringFromName("compactingDone", params, statusString);

    if (!statusString.IsEmpty() && NS_SUCCEEDED(rv))
      ShowStatusMsg(statusString);
  }
}

nsresult nsFolderCompactState::CompactNextFolder() {
  m_folderIndex++;
  // m_folderIndex might be > m_folderArray len if we compact offline stores,
  // and get back here from OnStopRunningUrl.
  if (m_folderIndex >= m_folderArray.Length()) {
    if (!m_compactOfflineAlso || m_compactingOfflineFolders) {
      CompactCompleted(NS_OK);
      return NS_OK;
    }
    m_compactingOfflineFolders = true;
    nsCOMPtr<nsIMsgFolder> folder(m_folderArray[m_folderIndex - 1]);
    return folder->CompactAllOfflineStores(this, m_window,
                                           m_offlineFolderArray);
  }
  nsCOMPtr<nsIMsgFolder> folder(m_folderArray[m_folderIndex]);
  return Compact(folder, m_compactingOfflineFolders, m_listener, m_window);
}

nsresult nsFolderCompactState::GetMessage(nsIMsgDBHdr** message) {
  return GetMsgDBHdrFromURI(m_messageUri.get(), message);
}

NS_IMETHODIMP
nsFolderCompactState::OnStartRequest(nsIRequest* request) {
  return StartMessage();
}

NS_IMETHODIMP
nsFolderCompactState::OnStopRequest(nsIRequest* request, nsresult status) {
  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  if (NS_FAILED(status)) {
    // Set m_status to status so the destructor can remove the temp folder and
    // database.
    m_status = status;
    CleanupTempFilesAfterError();
    m_folder->NotifyCompactCompleted();
    ReleaseFolderLock();
    m_folder->ThrowAlertMsg("compactFolderWriteFailed", m_window);
  } else {
    // XXX TODO: Error checking and handling missing here.
    EndCopy(nullptr, status);
    if (m_curIndex >= m_keys.Length()) {
      msgHdr = nullptr;
      // no more to copy finish it up
      FinishCompact();
    } else {
      // in case we're not getting an error, we still need to pretend we did get
      // an error, because the compact did not successfully complete.
      m_folder->NotifyCompactCompleted();
      CleanupTempFilesAfterError();
      ReleaseFolderLock();
    }
  }
  NS_RELEASE_THIS();  // kill self
  return status;
}

NS_IMETHODIMP
nsFolderCompactState::OnDataAvailable(nsIRequest* request,
                                      nsIInputStream* inStr,
                                      uint64_t sourceOffset, uint32_t count) {
  if (!m_fileStream || !inStr) return NS_ERROR_FAILURE;

  nsresult rv = NS_OK;
  uint32_t msgFlags;
  bool checkForKeyword = m_startOfMsg;
  bool addKeywordHdr = false;
  uint32_t needToGrowKeywords = 0;
  uint32_t statusOffset;
  nsCString msgHdrKeywords;

  if (m_startOfMsg) {
    m_statusOffset = 0;
    m_addedHeaderSize = 0;
    m_messageUri.Truncate();  // clear the previous message uri
    if (NS_SUCCEEDED(BuildMessageURI(m_baseMessageUri.get(), m_keys[m_curIndex],
                                     m_messageUri))) {
      rv = GetMessage(getter_AddRefs(m_curSrcHdr));
      NS_ENSURE_SUCCESS(rv, rv);
      if (m_curSrcHdr) {
        (void)m_curSrcHdr->GetFlags(&msgFlags);
        (void)m_curSrcHdr->GetStatusOffset(&statusOffset);

        if (statusOffset == 0) m_needStatusLine = true;
        // x-mozilla-status lines should be at the start of the headers, and the
        // code below assumes everything will fit in m_dataBuffer - if there's
        // not room, skip the keyword stuff.
        if (statusOffset > sizeof(m_dataBuffer) - 1024) {
          checkForKeyword = false;
          NS_ASSERTION(false, "status offset past end of read buffer size");
        }
      }
    }
    m_startOfMsg = false;
  }
  uint32_t maxReadCount, readCount, writeCount;
  uint32_t bytesWritten;

  while (NS_SUCCEEDED(rv) && (int32_t)count > 0) {
    maxReadCount =
        count > sizeof(m_dataBuffer) - 1 ? sizeof(m_dataBuffer) - 1 : count;
    writeCount = 0;
    rv = inStr->Read(m_dataBuffer, maxReadCount, &readCount);

    // if status offset is past the number of bytes we read, it's probably
    // bogus, and we shouldn't do any of the keyword stuff.
    if (statusOffset + X_MOZILLA_STATUS_LEN > readCount)
      checkForKeyword = false;

    if (NS_SUCCEEDED(rv)) {
      if (checkForKeyword) {
        // make sure that status offset really points to x-mozilla-status line
        if (!strncmp(m_dataBuffer + statusOffset, X_MOZILLA_STATUS,
                     X_MOZILLA_STATUS_LEN)) {
          const char* keywordHdr =
              PL_strnrstr(m_dataBuffer, HEADER_X_MOZILLA_KEYWORDS, readCount);
          if (keywordHdr)
            m_curSrcHdr->GetUint32Property("growKeywords", &needToGrowKeywords);
          else
            addKeywordHdr = true;
          m_curSrcHdr->GetStringProperty("keywords",
                                         getter_Copies(msgHdrKeywords));
        }
        checkForKeyword = false;
      }
      uint32_t blockOffset = 0;
      if (m_needStatusLine) {
        m_needStatusLine = false;
        // we need to parse out the "From " header, write it out, then
        // write out the x-mozilla-status headers, and set the
        // status offset of the dest hdr for later use
        // in OnEndCopy).
        if (!strncmp(m_dataBuffer, "From ", 5)) {
          blockOffset = 5;
          // skip from line
          MsgAdvanceToNextLine(m_dataBuffer, blockOffset, readCount);
          char statusLine[50];
          m_fileStream->Write(m_dataBuffer, blockOffset, &writeCount);
          m_statusOffset = blockOffset;
          PR_snprintf(statusLine, sizeof(statusLine),
                      X_MOZILLA_STATUS_FORMAT MSG_LINEBREAK, msgFlags & 0xFFFF);
          m_fileStream->Write(statusLine, strlen(statusLine),
                              &m_addedHeaderSize);
          PR_snprintf(statusLine, sizeof(statusLine),
                      X_MOZILLA_STATUS2_FORMAT MSG_LINEBREAK,
                      msgFlags & 0xFFFF0000);
          m_fileStream->Write(statusLine, strlen(statusLine), &bytesWritten);
          m_addedHeaderSize += bytesWritten;
        } else {
          NS_ASSERTION(false, "not an envelope");
          // try to mark the db as invalid so it will be reparsed.
          nsCOMPtr<nsIMsgDatabase> srcDB;
          m_folder->GetMsgDatabase(getter_AddRefs(srcDB));
          if (srcDB) {
            srcDB->SetSummaryValid(false);
            srcDB->ForceClosed();
          }
        }
      }
// clang-format off
#define EXTRA_KEYWORD_HDR                                                             \
  "                                                                                 " \
  MSG_LINEBREAK
      // clang-format on

      // if status offset isn't in the first block, this code won't work.
      // There's no good reason
      // for the status offset not to be at the beginning of the message anyway.
      if (addKeywordHdr) {
        // if blockOffset is set, we added x-mozilla-status headers so
        // file pointer is already past them.
        if (!blockOffset) {
          blockOffset = statusOffset;
          // skip x-mozilla-status and status2 lines.
          MsgAdvanceToNextLine(m_dataBuffer, blockOffset, readCount);
          MsgAdvanceToNextLine(m_dataBuffer, blockOffset, readCount);
          // need to rewrite the headers up to and including the
          // x-mozilla-status2 header
          m_fileStream->Write(m_dataBuffer, blockOffset, &writeCount);
        }
        // we should write out the existing keywords from the msg hdr, if any.
        if (msgHdrKeywords.IsEmpty()) {  // no keywords, so write blank header
          m_fileStream->Write(X_MOZILLA_KEYWORDS,
                              sizeof(X_MOZILLA_KEYWORDS) - 1, &bytesWritten);
          m_addedHeaderSize += bytesWritten;
        } else {
          if (msgHdrKeywords.Length() < sizeof(X_MOZILLA_KEYWORDS) -
                                            sizeof(HEADER_X_MOZILLA_KEYWORDS) +
                                            10 /* allow some slop */) {
            // Keywords fit in normal blank header, so replace blanks in
            // keyword hdr with keywords.
            nsAutoCString keywordsHdr(X_MOZILLA_KEYWORDS);
            keywordsHdr.Replace(sizeof(HEADER_X_MOZILLA_KEYWORDS) + 1,
                                msgHdrKeywords.Length(), msgHdrKeywords);
            m_fileStream->Write(keywordsHdr.get(), keywordsHdr.Length(),
                                &bytesWritten);
            m_addedHeaderSize += bytesWritten;
          } else {
            // Keywords don't fit, so write out keywords on one line and
            // an extra blank line.
            nsCString newKeywordHeader(HEADER_X_MOZILLA_KEYWORDS ": ");
            newKeywordHeader.Append(msgHdrKeywords);
            newKeywordHeader.Append(MSG_LINEBREAK EXTRA_KEYWORD_HDR);
            m_fileStream->Write(newKeywordHeader.get(),
                                newKeywordHeader.Length(), &bytesWritten);
            m_addedHeaderSize += bytesWritten;
          }
        }
        addKeywordHdr = false;
      } else if (needToGrowKeywords) {
        blockOffset = statusOffset;
        if (!strncmp(m_dataBuffer + blockOffset, X_MOZILLA_STATUS,
                     X_MOZILLA_STATUS_LEN))
          MsgAdvanceToNextLine(m_dataBuffer, blockOffset,
                               readCount);  // skip x-mozilla-status hdr
        if (!strncmp(m_dataBuffer + blockOffset, X_MOZILLA_STATUS2,
                     X_MOZILLA_STATUS2_LEN))
          MsgAdvanceToNextLine(m_dataBuffer, blockOffset,
                               readCount);  // skip x-mozilla-status2 hdr
        uint32_t preKeywordBlockOffset = blockOffset;
        if (!strncmp(m_dataBuffer + blockOffset, HEADER_X_MOZILLA_KEYWORDS,
                     sizeof(HEADER_X_MOZILLA_KEYWORDS) - 1)) {
          do {
            // skip x-mozilla-keywords hdr and any existing continuation headers
            MsgAdvanceToNextLine(m_dataBuffer, blockOffset, readCount);
          } while (m_dataBuffer[blockOffset] == ' ');
        }
        int32_t oldKeywordSize = blockOffset - preKeywordBlockOffset;

        // rewrite the headers up to and including the x-mozilla-status2 header
        m_fileStream->Write(m_dataBuffer, preKeywordBlockOffset, &writeCount);
        // let's just rewrite all the keywords on several lines and add a blank
        // line, instead of worrying about which are missing.
        bool done = false;
        nsAutoCString keywordHdr(HEADER_X_MOZILLA_KEYWORDS ": ");
        int32_t nextBlankOffset = 0;
        int32_t curHdrLineStart = 0;
        int32_t newKeywordSize = 0;
        while (!done) {
          nextBlankOffset = msgHdrKeywords.FindChar(' ', nextBlankOffset);
          if (nextBlankOffset == kNotFound) {
            nextBlankOffset = msgHdrKeywords.Length();
            done = true;
          }
          if (nextBlankOffset - curHdrLineStart > 90 || done) {
            keywordHdr.Append(nsDependentCSubstring(
                msgHdrKeywords, curHdrLineStart,
                msgHdrKeywords.Length() - curHdrLineStart));
            keywordHdr.Append(MSG_LINEBREAK);
            m_fileStream->Write(keywordHdr.get(), keywordHdr.Length(),
                                &bytesWritten);
            newKeywordSize += bytesWritten;
            curHdrLineStart = nextBlankOffset;
            keywordHdr.Assign(' ');
          }
          nextBlankOffset++;
        }
        m_fileStream->Write(EXTRA_KEYWORD_HDR, sizeof(EXTRA_KEYWORD_HDR) - 1,
                            &bytesWritten);
        newKeywordSize += bytesWritten;
        m_addedHeaderSize += newKeywordSize - oldKeywordSize;
        m_curSrcHdr->SetUint32Property("growKeywords", 0);
        needToGrowKeywords = false;
        writeCount += blockOffset - preKeywordBlockOffset;  // fudge writeCount
      }
      if (readCount <= blockOffset) {
        NS_ASSERTION(false, "bad block offset");
        // not sure what to do to handle this.
      }
      m_fileStream->Write(m_dataBuffer + blockOffset, readCount - blockOffset,
                          &bytesWritten);
      writeCount += bytesWritten;
      count -= readCount;
      if (writeCount != readCount) return NS_MSG_ERROR_WRITING_MAIL_FOLDER;
    }
  }
  return rv;
}

nsOfflineStoreCompactState::nsOfflineStoreCompactState()
    : m_offlineMsgSize(0) {}

nsOfflineStoreCompactState::~nsOfflineStoreCompactState() {}

nsresult nsOfflineStoreCompactState::InitDB(nsIMsgDatabase* db) {
  // Start with the list of messages we have offline as the possible
  // message to keep when compacting the offline store.
  db->ListAllOfflineMsgs(m_keys);
  m_db = db;
  return NS_OK;
}

/**
 * This will copy one message to the offline store, but if it fails to
 * copy the next message, it will keep trying messages until it finds one
 * it can copy, or it runs out of messages.
 */
nsresult nsOfflineStoreCompactState::CopyNextMessage(bool& done) {
  while (m_curIndex < m_keys.Length()) {
    // Filter out msgs that have the "pendingRemoval" attribute set.
    nsCOMPtr<nsIMsgDBHdr> hdr;
    nsString pendingRemoval;
    nsresult rv =
        m_db->GetMsgHdrForKey(m_keys[m_curIndex], getter_AddRefs(hdr));
    NS_ENSURE_SUCCESS(rv, rv);
    hdr->GetProperty("pendingRemoval", pendingRemoval);
    if (!pendingRemoval.IsEmpty()) {
      m_curIndex++;
      // Turn off offline flag for message, since after the compact is
      // completed; we won't have the message in the offline store.
      uint32_t resultFlags;
      hdr->AndFlags(~nsMsgMessageFlags::Offline, &resultFlags);
      // We need to clear this in case the user changes the offline retention
      // settings.
      hdr->SetStringProperty("pendingRemoval", "");
      continue;
    }
    m_messageUri.Truncate();  // clear the previous message uri
    rv = BuildMessageURI(m_baseMessageUri.get(), m_keys[m_curIndex],
                         m_messageUri);
    NS_ENSURE_SUCCESS(rv, rv);
    m_startOfMsg = true;
    nsCOMPtr<nsISupports> thisSupports;
    QueryInterface(NS_GET_IID(nsISupports), getter_AddRefs(thisSupports));
    nsCOMPtr<nsIURI> dummyNull;
    rv = m_messageService->StreamMessage(
        m_messageUri.get(), thisSupports, m_window, nullptr, false,
        EmptyCString(), true, getter_AddRefs(dummyNull));
    // if copy fails, we clear the offline flag on the source message.
    if (NS_FAILED(rv)) {
      nsCOMPtr<nsIMsgDBHdr> hdr;
      GetMessage(getter_AddRefs(hdr));
      if (hdr) {
        uint32_t resultFlags;
        hdr->AndFlags(~nsMsgMessageFlags::Offline, &resultFlags);
      }
      m_curIndex++;
      continue;
    } else
      break;
  }
  done = m_curIndex >= m_keys.Length();
  // In theory, we might be able to stream the next message, so
  // return NS_OK, not rv.
  return NS_OK;
}

NS_IMETHODIMP
nsOfflineStoreCompactState::OnStopRequest(nsIRequest* request,
                                          nsresult status) {
  nsresult rv = status;
  nsCOMPtr<nsIURI> uri;
  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;
  nsCOMPtr<nsIChannel> channel;
  bool done = false;

  // The NS_MSG_ERROR_MSG_NOT_OFFLINE error should allow us to continue, so we
  // check for it specifically and don't terminate the compaction.
  if (NS_FAILED(rv) && rv != NS_MSG_ERROR_MSG_NOT_OFFLINE) goto done;

  // We know the request is an nsIChannel we can get a URI from, but this is
  // probably bad form. See Bug 1528662.
  channel = do_QueryInterface(request, &rv);
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rv),
                       "error QI nsIRequest to nsIChannel failed");
  if (NS_FAILED(rv)) goto done;
  rv = channel->GetURI(getter_AddRefs(uri));
  if (NS_FAILED(rv)) goto done;
  rv = GetMessage(getter_AddRefs(msgHdr));
  if (NS_FAILED(rv)) goto done;

  // This is however an unexpected condition, so let's print a warning.
  if (rv == NS_MSG_ERROR_MSG_NOT_OFFLINE) {
    nsAutoCString spec;
    uri->GetSpec(spec);
    nsPrintfCString msg("Message expectedly not available offline: %s",
                        spec.get());
    NS_WARNING(msg.get());
  }

  if (msgHdr) {
    if (NS_SUCCEEDED(status)) {
      msgHdr->SetMessageOffset(m_startOfNewMsg);
      char storeToken[100];
      PR_snprintf(storeToken, sizeof(storeToken), "%lld", m_startOfNewMsg);
      msgHdr->SetStringProperty("storeToken", storeToken);
      msgHdr->SetOfflineMessageSize(m_offlineMsgSize);
    } else {
      uint32_t resultFlags;
      msgHdr->AndFlags(~nsMsgMessageFlags::Offline, &resultFlags);
    }
  }

  if (m_window) {
    m_window->GetStatusFeedback(getter_AddRefs(statusFeedback));
    if (statusFeedback)
      statusFeedback->ShowProgress(100 * m_curIndex / m_keys.Length());
  }
  // advance to next message
  m_curIndex++;
  rv = CopyNextMessage(done);
  if (done) {
    m_db->Commit(nsMsgDBCommitType::kCompressCommit);
    msgHdr = nullptr;
    // no more to copy finish it up
    ReleaseFolderLock();
    FinishCompact();
    NS_RELEASE_THIS();  // kill self
  }

done:
  if (NS_FAILED(rv)) {
    m_status = rv;  // set the status to rv so the destructor can remove the
                    // temp folder and database
    ReleaseFolderLock();
    NS_RELEASE_THIS();  // kill self
    return rv;
  }
  return rv;
}

nsresult nsOfflineStoreCompactState::FinishCompact() {
  // All okay time to finish up the compact process
  nsCOMPtr<nsIFile> path;
  uint32_t flags;

  // get leaf name and database name of the folder
  m_folder->GetFlags(&flags);
  nsresult rv = m_folder->GetFilePath(getter_AddRefs(path));

  nsCString leafName;
  path->GetNativeLeafName(leafName);

  if (m_fileStream) {
    // close down the temp file stream; preparing for deleting the old folder
    // and its database; then rename the temp folder and database
    m_fileStream->Flush();
    m_fileStream->Close();
    m_fileStream = nullptr;
  }

  // make sure the new database is valid
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  m_db->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
  if (dbFolderInfo) dbFolderInfo->SetExpungedBytes(0);
  // this forces the m_folder to update mExpungedBytes from the db folder info.
  int64_t expungedBytes;
  m_folder->GetExpungedBytes(&expungedBytes);
  m_folder->UpdateSummaryTotals(true);
  m_db->SetSummaryValid(true);

  // remove the old folder
  path->Remove(false);

  // rename the copied folder to be the original folder
  m_file->MoveToNative((nsIFile*)nullptr, leafName);

  ShowStatusMsg(EmptyString());
  m_folder->NotifyCompactCompleted();
  if (m_compactAll) rv = CompactNextFolder();
  return rv;
}

NS_IMETHODIMP
nsFolderCompactState::Init(nsIMsgFolder* srcFolder,
                           nsICopyMessageListener* destination,
                           nsISupports* listenerData) {
  return NS_OK;
}

NS_IMETHODIMP
nsFolderCompactState::StartMessage() {
  nsresult rv = NS_ERROR_FAILURE;
  NS_ASSERTION(m_fileStream, "Fatal, null m_fileStream...");
  if (m_fileStream) {
    nsCOMPtr<nsISeekableStream> seekableStream =
        do_QueryInterface(m_fileStream, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    // this will force an internal flush, but not a sync. Tell should really do
    // an internal flush, but it doesn't, and I'm afraid to change that
    // nsIFileStream.cpp code anymore.
    seekableStream->Seek(nsISeekableStream::NS_SEEK_CUR, 0);
    // record the new message key for the message
    int64_t curStreamPos;
    seekableStream->Tell(&curStreamPos);
    m_startOfNewMsg = curStreamPos;
    rv = NS_OK;
  }
  return rv;
}

NS_IMETHODIMP
nsFolderCompactState::EndMessage(nsMsgKey key) { return NS_OK; }

// XXX TODO: This function is sadly lacking all status checking, it always
// returns NS_OK and moves onto the next message.
NS_IMETHODIMP
nsFolderCompactState::EndCopy(nsISupports* url, nsresult aStatus) {
  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  nsCOMPtr<nsIMsgDBHdr> newMsgHdr;

  if (m_curIndex >= m_keys.Length()) {
    NS_ASSERTION(false, "m_curIndex out of bounds");
    return NS_OK;
  }

  /* Messages need to have trailing blank lines */
  uint32_t bytesWritten;
  (void)m_fileStream->Write(MSG_LINEBREAK, MSG_LINEBREAK_LEN, &bytesWritten);

  /**
   * Done with the current message; copying the existing message header
   * to the new database.
   */
  if (m_curSrcHdr) {
    nsMsgKey key;
    m_curSrcHdr->GetMessageKey(&key);
    m_db->CopyHdrFromExistingHdr(key, m_curSrcHdr, true,
                                 getter_AddRefs(newMsgHdr));
  }
  m_curSrcHdr = nullptr;
  if (newMsgHdr) {
    if (m_statusOffset != 0) newMsgHdr->SetStatusOffset(m_statusOffset);

    char storeToken[100];
    PR_snprintf(storeToken, sizeof(storeToken), "%lld", m_startOfNewMsg);
    newMsgHdr->SetStringProperty("storeToken", storeToken);
    newMsgHdr->SetMessageOffset(m_startOfNewMsg);

    uint32_t msgSize;
    (void)newMsgHdr->GetMessageSize(&msgSize);
    if (m_addedHeaderSize) {
      msgSize += m_addedHeaderSize;
      newMsgHdr->SetMessageSize(msgSize);
    }
    m_totalMsgSize += msgSize + MSG_LINEBREAK_LEN;
  }

  //  m_db->Commit(nsMsgDBCommitType::kLargeCommit);  // no sense committing
  //  until the end
  // advance to next message
  m_curIndex++;
  m_startOfMsg = true;
  nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;
  if (m_window) {
    m_window->GetStatusFeedback(getter_AddRefs(statusFeedback));
    if (statusFeedback)
      statusFeedback->ShowProgress(100 * m_curIndex / m_keys.Length());
  }
  return NS_OK;
}

nsresult nsOfflineStoreCompactState::StartCompacting() {
  nsresult rv = NS_OK;
  if (m_keys.Length() > 0 && m_curIndex == 0) {
    NS_ADDREF_THIS();  // we own ourselves, until we're done, anyway.
    ShowCompactingStatusMsg();
    bool done = false;
    rv = CopyNextMessage(done);
    if (!done) return rv;
  }
  ReleaseFolderLock();
  FinishCompact();
  return rv;
}

NS_IMETHODIMP
nsOfflineStoreCompactState::OnDataAvailable(nsIRequest* request,
                                            nsIInputStream* inStr,
                                            uint64_t sourceOffset,
                                            uint32_t count) {
  if (!m_fileStream || !inStr) return NS_ERROR_FAILURE;

  nsresult rv = NS_OK;

  if (m_startOfMsg) {
    m_statusOffset = 0;
    m_offlineMsgSize = 0;
    m_messageUri.Truncate();  // clear the previous message uri
    if (NS_SUCCEEDED(BuildMessageURI(m_baseMessageUri.get(), m_keys[m_curIndex],
                                     m_messageUri))) {
      rv = GetMessage(getter_AddRefs(m_curSrcHdr));
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }
  uint32_t maxReadCount, readCount, writeCount;
  uint32_t bytesWritten;

  while (NS_SUCCEEDED(rv) && (int32_t)count > 0) {
    maxReadCount =
        count > sizeof(m_dataBuffer) - 1 ? sizeof(m_dataBuffer) - 1 : count;
    writeCount = 0;
    rv = inStr->Read(m_dataBuffer, maxReadCount, &readCount);

    if (NS_SUCCEEDED(rv)) {
      if (m_startOfMsg) {
        m_startOfMsg = false;
        // check if there's an envelope header; if not, write one.
        if (strncmp(m_dataBuffer, "From ", 5)) {
          m_fileStream->Write("From " CRLF, 7, &bytesWritten);
          m_offlineMsgSize += bytesWritten;
        }
      }
      m_fileStream->Write(m_dataBuffer, readCount, &bytesWritten);
      m_offlineMsgSize += bytesWritten;
      writeCount += bytesWritten;
      count -= readCount;
      if (writeCount != readCount) {
        m_folder->ThrowAlertMsg("compactFolderWriteFailed", m_window);
        return NS_MSG_ERROR_WRITING_MAIL_FOLDER;
      }
    }
  }
  return rv;
}
