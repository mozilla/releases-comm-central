/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsString.h"
#include "LineReader.h"
#include "mozilla/ArrayUtils.h"
#include "mozilla/Span.h"

// Invocation:
// $ ./mach gtest "TestLineReader.*"

TEST(TestLineReader, Basic)
{
  struct {
    nsTArray<nsCString> chunks;
    int expectedLines;
  } testCases[] = {
      // Split lines as expected?
      {
          {"Line one\r\nLine two\r\n"_ns},
          2,
      },

      // Plain LFs should be accepted.
      {
          {"Line one\nLine two\n"_ns},
          2,
      },

      // Empty lines appear as expected?
      {
          {"\r\n\r\n\r\n"_ns},
          3,
      },

      // Empty case handled?
      {
          {""_ns},
          0,
      },

      // Split in mid-CRLF.
      {
          {
              "EOL split across\r"_ns,
              "\nchunks.\r\n"_ns,
          },
          2,
      },

      // Chunks join up correctly?
      {
          {"This single line is "_ns, "fed in as "_ns,
           "multiple chunks\r\n"_ns},
          1,
      },
      // Handle an empty chunk OK?
      {
          {"foo"_ns, ""_ns,
           "bar\n"_ns
           "wibble\n"_ns},
          2,
      },
      // Handle lines without EOL?
      {
          {"This line has no EOL and relies on Flush()."_ns},
          1,
      },
  };

  for (size_t i = 0; i < mozilla::ArrayLength(testCases); ++i) {
    auto const& t = testCases[i];

    // Join chunks into one string - we expect the output to be
    // this, byte-for-byte.
    nsCString expectedText;
    for (auto chunk : t.chunks) {
      expectedText.Append(chunk);
    }

    // Callback to collect the lines and count them.
    int gotLineCount = 0;
    nsCString gotText;
    auto callback = [&](mozilla::Span<const char> line) {
      ++gotLineCount;
      gotText.Append(line);
      return true;
    };
    // Parse the chunks.
    LineReader chopper;
    for (auto chunk : t.chunks) {
      chopper.Feed(chunk, callback);
    }
    chopper.Flush(callback);

    ASSERT_EQ(t.expectedLines, gotLineCount);
    ASSERT_EQ(expectedText, gotText);
  }
}

// Check that processing is aborted when callback returns false.
TEST(TestLineReader, Stop)
{
  struct {
    nsTArray<nsCString> chunks;
    int expectedLines;
  } testCases[] = {
      // Stop at 2 lines.
      {
          {"Line one\nSTOP\nThis line is never seen.\n"_ns},
          2,
      },

      // Line split up over multiple chunks.
      {
          {"one\r\nST"_ns, "OP\r\nblah blah\r\n"_ns},
          2,
      },

      // Empty string -> no lines.
      {
          {""_ns},
          0,
      },

      // No EOL, relies on Flush().
      {
          {
              "STOP"_ns,
          },
          1,
      },
  };

  for (size_t i = 0; i < mozilla::ArrayLength(testCases); ++i) {
    auto const& t = testCases[i];

    // Callback to collect the lines and count them, stopping when
    // we find a line containing "STOP".
    int gotLineCount = 0;
    auto callback = [&](mozilla::Span<const char> line) -> bool {
      ++gotLineCount;
      return nsCString(line).Find("STOP"_ns) == kNotFound;
    };
    // Parse.
    LineReader chopper;
    for (auto chunk : t.chunks) {
      chopper.Feed(chunk, callback);
    }
    chopper.Flush(callback);
    ASSERT_EQ(t.expectedLines, gotLineCount);
  }
}
