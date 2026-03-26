/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsMsgI18N.h"

// Unit tests for nsMsgI18N functions.

// Invocation:
// $ ./mach gtest "TestMsgI18N.*"

// Test nsMsgI18NTruncateUTF8Str().
TEST(TestMsgI18N, TruncateUTF8Str)
{
  struct {
    nsLiteralCString input;
    size_t maxBytes;
    nsLiteralCString expected;
  } testStrings[] = {
      // ASCII
      {""_ns, 100, ""_ns},
      {""_ns, 0, ""_ns},
      {"FooBar"_ns, 100, "FooBar"_ns},
      {"FooBar"_ns, 3, "Foo"_ns},
      {"FooBar"_ns, 0, ""_ns},
      // Non-ASCII - Make sure only complete characters are returned.
      {"グレープフルーツ"_ns, 100, "グレープフルーツ"_ns},
      {"グレープフルーツ"_ns, 0, ""_ns},
      {"グレープフルーツ"_ns, 12,
       "グレープ"_ns},  // Clip to exact UTF-8 boundary.
      {"グレープフルーツ"_ns, 13, "グレープ"_ns},    // Discards partial char...
      {"グレープフルーツ"_ns, 14, "グレープ"_ns},    // Discards partial char...
      {"グレープフルーツ"_ns, 15, "グレープフ"_ns},  // ...Enough room!
      // Stop at invalid UTF-8.
      {"foo"
       "\xff"
       "bar"_ns,
       100, "foo"_ns},
      {"foo"
       "\xff"
       "bar"_ns,
       3, "foo"_ns},
      {"foo"
       "\xff"
       "bar"_ns,
       4, "foo"_ns},
      {"foo"
       "\xff"
       "bar"_ns,
       1, "f"_ns},
      {"foo"
       "\xff"
       "bar"_ns,
       0, ""_ns},
  };

  for (auto const& t : testStrings) {
    nsCString got = nsMsgI18NTruncateUTF8Str(t.input, t.maxBytes);
    ASSERT_EQ(got, t.expected);
  }
}
