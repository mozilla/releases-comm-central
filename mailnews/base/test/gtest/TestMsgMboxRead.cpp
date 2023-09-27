/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsStringStream.h"
#include "nsISeekableStream.h"
#include "nsStreamUtils.h"
#include "nsMsgUtils.h"
#include "nsString.h"
#include "MboxMsgInputStream.h"
#include "mozilla/Buffer.h"

#include "Helpers.h"
#include "MboxTestData.h"

// To run:
// ./mach gtest "TestMsgMboxRead.*"

namespace testing {

// Helper to dump out a test case to stdout for troubleshooting.
static void dumpCase(testing::MboxCase const& t,
                     nsTArray<nsCString> const& got) {
  printf("mbox: '%s'\n", CEscapeString(t.mbox, 500).get());
  printf("EXPECTED %d msgs:\n", (int)t.expectedMsgs.Length());
  for (auto m : t.expectedMsgs) {
    printf("  => (%d bytes) '%s'\n", (int)m.Length(),
           CEscapeString(m, 120).get());
  }
  printf("GOT %d msgs:\n", (int)got.Length());
  for (auto m : got) {
    printf("  => (%d bytes) '%s'\n", (int)m.Length(),
           CEscapeString(m, 120).get());
  }
}

// Helper to run a batch of mbox test cases. Parses each mbox and ensures
// the expected messages pop out.
// readSize lets the caller set the size of the stream Read() calls.
static void runInputStreamCase(testing::MboxCase const& t, size_t readSize) {
  nsTArray<nsCString> msgs;
  testing::ExtractFromMbox(t.mbox, msgs, readSize);

  // Display test data + results before asserting to make troubleshooting
  // simpler.
  if (msgs.Length() != t.expectedMsgs.Length()) {
    dumpCase(t, msgs);
  }
  ASSERT_EQ(msgs.Length(), t.expectedMsgs.Length());

  for (size_t i = 0; i < msgs.Length(); ++i) {
    if (msgs[i] != t.expectedMsgs[i]) {
      dumpCase(t, msgs);
    }
    ASSERT_EQ(msgs[i], t.expectedMsgs[i]);
  }
}
}  // namespace testing

// Basics: Check against an assortment of validly-encoded mboxes.
// Try a variety of read sizes to try and trip up the parser.
TEST(TestMsgMboxRead, Basics)
{
  for (size_t s : {1, 3, 4096}) {
    for (auto const& t : testing::mboxValidCases) {
      testing::runInputStreamCase(t, s);
    }
  }
}

// Odd cases: Check against an assortment of odd-looking mboxes,
// where we know clearly what we want to see.
TEST(TestMsgMboxRead, OddCases)
{
  for (size_t s : {1, 3, 4096}) {
    for (auto const& t : testing::mboxOddCases) {
      testing::runInputStreamCase(t, s);
    }
  }
}

// Try a message with a more realistic size.
TEST(TestMsgMboxRead, LongMessage)
{
  nsCString msg =
      "From: alice@invalid\r\n"
      "To: bob@invalid\r\n"
      "Subject: big message\r\n"
      "\r\n"_ns;
  for (int i = 0; i < 512; ++i) {
    msg.AppendLiteral(
        "012345678901234567890123456789012345678901234567890123456789\r\n");
  }

  // An mbox with 10 copies of the message.
  testing::MboxCase longCase;
  for (int i = 0; i < 10; ++i) {
    longCase.mbox += "From \r\n"_ns;
    longCase.mbox += msg;
    longCase.mbox += "\r\n"_ns;
    longCase.expectedMsgs.AppendElement(msg);
  };

  for (size_t s : {1, 3, 4096}) {
    testing::runInputStreamCase(longCase, s);
  }
}

// Try a message with stupidly long lines.
TEST(TestMsgMboxRead, StupidlyLongLines)
{
  // 2000 chars of rubbish.
  nsCString stupid;
  for (int i = 0; i < 200; ++i) {
    stupid.AppendLiteral("0123456789");
  }

  nsCString msg = "Subject: "_ns + stupid + "\r\n"_ns + "To: "_ns + stupid +
                  "\r\n"_ns + "From: "_ns + stupid + "\r\n"_ns + "\r\n"_ns;
  for (int i = 0; i < 10; ++i) {
    msg.Append(stupid);
    msg.AppendLiteral("\r\n");
  }

  // An mbox with 10 copies of the message.
  testing::MboxCase t;
  for (int i = 0; i < 10; ++i) {
    // Use a stupid separator line too.
    t.mbox += "From "_ns;
    t.mbox += stupid;
    t.mbox += "\r\n"_ns;

    t.mbox += msg;

    t.mbox += "\r\n"_ns;

    t.expectedMsgs.AppendElement(msg);
  };

  for (size_t s : {1, 3, 4096}) {
    testing::runInputStreamCase(t, s);
  }
}

// Tests to handle ambiguous cases - mostly to support less
// clear mbox variants without "From "-quoting.
TEST(TestMsgMboxRead, Ambiguities)
{
  for (size_t s : {1, 3, 4096}) {
    for (auto const& t : testing::mboxAmbiguities) {
      testing::runInputStreamCase(t, s);
    }
  }
}
