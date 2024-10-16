/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderCompactor.h"

#include "nsCOMPtr.h"
#include "nsIDBFolderInfo.h"
#include "nsIFile.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolder.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgHdr.h"
#include "nsIMsgLocalMailFolder.h"  // For QI, needed by IsLocalFolder().
#include "nsIMsgPluggableStore.h"
#include "nsIMsgStatusFeedback.h"
#include "nsIMsgWindow.h"
#include "nsIStringBundle.h"
#include "nsIUrlListener.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"  // For ParseUint64Str(), MSGS_URL.
#include "nsString.h"
#include "nsThreadUtils.h"  // For NS_NewRunnableFunction().
#include "nsTStringHasher.h"  // IWYU pragma: keep, for mozilla::DefaultHasher<nsCString>
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/RefCounted.h"
#include "mozilla/ScopeExit.h"

mozilla::LazyLogModule gCompactLog("compact");
using mozilla::LogLevel;

static bool IsLocalFolder(nsIMsgFolder* folder);
static nsresult BuildKeepMap(nsIMsgDatabase* db,
                             mozilla::HashMap<nsCString, nsMsgKey>& keepMap);
static nsresult BackupFile(nsIFile* srcFile, nsIFile** backupFile);
static nsresult SpaceRequiredToCompact(nsIMsgFolder* folder,
                                       int64_t* extraSpace);
static void GUIShowCompactingMsg(nsIMsgWindow* window, nsIMsgFolder* folder);
static void GUIShowDoneMsg(nsIMsgWindow* window, int64_t totalBytesRecovered);

/**
 * Helper class to compact a single folder.
 * Updates database and handles folder notifications, but does not deal
 * with the GUI (callback functions are used for that).
 * Uses nsIMsgPluggableStore.asyncCompact() to perform the actual compaction
 * while this class just coordinates things
 *  - Deciding which messages to keep.
 *  - Updating the message entries in the database.
 *
 * It doesn't update the GUI, but it provides enough information via error
 * codes and the progressFn/completionFn callbacks that the caller can
 * handle all the GUI updates.
 *
 * The approach is to make a map of all the messages we want to keep,
 * then use that as a whitelist when the asks us which messages to keep
 * (via nsIStoreCompactListener callbacks).
 */
class FolderCompactor : public nsIStoreCompactListener {
 public:
  FolderCompactor() = delete;
  explicit FolderCompactor(nsIMsgFolder* folder);

  NS_DECL_ISUPPORTS
  NS_DECL_NSISTORECOMPACTLISTENER

  // This kicks off the compaction.
  nsresult BeginCompacting(std::function<void(int)> progressFn,
                           std::function<void(nsresult, int64_t)> completionFn);

 private:
  virtual ~FolderCompactor();

  // Callbacks to invoke for progress and completion.
  std::function<void(int)> mProgressFn;
  std::function<void(nsresult, int64_t)> mCompletionFn;

  // The folder we're compacting.
  nsCOMPtr<nsIMsgFolder> mFolder;

  // The database we're compacting.
  nsCOMPtr<nsIMsgDatabase> mDB;

  // Filename of mDB.
  nsCOMPtr<nsIFile> mDBFile;

  // The filename of our backed up DB file.
  nsCOMPtr<nsIFile> mBackupDBFile;

  // Map of all the messages we want to keep. storeToken => messageKey
  mozilla::HashMap<nsCString, nsMsgKey> mMsgsToKeep;

  // Running total of kept messages (for progress feedback).
  uint32_t mNumKept{0};
};

NS_IMPL_ISUPPORTS(FolderCompactor, nsIStoreCompactListener);

FolderCompactor::FolderCompactor(nsIMsgFolder* folder) : mFolder(folder) {}

FolderCompactor::~FolderCompactor() {
  // Just in case db backup file is still lingering...
  if (mBackupDBFile) {
    mBackupDBFile->Remove(false);
    mBackupDBFile = nullptr;
  }
  // Should have already released folder in OnCompactionComplete(), but
  // it's safe to release even if we don't hold the lock.
  mFolder->ReleaseSemaphore(this);
}

nsresult FolderCompactor::BeginCompacting(
    std::function<void(int)> progressFn = {},
    std::function<void(nsresult, int64_t)> completionFn = {}) {
  nsresult rv;

  mProgressFn = progressFn;
  mCompletionFn = completionFn;

  MOZ_LOG(gCompactLog, LogLevel::Info,
          ("BeginCompacting() folder='%s'", mFolder->URI().get()));

  // Get the folder DB. If it's a local folder and the DB needs to be
  // rebuilt, this will fail. That's OK. We shouldn't be here if the DB
  // isn't ready to go.
  rv = mFolder->GetMsgDatabase(getter_AddRefs(mDB));
  NS_ENSURE_SUCCESS(rv, rv);

  // Returns NS_MSG_FOLDER_BUSY if locked
  rv = mFolder->AcquireSemaphore(this);
  NS_ENSURE_SUCCESS(rv, rv);
  // Just in case we exit early...
  auto guardSemaphore =
      mozilla::MakeScopeExit([&] { mFolder->ReleaseSemaphore(this); });

  // Check available disk space against estimate of space required.
  // Return NS_ERROR_FILE_NO_DEVICE_SPACE if we think it'll fail.
  {
    nsCOMPtr<nsIFile> path;
    rv = mFolder->GetSummaryFile(getter_AddRefs(path));
    NS_ENSURE_SUCCESS(rv, rv);

    int64_t availableSpace;
    rv = path->GetDiskSpaceAvailable(&availableSpace);
    if (NS_SUCCEEDED(rv)) {
      int64_t requiredSpace;
      rv = SpaceRequiredToCompact(mFolder, &requiredSpace);
      NS_ENSURE_SUCCESS(rv, rv);
      if (availableSpace < requiredSpace) {
        return NS_ERROR_FILE_NO_DEVICE_SPACE;
      }
    } else if (rv != NS_ERROR_NOT_IMPLEMENTED) {
      // If GetDiskSpaceAvailable() isn't implemented, we'll just plough
      // on without a space check. Otherwise bail out now.
      return rv;
    }
  }

  // Decide which messages we want to keep. Builds a storeToken => msgKey
  // hashmap of them.
  rv = BuildKeepMap(mDB, mMsgsToKeep);
  NS_ENSURE_SUCCESS(rv, rv);

  // If anything goes wrong during the compaction, the mbox file will be
  // left unchanged. In that case, we also want the DB to be left in
  // same condition as when we started.
  // We don't really have a proper transaction system in the DB, so
  // for now let's just take a copy of the DB file before we start
  // so we can restore it if anything goes wrong.
  rv = mDB->Commit(nsMsgDBCommitType::kLargeCommit);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mFolder->GetSummaryFile(getter_AddRefs(mDBFile));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = BackupFile(mDBFile, getter_AddRefs(mBackupDBFile));
  NS_ENSURE_SUCCESS(rv, rv);
  // Ditch the backup if we exit early.
  auto guardBackup = mozilla::MakeScopeExit([&] {
    mBackupDBFile->Remove(false);
    mBackupDBFile = nullptr;
  });

  // Local folders maintain X-Mozilla-* headers in the messages and they
  // may need patching up.
  bool patchXMozillaHeaders = IsLocalFolder(mFolder);

  // Kick it off by telling the store to start compacting the mbox file.
  // The msgStore will hold us in existence until our
  // OnCompactionComplete() handler returns.
  //
  // After AsyncCompact() is called, we'll receive callbacks to:
  // OnCompactionBegin()     - At the start of the compaction.
  // OnRetentionQuery()   - For each message, we give a thumbs up or down.
  // OnMessageRetained()         - After each kept message has been written.
  // OnCompactionComplete()  - At the end of the compaction.
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = mFolder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgStore->AsyncCompact(mFolder, this, patchXMozillaHeaders);
  NS_ENSURE_SUCCESS(rv, rv);

  // Gah. Would much rather have this notification defered until
  // OnCompactionBegin() is called, but test_nsIMsgFolderListenerLocal.js
  // relies on this being called _before_ we return...
  // See Bug 1887592.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) {
    notifier->NotifyFolderCompactStart(mFolder);
  }

  guardSemaphore.release();
  guardBackup.release();
  return NS_OK;
}

// Helper to estimate the extra diskspace required to compact a folder.
static nsresult SpaceRequiredToCompact(nsIMsgFolder* folder,
                                       int64_t* extraSpace) {
  MOZ_ASSERT(extraSpace);
  nsresult rv;

  // Get current size of store.
  int64_t storeSize;
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = folder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgStore->EstimateFolderSize(folder, &storeSize);
  NS_ENSURE_SUCCESS(rv, rv);

  // Number of bytes we expect to save.
  int64_t expunged = 0;
  folder->GetExpungedBytes(&expunged);

  // Allow at least 1Kb/message or current db size, whichever is smaller.
  int64_t dbSize;
  nsCOMPtr<nsIMsgDatabase> db;
  rv = folder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = db->GetDatabaseSize(&dbSize);
  NS_ENSURE_SUCCESS(rv, rv);
  int32_t numMsgs;
  rv = folder->GetTotalMessages(false, &numMsgs);
  NS_ENSURE_SUCCESS(rv, rv);
  dbSize = std::min(dbSize, ((int64_t)numMsgs) * 1024);

  // Tally up the final estimate.
  *extraSpace = (storeSize - expunged) + dbSize;
  return NS_OK;
}

// Helper to determine if folder is a local folder.
// We still require some special-casing depending on folder type (sigh).
static bool IsLocalFolder(nsIMsgFolder* folder) {
  nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(folder);
  return localFolder ? true : false;
}

// Helper. Make a copy of srcFile in the same directory, using a unique name
// returning the new filename in backupFile.
static nsresult BackupFile(nsIFile* srcFile, nsIFile** backupFile) {
  MOZ_ASSERT(backupFile);
  nsresult rv;
  // Want a file in the same directory
  nsCOMPtr<nsIFile> backup;
  rv = srcFile->Clone(getter_AddRefs(backup));
  NS_ENSURE_SUCCESS(rv, rv);

  // Add a suffix to the filename and make sure it's unique.
  nsAutoString filename;
  rv = backup->GetLeafName(filename);
  NS_ENSURE_SUCCESS(rv, rv);
  filename.AppendLiteral(".compact-backup");
  rv = backup->SetLeafName(filename);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = backup->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 00600);
  NS_ENSURE_SUCCESS(rv, rv);

  // Copy it.
  rv = backup->GetLeafName(filename);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = srcFile->CopyTo(nullptr, filename);
  NS_ENSURE_SUCCESS(rv, rv);

  backup.forget(backupFile);
  return NS_OK;
}

// Helper to decide which messages in a database we want to keep, and
// build a storeToken=>nsMsgKey map for easy lookups.
static nsresult BuildKeepMap(nsIMsgDatabase* db,
                             mozilla::HashMap<nsCString, nsMsgKey>& keepMap) {
  nsCOMPtr<nsIMsgEnumerator> iter;
  nsresult rv = db->EnumerateMessages(getter_AddRefs(iter));
  NS_ENSURE_SUCCESS(rv, rv);
  while (true) {
    bool hasMoreElements = false;
    rv = iter->HasMoreElements(&hasMoreElements);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!hasMoreElements) {
      break;
    }
    nsCOMPtr<nsIMsgDBHdr> hdr;
    rv = iter->GetNext(getter_AddRefs(hdr));
    NS_ENSURE_SUCCESS(rv, rv);

    nsMsgKey msgKey;
    rv = hdr->GetMessageKey(&msgKey);
    NS_ENSURE_SUCCESS(rv, rv);

    // No store token => No local copy of message.
    nsAutoCString token;
    rv = hdr->GetStoreToken(token);
    NS_ENSURE_SUCCESS(rv, rv);
    if (token.IsEmpty()) {
      MOZ_LOG(gCompactLog, LogLevel::Verbose,
              ("keepmap: ignore msgKey=%" PRIu32 " (no storeToken)", msgKey));
      continue;
    }

    // Check the "pendingRemoval" attribute. This is set by IMAP
    // ApplyRetentionSettings(), and we want to purge such messages now.
    // Unlike message deletion, these messages will still be in the DB and
    // on the server. We're just ditching the local copy.
    nsAutoCString pendingRemoval;
    rv = hdr->GetStringProperty("pendingRemoval", pendingRemoval);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!pendingRemoval.IsEmpty()) {
      // Clear the storeToken and Offline flag to make it clear message is no
      // longer stored locally.
      hdr->SetStoreToken(EmptyCString());
      uint32_t resultFlags;
      hdr->AndFlags(~nsMsgMessageFlags::Offline, &resultFlags);
      MOZ_LOG(gCompactLog, LogLevel::Verbose,
              ("keepmap: ignore msgKey=%" PRIu32 " (pendingRemoval is set)",
               msgKey));
      continue;
    }

    // If we get this far it's a message we want to keep, so
    // add it to our lookup table.
    NS_ENSURE_TRUE(keepMap.put(token, msgKey), NS_ERROR_OUT_OF_MEMORY);

    MOZ_LOG(gCompactLog, LogLevel::Verbose,
            ("keepmap: storeToken '%s' => msgKey %" PRIu32 "", token.get(),
             msgKey));
  }
  return NS_OK;
}

// nsIStoreCompactListener callback invoked when the compaction starts.
NS_IMETHODIMP FolderCompactor::OnCompactionBegin() {
  MOZ_LOG(gCompactLog, LogLevel::Verbose, ("OnCompactionBegin()"));
  return NS_OK;
}

// nsIStoreCompactListener callback to decide which messages to keep.
// Also has output params to send back flags and keywords so that
// nsIMsgPluggableStore.asyncCompact() can patch X-Mozilla-* headers.
NS_IMETHODIMP FolderCompactor::OnRetentionQuery(nsACString const& storeToken,
                                                uint32_t* msgFlags,
                                                nsACString& msgKeywords,
                                                bool* keep) {
  MOZ_ASSERT(msgFlags);
  MOZ_ASSERT(keep);
  auto got = mMsgsToKeep.lookup(PromiseFlatCString(storeToken));
  if (!got) {
    // Not in our list. Assume it's been deleted.
    MOZ_LOG(gCompactLog, LogLevel::Debug,
            ("OnRetentionQuery(storeToken='%s')? => No",
             PromiseFlatCString(storeToken).get()));
    *keep = false;
    return NS_OK;
  }

  // Get msg header from key.
  nsMsgKey msgKey = got->value();
  nsCOMPtr<nsIMsgDBHdr> hdr;
  nsresult rv = mDB->GetMsgHdrForKey(msgKey, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t flags;
  rv = hdr->GetFlags(&flags);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString keywords;
  rv = hdr->GetStringProperty("keywords", keywords);
  NS_ENSURE_SUCCESS(rv, rv);

  // If we get this far, we want to keep the message.
  *keep = true;
  MOZ_LOG(gCompactLog, LogLevel::Debug,
          ("OnRetentionQuery(storeToken='%s')? => Yes",
           PromiseFlatCString(storeToken).get()));
  // Return these so AsyncCompact() can rewrite X-Mozilla-* headers if asked
  // (We only ask it to do that for local folders).
  *msgFlags = flags;
  msgKeywords = keywords;
  return NS_OK;
}

// nsIStoreCompactListener callback, called when a message has been written
// out.
// This is not called for discarded messages.
// @param oldToken - The old storeToken of this message.
// @param newToken - The post-compaction storeToken of this message.
// @param newSize - The size of the new message, in bytes.
NS_IMETHODIMP FolderCompactor::OnMessageRetained(nsACString const& oldToken,
                                                 nsACString const& newToken,
                                                 int64_t newSize) {
  MOZ_LOG(gCompactLog, LogLevel::Debug,
          ("OnMessageRetained(oldToken='%s' newToken='%s' newSize=%" PRId64 ")",
           PromiseFlatCString(oldToken).get(),
           PromiseFlatCString(newToken).get(), newSize));
  // Look up msgKey for token.
  auto p = mMsgsToKeep.lookup(PromiseFlatCString(oldToken));
  if (!p) {
    return NS_ERROR_UNEXPECTED;
  }
  nsMsgKey key = p->value();
  // Using nsIMsgHdr is pretty heavyweight here - they'll likely all be cached
  // through murky mechanisms. This'll use up lots of memory on large folders
  // for no good reason.
  // Would be much better to just use the msgKey to twiddle the DB directly,
  // but the API doesn't support it. Sigh.
  nsCOMPtr<nsIMsgDBHdr> hdr;
  nsresult rv = mDB->GetMsgHdrForKey(key, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = hdr->SetStoreToken(newToken);
  NS_ENSURE_SUCCESS(rv, rv);

  // For IMAP and news, .offlineMessageSize is the local size.
  // For local folders, .messageSize is the local size.
  if (newSize >= UINT32_MAX) {
    return NS_ERROR_UNEXPECTED;
  }
  if (IsLocalFolder(mFolder)) {
    hdr->SetMessageSize((uint32_t)newSize);
  } else {
    hdr->SetOfflineMessageSize((uint32_t)newSize);
    // Offline flag should already be set.
  }

  // Give our caller a progress update.
  ++mNumKept;
  if (mProgressFn) {
    int perc = (100 * mNumKept) / mMsgsToKeep.count();
    mProgressFn(perc);
  }

  return NS_OK;
}

// nsIStoreCompactListener callback, called after compaction is complete.
// Success or failure indicated by status param.
// After this callback is called, the FolderCompactor will likely be
// destroyed.
// At this point the mbox file has been compacted, unless the status is
// a failure. In which case it has been rolled back.
NS_IMETHODIMP FolderCompactor::OnCompactionComplete(nsresult status,
                                                    int64_t oldSize,
                                                    int64_t newSize) {
  MOZ_LOG(gCompactLog, LogLevel::Info,
          ("OnCompactionComplete(status=0x%" PRIx32 " oldSize=%" PRId64
           " newSize=%" PRId64 ")",
           (uint32_t)status, oldSize, newSize));

  if (NS_SUCCEEDED(status)) {
    // Commit all the changes.
    nsresult rv = mDB->Commit(nsMsgDBCommitType::kCompressCommit);
    if (NS_SUCCEEDED(rv)) {
      // Don't need the DB backup any longer.
      mBackupDBFile->Remove(false);
      mBackupDBFile = nullptr;

      // Update expungedbytes count in db.
      nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
      mDB->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
      if (dbFolderInfo) {
        dbFolderInfo->SetExpungedBytes(0);
      }
      mDB->SetSummaryValid(true);
    } else {
      NS_ERROR("Failed to commit changes to DB!");
      status = rv;  // Make sure our completion fn hears about the failure.
    }
  } else {
    // Roll back all the DB changes.
    mDB->ForceClosed();

    // Replace db file with the backup one.
    nsAutoString dbFilename;
    nsresult rv = mDBFile->GetLeafName(dbFilename);
    if (NS_SUCCEEDED(rv)) {
      rv = mBackupDBFile->MoveTo(nullptr, dbFilename);
    }
    if (NS_SUCCEEDED(rv)) {
      // All done with backup db.
      mBackupDBFile = nullptr;
    }
    if (NS_FAILED(rv)) {
      NS_ERROR("Failed to restore db after compaction failure.");
      // Everything is going pear-shaped at this point.
      // The mbox file will have been rolled back, but there's not
      // much in the way of recovery options for the DB.
      // TODO: Maybe should just delete DB and require a reparse?
    }
  }

  // Release our lock on the folder.
  mFolder->ReleaseSemaphore(this);

  // Indicate that we're done (and how many bytes we clawed back).
  mCompletionFn(status, oldSize - newSize);

  // Notify that compaction of the folder is completed.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) {
    notifier->NotifyFolderCompactFinish(mFolder);
  }
  mFolder->NotifyCompactCompleted();  // Sigh. Would be nice to ditch this.

  return NS_OK;
}

/**
 * BatchCompactor - manages compacting a bunch of folders in sequence.
 *
 * Iterates through all the given folders and compacts them using the
 * FolderCompactor class. When all are complete the called is informed
 * via finalListener.onStopRunningUrl().
 *
 * This class is also responsible for all compaction-related GUI updates.
 */
class BatchCompactor {
 public:
  MOZ_DECLARE_REFCOUNTED_TYPENAME(BatchCompactor)
  NS_INLINE_DECL_REFCOUNTING(BatchCompactor)

  BatchCompactor() = delete;
  explicit BatchCompactor(nsTArray<RefPtr<nsIMsgFolder>> const& folders,
                          nsIUrlListener* finalListener, nsIMsgWindow* window);

  // Kick off the compaction.
  nsresult Begin();

 protected:
  virtual ~BatchCompactor();
  void OnProgress(int percent);
  void OnDone(nsresult status, int64_t bytesRecovered);
  // The folders we're compacting.
  nsTArray<RefPtr<nsIMsgFolder>> mFolders;
  // Which folder in mFolders is up next.
  size_t mNext;
  // OnStopRunningUrl() is called when it's all done.
  nsCOMPtr<nsIUrlListener> mFinalListener;
  // We show alert boxes and status/progress updates.
  nsCOMPtr<nsIMsgWindow> mWindow;
  // Keep a refcount upon ourself until we're done.
  RefPtr<BatchCompactor> mKungFuDeathGrip;
  // Running total of bytes saved.
  int64_t mTotalBytesRecovered;
};

BatchCompactor::BatchCompactor(nsTArray<RefPtr<nsIMsgFolder>> const& folders,
                               nsIUrlListener* finalListener,
                               nsIMsgWindow* window)
    : mFolders(folders.Clone()),
      mNext(0),
      mFinalListener(finalListener),
      mWindow(window),
      mTotalBytesRecovered(0) {}

BatchCompactor::~BatchCompactor() {}

nsresult BatchCompactor::Begin() {
  mKungFuDeathGrip = this;
  // Kick off the first folder (by pretending to complete one :-).
  // It might invoke listener, so defer until after we've returned.
  RefPtr<BatchCompactor> self = this;
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "BatchCompactor kickoff", [self] { self->OnDone(NS_OK, 0); }));
  return NS_OK;
}

void BatchCompactor::OnProgress(int percent) {
  if (mWindow) {
    nsCOMPtr<nsIMsgStatusFeedback> feedback;
    mWindow->GetStatusFeedback(getter_AddRefs(feedback));
    if (feedback) {
      feedback->ShowProgress(percent);
    }
  }
}

void BatchCompactor::OnDone(nsresult status, int64_t bytesRecovered) {
  if (NS_SUCCEEDED(status)) {
    mTotalBytesRecovered += bytesRecovered;
    if (mNext < mFolders.Length()) {
      // Kick off the next folder.
      nsIMsgFolder* folder = mFolders[mNext];
      ++mNext;
      RefPtr<FolderCompactor> compactor = new FolderCompactor(folder);
      status = compactor->BeginCompacting(
          std::bind(&BatchCompactor::OnProgress, this, std::placeholders::_1),
          std::bind(&BatchCompactor::OnDone, this, std::placeholders::_1,
                    std::placeholders::_2));
      // If it worked we're done for now.
      // If it failed, fall through.
      if (NS_SUCCEEDED(status)) {
        if (mWindow) {
          GUIShowCompactingMsg(mWindow, folder);
        }
        return;
      }
    }
  }

  // If we get here, we're either all done or something has failed.
  if (mWindow) {
    GUIShowDoneMsg(mWindow, mTotalBytesRecovered);
  }

  if (NS_FAILED(status) && mNext > 0) {
    // If it failed, display an alert.
    nsIMsgFolder* folder = mFolders[mNext - 1];
    MOZ_LOG(gCompactLog, LogLevel::Error,
            ("Failed to compact folder='%s', status=0x%" PRIx32 "",
             folder->URI().get(), (uint32_t)status));
    if (status == NS_ERROR_FILE_NO_DEVICE_SPACE) {
      folder->ThrowAlertMsg("compactFolderInsufficientSpace", mWindow);
    } else if (status == NS_MSG_FOLDER_BUSY) {
      folder->ThrowAlertMsg("compactFolderDeniedLock", mWindow);
    } else {
      folder->ThrowAlertMsg("compactFolderWriteFailed", mWindow);
    }
  }

  // Tell the listener how it all turned out.
  if (mFinalListener) {
    mFinalListener->OnStopRunningUrl(nullptr, status);
  }
  MOZ_LOG(gCompactLog, LogLevel::Info,
          ("AsyncCompactFolders() finished. TotalBytesRecovered=%" PRId64 "",
           mTotalBytesRecovered));
  // All done. BatchCompactor can be deleted now.
  mKungFuDeathGrip = nullptr;
}

static void GUIShowCompactingMsg(nsIMsgWindow* window, nsIMsgFolder* folder) {
  MOZ_ASSERT(window);
  nsresult rv;

  // Get our localised strings.
  nsCOMPtr<nsIStringBundle> bundle;
  {
    nsCOMPtr<nsIStringBundleService> sbs =
        mozilla::components::StringBundle::Service();
    NS_ENSURE_TRUE_VOID(sbs);
    rv = sbs->CreateBundle(MSGS_URL, getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS_VOID(rv);
  }

  // Get the message.
  nsAutoString compactingMsg;
  rv = folder->GetStringWithFolderNameFromBundle("compactingFolder",
                                                 compactingMsg);
  // Prepend account name.
  nsAutoString accountName;
  {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = folder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS_VOID(rv);
    rv = server->GetPrettyName(accountName);
    NS_ENSURE_SUCCESS_VOID(rv);
  }

  nsAutoString statusMessage;
  AutoTArray<nsString, 2> params = {accountName, compactingMsg};
  rv = bundle->FormatStringFromName("statusMessage", params, statusMessage);
  NS_ENSURE_SUCCESS_VOID(rv);

  // Show message and turn on the progress bar.
  nsCOMPtr<nsIMsgStatusFeedback> feedback;
  window->GetStatusFeedback(getter_AddRefs(feedback));
  if (feedback) {
    // Not all windows have .statusFeedback set, especially during
    // xpcshell-tests (search for gDummyMsgWindow, set up in alertTestUtils.js).
    feedback->SetStatusString(statusMessage);
    feedback->StartMeteors();
  }
}

static void GUIShowDoneMsg(nsIMsgWindow* window, int64_t totalBytesRecovered) {
  MOZ_ASSERT(window);
  nsresult rv;

  // Get our localised strings.
  nsCOMPtr<nsIStringBundle> bundle;
  {
    nsCOMPtr<nsIStringBundleService> sbs =
        mozilla::components::StringBundle::Service();
    NS_ENSURE_TRUE_VOID(sbs);
    rv = sbs->CreateBundle(MSGS_URL, getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS_VOID(rv);
  }

  // Format message with a nice human-readable byte count.
  nsAutoString amount;
  FormatFileSize(totalBytesRecovered, true, amount);
  nsAutoString doneMsg;
  AutoTArray<nsString, 1> params = {amount};
  rv = bundle->FormatStringFromName("compactingDone", params, doneMsg);
  NS_ENSURE_SUCCESS_VOID(rv);

  // Show message, and turn off progress bar.
  nsCOMPtr<nsIMsgStatusFeedback> feedback;
  window->GetStatusFeedback(getter_AddRefs(feedback));
  if (feedback) {
    feedback->SetStatusString(doneMsg);
    feedback->StopMeteors();
  }
}

// This is the sole public-facing function.
nsresult AsyncCompactFolders(nsTArray<RefPtr<nsIMsgFolder>> const& folders,
                             nsIUrlListener* listener, nsIMsgWindow* window) {
  // Filter out noncompactable folders and ones with zero .expungedBytes.
  nsTArray<RefPtr<nsIMsgFolder>> filteredFolders;
  for (nsIMsgFolder* f : folders) {
    // Get expunged count.
    int64_t expunged = 0;
    nsresult rv = f->GetExpungedBytes(&expunged);
    NS_ENSURE_SUCCESS(rv, rv);
    if (expunged == 0) {
      MOZ_LOG(
          gCompactLog, LogLevel::Info,
          ("AsyncCompactFolders() ignoring folder '%s' (expungedBytes is 0)",
           f->URI().get()));
      continue;  // Skip it.
    }

    // Supports compaction?
    bool supportsCompaction;
    nsCOMPtr<nsIMsgPluggableStore> msgStore;
    rv = f->GetMsgStore(getter_AddRefs(msgStore));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = msgStore->GetSupportsCompaction(&supportsCompaction);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!supportsCompaction) {
      MOZ_LOG(gCompactLog, LogLevel::Info,
              ("AsyncCompactFolders() ignoring folder '%s' (compaction "
               "unsupported)",
               f->URI().get()));
      continue;  // Skip it.
    }

    // If we get this far, we'll compact it!
    filteredFolders.AppendElement(f);
  }

  // BatchCompactor works fine with an empty set and
  // listener.onStopRunningUrl() will still be called.
  MOZ_LOG(gCompactLog, LogLevel::Info,
          ("AsyncCompactFolders() starting compaction of %d folders",
           (int)filteredFolders.Length()));

  RefPtr<BatchCompactor> batch =
      new BatchCompactor(filteredFolders, listener, window);
  nsresult rv = batch->Begin();
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}
