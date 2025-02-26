/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_LOCAL_SRC_MBOXCOMPACTOR_H_
#define COMM_MAILNEWS_LOCAL_SRC_MBOXCOMPACTOR_H_

#include "mozilla/Buffer.h"
#include "nsIMsgPluggableStore.h"
#include "nsIOutputStream.h"

class MboxMsgOutputStream;
class nsIFile;

/**
 * Helper class for mbox compaction, used to implement
 * nsMsgBrkMBoxStore::AsyncCompact().
 *
 * It iterates through each message in the store, and writes the ones we
 * want to keep into a new mbox file. It'll also patch X-Mozilla-* headers
 * as it goes, if asked to.
 * If all goes well, the old mbox file is replaced by the
 * new one. If any error occurs, the mbox is left untouched.
 * Doesn't fiddle with folder or database or GUI. Just the mbox file.
 * Any higher level database/folder changes are handled by the caller.
 *
 * The commit strategy works like this:
 * 1) create a ".compact-temp" dir in the same directory as the mbox.
 * 2) compact the mbox file into "foo/.temp-compact/inbox.compacting"
 * 3) when successfully completed, rename to
 *   "foo/.temp-compact/inbox.compacted"
 * 4) rename "foo/inbox" to "foo/.temp-compact/inbox.original"
 * 5) invoke OnCompactionComplete() callback to tell the caller to commit
 *    any higher-level changes they need to make in sync with the new
 *    mbox (e.g. database changes).
 * 6) rename "foo/.temp-compact/inbox.compacted" to "foo/inbox".
 * 7) all done!
 *
 * If anything goes wrong at any stage, the old mbox will be restored to
 * the state it started in.
 *
 */
class MboxCompactor : public nsIStoreScanListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISTORESCANLISTENER
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER

  /*
   * Start the compaction.
   * NOTE: this returns before any listener callbacks are invoked.
   * If it fails, no callbacks will be called.
   *
   * @param srcMbox - The mbox we're compacting.
   * @param listener - Callbacks to make decisions about what to keep.
   * @param patchXMozillaHeaders - Patch X-Mozilla-* headers as we go?
   */
  nsresult BeginCompaction(nsIFile* srcMbox, nsIStoreCompactListener* listener,
                           bool patchXMozillaHeaders);

 private:
  virtual ~MboxCompactor() = default;

  nsresult SanityCheck(nsIFile* srcMbox);
  nsresult SetupPaths(nsIFile* srcMbox);
  nsresult FlushBuffer();

  nsCOMPtr<nsIStoreCompactListener> mCompactListener;

  // Keep track of all the filenames and paths we're juggling:
  struct {
    // The mbox file we're compacting.
    nsCOMPtr<nsIFile> Source;     // ".../foo/bar/folder"
    nsCOMPtr<nsIFile> SourceDir;  // ".../foo/bar"
    nsAutoString SourceName;      // "folder"

    // Temp dir to use, must be in same filesystem as Source!
    nsCOMPtr<nsIFile> TempDir;  // ".../foo/bar/.compact-temp"

    nsAutoString CompactingName;  // "folder.compacting"
    nsCOMPtr<nsIFile>
        Compacting;  // ".../foo/bar/.compact-temp/folder.compacting"
    nsAutoString CompactedName;  // "folder.compacted"
    nsCOMPtr<nsIFile>
        Compacted;             // ".../foo/bar/.compact-temp/folder.compacted"
    nsAutoString BackupName;   // "folder.original"
    nsCOMPtr<nsIFile> Backup;  // ".../foo/bar/.compact-temp/folder.original"
  } mPaths;

  // The raw stream to write the new mbox file.
  nsCOMPtr<nsIOutputStream> mDestStream;

  // Where we're writing the current message.
  // Formats mbox data and writes it out to mDestStream.
  // If this is null, the current message is being skipped.
  RefPtr<MboxMsgOutputStream> mMsgOut;

  // The current message being processed.
  nsAutoCString mCurToken;  // empty = no message being processed

  // Remember flags and keywords provided by onRetentionQuery(),
  // used if patching headers.
  uint32_t mMsgFlags{0};
  nsAutoCString mMsgKeywords;

  // Running total of the size in bytes of the current message.
  int64_t mNewMsgSize{0};

  // Patch X-Mozilla-* headers as we go, with message flags and keywords.
  // Local folders do this, others probably shouldn't.
  bool mPatchXMozillaHeaders{false};

  // Buffer for copying message data.
  // This should be at least large enough to contain the start of a message
  // including the X-Mozilla-* headers, so we can patch them.
  // (It's OK if we don't have the whole header block - the X-Mozilla-*
  // headers will likely be right at the beginning).
  mozilla::Buffer<char> mBuffer{16 * 1024};

  // How many bytes are currently contained in mBuffer.
  size_t mBufferCount{0};
};

#endif  // COMM_MAILNEWS_LOCAL_SRC_MBOXCOMPACTOR_H_
