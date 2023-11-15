/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MboxMsgOutputStream.h"
#include "nsString.h"
#include "nsMsgUtils.h"  // For CEscapeString().
#include "mozilla/Logging.h"
#include <algorithm>
#include <functional>
#include <limits>

extern mozilla::LazyLogModule gMboxLog;
using mozilla::LogLevel;

NS_IMPL_ISUPPORTS(MboxMsgOutputStream, nsIOutputStream);

MboxMsgOutputStream::MboxMsgOutputStream(nsIOutputStream* mboxStream,
                                         bool closeInnerWhenDone)
    : mTarget(mboxStream), mCloseInnerWhenDone(closeInnerWhenDone) {}

MboxMsgOutputStream::~MboxMsgOutputStream() { Close(); }

nsresult MboxMsgOutputStream::Emit(nsACString const& data) {
  return Emit(data.Data(), data.Length());
}

// Internal output helper to write to underlying target output stream.
// Makes sure the error state is checked and kept updated.
nsresult MboxMsgOutputStream::Emit(const char* data, uint32_t numBytes) {
  if (mState == eError) {
    MOZ_ASSERT(NS_FAILED(mStatus));
    return mStatus;
  }
  if (mState == eClosed) {
    mState = eError;
    mStatus = NS_BASE_STREAM_CLOSED;
    return mStatus;
  }

  while (numBytes > 0) {
    uint32_t count;
    nsresult rv = mTarget->Write(data, numBytes, &count);
    if (NS_FAILED(rv)) {
      mState = eError;
      mStatus = rv;
      return mStatus;
    }
    numBytes -= count;
    data += count;
  }

  return NS_OK;
}

// Decide if a line requires "From "-escaping or not, or if more data is
// required to be sure.
enum EscapingDecision { eDoEscape, eDontEscape, eNeedMore };
static EscapingDecision DecideEscaping(const char* begin, const char* end) {
  auto it = begin;

  // Might require nested escaping...
  while (it != end && *it == '>') {
    ++it;
  }

  auto const sep = "From "_ns;
  for (size_t i = 0; i < sep.Length(); ++i) {
    if (it == end) {
      return eNeedMore;
    }
    if (*it != sep[i]) {
      return eDontEscape;  // it's not "From "
    }
    ++it;
  }
  return eDoEscape;
}

// Implementation for nsIOutputStream.streamStatus().
NS_IMETHODIMP MboxMsgOutputStream::StreamStatus() {
  switch (mState) {
    case eClosed:
      return NS_BASE_STREAM_CLOSED;
    case eError:
      return mStatus;
    default:
      return NS_OK;
  }
}

// Implementation for nsIOutputStream.write().
NS_IMETHODIMP MboxMsgOutputStream::Write(const char* buf, uint32_t count,
                                         uint32_t* bytesWritten) {
  MOZ_LOG(gMboxLog, LogLevel::Verbose,
          ("MboxMsgOutputStream::Write() %" PRIu32 " bytes: `%s`", count,
           CEscapeString(nsDependentCSubstring(buf, count), 80).get()));
  nsresult rv;
  *bytesWritten = 0;
  if (count == 0) {
    return NS_OK;
  }

  // First write?
  if (mState == eInitial) {
    // As per RFC 4155, this _should_ be "From <SENDER> <TIMESTAMP>\r\n".
    // But we don't really have that info here, so we'll just use "From \r\n".
    // Other msgStore implementations won't store it either, so seems silly
    // to jump through hoops for it.
    rv = Emit("From \r\n"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
    mState = eStartOfLine;
  }

  const char* src = buf;
  const char* end = buf + count;
  if (mState == eStartAwaitingData) {
    MOZ_ASSERT(!mStartFragment.IsEmpty());
    // The previous Write() left the beginning of a line, but not enough to
    // decide if escaping is required. So add new chars until we can make a
    // definite decision either way.
    while (1) {
      auto decision = DecideEscaping(mStartFragment.BeginReading(),
                                     mStartFragment.EndReading());
      if (decision == eNeedMore) {
        if (src == end) {
          // Used up all the new data and still not enough for decision.
          // Stay in eStartAwaitingData state and wait for the next Write().
          *bytesWritten = count;
          return NS_OK;
        }
        mStartFragment.Append(*src);
        ++src;
        continue;
      }

      if (decision == eDoEscape) {
        rv = Emit(">"_ns);
        NS_ENSURE_SUCCESS(rv, rv);
      }
      break;
    }
    // Flush out the leftover fragment.
    rv = Emit(mStartFragment);
    NS_ENSURE_SUCCESS(rv, rv);
    if (mStartFragment[mStartFragment.Length() - 1] != '\n') {
      mState = eMidLine;  // No EOL was output.
    }
    mStartFragment.Truncate();
  }

  // Now loop through all remaining incoming data.
  // The aim is to pass through the largest possible runs of data,
  // breaking them up only when we need to insert a '>' for escaping.
  auto unwritten = src;
  while (src != end) {
    if (mState == eStartOfLine) {
      auto decision = DecideEscaping(src, end);
      if (decision == eNeedMore) {
        // Flush everything up to this line.
        rv = Emit(unwritten, src - unwritten);
        NS_ENSURE_SUCCESS(rv, rv);
        unwritten = src;
        // Stash the leftover fragment for the next Write() to deal with.
        mState = eStartAwaitingData;
        mStartFragment = nsCString(unwritten, end - unwritten);
        *bytesWritten = count;
        return NS_OK;
      }
      if (decision == eDoEscape) {
        // Flush everything up to this line, and insert extra '>' to escape.
        rv = Emit(unwritten, src - unwritten);
        NS_ENSURE_SUCCESS(rv, rv);
        unwritten = src;
        rv = Emit(">"_ns);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }

    auto eol = std::find(src, end, '\n');
    if (eol == end) {
      // Flush the unterminated line (already know no escaping needed).
      rv = Emit(unwritten, end - unwritten);
      NS_ENSURE_SUCCESS(rv, rv);
      unwritten = end;
      mState = eMidLine;
      *bytesWritten = count;
      return NS_OK;
    }

    mState = eStartOfLine;
    src = eol + 1;
  }

  rv = Emit(unwritten, end - unwritten);
  NS_ENSURE_SUCCESS(rv, rv);

  unwritten = end;
  *bytesWritten = count;
  return NS_OK;
}

// Implementation for nsIOutputStream.writeFrom().
NS_IMETHODIMP MboxMsgOutputStream::WriteFrom(nsIInputStream* fromStream,
                                             uint32_t count,
                                             uint32_t* bytesWritten) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

// Implementation for nsIOutputStream.writeSegments().
NS_IMETHODIMP MboxMsgOutputStream::WriteSegments(nsReadSegmentFun reader,
                                                 void* closure, uint32_t count,
                                                 uint32_t* bytesWritten) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

// Implementation for nsIOutputStream.isNonBlocking().
NS_IMETHODIMP MboxMsgOutputStream::IsNonBlocking(bool* nonBlocking) {
  *nonBlocking = false;
  return NS_OK;
}

// Implementation for nsIOutputStream.flush().
NS_IMETHODIMP MboxMsgOutputStream::Flush() {
  if (mState == eClosed) {
    return NS_OK;
  }
  if (mState == eError) {
    return mStatus;
  }

  nsresult rv = mTarget->Flush();
  if (NS_FAILED(rv)) {
    mState = eError;
    mStatus = rv;
  }
  return rv;
}

// Implementation for nsIOutputStream.close().
NS_IMETHODIMP MboxMsgOutputStream::Close() {
  if (mState == eClosed) {
    return NS_OK;
  }
  if (mState == eError) {
    return mStatus;
  }

  // If the messsage was written with no final EOL, add one.
  // NOTE:
  // This is the one case where the message written into the mbox is
  // not byte-exact with the one you'd read out.
  // Strictly speaking, we're being pedantic enough about "From "
  // escaping here that an mbox reader should be able to reverse it and
  // get back the exact bytes of a message with no final EOL, but adding in
  // the missing EOL lets an mbox reader be a little more forgiving about
  // what it handles...
  nsresult rv;
  if (mState == eMidLine) {
    rv = Emit("\r\n"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  if (mState == eStartAwaitingData) {
    rv = Emit(mStartFragment);
    NS_ENSURE_SUCCESS(rv, rv);
    if (mStartFragment[mStartFragment.Length() - 1] != '\n') {
      rv = Emit("\r\n"_ns);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  // Now the end-of-message blank line (not part of the message).
  rv = Emit("\r\n"_ns);
  NS_ENSURE_SUCCESS(rv, rv);
  mState = eClosed;

  if (mCloseInnerWhenDone) {
    mTarget->Close();
  }
  return NS_OK;
}
