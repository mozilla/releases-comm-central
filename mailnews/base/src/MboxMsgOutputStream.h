/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_MBOXMSGOUTPUTSTREAM_H_
#define COMM_MAILNEWS_BASE_SRC_MBOXMSGOUTPUTSTREAM_H_

#include "nsCOMPtr.h"
#include "nsIOutputStream.h"
#include "nsISafeOutputStream.h"
#include "nsISeekableStream.h"
#include "nsString.h"

/**
 * MboxMsgOutputStream writes a single message out to an underlying mbox
 * stream.
 * It's a nsISafeOutputStream so callers need to "commit" the written data
 * by calling nsISafeOutputStream::Finish() when done.
 * Just calling Close(), or letting the stream go out of scope will
 * cause a rollback, and the underlying mbox file will be truncated back
 * to the size it was.
 *
 * Aims:
 * - Byte exact. What you write is exactly what should come back out when
 *   read.
 *   NOTE: There is one exception. Messages with an unterminated
 *   final line will have an EOL added. Without this, there's no way to
 *   ensure the proper message separation required for a well-formed mbox.
 * - Handles malformed messages - everything is just stored verbatim.
 * - Uses reversible "From " escaping, as per mboxrd. "From " lines are
 *   prefixed with '>'. If already prefixed, another '>' is added.
 *   e.g. "From Bob Smith" => ">From Bob Smith".
 *        ">>>>From here..." => ">>>>>From here..."
 * - Avoid intermediate copies of data. The only time buffering is required is
 *   where "From " parts are split across Write() calls.
 * - Handle processing lines of any length, without extra memory usage.
 * - Leaves output buffering up to the target mbox stream.
 * - Provide a reasonable rollback mechanism (as nsISafeOutputStream).
 *
 * mboxrd descriptions:
 * https://www.loc.gov/preservation/digital/formats/fdd/fdd000385.shtml
 * https://doc.dovecot.org/admin_manual/mailbox_formats/mbox/#mbox-variants
 */
class MboxMsgOutputStream : public nsIOutputStream, nsISafeOutputStream {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIOUTPUTSTREAM
  NS_DECL_NSISAFEOUTPUTSTREAM

  // The underlying mboxStream must be nsISeekable.
  explicit MboxMsgOutputStream(nsIOutputStream* mboxStream,
                               bool closeInnerWhenDone = false);
  MboxMsgOutputStream() = delete;

 private:
  virtual ~MboxMsgOutputStream();

  // The actual stream we're writing the mbox into.
  nsCOMPtr<nsIOutputStream> mInner;

  // QIed version of mInner.
  nsCOMPtr<nsISeekableStream> mSeekable;

  // Start offset, so we can roll back.
  int64_t mStartPos{-1};

  // Should the underlying mInner be closed when done?
  bool mCloseInnerWhenDone;

  enum {
    eInitial,      // No "From " line written yet.
    eStartOfLine,  // Ready to start a new line.
    eMidLine,      // Unfinished line (wrote the beginning, but no EOL yet).
    eStartAwaitingData,  // Start of line, but more data is required to decide
                         // whether escaping is needed. mStartFragment stores
                         // what we've got so far.
    eError,   // An error occurred (saved in in mError). Can still Close().
    eClosed,  // File has been closed via Close().
  } mState{eInitial};
  nsresult mStatus{NS_OK};

  // Growable buffer to handle fragments from the start of the line when
  // we can't yet decide whether escaping is needed, e.g. we have processed
  // ">>Fro" and are awaiting further data to see if it is "m ".
  nsAutoCStringN<16> mStartFragment;

  nsresult Emit(nsACString const& data);
  nsresult Emit(const char* data, uint32_t numBytes);
};

#endif  // COMM_MAILNEWS_BASE_SRC_MBOXMSGOUTPUTSTREAM_H_
