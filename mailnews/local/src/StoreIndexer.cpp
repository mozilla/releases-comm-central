/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "StoreIndexer.h"

#include "nsLocalMailFolder.h"
#include "nsParseMailbox.h"
#include "LineReader.h"
#include "mozilla/ScopeExit.h"

NS_IMPL_ISUPPORTS(StoreIndexer, nsIStoreScanListener)

// 32KB buffer is a bit arbitrary. Gut feeling is that it should be at least
// a few times larger than filesystem block size (often 4KB).
StoreIndexer::StoreIndexer()
    : mExpectedTotalCount(0),
      mCurrentCount(0),
      mCurrentMsgSize(0),
      mBuf(32768),
      mUsed(0),
      mUnused(0),
      mIsStupidlyLongLine(false) {}

StoreIndexer::~StoreIndexer() { ReleaseFolder(); }

nsresult StoreIndexer::GoIndex(nsMsgLocalMailFolder* folder,
                               std::function<void(int64_t, int64_t)> progressFn,
                               std::function<void(nsresult)> completionFn) {
  MOZ_ASSERT(!mFolder);  // already in use?

  // Only set mFolder if we can successfully lock it!
  // NOTE: the folder semaphore is not a thread-safe mechanism!
  // The folder just sets a member var to track who is currently holding
  // it. It's thoroughly main-thread-only.
  nsresult rv = folder->AcquireSemaphore(this);
  NS_ENSURE_SUCCESS(rv, rv);
  auto scopeGuard =
      mozilla::MakeScopeExit([&] { folder->ReleaseSemaphore(this); });

  mProgressFn = progressFn;
  mCompletionFn = completionFn;
  mFolder = folder;

  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  // Use OpenFolderDB to always open the db so that db's m_folder
  // is set correctly.
  rv = msgDBService->OpenFolderDB(mFolder, true, getter_AddRefs(mDB));
  if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING) {
    rv = msgDBService->CreateNewDB(mFolder, getter_AddRefs(mDB));
  }
  NS_ENSURE_SUCCESS(rv, rv);
  // Try to get a backup message database.
  // NOTE: this doesn't actually create a backup db. That's handled further up
  // the chain, by nsMsgLocalMailFolder::GetDatabaseWithReparse(). Really, we
  // should be handling DB backup/rollback in this code.
  // If GetBackupMsgDatabase() fails, there's nothing we can do about it,
  // and we still need to index the store. After all, there may not even
  // _be_ a primary database, let alone a backup. It's this indexing process
  // which is used to recreate missing DBs!
  mFolder->GetBackupMsgDatabase(getter_AddRefs(mBackupDB));

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = mFolder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Set up for progress updates.
  mCurrentCount = 0;
  rv = msgStore->EstimateFolderSize(mFolder, &mExpectedTotalCount);
  NS_ENSURE_SUCCESS(rv, rv);

  // Start iterating over all the messages.
  // AsyncScan() holds a refcounted ptr to the listener until the scan
  // completes, so we don't need our own kungfudeathgrip or anything.
  rv = msgStore->AsyncScan(mFolder, this);
  NS_ENSURE_SUCCESS(rv, rv);

  // Reset forceReparse in the DB.
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  mDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
  if (folderInfo) {
    folderInfo->SetBooleanProperty("forceReparse", false);
  }

  scopeGuard.release();
  return NS_OK;
}

void StoreIndexer::ReleaseFolder() {
  // mFolder is only set if we took a lock on it.
  if (mFolder) {
    mFolder->ReleaseSemaphore(this);
    mFolder = nullptr;
  }
  // Release
  mDB = nullptr;
  mBackupDB = nullptr;
}

// nsIStoreScanListener.onStartScan()
// Called at beginning of msgStore scan.
NS_IMETHODIMP StoreIndexer::OnStartScan() { return NS_OK; }

// nsIStoreScanListener.onStartMessage()
// Called when a new message is about to start.
NS_IMETHODIMP StoreIndexer::OnStartMessage(nsACString const& token) {
  MOZ_ASSERT(!mParser);  // Can't be mid-message!

  mStoreToken = token;

  // Start a new header parser for this message...
  mParser = new nsParseMailMessageState();
  nsresult rv = mParser->SetMailDB(mDB);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mParser->SetBackupMailDB(mBackupDB);
  NS_ENSURE_SUCCESS(rv, rv);

  mIsStupidlyLongLine = false;
  mCurrentMsgSize = 0;
  // Clear the buffer.
  mUsed = 0;
  mUnused = 0;
  return NS_OK;
}

// nsIStoreScanListener.onStartRequest()
// Called after OnStartMessage(), but before the first OnDataAvailable().
NS_IMETHODIMP StoreIndexer::OnStartRequest(nsIRequest* req) {
  MOZ_ASSERT(!mStoreToken.IsEmpty());
  MOZ_ASSERT(mParser);
  // Nothing to do - OnStartMessage() has already set us up.
  return NS_OK;
}

// nsIStoreScanListener.onDataAvailable()
NS_IMETHODIMP StoreIndexer::OnDataAvailable(nsIRequest* req,
                                            nsIInputStream* stream,
                                            uint64_t offset, uint32_t count) {
  while (count > 0) {
    // Read in a chunk.
    uint32_t got;
    size_t freeSpace = mBuf.Length() - (mUsed + mUnused);
    nsresult rv = stream->Read(mBuf.Elements() + mUsed + mUnused,
                               std::min((uint32_t)freeSpace, count), &got);
    NS_ENSURE_SUCCESS(rv, rv);
    mUnused += got;
    count -= got;

    while (true) {
      auto data = mBuf.AsSpan().Subspan(mUsed, mUnused);
      auto line = FirstLine(data);
      // Empty line means no EOL was found.
      bool incompleteLine = line.IsEmpty();
      if (incompleteLine) {
        if (data.Length() >= STUPIDLY_LONG_LINE_THRESHOLD) {
          // Uhoh... a stupidly long line with no EOL in sight.
          // We'll discard everything up to the end of the line (whenever
          // that shows up!). The discarded data will _not_ be fed to the
          // header parser, because we'd have to buffer up the whole lot,
          // and we _really_ don't want to do that as the pathological case
          // could involve gigabytes!
          mIsStupidlyLongLine = true;
          // Soak up the whole lot for discarding.
          line = data.First(data.Length());
        } else {
          break;  // It's OK. Just wait for the rest of the line to arrive.
        }
      }

      if (!mIsStupidlyLongLine) {
        MOZ_ASSERT(!incompleteLine);
        // Ignore result of ParseFolderLine(). Better to just keep going.
        mParser->ParseFolderLine(line.Elements(), line.Length());
      } else if (!incompleteLine) {
        // Soaked up entire stupidly-long-line, stop discarding data.
        mIsStupidlyLongLine = false;
      }
      mCurrentMsgSize += line.Length();
      mUsed += line.Length();
      mUnused -= line.Length();
    }

    // Shift the unused portion (if any) to the front of the buffer.
    if (mUsed > 0) {
      auto unused = mBuf.AsSpan().Subspan(mUsed, mUnused);
      std::copy(unused.cbegin(), unused.cend(), mBuf.begin());
      mUsed = 0;
    }
  }
  return NS_OK;
}

// nsIStoreScanListener.onStopRequest()
// Called at end of each message.
NS_IMETHODIMP StoreIndexer::OnStopRequest(nsIRequest* req, nsresult status) {
  // If there's an unfinished line left in the buffer, include it in the
  // msgSize, but no point feeding it through the parser.
  mCurrentMsgSize += mUnused;

  // Update progress.
  mCurrentCount += (int64_t)mCurrentMsgSize;
  if (mProgressFn) {
    mProgressFn(mCurrentCount, mExpectedTotalCount);
  }

  // This stuff is loosely based on nsMsgMailboxParser::PublishMsgHeader()

  // Tell the world about the message header (add to db, and view, if any)
  nsCOMPtr<nsIMsgDBHdr> hdr = mParser->m_newMsgHdr;

  if (hdr) {
    // nsParseMailMessageState will parse flags from X-Mozilla-Status[2],
    // if present. So we can check to see if a message has been deleted
    // but not yet cleaned up by compaction (should only really apply
    // to mbox).
    uint32_t flags;
    hdr->GetFlags(&flags);
    if (flags & nsMsgMessageFlags::Expunged) {
      // Don't want to add this message to the DB!
      hdr = nullptr;
    }
  }

  if (hdr) {
    hdr->SetMessageSize(mCurrentMsgSize);
    hdr->SetLineCount(mParser->m_body_lines);

    MOZ_ASSERT(!mStoreToken.IsEmpty());
    hdr->SetStringProperty("storeToken", mStoreToken);
    // HACK ALERT!
    // Nasty mbox-specific hack until we can ditch .messageOffset.
    // See Bug 1720047.
    // A lot of code relies on .messageOffset, even if it makes no sense for
    // maildir. So we'll set it here.
    {
      nsCOMPtr<nsIMsgPluggableStore> msgStore;
      nsresult rv = mFolder->GetMsgStore(getter_AddRefs(msgStore));
      if (NS_SUCCEEDED(rv)) {
        int64_t msgOffset = 0;
        nsAutoCString storeType;
        msgStore->GetStoreType(storeType);
        if (storeType.EqualsLiteral("mbox")) {
          msgOffset = mStoreToken.ToInteger64(&rv);
        }
        MOZ_ASSERT(msgOffset >= 0);
        hdr->SetMessageOffset((uint64_t)msgOffset);
      }
    }
    // END HACK ALERT

    // Add hdr but don't notify - shouldn't be requiring notifications
    // during summary file rebuilding.
    mParser->m_mailDB->AddNewHdrToDB(hdr, false);
  } else {
    // The parser chose not to include the message.
    // Likely, it was expunged/deleted.
    nsCOMPtr<nsIDBFolderInfo> folderInfo;
    nsresult rv =
        mParser->m_mailDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
    if (NS_SUCCEEDED(rv) && folderInfo) {
      folderInfo->ChangeExpungedBytes(mCurrentMsgSize);
    }
  }

  // Clear up our per-message vars.
  mStoreToken.Truncate();
  mCurrentMsgSize = 0;
  mParser->m_newMsgHdr = nullptr;
  mParser = nullptr;
  return NS_OK;
}

// nsIStoreScanListener.onStopScan()
// Called when the scan completes.
NS_IMETHODIMP StoreIndexer::OnStopScan(nsresult status) {
  if (NS_SUCCEEDED(status)) {
    mDB->SetSummaryValid(true);
  }
  ReleaseFolder();

  if (NS_SUCCEEDED(status) && mProgressFn) {
    // If it all worked, fudge a 100% progress report.
    // Remember, nsIMsgPluggableStore.estimateFolderSize() includes things like
    // mbox overhead ("From " lines and escaping) which are stripped out by
    // the time we see the message data, so our byte total won't necessarily
    // match exactly.
    mProgressFn(mExpectedTotalCount, mExpectedTotalCount);
  }
  if (mCompletionFn) {
    mCompletionFn(status);
  }

  // Our caller will probably be releasing its reference upon returning
  // here, so likely we'll be deleted.
  return NS_OK;
}
