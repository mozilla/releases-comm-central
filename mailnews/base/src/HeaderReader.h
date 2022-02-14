/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef HeaderReader_h__
#define HeaderReader_h__

#include <algorithm>
#include "LineReader.h"
#include "nsMsgUtils.h"
#include "nsString.h"
#include "mozilla/Span.h"

/**
 * HeaderReader parses mail headers from a stream of bytes.
 * The input is fed in as chunks of any size, and a callback function
 * is invoked when each header is completed.
 *
 * General goals:
 *
 * - Incremental. Feed data in as multiple chunks.
 * - Can work with a partial header block (e.g. sniffing the first N bytes
 *   of a message file).
 * - Track exact byte offsets for values, to support rewriting headers in
 *   place. This is needed to support X-Mozilla-Status et al.
 * - Callback can be inlined.
 * - Callback can halt processing (by returning false).
 * - Tolerant of real-world oddness in input data (for now, we just skip
 *   lines which don't make sense).
 *
 * Example usage:
 *
 *    auto cb = [](HeaderReader::Header const& hdr) {
 *      printf("-> '%s':'%s'\n", hdr.name.get(), hdr.value.get());
 *      return true;
 *    };
 *
 *    HeaderReader rdr;
 *    rdr.Feed("To: Alice\r\nFrom: Bob\r\n", cb);
 *    // -> 'To':'Alice'
 *    // -> 'From':'Bob'
 *    rdr.Feed("Subject: a long\r\n subject.\r\n", cb); // folded.
 *    rdr.Feed("\r\n", cb)
 *    rdr.Feed("message body starts here...\r\n", cb);
 *    // -> 'Subject': 'a long subject'
 *    rdr.Flush(cb);
 *
 * See TestHeaderReader.cpp for more examples.
 */
class HeaderReader {
 public:
  /**
   * Feed() accepts a chunk of raw data to parse. It can be called multiple
   * times. hdrCallback will be invoked for each complete header found.
   *
   * Signature of callback is:
   * bool hdrCallback(HeaderReader::Header const& hdr);
   *
   * If the callback returns false, further processing is halted.
   */
  template <typename HeaderFn>
  void Feed(mozilla::Span<const char> data, HeaderFn hdrCallback) {
    auto lineFn = [this, hdrCallback](mozilla::Span<const char> line) {
      if (!mFinished) {
        HandleLine(line, hdrCallback);
        mPos += line.Length();
      }
      return !mFinished;
    };
    // Use LineReader to break up input into lines.
    mLineReader.Feed(data, lineFn);
  }

  /**
   * Flush() indicates that no more input data will be provided via Feed().
   * If there was an unfinished header, there _might_ be enough information
   * to complete it (in which case the callback will be invoked).
   */
  template <typename HeaderFn>
  void Flush(HeaderFn hdrCallback) {
    if (mFinished) {
      return;
    }
    auto lineFn = [this, hdrCallback](mozilla::Span<const char> line) {
      // This last line will be unterminated.
      // All we need to know is if it's a continuation of a folded field
      // value or not.
      if (line[0] == ' ' || line[1] == '\t') {
        // It's folded, so even if we've got a header, it's unfinished and we
        // shouldn't emit it.
        mFinished = true;
        return false;
      }
      // Not folded. If we have a header, it's complete and we should emit it.
      FlushHdr(hdrCallback);
      return false;
    };
    mLineReader.Flush(lineFn);
    mFinished = true;
  }

  /**
   * Header is the struct passed back to the callback function.
   *
   * e.g. For "Foo: one\r\n two\r\n" (note the folded value):
   *   name: "Foo"
   *   value: "one two"   (interior and final EOL stripped)
   *   rawValuePos: 5
   *   rawValueLength: 9  (includes interior EOL, but not final EOL)
   */
  struct Header {
    // The name of the field.
    nsCString name;
    // The processed value, stripped of leading whitespace and EOLs and
    // unfolded if required.
    nsCString value;
    // rawValuePos/Length gives the extent of the value within the original
    // data. It includes the interior EOL characters that are stripped from
    // the value field.  It's here to support code that wants to rewrite
    // header values in-place (for X-Mozilla-Status et al).
    uint64_t rawValuePos{0};     // Offset within data fed in so far.
    uint64_t rawValueLength{0};  // Includes interior CRLFs.

    // We'll consider Header struct empty unless name is set.
    bool IsSet() const { return !name.IsEmpty(); }
  };

 private:
  // Start of current line (in terms of how many bytes have been fed in).
  uint64_t mPos{0};
  LineReader mLineReader;
  // The current header data being accumulated.
  Header mHdr;
  // Number of EOL chars at the end of previous line (so we can strip it if the
  // next line is folded).
  int mEOLSize{0};

  // Set when end of header block detected, or if the callback returns false.
  bool mFinished{false};

  // We consider each line of input one at a time.
  template <typename HeaderFn>
  void HandleLine(mozilla::Span<const char> line, HeaderFn hdrCallback) {
    // Should never be here if we've finished.
    MOZ_ASSERT(!mFinished);
    // LineReader should _never_ pass in totally empty lines.
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
    // We should never have been called with non-terminated line.
    MOZ_ASSERT(eol != line.cend());

    // Blank line?
    // Indicates end of header block.
    if (eol == line.cbegin()) {
      FlushHdr(hdrCallback);
      mFinished = true;
      return;
    }

    // A folded line?
    // Leading space or tab indicates continuation of previous value.
    if (line[0] == ' ' || line[0] == '\t') {
      if (mHdr.name.IsEmpty()) {
        // UHOH - folded value but haven't started a header...
        // Just ignore the line.
        return;
      }
      // Unfold. The leading space stays, but we don't keep EOL chars.
      mHdr.value += nsCString(mozilla::Span<const char>(line.cbegin(), eol));
      mHdr.rawValueLength += line.Length();
      mEOLSize = line.cend() - eol;
      return;
    }

    // By now, we're expecting a "name: value" line, to start a fresh header.
    // First, emit the previous header, if any.
    FlushHdr(hdrCallback);

    auto colon = std::find(line.cbegin(), line.cend(), ':');
    if (colon == line.cend()) {
      // UHOH. We were expecting a "name: value" line, but didn't find one.
      // Just ignore.
      return;
    }
    auto val = colon + 1;
    if (*val == ' ' || *val == '\t') {
      // Skip a single leading whitespace.
      ++val;
    }
    mHdr.name = nsCString(mozilla::Span(line.cbegin(), colon));
    mHdr.value = nsCString(mozilla::Span(val, eol));
    mHdr.rawValuePos = mPos + (val - line.cbegin());
    mHdr.rawValueLength = line.cend() - val;  // Includes EOL chars.
    mEOLSize = line.cend() - eol;
  }

  // If we've collected a header, emit it then clear it.
  template <typename HeaderFn>
  void FlushHdr(HeaderFn hdrCallback) {
    if (!mHdr.IsSet()) {
      return;
    }
    // rawValue includes interior EOLs, but not the final EOL.
    mHdr.rawValueLength -= mEOLSize;
    if (!hdrCallback(mHdr)) {
      mFinished = true;  // Callback wants us to stop.
    }
    mHdr = Header();
  }
};

#endif
