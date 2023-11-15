/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_BASE_SRC_LINEREADER_H_
#define COMM_MAILNEWS_BASE_SRC_LINEREADER_H_

#include <algorithm>
#include "mozilla/Span.h"
#include "mozilla/Vector.h"

/**
 * FirstLine() returns the first complete line in a span.
 * The EOL sequence (CRLF or LF) is included in the returned line.
 * If no EOL is found, an empty span is returned.
 */
inline mozilla::Span<const char> FirstLine(
    mozilla::Span<const char> const& data) {
  auto eol = std::find(data.cbegin(), data.cend(), '\n');
  if (eol == data.cend()) {
    // no line ending found - return empty span.
    return data.First(0);
  }
  ++eol;
  return mozilla::Span<const char>(data.cbegin(), eol);
}

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

/**
 * SplitLines() invokes a callback for every complete line it finds in the
 * input data.
 *
 * The callback is of the form:
 *   bool callback(mozilla::Span<const char> line);
 * where line is a span pointing to the range of bytes in the input data
 * which comprises the line.
 *
 * If the callback returns false, processing is halted.
 *
 * The lines passed to the callback include end-of-line (EOL) character(s).
 *
 * Lines are considered terminated by '\n' (LF) but this means CRLF-delimited
 * data is also handled correctly.
 *
 * This function is byte-exact: if you concatenate all the line spans, along
 * with the unconsumed data returned at the end, you'll end up with the exact
 * same byte sequence as the original input data.
 *
 * @param data - The input bytes.
 * @param callback - The callback to invoke for each line.
 *
 * @returns the unconsumed data. Usually this will be empty, or an incomplete
 *          line at the end (with no EOL). However if the callback returned
 *          false, all the unused data will be returned.
 */
template <typename LineFn>
mozilla::Span<const char> SplitLines(mozilla::Span<const char> data,
                                     LineFn callback) {
  while (!data.IsEmpty()) {
    auto eol = std::find(data.cbegin(), data.cend(), '\n');
    if (eol == data.cend()) {
      // No LF - we're done. May or may not be some leftover data.
      break;
    }

    // Consume everything up to and including the LF.
    ++eol;
    mozilla::Span<const char> line(data.cbegin(), eol);
    data = mozilla::Span<const char>(eol, data.cend());

    if (callback(line) == false) {
      break;
    }
  }
  return data;
}

#endif  // COMM_MAILNEWS_BASE_SRC_LINEREADER_H_
