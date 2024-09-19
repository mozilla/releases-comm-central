/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MboxMsgInputStream.h"
#include "nsString.h"
#include "nsMsgUtils.h"
#include "nsTArray.h"
#include "mozilla/Logging.h"
#include <algorithm>

extern mozilla::LazyLogModule gMboxLog;
using mozilla::LogLevel;

/**
 * MboxParser is a helper class to manage parsing messages out of an mbox
 * byte stream.
 * Call Feed() to pass data into the parser, in chunks of at least MinChunk
 * size. Pass in a chunk less than MinChunk size to indicate EOF of the mbox
 * file (a zero-size chunk is fine). The resulting message is written to a
 * growable output buffer and accessed via Drain(). Use Available() to see how
 * many bytes are ready to drain. When a complete message has been parsed,
 * parsing will halt, and further calls to Feed() will consume no more data.
 * However, the message is not considered 'finished' until it has been
 * completely read from the output buffer (via Drain()). At this point,
 * IsFinished() will return true. To continue with the next message, you can
 * then call Kick() to resume the parsing. AtEOF() will return true when all
 * messages have been parsed (and drained).
 *
 * Goals:
 * - Assume well formed mboxrd format, but try to handle other variants
 *   and don't freak out when malformed data is encountered.
 * - Don't choke on invalid messages. Just treat mbox as a container format
 *   and aim to return messages as accurately as possible, even if malformed.
 * - Avoid copying and memory reallocation as much as possible.
 * - Cope with pathological cases without buffering up huge quantities of data.
 *   eg "From " followed by gigabytes of non-EOL characters.
 *   Output buffer size is kept down to roughly what you pass in with a
 *   single call to Feed().
 *
 * Note:
 * It'd be nice to ditch the output buffer and the extra copy involved, but
 * that'd require the caller passing in an output buffer, and the parser would
 * have to break off parsing when that buffer is full. It could be done, but
 * the extra complexity probably isn't worth it...
 */
class MboxParser {
 public:
  using span = mozilla::Span<const char>;
  static constexpr size_t InitialOutBufSize = 8192;

  MboxParser() : mOutBuffer(InitialOutBufSize), mCursor(0) {}

  /**
   *  Returns the number of chars available for reading by Drain().
   */
  size_t Available() const { return mOutBuffer.Length() - mCursor; }

  /**
   * Returns true when a complete message has been parsed and read out
   * via Drain().
   */
  bool IsFinished() const {
    return Available() == 0 && (mState == eEOF || mState == eMessageComplete);
  }

  /**
   * Returns true when the end of the mbox has been reached (and the last
   * message has been completely read out via Drain()).
   */
  bool AtEOF() const { return Available() == 0 && mState == eEOF; }

  /**
   * MinChunk is the minimum amount of data callers should pass into Feed().
   * If less than MinChunk is passed in, Feed() knows that there will be no
   * more data to come (i.e. EOF).
   * It is chosen to be a reasonable minimum for our end-of-message heuristic:
   * A "From " line followed by a couple of likely-looking header lines.
   *
   * Note: This is just a guideline minimum value for callers. In practice,
   * sensible callers would aim to feed in chunks much larger than this.
   */
  static constexpr size_t MinChunk = 512;

  /**
   * Feed a chunk of data into the parser for processing.
   * Returns any portion of the data which was unused.
   * Expects at least MinChunk bytes. Passing in less than MinChunk bytes
   * indicates that EOF is on the horizon - the end of the mbox file.
   *
   * Calling Feed() is no guarantee that output will be ready via
   * Available()/Drain(). For example, "From "-separator lines produce no
   * output.
   *
   * It is an error to call Feed() if data is available to Drain().
   *
   * If a complete message has been parsed, Feed() will consume no further
   * data until the message output has been drained and the parsing is
   * restarted via Kick().
   */
  span Feed(span data) {
    MOZ_LOG(gMboxLog, LogLevel::Verbose,
            ("MboxParser - Feed() %zu bytes: '%s')", data.Length(),
             CEscapeString(nsDependentCSubstring(data), 80).get()));

    MOZ_ASSERT(Available() == 0);

    // Is this the end of the mbox?
    bool endOfMbox = data.Length() < MinChunk;

    // Loop until we've used up all the data we can.
    while (true) {
      // If a message is complete (or the mbox is finished), then
      // we stall.
      if (mState == eMessageComplete || mState == eEOF) {
        break;
      }

      // Have the current state use up as much data as it needs.
      data = handle(data);

      if (data.Length() < MinChunk) {
        if (data.IsEmpty()) {
          break;
        }
        if (!endOfMbox) {
          // We know there's more data to come, so go away and come back
          // when theres >=MinChunk.
          break;
        }
      }
    }

    return data;
  }

  /**
   * Drain() reads processed data out of parser into buf.
   * It'll produce a maximum of `count` bytes.
   * The number of bytes actually read is returned.
   */
  size_t Drain(char* buf, size_t count) {
    size_t n = std::min(count, Available());
    auto start = mOutBuffer.cbegin() + mCursor;
    std::copy(start, start + n, buf);

    mCursor += n;
    MOZ_ASSERT(mCursor <= mOutBuffer.Length());

    // If only a small proportion (<25%) has been left unconsumed, move it to
    // the beginning of the buffer. Ideally, the caller would drain all
    // available data in one go, but that's not always possible.
    if (Available() < (mOutBuffer.Length() / 4)) {
      mOutBuffer.RemoveElementsAt(0, mCursor);
      mCursor = 0;
    }
    return n;
  }

  /**
   * When a message has been completely parsed and drained,
   * Kick() can be called to resume parsing for the next message (if any).
   */
  void Kick() {
    MOZ_ASSERT(IsFinished());
    if (mState == eMessageComplete) {
      mEnvAddr.Truncate();
      mEnvDate = 0;
      mState = eExpectFromLine;
    }
  }

  /**
   * If the "From " line contained a sender, it can be accessed here.
   * Otherwise an empty string will be returned.
   * NOTE: you can guarantee the "From " line parsing is complete by the
   * time data becomes available via Available()/Drain().
   */
  nsCString EnvAddr() { return mEnvAddr; }

  /**
   * If the "From " line contained a timestamp, it can be accessed here.
   * Otherwise 0 will be returned.
   * NOTE: you can guarantee the "From " line parsing is complete by the
   * time data becomes available via Available()/Drain().
   */
  PRTime EnvDate() { return mEnvDate; }

 private:
  // Processed data is stored here, ready to be read out by Drain().
  nsTArray<char> mOutBuffer;
  // Start of unread data within mOutBuffer.
  size_t mCursor{0};
  // Number of '>' characters at start of line, for eCountQuoting state.
  int mQuoteCnt{0};

  // Values potentially extracted by parsing the "From " line.
  nsAutoCString mEnvAddr;  // Empty = none.
  PRTime mEnvDate{0};      // 0 = none.

  // Our states. In general, the Expect* states don't consume any data -
  // they just sniff data and move to a new state accordingly.
  enum {
    eExpectFromLine = 0,  // We start here.
    eDiscardFromLine,
    eExpectHeaderLine,
    eEmitHeaderLine,
    eEmitSeparator,  // Blank line between header and body.
    eExpectBodyLine,
    eCountQuoting,  // Line starts with one or more '>' chars.
    eEmitQuoting,
    eEmitBodyLine,
    eMessageComplete,  // Message is complete (or ended prematurely).
    eEOF,              // End of mbox.
  } mState{eExpectFromLine};

  // handle_<state>() functions consume as much data as they need, and
  // return whatever is left over.
  // If they are given <MinChunk bytes, they are free to assume the end
  // the mbox file has been reached.
  span handle(span data) {
    {
      const char* stateName[] = {"eExpectFromLine",
                                 "eDiscardFromLine",
                                 "eExpectHeaderLine",
                                 "eEmitHeaderLine",
                                 "eEmitSeparator",
                                 "eExpectBodyLine",
                                 "eCountQuoting",
                                 "eEmitQuoting",
                                 "eEmitBodyLine",
                                 "eMessageComplete",
                                 "eEOF"};
      MOZ_LOG(gMboxLog, LogLevel::Verbose,
              ("MboxParser - handle %s (%zu bytes: '%s')", stateName[mState],
               data.Length(),
               CEscapeString(nsDependentCSubstring(data), 80).get()));
    }
    switch (mState) {
      case eExpectFromLine:
        return handle_eExpectFromLine(data);
      case eDiscardFromLine:
        return handle_eDiscardFromLine(data);
      case eExpectHeaderLine:
        return handle_eExpectHeaderLine(data);
      case eEmitHeaderLine:
        return handle_eEmitHeaderLine(data);
      case eEmitSeparator:
        return handle_eEmitSeparator(data);
      case eExpectBodyLine:
        return handle_eExpectBodyLine(data);
      case eCountQuoting:
        return handle_eCountQuoting(data);
      case eEmitQuoting:
        return handle_eEmitQuoting(data);
      case eEmitBodyLine:
        return handle_eEmitBodyLine(data);
      case eMessageComplete:
        return handle_eMessageComplete(data);
      case eEOF:
        return handle_eEOF(data);
      default:
        MOZ_ASSERT_UNREACHABLE();  // should not happen
    }
  }

  // Attempt to parse a "From " line to extract sender and timestamp.
  // e.g. "From bob@example.com Tue Dec 09 15:30:45 2014"
  // Will always set both envAddr AND envDate, or neither.
  static void ParseFromLine(span line, nsACString& envAddr, PRTime& envDate) {
    MOZ_ASSERT(IsFromLine(line));
    auto p = line.begin();
    auto end = line.end();
    if (line.Length() < 5) {
      return;
    }
    // Skip "From ".
    p += 5;
    // Skip extra spaces.
    while (p != end && *p == ' ') ++p;

    // Address is everything up to next space.
    auto addrBegin = p;
    p = std::find(p, end, ' ');
    if (p == end) {
      return;  // No space delimiter found.
    }
    span addrSpan(addrBegin, p);
    if (addrSpan.Length() > 254) {
      // Too big for an email address.
      // (https://www.rfc-editor.org/errata_search.php?rfc=3696)
      // Doesn't have to be an email address (eg "MAILER-DAEMON"), but using
      // the email length limit seems reasonable.
      return;
    }

    // Skip space.
    while (p != end && *p == ' ') ++p;

    // Assume everything else is date.
    span dateSpan(p, end);

    // Parse the timestamp, assuming GMT.
    nsAutoCString tmp(dateSpan.Elements(), dateSpan.Length());
    // Date _should_ be exactly 24 chars, but allow some wiggle-room.
    if (dateSpan.Length() < 22 || dateSpan.Length() > 32) {
      return;
    }
    PRTime tmpDate;
    if (PR_ParseTimeString(tmp.get(), true, &tmpDate) != PR_SUCCESS) {
      return;
    }

    // If we got this far we have valid sender and date to return - yay!
    envAddr.Assign(addrSpan.Elements(), addrSpan.Length());
    envDate = tmpDate;
  }

  // We're expecting a new message to start, or an EOF.
  span handle_eExpectFromLine(span data) {
    if (data.Length() < 5) {  // Enough to check for "From "?
      mState = eEOF;          // no more messages.
      return span();          // discard data
    }
    if (IsFromLine(data)) {
      // The "From " line could have an email address (up to 254 bytes) and a
      // date string (24 bytes). MinChunk is tuned to avoid spliting up long
      // (but plausible) "From " lines.
      auto eol = std::find(data.begin(), data.end(), '\n');
      if (eol != data.end()) {
        // We've got a whole line - try and extract sender/date info.
        if (eol > data.begin() && *(eol - 1) == '\r') {
          --eol;
        }
        MOZ_ASSERT(mEnvAddr.IsEmpty());
        MOZ_ASSERT(mEnvDate == 0);
        ParseFromLine(span(data.begin(), eol), mEnvAddr, mEnvDate);
      }
      mState = eDiscardFromLine;
    } else {
      MOZ_LOG(gMboxLog, LogLevel::Warning,
              ("MboxParser - Missing 'From ' separator"));
      // Just jump straight to header phase.
      mState = eExpectHeaderLine;
    }
    return data;
  }

  // Ditch the "From " line.
  // (Pathological case: "From " followed by gigabyte-length line).
  span handle_eDiscardFromLine(span data) {
    if (data.IsEmpty()) {
      return PrematureEOF(data);
    }
    bool hitEOL;
    data = DiscardUntilEOL(data, hitEOL);
    if (hitEOL) {
      mState = eExpectHeaderLine;
    }
    return data;
  }

  // Decide if we're still in the header block.
  // We don't need to worry about folded lines. Any non-blank line is just
  // treated as a header line and output verbatim.
  span handle_eExpectHeaderLine(span data) {
    if (data.Length() < 2) {
      return PrematureEOF(data);
    }

    // Start with an EOL? (CRLF or LF)
    size_t eolSize = SniffEOLAtStart(data);
    if (eolSize > 0) {
      mState = eEmitSeparator;  // Yes. Line is blank.
    } else {
      mState = eEmitHeaderLine;
    }
    return data;
  }

  // Output a single header line.
  span handle_eEmitHeaderLine(span data) {
    if (data.IsEmpty()) {
      return PrematureEOF(data);
    }
    bool hitEOL;
    data = EmitUntilEOL(data, hitEOL);
    if (hitEOL) {
      mState = eExpectHeaderLine;
    }
    return data;
  }

  // We're emitting the blank line separating header and body.
  span handle_eEmitSeparator(span data) {
    if (data.IsEmpty()) {
      return PrematureEOF(data);
    }
    bool hitEOL;
    data = EmitUntilEOL(data, hitEOL);
    // We wouldn't be here unless an EOL was found (see eExpectHeaderLine).
    MOZ_ASSERT(hitEOL == true);
    mState = eExpectBodyLine;
    return data;
  }

  // Decide if we're still in body or if end of message has been hit.
  // While there _should_ be a blank line after each message, before the
  // "From " separator... we can't rely on that.
  // If there is a blank line at the end of the message it should be stripped.
  span handle_eExpectBodyLine(span data) {
    if (data.IsEmpty()) {
      // Actual EOF, so we're done (it'll advance to eEOF once the message
      // is drained and we go to look for the next one).
      mState = eMessageComplete;
      return data;
    }

    // Need to unescape lines beginning ">From " (or ">>>>From " etc).
    // (Pathological case: so many leading '>' chars that we don't see
    // anything else in the buffer. So use a separate state to count them).
    if (data[0] == '>') {
      mQuoteCnt = 0;
      mState = eCountQuoting;
      return data;
    }

    // Check for blank line.
    size_t n = SniffEOLAtStart(data);
    if (n == data.Length()) {
      // EOF. Suppress last blank line.
      mState = eMessageComplete;
      return data.From(n);
    }

    // Is it an unescaped "From " (optionally with a preceding blank line)?
    // A line beginning with "From " is end of message according to spec,
    // But we want to be really really sure, so we can support some cases
    // where it's just a badly-encoded message body.
    if (IsReallyReallyFromLine(data.From(n))) {
      mState = eMessageComplete;
      // If there was a preceding blank line, suppress it.
      return data.From(n);
    }

    // Just output the line as it is.
    mState = eEmitBodyLine;
    return data;
  }

  span handle_eEmitBodyLine(span data) {
    if (data.IsEmpty()) {
      return PrematureEOF(data);
    }
    bool hitEOL;
    data = EmitUntilEOL(data, hitEOL);
    if (hitEOL) {
      mState = eExpectBodyLine;
    }
    return data;
  }

  // Soak up and count '>' quote chars.
  // (pathological case: line starting with gigabytes of repeated '>' char)
  span handle_eCountQuoting(span data) {
    if (data.IsEmpty()) {
      // Uhoh, EOF. Write out the chars we held back, then bail out.
      while (mQuoteCnt > 0) {
        --mQuoteCnt;
        Emit(span(">", 1));
      }
      return PrematureEOF(data);
    }
    auto is_quote = [](char c) { return c == '>'; };
    auto firstNonQuote = std::find_if_not(data.cbegin(), data.cend(), is_quote);
    auto n = firstNonQuote - data.cbegin();
    mQuoteCnt += n;
    if (firstNonQuote != data.cend()) {
      // We hit the end of the quotes.
      mState = eEmitQuoting;
    }
    return span(firstNonQuote, data.cend());
  }

  // Spit out appropriate quoting for upcoming body line.
  span handle_eEmitQuoting(span data) {
    if (data.IsEmpty()) {
      // Uhoh. Write out the chars we held back, then bail out.
      while (mQuoteCnt > 0) {
        --mQuoteCnt;
        Emit(span(">", 1));
      }
      return PrematureEOF(data);
    }
    // Body line continues with "From "?
    if (IsFromLine(data)) {
      // Yes! We need to remove a '>' to unescape it.
      MOZ_ASSERT(mQuoteCnt > 0);
      --mQuoteCnt;
    }

    // Write out the '>' chars we held back.
    while (mQuoteCnt > 0) {
      --mQuoteCnt;
      Emit(span(">", 1));
    }

    // Output the rest of the line as a normal body line.
    mState = eEmitBodyLine;
    return data;
  }

  // All done, so this is a no-op.
  span handle_eMessageComplete(span data) {
    if (data.IsEmpty()) {
      mState = eEOF;
    } else {
      mState = eExpectFromLine;
    }
    return data;
  }

  // All done, so this is a no-op.
  span handle_eEOF(span data) {
    MOZ_ASSERT(data.IsEmpty());
    return data;
  }

  // Helper for when we hit unexpected EOF.
  // Log it, output remaining data, and go into eMessageComplete state.
  span PrematureEOF(span data) {
    MOZ_LOG(gMboxLog, LogLevel::Warning, ("MboxParser - PrematureEOF"));
    // We don't go directly to eEOF.
    // Going to eMessageComplete holds parsing up until the output
    // has all been drained.
    // After this, eExpectFromLine will move us into eEOF.
    mState = eMessageComplete;
    Emit(data);
    return data.Last<0>();
  }

  // Discard all data up to (and including) an EOL.
  // hitEOL is set if the end of the line is encountered.
  span DiscardUntilEOL(span data, bool& hitEOL) {
    hitEOL = false;
    auto eol = std::find(data.cbegin(), data.cend(), '\n');
    if (eol != data.cend()) {
      hitEOL = true;
      ++eol;  // Include '\n' in discard.
    }
    auto n = eol - data.cbegin();
    return data.From(n);
  }

  // Emit all data up to (and including) an EOL.
  // hitEOL is set if the end of the line is encountered.
  span EmitUntilEOL(span data, bool& hitEOL) {
    hitEOL = false;
    auto eol = std::find(data.cbegin(), data.cend(), '\n');
    if (eol != data.cend()) {
      hitEOL = true;
      ++eol;  // Include '\n'.
    }
    auto n = eol - data.cbegin();
    Emit(data.First(n));
    return data.From(n);
  }

  // Emit a chunk of data, to be picked up by Drain().
  void Emit(span data) { mOutBuffer.AppendElements(data); }

  // Check for "From " at start of data.
  static bool IsFromLine(span data) {
    if (data.Length() < 5) {
      return false;
    }
    nsDependentCSubstring cookie(data.First<5>());
    return cookie.EqualsLiteral("From ");
  }

  // Check for an EOL sequence at the start of data.
  // Returns size of EOL sequence found: 0=none, 1=LF, 2=CRLF.
  static size_t SniffEOLAtStart(span data) {
    if (data.Length() >= 1 && data[0] == '\n') {
      return 1;
    }
    if (data.Length() >= 2 && data[0] == '\r' && data[1] == '\n') {
      return 2;
    }
    return 0;
  }

  // A more rigorous "From " check which tries to detect spurious cases
  // where a message body hasn't been properly escaped.
  // The heuristic we use:
  // If the "From " line is followed by two lines which look like headers,
  // treat it as a message separator.
  // Otherwise assume it's part of the message body.
  // NOTE: the incoming data might not include two complete headers.
  // If that's the case and we don't spot anything that's obviously _not_
  // a header, then we'll give it the benefit of the doubt.
  // It would be more rigorous to implement this as its own state, so
  // it's not restricted to the size of the buffer passed in (>=MinChunk).
  // But that would require buffering up the data that passed through, in
  // order to roll back once the decision has been made.
  // And it's just not worth the extra complexity for such an obscure case.
  // Rationale:
  // 1) We're just trying to catch malformed mboxes already in the wild. We
  //    shouldn't have this problem if the mbox was written out properly
  //    (i.e. written by Thunderbird!).
  // 2) We should be using big buffers, and the likelihood of hitting a
  //    malformed message at a read boundary is teeny tiny.
  // So it's not worth jumping through toooooo many hoops here.
  static bool IsReallyReallyFromLine(span data) {
    if (!IsFromLine(data)) {
      return false;
    }

    auto it = data.cbegin();
    auto end = data.cend();
    // Skip past the "From " line
    it = std::find(it, end, '\n');
    if (it == end) {
      // "From " line takes up entirety of buffer.
      // Done all we can, so allow benefit of the doubt.
      return true;
    }
    ++it;

    // Now apply our heuristic by sniffing for mail headers.
    // From RFC 5322:
    // ```
    // Header fields are lines beginning with a field name, followed by a
    // colon (":"), followed by a field body, and terminated by CRLF.  A
    // field name MUST be composed of printable US-ASCII characters (i.e.,
    // characters that have values between 33 and 126, inclusive), except
    // colon.
    // ```
    auto is_fieldnamechar = [](char c) -> bool {
      // return true if char is valid for a mail header name.
      return c != ':' && c >= 33 && c <= 126;
    };

    // Check that the "From " line is followed by mail headers (2 is enough).
    // If we run out of data without seeing anything that's obviously not a
    // header, give it the benefit of the doubt.
    for (int headercount = 0; headercount < 2; ++headercount) {
      it = std::find_if_not(it, end, is_fieldnamechar);
      if (it == end) {
        return true;
      }
      if (*it != ':') {
        // Line is not a valid header.
        MOZ_LOG(gMboxLog, LogLevel::Warning,
                ("MboxParser - detected unescaped \"From \" line (data='%s')",
                 CEscapeString(nsDependentCSubstring(data), 80).get()));
        return false;
      }
      ++it;

      // Next line.
      it = std::find(it, end, '\n');
      if (it == end) {
        return true;
      }
      ++it;
      if (it == end) {
        return true;
      }

      // Skip over any continued lines (folded headers).
      while (*it == ' ' || *it == '\t') {
        it = std::find(it, end, '\n');
        if (it == end) {
          return true;
        }
        ++it;
        if (it == end) {
          return true;
        }
      }
    }
    return true;  // That'll do nicely.
  }
};

/**
 * MboxMsgInputStream implementation.
 */

NS_IMPL_ISUPPORTS(MboxMsgInputStream, nsIInputStream);

MboxMsgInputStream::MboxMsgInputStream(nsIInputStream* mboxStream)
    : mRawStream(mboxStream),
      mStatus(NS_OK),
      mBuf(8192),
      mUsed(0),
      mUnused(0),
      mTotalUsed(0),
      mMsgOffset(0),
      mParser(new MboxParser()) {
  // Ensure the first chunk is read and parsed.
  // This should include the "From " line, so EnvAddr()/EnvDate()
  // can be used right away.
  mStatus = PumpData();
}

MboxMsgInputStream::~MboxMsgInputStream() { Close(); }

NS_IMETHODIMP MboxMsgInputStream::Close() {
  mRawStream->Close();
  mStatus = NS_BASE_STREAM_CLOSED;
  return NS_OK;
}

bool MboxMsgInputStream::IsNullMessage() {
  return mParser->IsFinished() && (mMsgOffset == mTotalUsed);
}

nsresult MboxMsgInputStream::Continue(bool& more) {
  more = false;

  // Can't continue if the stream was closed.
  if (mStatus == NS_BASE_STREAM_CLOSED) {
    return NS_BASE_STREAM_CLOSED;
  }

  MOZ_ASSERT(NS_SUCCEEDED(mStatus));
  MOZ_ASSERT(mParser->IsFinished());
  // Record start of the next message (or EOF).
  mMsgOffset = mTotalUsed;

  // Tell the parser to start on the next message
  mParser->Kick();
  mStatus = PumpData();
  if (NS_FAILED(mStatus)) {
    return mStatus;
  }
  if (mParser->AtEOF()) {
    // No more messages.
    return NS_OK;
  }

  more = true;
  return NS_OK;
}

nsCString MboxMsgInputStream::EnvAddr() { return mParser->EnvAddr(); }

PRTime MboxMsgInputStream::EnvDate() { return mParser->EnvDate(); }

// Throw NS_BASE_STREAM_CLOSED if closed.
// Return 0 if EOF but not closed.
// Else return available bytes.
NS_IMETHODIMP MboxMsgInputStream::Available(uint64_t* result) {
  *result = 0;
  if (NS_FAILED(mStatus)) {
    return mStatus;
  }
  mStatus = PumpData();
  *result = static_cast<uint64_t>(mParser->Available());
  return mStatus;
}

NS_IMETHODIMP MboxMsgInputStream::StreamStatus() { return mStatus; }

// Returns a count of 0 if EOF or closed.
// Never throws NS_BASE_STREAM_CLOSED
NS_IMETHODIMP MboxMsgInputStream::Read(char* buf, uint32_t count,
                                       uint32_t* result) {
  *result = 0;
  if (mStatus == NS_BASE_STREAM_CLOSED) {
    return NS_OK;
  }
  if (NS_FAILED(mStatus)) {
    return mStatus;
  }

  // We just keep feeding data into the parser and copying out its output.
  while (count > 0) {
    mStatus = PumpData();
    if (NS_FAILED(mStatus)) {
      return mStatus;
    }
    size_t n = mParser->Drain(buf, (size_t)count);
    if (n == 0) {
      break;  // Nothing more in this message. Return EOF.
    }
    MOZ_ASSERT(n <= UINT32_MAX);
    buf += n;
    count -= (uint32_t)n;
    *result += n;
  }
  return NS_OK;
}

// Helper fn to feed data into the parser until there's something to drain,
// or until the end of the message has been hit.
// After calling this, mParser->Available() will only return 0 if the
// message is complete.
//
// Our read buffer (mBuf) is a fixed-size allocation, and breaks down like
// this:
// +---------------+---------------+----------------------+
// |  used data    | unused data   | free space           |
// +---------------+---------------+----------------------+
// ^               ^               ^                      ^
// |<--  mUsed  -->|<-- mUnused -->|                 mBuf.Length()
//
// Used data has been parsed already and can be ditched.
// Unused data has been read in, but not parsed yet.
// Free space is space we can read more raw data into.
//
// Obviously, the aim is to fill the buffer with each read,
// then exhaust it completely before reading more. But sometimes
// the parser will require more data before it can continue, so
// we have to "garbage collect" by moving the unused data to
// the front of the buffer to maximise the free space for reading.
// Luckily such parser stalls tend to involve small quantities of
// data (e.g. a "From " line falling between read boundaries).
nsresult MboxMsgInputStream::PumpData() {
  // Feed data to the parser until there's data available to output (or until
  // message is completed).
  while (mParser->Available() == 0 && !mParser->IsFinished()) {
    while (mUnused < MboxParser::MinChunk) {
      if (mUsed > 0) {
        // Shift the unused portion to the front of the buffer.
        auto unused = mBuf.AsSpan().Subspan(mUsed, mUnused);
        std::copy(unused.cbegin(), unused.cend(), mBuf.begin());
        mUsed = 0;
      }

      uint32_t got;
      size_t want = mBuf.Length() - (mUsed + mUnused);
      nsresult rv = mRawStream->Read(mBuf.Elements() + mUnused, want, &got);
      if (NS_FAILED(rv)) {
        return rv;
      }
      if (got == 0) {
        break;  // EOF.
      }
      mUnused += got;
    }

    // Feed what we've got into the parser.
    // If it's <MinChunk, then we've hit EOF, and the parser will handle it.
    auto data = mBuf.AsSpan().Subspan(mUsed, mUnused);
    data = mParser->Feed(data);
    size_t consumed = mUnused - data.Length();
    mTotalUsed += consumed;
    mUsed += consumed;
    mUnused -= consumed;
  }

  return NS_OK;
}

NS_IMETHODIMP MboxMsgInputStream::ReadSegments(nsWriteSegmentFun writer,
                                               void* closure, uint32_t count,
                                               uint32_t* _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP MboxMsgInputStream::IsNonBlocking(bool* nonBlocking) {
  *nonBlocking = false;
  return NS_OK;
}
