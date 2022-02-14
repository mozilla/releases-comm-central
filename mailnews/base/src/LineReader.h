/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef LineReader_h__
#define LineReader_h__

#include <algorithm>
#include "mozilla/Span.h"
#include "mozilla/Vector.h"

/**
 * LineReader breaks up continuous character streams into lines.
 * Data is fed in by calling Feed() as often as required, and a
 * callback function is invoked to handle each resulting line.
 *
 * The resulting lines include the end-of-line char(s), except for any
 * non-terminated final line.
 * LF ('\n') is used as the line terminator. CRLF-terminated lines will
 * be handled correctly - the resultant lines will include the line
 * terminators exactly as they appear in the input data.
 *
 * Goals for LineReader:
 * - Byte exact. The bytes fed in will appear _exactly_ in the callback fn.
 * - Callback can be inlined (due to templating).
 * - Avoid copying data if possible. The internal buffer is only used when
 *   lines are split across incoming chunks of data.
 * - Tries to avoid heap allocation. If the internal buffer is used, it'll
 *   only allocate memory for long lines (>80 chars).
 *
 * Example usage:
 *
 *    auto callback = [](mozilla::Span<const char> line) {
 *      printf("%s\n", nsCString(line).get());
 *      return true;
 *    };
 *
 *    LineReader c;
 *    c.Feed("Line 1\r\nLine 2\r\nLine 3", callback);
 *    // -> "Line 1\r\n"
 *    // -> "Line 2\r\n"
 *    c.Feed("\r\nLeftovers.", callback);
 *    // -> "Line 3\r\n"
 *    c.Flush(callback);
 *    // -> "Leftovers."
 *
 * See TestLineReader.cpp for more examples.
 */
class LineReader {
 public:
  /*
   * Feed() takes in a chunk of data to be split up into lines. You can call
   * this as often as required to feed in all your data. Don't forget to call
   * Flush() after the last Feed(), in case the last line has no line endings!
   *
   * The callback will be invoked once for each full line extracted.
   * It should have the form:
   * The callback is of the form:
   *   bool callback(mozilla::Span<const char> line);
   *
   * The data in `line` should be considered valid only until the callback
   * returns. So if the callback wants to retain data it needs to copy it.
   * `line` will include any EOL character(s).
   * The callback should return true to continue processing.
   * If the callback returns false, processing will stop, even if there is
   * more data available.
   */
  template <typename LineFn>
  void Feed(mozilla::Span<const char> data, LineFn callback) {
    bool keepGoing = true;
    while (!data.IsEmpty() && keepGoing) {
      auto eol = std::find(data.cbegin(), data.cend(), '\n');
      if (eol == data.cend()) {
        // No LF. Just collect and wait for more.
        // TODO: limit maximum mBuf size, to stop maliciously-crafted input
        // OOMing us?
        if (!mBuf.append(data.data(), data.size())) {
          NS_ERROR("OOM!");
        }
        return;
      }

      // Consume everything up to and including the LF.
      ++eol;
      mozilla::Span<const char> line(data.cbegin(), eol);
      data = mozilla::Span<const char>(eol, data.cend());

      if (mBuf.empty()) {
        // Pass the data through directly, no copying.
        keepGoing = callback(line);
      } else {
        // Complete the line we previously started.
        if (!mBuf.append(line.data(), line.size())) {
          NS_ERROR("OOM!");
        }
        keepGoing = callback(mBuf);
        mBuf.clear();
      }
    }
  }

  /*
   * Flush() will invoke the callback with any leftover data, after the last
   * Feed() call has completed.
   * The line passed to the callback will be a partial line, without a final
   * LF. If the input data has a final LF, there will be nothing to flush,
   * and the callback will not be invoked.
   */
  template <typename LineFn>
  void Flush(LineFn callback) {
    if (!mBuf.empty()) {
      callback(mBuf);
      mBuf.clear();
    }
  }

 private:
  // Growable buffer, to collect lines which come in as multiple parts.
  // Can handle lines up to 80 chars before needing to reallocate.
  mozilla::Vector<char, 80> mBuf;
};

#endif
