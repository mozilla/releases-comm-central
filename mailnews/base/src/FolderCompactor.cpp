/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderCompactor.h"

#include "nsCOMPtr.h"
#include "nsIAppStartup.h"
#include "nsIDBFolderInfo.h"
#include "nsIFile.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolder.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgImapMailFolder.h"
#include "nsIMsgHdr.h"
#include "nsIMsgLocalMailFolder.h"  // For QI, needed by IsLocalFolder().
#include "nsIMsgPluggableStore.h"
#include "nsIMsgStatusFeedback.h"
#include "nsIMsgWindow.h"
#include "nsIObserver.h"
#include "nsIObserverService.h"
#include "nsIStringBundle.h"
#include "nsIUrlListener.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"  // For ParseUint64Str(), MSGS_URL.
#include "nsString.h"
#include "nsThreadUtils.h"  // For NS_NewRunnableFunction().
#include "nsTStringHasher.h"  // IWYU pragma: keep, for mozilla::DefaultHasher<nsCString>
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/RefCounted.h"
#include "mozilla/Services.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/glean/CommMailMetrics.h"

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

  class ShutdownObserver final : public nsIObserver {
   public:
    ShutdownObserver();
    NS_DECL_ISUPPORTS
    NS_DECL_NSIOBSERVER
    static bool IsShuttingDown();

   protected:
    ~ShutdownObserver() {}
    MOZ_RUNINIT static RefPtr<FolderCompactor::ShutdownObserver> sInstance;
    bool mIsShuttingDown;
  };

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

  // Glean timer.
  uint64_t mTimerId{0};
};

NS_IMPL_ISUPPORTS(FolderCompactor, nsIStoreCompactListener)

FolderCompactor::FolderCompactor(nsIMsgFolder* folder) : mFolder(folder) {}

FolderCompactor::~FolderCompactor() {
  // Just in case db backup file is still lingering...
  if (mBackupDBFile) {
    mBackupDBFile->Remove(false);
    mBackupDBFile = nullptr;
  }
  // Should have already released folder in OnFinalSummary(), but
  // ReleaseSemaphore() is OK with being called even if we don't hold the
  // lock.
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
  // handler returns.
  //
  // After AsyncCompact() is called, we'll receive callbacks to:
  // OnCompactionBegin()    - At the start of the compaction.
  // OnRetentionQuery()     - For each message, we give a thumbs up or down.
  // OnMessageRetained()    - After each kept message has been written.
  // OnCompactionComplete() - The new mbox is ready to go, so we should
  //                          install the new db.
  // OnFinalSummary()       - At the end of the compaction.
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
  if (ShutdownObserver::IsShuttingDown()) {
    return NS_ERROR_ABORT;
  }

  MOZ_LOG(gCompactLog, LogLevel::Verbose, ("OnCompactionBegin()"));
  mTimerId = mozilla::glean::mail::compact_duration.Start();

  PROFILER_MARKER_TEXT(
      "FolderCompactor", OTHER,
      mozilla::MarkerOptions(mozilla::MarkerTiming::IntervalStart()),
      mFolder->URI());
  return NS_OK;
}

// nsIStoreCompactListener callback to decide which messages to keep.
// Also has output params to send back flags and keywords so that
// nsIMsgPluggableStore.asyncCompact() can patch X-Mozilla-* headers.
NS_IMETHODIMP FolderCompactor::OnRetentionQuery(nsACString const& storeToken,
                                                uint32_t* msgFlags,
                                                nsACString& msgKeywords,
                                                bool* keep) {
  if (ShutdownObserver::IsShuttingDown()) {
    return NS_ERROR_ABORT;
  }

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
  if (ShutdownObserver::IsShuttingDown()) {
    return NS_ERROR_ABORT;
  }

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

// nsIStoreCompactListener callback, called after the low-level compaction
// is complete, but before it has been committed.
//
// In practice, for mbox: the newly compacted mbox is ready to go
// (in "foo/.compact-temp/folder.compacted"), the old mbox has been moved out
// of the way (to "foo/.compact-temp/folder.original"). The new mbox will be
// installed (via a file rename) as soon as this function returns
// successfully.
// If this function returns a failure code, an attempt will be made to
// restore the old mbox file.
//
// If we crash or lose power before returning from this function, we'll be
// out of sync. But at least the condition can be detected and could be
// recovered.
//
// If the AsyncCompact() operation failed, then status passed in here will
// hold a failure code, we shouldn't install our DB changes, and the
// lower-level (mbox) compaction will be reverted no matter what error code
// we return from this function.
NS_IMETHODIMP FolderCompactor::OnCompactionComplete(nsresult status) {
  MOZ_LOG(gCompactLog, LogLevel::Info,
          ("OnCompactionComplete(status=0x%" PRIx32 ")", (uint32_t)status));

  nsresult rv = status;
  if (NS_SUCCEEDED(rv)) {
    // Commit all the changes.
    rv = mDB->Commit(nsMsgDBCommitType::kCompressCommit);
    if (NS_SUCCEEDED(rv)) {
      mBackupDBFile->Remove(false);
      mBackupDBFile = nullptr;
    }
  }

  if (NS_FAILED(rv)) {
    // Kill db and replace with backup.
    mDB->ForceClosed();
    nsAutoString dbFilename;
    nsresult rv2 = mDBFile->GetLeafName(dbFilename);
    if (NS_SUCCEEDED(rv2)) {
      rv2 = mBackupDBFile->MoveTo(nullptr, dbFilename);
    }
    if (NS_SUCCEEDED(rv2)) {
      // All done with backup db.
      mBackupDBFile = nullptr;
    } else {
      NS_ERROR("Failed to restore db after compaction failure.");
      // Everything is going pear-shaped at this point.
      // The mbox file will be rolled back, but there's not
      // much in the way of recovery options for the DB.
      // TODO: Maybe should just delete DB and require a reparse?
    }
  }
  return rv;
}

// nsIStoreCompactListener callback, the last thing called.
// Informs us about the final results of the compaction.
// After this callback returns, the FolderCompactor will likely be
// destroyed.
// Any error code returned from here is ignored.
NS_IMETHODIMP FolderCompactor::OnFinalSummary(nsresult status, int64_t oldSize,
                                              int64_t newSize) {
  MOZ_LOG(gCompactLog, LogLevel::Info,
          ("OnFinalSummary(status=0x%" PRIx32 " oldSize=%" PRId64
           " newSize=%" PRId64 ")",
           (uint32_t)status, oldSize, newSize));

  nsPrintfCString statusStr("%x", (uint32_t)status);
  mozilla::glean::mail::compact_result.Get(statusStr).Add(1);
  if (mTimerId) {
    mozilla::glean::mail::compact_duration.StopAndAccumulate(
        std::move(mTimerId));
  }
  PROFILER_MARKER_TEXT(
      "FolderCompactor", OTHER,
      mozilla::MarkerOptions(mozilla::MarkerTiming::IntervalEnd()),
      mFolder->URI());

  if (NS_SUCCEEDED(status)) {
    mozilla::glean::mail::compact_space_recovered.Accumulate(oldSize - newSize);
    // Update expungedbytes count in db.
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    mDB->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
    if (dbFolderInfo) {
      dbFolderInfo->SetExpungedBytes(0);
    }
    mDB->SetSummaryValid(true);
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

  return NS_OK;  // This is ignored.
}

NS_IMPL_ISUPPORTS(FolderCompactor::ShutdownObserver, nsIObserver)

RefPtr<FolderCompactor::ShutdownObserver>
    FolderCompactor::ShutdownObserver::sInstance;

FolderCompactor::ShutdownObserver::ShutdownObserver() {
  nsCOMPtr<nsIAppStartup> appStartup(
      mozilla::components::AppStartup::Service());
  appStartup->GetShuttingDown(&mIsShuttingDown);

  if (!mIsShuttingDown) {
    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    obs->AddObserver(this, "quit-application", false);
    obs->AddObserver(this, "test-quit-application", false);
  }
}

NS_IMETHODIMP
FolderCompactor::ShutdownObserver::Observe(nsISupports* aSubject,
                                           const char* aTopic,
                                           const char16_t* aData) {
  if (!strcmp(aTopic, "quit-application") ||
      !strcmp(aTopic, "test-quit-application")) {
    mIsShuttingDown = true;
    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    obs->RemoveObserver(this, "quit-application");
    obs->RemoveObserver(this, "test-quit-application");
  }
  return NS_OK;
}

// static
bool FolderCompactor::ShutdownObserver::IsShuttingDown() {
  if (!sInstance) {
    sInstance = new FolderCompactor::ShutdownObserver();
  }
  return sInstance->mIsShuttingDown;
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
  void StartNext();
  void OnProgress(int percent);
  void OnDone(nsresult status, int64_t bytesRecovered);

  static void RetryTimerCallback(nsITimer* timer, void* closure);

  // Delay between attempts.
  static constexpr uint32_t kRetryDelayMs = 3000;
  // Maximum number of attempts.
  static constexpr int kMaxAttempts = 5;
  // The folders queued for compaction.
  nsTArray<RefPtr<nsIMsgFolder>> mQueue;
  // Folders which need to be retried (after a delay).
  nsTArray<RefPtr<nsIMsgFolder>> mRetry;
  // Number of times we've delayed and retried.
  int mAttempt{0};
  // Timer used for retries.
  nsCOMPtr<nsITimer> mRetryTimer;
  // Folders which were successfully compacted.
  nsTArray<RefPtr<nsIMsgFolder>> mComplete;
  // Folders which failed to compact.
  nsTArray<RefPtr<nsIMsgFolder>> mFailed;
  // Error codes for failed folders.
  nsTArray<nsresult> mFailedCodes;
  // OnStopRunningUrl() is called when it's all done.
  nsCOMPtr<nsIUrlListener> mFinalListener;
  // We show alert boxes and status/progress updates.
  nsCOMPtr<nsIMsgWindow> mWindow;
  // Keep a refcount upon ourself until we're done.
  RefPtr<BatchCompactor> mKungFuDeathGrip;
  // Running total of bytes saved.
  int64_t mTotalBytesRecovered{0};
};

BatchCompactor::BatchCompactor(nsTArray<RefPtr<nsIMsgFolder>> const& folders,
                               nsIUrlListener* finalListener,
                               nsIMsgWindow* window)
    : mRetryTimer(NS_NewTimer()),
      mComplete(folders.Length()),
      mFinalListener(finalListener),
      mWindow(window) {
  mQueue = folders.Clone();
  mQueue.Reverse();
}

BatchCompactor::~BatchCompactor() {
  mRetryTimer->Cancel();  // Just in case.
}

nsresult BatchCompactor::Begin() {
  mKungFuDeathGrip = this;
  // Kick off the first folder.
  // It might invoke listener, so defer until after we've returned.
  RefPtr<BatchCompactor> self = this;
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "BatchCompactor kickoff", [self] { self->StartNext(); }));
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

// static
void BatchCompactor::RetryTimerCallback(nsITimer* timer, void* closure) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  BatchCompactor* self = static_cast<BatchCompactor*>(closure);
  self->StartNext();
}

// IMAP folders can have pseudo and offline operations that don't
// interact well with compaction. If we see any of those pending,
// we cannot compact now, but need to retry later.
static bool CanCompactNow(nsIMsgFolder* folder) {
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(folder);
  if (imapFolder) {
    bool hasPseudo;
    if (NS_SUCCEEDED(imapFolder->HasPseudoActivity(&hasPseudo))) {
      if (hasPseudo) {
        MOZ_LOG(gCompactLog, LogLevel::Debug,
                ("BatchCompactor::CanCompactNow(): HasPseudoStuff"));
        return false;
      }
    }
  }

  nsCOMPtr<nsIMsgDatabase> folderDB;
  nsresult rv = folder->GetMsgDatabase(getter_AddRefs(folderDB));
  if (folderDB) {
    nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb = do_QueryInterface(folderDB, &rv);
    if (NS_SUCCEEDED(rv)) {
      bool hasOffline;
      rv = opsDb->HasOfflineActivity(&hasOffline);
      if (NS_SUCCEEDED(rv)) {
        if (hasOffline) {
          MOZ_LOG(gCompactLog, LogLevel::Debug,
                  ("BatchCompactor::CanCompactNow(): HasOfflineActivity"));
          // No, we don't want to compact now.
          return false;
        }
      } else if (rv != NS_ERROR_NOT_IMPLEMENTED) {
        // We can compact folders that don't support offline ops.
        // However, we skip folders that fail to give us the status.
        MOZ_LOG(
            gCompactLog, LogLevel::Debug,
            ("BatchCompactor::CanCompactNow(): Failure querying offline ops"));
        return false;
      }
    }
  }
  return true;
}

void BatchCompactor::StartNext() {
  MOZ_ASSERT(mRetryTimer);

  while (true) {
    if (mQueue.IsEmpty()) {
      if (mRetry.IsEmpty()) {
        // That's it - we're all done!
        break;
      }

      ++mAttempt;
      if (mAttempt >= kMaxAttempts) {
        // Out of retries - fail the outstanding folders.
        MOZ_LOG(gCompactLog, LogLevel::Error,
                ("BatchCompactor: too many attempts. Bailing out."));
        for (nsIMsgFolder* f : mRetry) {
          mFailed.AppendElement(f);
          mFailedCodes.AppendElement(NS_ERROR_UNEXPECTED);
        }
        mRetry.Clear();
        continue;
      }

      // Re-queue the folders in the retry list and schedule another attempt,
      // after a suitable pause.
      mQueue = mRetry.Clone();
      mRetry.Clear();
      MOZ_LOG(
          gCompactLog, LogLevel::Info,
          ("BatchCompactor: Attempt %d. Retrying %d folders in %" PRIu32 "ms",
           mAttempt, (int)mQueue.Length(), kRetryDelayMs));
      nsresult rv = mRetryTimer->InitWithNamedFuncCallback(
          RetryTimerCallback, (void*)this, kRetryDelayMs,
          nsITimer::TYPE_ONE_SHOT, "BatchCompactor RetryTimer");
      if (NS_SUCCEEDED(rv)) {
        // Time to wait.
        return;
      }

      // Retry timer failed.
      // Nothing we can do to recover, so just fail everything outstanding.
      for (nsIMsgFolder* f : mQueue) {
        mFailed.AppendElement(f);
        mFailedCodes.AppendElement(NS_ERROR_UNEXPECTED);
      }
      mQueue.Clear();
      break;  // All Done.
    }

    // If we get this far, there's something in the queue to try.
    if (!CanCompactNow(mQueue.LastElement())) {
      MOZ_LOG(gCompactLog, LogLevel::Error,
              ("BatchCompactor - Can't compact '%s' now. Queued for retry.",
               mQueue.LastElement()->URI().get()));
      // Move it to the retry queue, to try again later.
      mRetry.AppendElement(mQueue.PopLastElement());
      continue;
    }

    // GO!
    RefPtr<FolderCompactor> compactor =
        new FolderCompactor(mQueue.LastElement());
    nsresult rv = compactor->BeginCompacting(
        std::bind(&BatchCompactor::OnProgress, this, std::placeholders::_1),
        std::bind(&BatchCompactor::OnDone, this, std::placeholders::_1,
                  std::placeholders::_2));
    // If it worked we're done for now.
    if (NS_FAILED(rv)) {
      // Move it to the Failed list and go back for another one.
      mFailed.AppendElement(mQueue.PopLastElement());
      mFailedCodes.AppendElement(rv);
      continue;
    }

    // We've sucessfully set a compaction running!
    if (mWindow) {
      GUIShowCompactingMsg(mWindow, mQueue.LastElement());
    }
    return;
  }  // End of loop.

  // When we get here, we're all done.
  MOZ_ASSERT(mQueue.IsEmpty());
  MOZ_ASSERT(mRetry.IsEmpty());
  MOZ_ASSERT(mFailed.Length() == mFailedCodes.Length());

  if (mWindow) {
    GUIShowDoneMsg(mWindow, mTotalBytesRecovered);
  }

  // There _may_ be failures.

  for (uint32_t i = 0; i < mFailed.Length(); ++i) {
    MOZ_LOG(gCompactLog, LogLevel::Error,
            ("Failed to compact folder='%s', status=0x%" PRIx32 "",
             mFailed[i]->URI().get(), (uint32_t)mFailedCodes[i]));
  }

  nsresult status = NS_OK;
  if (!mFailed.IsEmpty()) {
    // Show an error for the first failing folder.
    nsIMsgFolder* folder = mFailed[0];
    status = mFailedCodes[0];

    if (!FolderCompactor::ShutdownObserver::IsShuttingDown()) {
      // NOTE: NS_MSG_ codes are not actually nsresult, so can't use switch
      // statement here (see Bug 1927029).
      if (status == NS_ERROR_FILE_NO_DEVICE_SPACE) {
        folder->ThrowAlertMsg("compactFolderInsufficientSpace", mWindow);
      } else if (status == NS_MSG_FOLDER_BUSY) {
        folder->ThrowAlertMsg("compactFolderDeniedLock", mWindow);
      } else if (status == NS_MSG_ERROR_MBOX_MALFORMED) {
        // Uhoh... looks like the mbox was bad.
        // It does seem like there are old mboxes in the wild which don't
        // have "From " separators so we can't reliably compact those.

        nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(folder);
        if (imapFolder) {
          // For IMAP, we can trigger a folder repair, which will re-download
          // the messages.
          nsCOMPtr<nsIObserverService> obs =
              mozilla::services::GetObserverService();
          obs->NotifyObservers(folder, "folder-needs-repair", nullptr);
        } else {
          // For local folders, there's not much we can do. If compact can't
          // scan the mbox, then local folder repair won't be able to either.
          folder->ThrowAlertMsg("compactFolderStorageCorruption", mWindow);
        }
      } else {
        // Show a catch-all error message.
        folder->ThrowAlertMsg("compactFolderWriteFailed", mWindow);
      }
    }
  }

  // Tell the listener how it all turned out.
  if (mFinalListener) {
    mFinalListener->OnStopRunningUrl(nullptr, status);
  }

  MOZ_LOG(
      gCompactLog, LogLevel::Info,
      ("BatchCompactor complete: %d folders compacted, %d failed, "
       "TotalBytesRecovered=%" PRId64 "",
       (int)mComplete.Length(), (int)mFailed.Length(), mTotalBytesRecovered));

  // All done. BatchCompactor can be deleted now.
  mKungFuDeathGrip = nullptr;
}

// Called when a folder compaction has completed (or failed).
void BatchCompactor::OnDone(nsresult status, int64_t bytesRecovered) {
  if (NS_SUCCEEDED(status)) {
    mTotalBytesRecovered += bytesRecovered;
    mComplete.AppendElement(mQueue.PopLastElement());
  } else {
    mFailed.AppendElement(mQueue.PopLastElement());
    mFailedCodes.AppendElement(status);
  }
  StartNext();
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
  nsAutoCString accountName;
  {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = folder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS_VOID(rv);
    rv = server->GetPrettyName(accountName);
    NS_ENSURE_SUCCESS_VOID(rv);
  }

  nsAutoString statusMessage;
  AutoTArray<nsString, 2> params = {NS_ConvertUTF8toUTF16(accountName),
                                    compactingMsg};
  rv = bundle->FormatStringFromName("statusMessage", params, statusMessage);
  NS_ENSURE_SUCCESS_VOID(rv);

  // Show message and turn on the progress bar.
  nsCOMPtr<nsIMsgStatusFeedback> feedback;
  window->GetStatusFeedback(getter_AddRefs(feedback));
  if (feedback) {
    // Not all windows have .statusFeedback set, especially during
    // xpcshell-tests (search for gDummyMsgWindow, set up in alertTestUtils.js).
    feedback->ShowStatusString(statusMessage);
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
    feedback->ShowStatusString(doneMsg);
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
