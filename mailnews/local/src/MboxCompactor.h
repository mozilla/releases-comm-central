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
 * Helper class for mbox compaction, used by nsMsgBrkMBoxStore::AsyncCompact().
 *
 * It iterates through each message in the store, and writes the ones we
 * want to keep into a new mbox file. It'll also patch X-Mozilla-* headers
 * as it goes, if asked to.
 * If all goes well, the old mbox file is replaced by the
 * new one. If any error occurs, the mbox is left untouched.
 * Doesn't fiddle with folder or database or GUI. Just the mbox file.
 */
class MboxCompactor : public nsIStoreScanListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISTORESCANLISTENER
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER

  MboxCompactor() = delete;

  /**
   * Create the compactor.
   * @param folder - The folder we're compacting.
   * @param listener - Callbacks to make decisions about what to keep.
   * @param patchXMozillaHeaders - Patch X-Mozilla-* headers as we go?
   */
  MboxCompactor(nsIMsgFolder* folder, nsIStoreCompactListener* listener,
                bool patchXMozillaHeaders)
      : mFolder(folder),
        mCompactListener(listener),
        mOriginalMboxFileSize(0),
        mMsgFlags(0),
        mNewMsgSize(0),
        mPatchXMozillaHeaders(patchXMozillaHeaders) {}

  /*
   * Start the compaction.
   * NOTE: this returns before any listener callbacks are invoked.
   * If it fails, no callbacks will be called.
   */
  nsresult BeginCompaction();

 private:
  virtual ~MboxCompactor() {}

  nsresult FlushBuffer();

  // NOTE: We're still lumbered with having to use nsIMsgFolder here,
  // but eventually we can decouple and just work with the store directly.
  // (Bug 1714472)
  nsCOMPtr<nsIMsgFolder> mFolder;
  nsCOMPtr<nsIStoreCompactListener> mCompactListener;

  // Path for the mbox file we're compacting.
  nsCOMPtr<nsIFile> mMboxPath;

  // Size of original mbox file before compaction.
  int64_t mOriginalMboxFileSize;

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
  uint32_t mMsgFlags;
  nsAutoCString mMsgKeywords;

  // Running total of the size in bytes of the current message.
  int64_t mNewMsgSize;

  // Patch X-Mozilla-* headers as we go, with message flags and keywords.
  // Local folders do this, others probably shouldn't.
  bool mPatchXMozillaHeaders;

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
