/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_BASE_SRC_HEADERREADER_H_
#define COMM_MAILNEWS_BASE_SRC_HEADERREADER_H_

#include <algorithm>
#include "LineReader.h"
#include "nsMsgUtils.h"
#include "nsString.h"
#include "mozilla/Span.h"

/**
 * HeaderReader parses mail headers from a buffer.
 * The input is fed in via Parse(), and a callback function is invoked for
 * each header encountered.
 *
 * General goals:
 *
 * - Incremental. Parse() can be called multiple times as a buffer grows.
 * - Works in-place. Headers are returned as byte ranges within the data.
 * - Works with a partial header block (e.g. sniffing the first N bytes
 *   of a message file). It won't mistakenly emit an incomplete header.
 * - Track exact byte offsets for values, to support rewriting headers in
 *   place. This is needed to support X-Mozilla-Status et al.
 * - Avoids copying data where possible.
 * - Callback is inlined.
 * - Callback can halt processing (by returning false).
 * - Tolerant of real-world oddness in input data (for now, we just skip
 *   lines which don't make sense).
 *
 * Example usage:
 *    nsCString raw = "To: Alice\r\nFrom: Bob\r\n\r\n...Message body..."_ns;
 *    auto cb = [&](HeaderReader::Hdr const& hdr) {
 *      printf("-> '%s':'%s'\n", hdr.Name(raw).get(), hdr.Value(raw).get());
 *      return true;
 *    };
 *
 *    HeaderReader rdr;
 *    rdr.Parse(raw, cb);
 *    // -> 'To':'Alice'
 *    // -> 'From':'Bob'
 *
 * See TestHeaderReader.cpp for more examples.
 */
class HeaderReader {
 public:
  /**
   * Parse() scans an input buffer and invokes a callback for each complete
   * header found.
   *
   * It can be called any number of times - it'll pick up where it left off.
   * The idea is that the caller can accumulate data in multiple chunks and
   * call Parse() to extract headers incrementally as they come in.
   * It does rely on data being a single contiguous allocation, but it
   * doesn't require the data being located in the same memory location
   * each time. So can it can be safely used on a growable buffer.
   *
   * Signature of callback is:
   * bool hdrCallback(HeaderReader::Hdr const& hdr);
   *
   * The callback should return true to continue parsing, or false to halt.
   * This allows, for example, an early-out if you're scanning for one
   * specific header and don't care about the rest.
   *
   * Parse() stops when one of these conditions is true:
   * 1. The end of the header block is reached (the final blank line marker
   *    is consumed). Subsequent calls to IsComplete() will return true.
   * 2. The callback returns false. If Parse() is called again, it will
   *    safely pick up where it left off.
   * 3. No more headers can be read. There may be some unconsumed data
   *    returned (eg a partial line). Parse() can be safely called again
   *    when more data becomes available. It will resume from the point it
   *    reached previously.
   *
   * It is safe to call Parse() on a truncated header block. It will only
   * invoke the callback for headers which are unambiguously complete.
   *
   * @param data - bytes containing the header block to parse.
   * @param hdrCallback - callback to invoke for each header found
   *
   * @returns a span containing the unconsumed (leftover) data.
   */
  template <typename HeaderFn>
  mozilla::Span<const char> Parse(mozilla::Span<const char> data,
                                  HeaderFn hdrCallback);

  /**
   * Complete() returns true if the header block has been fully parsed.
   * Further calls to Parse() will consume no more data.
   * The blank line which separates the header block from the body is consumed.
   */
  bool IsComplete() const { return mFinished; }

  /**
   * Hdr holds offsets to a name/value pair within a header block.
   * The name starts at pos.
   * The value starts at pos+rawValOffset.
   */
  struct Hdr {
    uint32_t pos{0};           // Start position of header within the block.
    uint32_t len{0};           // Length of entire header, including final EOL.
    uint32_t nameLen{0};       // Length of name.
    uint32_t rawValOffset{0};  // Where the value starts, relative to pos.
    uint32_t rawValLen{0};     // Excludes final EOL.
    bool IsEmpty() const { return len == 0; }

    /**
     * Access the header name as a string.
     *
     * @param data - the data originally passed into Parse().
     * @returns the name within data, wrapped for string access (so it is
     *          valid only as long as data is valid).
     */
    nsDependentCSubstring Name(mozilla::Span<const char> data) const {
      return nsDependentCSubstring(data.Elements() + pos, nameLen);
    }
    /**
     * Access the raw value as a string.
     *
     * @param data - the data originally passed into Parse().
     * @returns the raw data, EOLs and all, wrapped for string access (so it
     *          is valid only as long as data is valid).
     */
    nsDependentCSubstring RawValue(mozilla::Span<const char> data) const {
      return nsDependentCSubstring(data.Elements() + pos + rawValOffset,
                                   rawValLen);
    }
    /**
     * Decode the 'cooked' value into a string.
     * NOTE: handles unfolding multi-line values. No attempt (yet) at dealing
     * with comments or quoted strings...
     *
     * @param data - the data originally passed into Parse().
     * @returns a new string containing the value.
     */
    nsCString Value(mozilla::Span<const char> data) const {
      nsCString val(RawValue(data));
      val.ReplaceSubstring("\r\n"_ns, ""_ns);
      val.ReplaceSubstring("\n"_ns, ""_ns);
      return val;
    }

    /**
     * EOL() returns a string containing the eol characters at the end of the
     * header. It will be "\n" or "\r\n".
     * Calling this on an empty hdr struct is unsupported.
     */
    nsDependentCSubstring EOL(mozilla::Span<const char> data) const {
      MOZ_ASSERT(len >= 2);  // Empty or malformed?

      uint32_t i = pos + len;
      int n = 0;
      if (data[i - 1] == '\n') {
        ++n;
        if (data[i - 2] == '\r') {
          ++n;
        }
      }
      return nsDependentCSubstring(data.Elements() + pos + len - n, n);
    }
  };

 private:
  // How far Parse() has gone so far.
  uint32_t mPos{0};

  // The current header we're accumulating.
  Hdr mHdr;

  // Number of EOL chars at the end of previous line (so we can strip it if the
  // next line is folded).
  int mEOLSize{0};

  // Set when end of header block detected.
  bool mFinished{false};

  template <typename HeaderFn>
  bool HandleLine(mozilla::Span<const char> line, HeaderFn hdrCallback);
};

// Parse() implementation.
template <typename HeaderFn>
mozilla::Span<const char> HeaderReader::Parse(mozilla::Span<const char> data,
                                              HeaderFn hdrCallback) {
  // If were're resuming, skip what we've already scanned.
  auto remaining = mozilla::Span<const char>(data.cbegin() + mPos, data.cend());
  if (mFinished) {
    return remaining;
  }
  // Iterate over all the lines of our input.
  remaining = SplitLines(remaining,
                         [this, hdrCallback](mozilla::Span<const char> line) {
                           return HandleLine(line, hdrCallback);
                         });

  if (!mFinished) {
    // We didn't get to the end of the header block, but we may still be
    // able to finalise a previously-started header...
    if (!mHdr.IsEmpty()) {
      if (remaining.Length() > 0 && remaining[0] != ' ' &&
          remaining[0] != '\t') {
        // Next line isn't folded, so we know the header is complete.
        mHdr.rawValLen -= mEOLSize;
        hdrCallback(mHdr);
      } else {
        // Can't tell if header is complete. Rewind and try again next time.
        mPos = mHdr.pos;
        remaining =
            mozilla::Span<const char>(data.cbegin() + mPos, data.cend());
      }
      mHdr = Hdr();
    }
  }
  return remaining;
}

// Helper function - we call this on each complete line we encounter.
template <typename HeaderFn>
bool HeaderReader::HandleLine(mozilla::Span<const char> line,
                              HeaderFn hdrCallback) {
  // Should never be here if we've finished.
  MOZ_ASSERT(!mFinished);
  // we should _never_ see empty strings.
  MOZ_ASSERT(!line.IsEmpty());

  // Find the EOL sequence (CRLF or LF).
  auto eol = line.cend();
  auto p = eol;
  if (p > line.cbegin() && *(p - 1) == '\n') {
    --eol;
    if ((p - 1) > line.cbegin() && *(p - 2) == '\r') {
      --eol;
    }
  }
  // We should never have been called with a non-terminated line.
  MOZ_ASSERT(eol != line.cend());

  // Blank line indicates end of header block.
  if (eol == line.cbegin()) {
    if (!mHdr.IsEmpty()) {
      // Emit the completed header.
      mHdr.rawValLen -= mEOLSize;
      hdrCallback(mHdr);
      mHdr = Hdr();
    }
    mFinished = true;
    mPos += line.Length();
    return false;  // Stop.
  }

  // A folded line?
  // Leading space or tab indicates continuation of previous value.
  if (line[0] == ' ' || line[0] == '\t') {
    if (!mHdr.IsEmpty()) {
      // Grow the existing header.
      mHdr.len += line.Length();
      mHdr.rawValLen += line.Length();
      mEOLSize = line.cend() - eol;
    } else {
      // UHOH - a folded value but we haven't started a header...
      // Not much we can do, so we'll just ignore the line.
      NS_WARNING("Malformed header (bare continuation)");
    }
    mPos += line.Length();
    return true;  // Next line, please.
  }

  bool keepGoing = true;
  // By now, we're expecting a "name: value" line, to start a fresh header.
  if (!mHdr.IsEmpty()) {
    // Flush previous header now we know it's complete.
    mHdr.rawValLen -= mEOLSize;
    keepGoing = hdrCallback(mHdr);
    mHdr = Hdr();
  }

  auto colon = std::find(line.cbegin(), line.cend(), ':');
  if (colon == line.cend()) {
    // UHOH. We were expecting a "name: value" line, but didn't find one.
    // Just ignore this line.
    NS_WARNING("Malformed header (expected 'name: value')");
    mPos += line.Length();
    return keepGoing;
  }
  auto val = colon + 1;
  if (*val == ' ' || *val == '\t') {
    // Skip single leading whitespace.
    ++val;
  }

  // Start filling out the new header (it may grow if folded lines come next).
  mHdr.pos = mPos;
  mHdr.len = line.Length();
  mHdr.nameLen = colon - line.cbegin();

  mHdr.rawValOffset = val - line.cbegin();
  mHdr.rawValLen = line.cend() - val;
  mEOLSize = line.cend() - eol;
  mPos += line.Length();
  return keepGoing;
}

#endif  // COMM_MAILNEWS_BASE_SRC_HEADERREADER_H_
