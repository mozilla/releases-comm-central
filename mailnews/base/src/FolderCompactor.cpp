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
#include "nsPrintfCString.h"
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
 * The approach is to make a map of all the messages we want to
 * keep, then use that each time asyncCompact() calls our
 * nsIStoreCompactListener.onRetentionQuery() method.
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

  // We need this in a couple of places, so hold onto it.
  nsCOMPtr<nsIMsgDBService> mDBService;

  // The database we're compacting.
  nsCOMPtr<nsIMsgDatabase> mDB;

  // Map of all the messages we want to keep. storeToken => messageKey
  mozilla::HashMap<nsCString, nsMsgKey> mMsgsToKeep;

  // Running total of kept messages (for progress feedback).
  uint32_t mNumKept{0};

  // Glean timer.
  uint64_t mTimerId{0};

  // Set if/when we return success from our OnCompactionComplete()
  // handler. If this is false at OnFinalSummary() time, we know
  // no attempt has been made to install the low level changes, and
  // we can safely delete our leftover .compacted or .backup DB files.
  bool mKeepRecoveryFiles{false};

  // Collect together the various file paths we want to wrangle.
  struct {
    // Path to folder db file we're compacting.
    nsCOMPtr<nsIFile> Source;     // "foo/folder.msf"
    nsCOMPtr<nsIFile> SourceDir;  // "foo"
    nsString SourceName;          // "folder.msf"

    // Temp dir to use (must be in same filesystem as Source!)
    nsCOMPtr<nsIFile> TempDir;  // ".../foo/.compact-temp"

    // The db file we're compacting into.
    nsCOMPtr<nsIFile> Compacting;  // "foo/.compact-temp/folder.msf.compacting"
    nsString CompactingName;       // "folder.msf.compacting"

    // The db file once successfully compacted (but not yet installed).
    nsCOMPtr<nsIFile> Compacted;  // "foo/.compact-temp/folder.msf.compacted"
    nsString CompactedName;       // "folder.msf.compacted"

    // Where to move the old db file (in case installing the new one fails).
    nsCOMPtr<nsIFile> Backup;  // "foo/.compact-temp/folder.msf.original"
    nsString BackupName;       // "folder.msf.original"
  } mPaths;
};

NS_IMPL_ISUPPORTS(FolderCompactor, nsIStoreCompactListener)

FolderCompactor::FolderCompactor(nsIMsgFolder* folder) : mFolder(folder) {}

FolderCompactor::~FolderCompactor() {
  // Should have already released folder in OnFinalSummary(), but
  // ReleaseSemaphore() is OK with being called even if we don't hold the
  // lock.
  mFolder->ReleaseSemaphore(this, "FolderCompactor::~FolderCompactor"_ns);
}

nsresult FolderCompactor::BeginCompacting(
    std::function<void(int)> progressFn = {},
    std::function<void(nsresult, int64_t)> completionFn = {}) {
  MOZ_ASSERT(mDB == nullptr);
  MOZ_ASSERT(mDBService == nullptr);

  nsresult rv;

  mProgressFn = progressFn;
  mCompletionFn = completionFn;

  MOZ_LOG(gCompactLog, LogLevel::Info,
          ("BeginCompacting() folder='%s'", mFolder->URI().get()));

  mDBService = do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mFolder->AcquireSemaphore(this, "FolderCompactor::BeginCompacting"_ns);
  if (rv == NS_MSG_FOLDER_BUSY) {
    return rv;  // Semi-expected, don't want a warning message.
  }
  NS_ENSURE_SUCCESS(rv, rv);

  // Just in case we exit early...
  auto guardSemaphore = mozilla::MakeScopeExit([&] {
    mFolder->ReleaseSemaphore(this, "FolderCompactor::BeginCompacting"_ns);
  });

  // If it's a local folder and the DB needs to be rebuilt, this will fail.
  // That's OK. We shouldn't be here if the DB isn't ready to go.
  nsCOMPtr<nsIMsgDatabase> db;
  rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);
  // There could be changes which aren't yet written to disk.
  rv = db->Commit(nsMsgDBCommitType::kLargeCommit);
  NS_ENSURE_SUCCESS(rv, rv);

  // Get file location of the folder db.
  rv = mFolder->GetSummaryFile(getter_AddRefs(mPaths.Source));
  NS_ENSURE_SUCCESS(rv, rv);

  // Check available disk space against estimate of space required.
  // Return NS_ERROR_FILE_NO_DEVICE_SPACE if we think it'll fail.
  {
    int64_t availableSpace;
    rv = mPaths.Source->GetDiskSpaceAvailable(&availableSpace);
    // If GetDiskSpaceAvailable() isn't implemented, we'll just plough
    // on without a space check. Otherwise bail out now.
    if (NS_FAILED(rv) && rv != NS_ERROR_NOT_IMPLEMENTED) {
      return rv;
    }
    int64_t requiredSpace;
    rv = SpaceRequiredToCompact(mFolder, &requiredSpace);
    NS_ENSURE_SUCCESS(rv, rv);
    if (availableSpace < requiredSpace) {
      return NS_ERROR_FILE_NO_DEVICE_SPACE;
    }
  }

  // Decide which messages we want to keep. Builds a storeToken => msgKey
  // hashmap of them.
  rv = BuildKeepMap(db, mMsgsToKeep);
  NS_ENSURE_SUCCESS(rv, rv);

  mFolder->NotifyAboutToCompact();
  // Ensure the active views of the folder are reloaded in any case.
  auto guardNotification =
      mozilla::MakeScopeExit([&] { mFolder->NotifyCompactCompleted(); });

  // We've read what we need from the DB now. Close it. We'll be working on a
  // copy from now on.
  mFolder->CloseDatabase();

  // Set up temp dir and all the paths and filenames we want to track.
  {
    rv =
        GetOrCreateCompactionDir(mPaths.Source, getter_AddRefs(mPaths.TempDir));
    NS_ENSURE_SUCCESS(rv, rv);

    // The original folder db file.
    // "foo/folder.msf"
    rv = mPaths.Source->GetParent(getter_AddRefs(mPaths.SourceDir));
    NS_ENSURE_SUCCESS(rv, rv);
    // "folder.msf"
    rv = mPaths.Source->GetLeafName(mPaths.SourceName);
    NS_ENSURE_SUCCESS(rv, rv);

    // The new db file, in temp dir, while it's being built.
    mPaths.CompactingName = mPaths.SourceName + u".compacting"_ns;
    rv = mPaths.TempDir->Clone(getter_AddRefs(mPaths.Compacting));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = mPaths.Compacting->Append(mPaths.CompactingName);
    NS_ENSURE_SUCCESS(rv, rv);

    // The new db file, in temp dir, once it's been successfully compacted.
    mPaths.CompactedName = mPaths.SourceName + u".compacted"_ns;
    rv = mPaths.TempDir->Clone(getter_AddRefs(mPaths.Compacted));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = mPaths.Compacted->Append(mPaths.CompactedName);
    NS_ENSURE_SUCCESS(rv, rv);

    // The original db file, moved to temp dir just before we install the
    // compacted one. If we crash at that critical moment, this could be
    // used for recovery.
    mPaths.BackupName = mPaths.SourceName + u".original"_ns;
    rv = mPaths.TempDir->Clone(getter_AddRefs(mPaths.Backup));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = mPaths.Backup->Append(mPaths.BackupName);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Copy the original DB file to work on.
  // cp "foo/folder.msf" "foo/.compact-temp/folder.msf.compacting"
  {
    rv = mPaths.Source->CopyTo(mPaths.TempDir, mPaths.CompactingName);
    MOZ_LOG(gCompactLog, NS_SUCCEEDED(rv) ? LogLevel::Debug : LogLevel::Error,
            ("FolderCompactor - copy '%s' to '%s' (rv=0x%x)",
             mPaths.Source->HumanReadablePath().get(),
             mPaths.Compacting->HumanReadablePath().get(), (uint32_t)rv));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Open the output ("*.compacting") DB for writing.
  // This DB will be linked to the folder but no listeners will be attached to
  // it.
  rv = mDBService->OpenDBFromFile(mPaths.Compacting, mFolder, false, true,
                                  getter_AddRefs(mDB));
  NS_ENSURE_SUCCESS(rv, rv);

  // Local folders maintain X-Mozilla-* headers in the messages and they
  // may need patching up.
  bool patchXMozillaHeaders = IsLocalFolder(mFolder);

  // Kick it off by telling the store to start compacting the mbox file.
  // The msgStore will hold us in existence until our OnFinalSummary()
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
  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  notifier->NotifyFolderCompactStart(mFolder);

  guardSemaphore.release();
  guardNotification.release();
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
  MOZ_ASSERT(mDB);
  MOZ_ASSERT(mPaths.Source);
  MOZ_ASSERT(mPaths.Compacting);
  MOZ_ASSERT(mPaths.Compacted);
  MOZ_ASSERT(mPaths.Backup);

  if (ShutdownObserver::IsShuttingDown()) {
    return NS_ERROR_ABORT;
  }

  MOZ_LOG(gCompactLog, LogLevel::Verbose, ("OnCompactionBegin()"));
  mTimerId = mozilla::glean::mail::compact_duration.Start();

  PROFILER_MARKER_TEXT(
      "FolderCompactor", MAILNEWS,
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
  MOZ_LOG(gCompactLog, NS_SUCCEEDED(status) ? LogLevel::Info : LogLevel::Error,
          ("OnCompactionComplete(status=0x%" PRIx32 ")", (uint32_t)status));
  nsresult rv = status;
  if (NS_SUCCEEDED(rv)) {
    // Update the DBs expungedbytes count.
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    mDB->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
    if (dbFolderInfo) {
      rv = dbFolderInfo->SetExpungedBytes(0);
    }
  }

  if (NS_SUCCEEDED(rv)) {
    // Commit all the DB changes to disk.
    rv = mDB->Commit(nsMsgDBCommitType::kCompressCommit);
  }

  // We're done with the DB now. Close so we can start moving files about.
  mDB->ForceClosed();
  mDB = nullptr;

  // While we were compacting, something else might have opened the database
  // (Bug 1959858, Bug 1965686).
  // That'll mean the file is locked (under Windows), and we won't be able
  // to install the compacted one! So we'll attempt another force close here:
  mDBService->ForceFolderDBClosed(mFolder);

  // If we succeeded thus far, it's time to replace the old DB file with our
  // shiny new one. File renames are the most atomic tool we've got, so we'll
  // use them to make sure even if there's a crash or power-loss, things should
  // be recoverable.
  if (NS_SUCCEEDED(rv)) {
    // rename from "foo/.compact-temp/folder.msf.compacting"
    // to "foo/.compact-temp/folder.msf.compacted"
    rv = mPaths.Compacting->RenameTo(mPaths.TempDir, mPaths.CompactedName);
    MOZ_LOG(gCompactLog, NS_SUCCEEDED(rv) ? LogLevel::Debug : LogLevel::Error,
            ("FolderCompactor - rename '%s' to '%s' (rv=0x%x)",
             mPaths.Compacting->HumanReadablePath().get(),
             mPaths.Compacted->HumanReadablePath().get(), (uint32_t)rv));
  }
  if (NS_SUCCEEDED(rv)) {
    // Move the old DB file into the temp dir.
    // mv "foo/folder.msf" "foo/.compact-temp/folder.msf.original"
    // NOTE: I'm not sure if this is really worth doing. I can't think of
    // any recovery plan which needs it - we've already got the new db
    // and mbox files sitting in the temp dir, all ready to go.
    // But it seems wrong to _not_ keep this around until we're all done!
    rv = mPaths.Source->RenameTo(mPaths.TempDir, mPaths.BackupName);
    MOZ_LOG(gCompactLog, NS_SUCCEEDED(rv) ? LogLevel::Debug : LogLevel::Error,
            ("FolderCompactor - rename '%s' to '%s' (rv=0x%x)",
             mPaths.Source->HumanReadablePath().get(),
             mPaths.Backup->HumanReadablePath().get(), (uint32_t)rv));
  }
  if (NS_SUCCEEDED(rv)) {
    // Install the new DB file. This is where the critical phase begins.
    // mv "foo/.compact-temp/folder.msf.compacted" "foo/folder.msf"
    MOZ_LOG(gCompactLog, LogLevel::Debug,
            ("FolderCompactor - Install new DB file. PR_Now()=%" PRIu64 "\n",
             PR_Now()));
    rv = mPaths.Compacted->RenameTo(mPaths.SourceDir, mPaths.SourceName);
    MOZ_LOG(gCompactLog, NS_SUCCEEDED(rv) ? LogLevel::Debug : LogLevel::Error,
            ("FolderCompactor - rename '%s' to '%s' (rv=0x%x)",
             mPaths.Compacted->HumanReadablePath().get(),
             mPaths.Source->HumanReadablePath().get(), (uint32_t)rv));
  }
  // Return as soon as possible - we're in a critial phase here.
  // We've updated the high-level (db) stuff, so we're out of sync until the
  // low-level side commits it's changes (e.g. installs the compacted mbox).
  // If anything went wrong, returning an error here tells the lower-level
  // compaction to roll back (e.g. restore the original mbox file).
  if (NS_SUCCEEDED(rv)) {
    // But low-level commit can still fail, and we'll see a failure reported
    // via OnFinalSummary(), and if that happens, we want to make sure we
    // keep any .compacted or .backup DB files for recovery purposes.
    mKeepRecoveryFiles = true;
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
  MOZ_LOG(gCompactLog, NS_SUCCEEDED(status) ? LogLevel::Info : LogLevel::Error,
          ("OnFinalSummary(status=0x%" PRIx32 " oldSize=%" PRId64
           " newSize=%" PRId64 ")",
           (uint32_t)status, oldSize, newSize));

  nsPrintfCString statusStr("%x", (uint32_t)status);
  mozilla::glean::mail::compact_result.Get(statusStr).Add(1);
  if (mTimerId) {
    mozilla::glean::mail::compact_duration.StopAndAccumulate(
        std::move(mTimerId));
    PROFILER_MARKER_TEXT(
        "FolderCompactor", MAILNEWS,
        mozilla::MarkerOptions(mozilla::MarkerTiming::IntervalEnd()),
        mFolder->URI());
  }

  if (NS_SUCCEEDED(status)) {
    mozilla::glean::mail::compact_space_recovered.Accumulate(oldSize - newSize);
  }

  // Clean up our working.
  if (NS_SUCCEEDED(status)) {
    // If we got this far without an error, we know it's all worked.
    mKeepRecoveryFiles = false;
  }
  mPaths.Compacting->Remove(false);  // Partial file, no use to anyone.
  if (!mKeepRecoveryFiles) {
    mPaths.Compacted->Remove(false);
    mPaths.Backup->Remove(false);
  }
  mPaths.TempDir->Remove(false);  // Only if empty.

  // Release our lock on the folder.
  mFolder->ReleaseSemaphore(this, "FolderCompactor::OnFinalSummary"_ns);

  if (NS_SUCCEEDED(status)) {
    // Need to set nsIMsgDatabase.summaryValid, but can't access DB via
    // nsIMsgFolder.msgDatabase, because summaryValid isn't set! But we can
    // open it with nsIMsgDBService.openFolderDB(). It'll still return
    // NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE, but does return the DB object.
    nsCOMPtr<nsIMsgDatabase> db;
    mDBService->OpenFolderDB(mFolder, true, getter_AddRefs(db));
    if (db) {
      db->SetSummaryValid(true);
    }
  }

  // Indicate that we're done (and how many bytes we clawed back).
  mCompletionFn(status, oldSize - newSize);

  // Notify that compaction of the folder is completed.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  notifier->NotifyFolderCompactFinish(mFolder);
  mFolder->NotifyCompactCompleted();

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
  static constexpr uint32_t kRetryDelayMs = 5000;
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
        MOZ_LOG(gCompactLog, LogLevel::Warning,
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
          MOZ_LOG(gCompactLog, LogLevel::Warning,
                  ("BatchCompactor::CanCompactNow(): HasOfflineActivity"));
          // No, we don't want to compact now.
          return false;
        }
      } else if (rv != NS_ERROR_NOT_IMPLEMENTED) {
        // We can compact folders that don't support offline ops.
        // However, we skip folders that fail to give us the status.
        MOZ_LOG(
            gCompactLog, LogLevel::Warning,
            ("BatchCompactor::CanCompactNow(): Failure querying offline ops"));
        return false;
      }
    }
  }
  return true;
}

void BatchCompactor::StartNext() {
  AUTO_PROFILER_LABEL("BatchCompactor::StartNext", MAILNEWS);
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
          // Retries are currently always due to pending offline/pseudo ops.
          mFailedCodes.AppendElement(NS_MSG_ERROR_BLOCKED_COMPACTION);
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
      } else if (status == NS_MSG_ERROR_BLOCKED_COMPACTION) {
        // Do nothing and trust the offline/pseudo ops are clear next time.
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
