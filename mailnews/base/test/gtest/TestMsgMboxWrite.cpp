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
#include "MboxMsgOutputStream.h"
#include "mozilla/Buffer.h"

#include "Helpers.h"
#include "MboxTestData.h"
#include <algorithm>

// To run:
// ./mach gtest "TestMsgMboxWrite.*"

// Helper to run a single mbox test case.
// Feeds all the test messages into an mbox via MboxMsgOutputStream, then check
// that mbox is what we expect to see.
static void testOutputStreamCase(testing::MboxCase const& t, size_t writeSize) {
  RefPtr<testing::CaptureStream> mboxStream = new testing::CaptureStream();
  for (auto const& msg : t.expectedMsgs) {
    RefPtr<MboxMsgOutputStream> out = new MboxMsgOutputStream(mboxStream);
    size_t total = 0;
    // Write in chunks of writeSize.
    while (total < msg.Length()) {
      size_t chunkSize = std::min(writeSize, msg.Length() - total);
      uint32_t n;
      nsresult rv = out->Write(msg.Data() + total, (uint32_t)chunkSize, &n);
      ASSERT_TRUE(NS_SUCCEEDED(rv));
      total += (size_t)n;
    }
    // Wrote it all?
    ASSERT_EQ(total, msg.Length());
  }

  // Got the mbox we expected?
  ASSERT_EQ(mboxStream->Data(), t.mbox);
}

// Run our basic test cases of well-formed messages. Tests quoting etc...
TEST(TestMsgMboxWrite, Basics)
{
  for (size_t s : {1, 3, 4096}) {
    for (auto const& t : testing::mboxValidCases) {
      testOutputStreamCase(t, s);
    }
  }
}

// Write out what we're given, even if it's not a valid RFC5322 message.
TEST(TestMsgMboxWrite, BadMessages)
{
  testing::MboxCase t;
  nsCString msg = "BADMESSAGE\r\n"_ns;  // No header, No body...

  for (int i = 0; i < 10; ++i) {
    t.mbox += "From \r\n"_ns;
    t.mbox += msg;
    t.mbox += "\r\n"_ns;
    t.expectedMsgs.AppendElement(msg);
  }
  for (size_t s : {1, 3, 4096}) {
    testOutputStreamCase(t, s);
  }
}
