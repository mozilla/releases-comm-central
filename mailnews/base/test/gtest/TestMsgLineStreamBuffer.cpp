/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsMsgLineBuffer.h"
#include "nsString.h"
#include "nsStringStream.h"
#include "prmem.h"

static nsCString ReadDataLine(nsMsgLineStreamBuffer* aBuffer,
                              const nsACString& aData) {
  nsCOMPtr<nsIInputStream> stream;
  EXPECT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream), aData), NS_OK);
  uint32_t length;
  bool pause;
  char* line = aBuffer->ReadNextLine(stream, length, pause);
  nsCString result;
  if (line) {
    result.Assign(line, length);
    PR_Free(line);
  }
  return result;
}

// NULs stay in the buffer as received, but not in the lines returned.
TEST(TestMsgLineStreamBuffer, NulBytes)
{
  RefPtr<nsMsgLineStreamBuffer> buffer = new nsMsgLineStreamBuffer(64, true);
  EXPECT_EQ(ReadDataLine(buffer, nsLiteralCString("a\0b\r\nc\0\0\r\n")),
            "a b"_ns);
  EXPECT_TRUE(buffer->NextLineAvailable());
  nsAutoCString unread;
  buffer->TakeUnreadData(unread);
  EXPECT_EQ(unread, nsLiteralCString("c\0\0\r\n"));
  EXPECT_FALSE(buffer->NextLineAvailable());
}

// A line that arrives in two reads, with NULs in both.
TEST(TestMsgLineStreamBuffer, NulBytesAcrossReads)
{
  RefPtr<nsMsgLineStreamBuffer> buffer = new nsMsgLineStreamBuffer(64, true);
  EXPECT_EQ(ReadDataLine(buffer, nsLiteralCString("x\0y")), ""_ns);
  EXPECT_FALSE(buffer->NextLineAvailable());
  EXPECT_EQ(ReadDataLine(buffer, nsLiteralCString("\0z\r\n")), "x y z"_ns);
  EXPECT_FALSE(buffer->NextLineAvailable());
}

// A line without an end that exceeds the limit is an error, not more waiting.
TEST(TestMsgLineStreamBuffer, MaxLineLength)
{
  RefPtr<nsMsgLineStreamBuffer> buffer = new nsMsgLineStreamBuffer(64, true);
  buffer->SetMaxLineLength(16);
  EXPECT_EQ(ReadDataLine(buffer, "0123456789abcdef\r\n"_ns),
            "0123456789abcdef"_ns);

  nsCOMPtr<nsIInputStream> stream;
  EXPECT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream),
                                     "0123456789abcdef"_ns),
            NS_OK);
  uint32_t length;
  bool pause;
  nsresult rv;
  EXPECT_EQ(buffer->ReadNextLine(stream, length, pause, &rv), nullptr);
  EXPECT_EQ(rv, NS_OK);

  EXPECT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream), "g"_ns), NS_OK);
  EXPECT_EQ(buffer->ReadNextLine(stream, length, pause, &rv), nullptr);
  EXPECT_EQ(rv, NS_ERROR_ILLEGAL_INPUT);
}

// A complete line that arrives in one read is checked as well.
TEST(TestMsgLineStreamBuffer, MaxLineLengthCompleteLine)
{
  RefPtr<nsMsgLineStreamBuffer> buffer = new nsMsgLineStreamBuffer(64, true);
  buffer->SetMaxLineLength(16);
  nsCOMPtr<nsIInputStream> stream;
  EXPECT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream),
                                     "0123456789abcdefg\r\n"_ns),
            NS_OK);
  uint32_t length;
  bool pause;
  nsresult rv;
  EXPECT_EQ(buffer->ReadNextLine(stream, length, pause, &rv), nullptr);
  EXPECT_EQ(rv, NS_ERROR_ILLEGAL_INPUT);
}

// A CR at the end of a partial line doesn't count towards the limit.
TEST(TestMsgLineStreamBuffer, MaxLineLengthSplitCRLF)
{
  RefPtr<nsMsgLineStreamBuffer> buffer = new nsMsgLineStreamBuffer(64, true);
  buffer->SetMaxLineLength(16);
  nsCOMPtr<nsIInputStream> stream;
  EXPECT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream),
                                     "0123456789abcdef\r"_ns),
            NS_OK);
  uint32_t length;
  bool pause;
  nsresult rv;
  EXPECT_EQ(buffer->ReadNextLine(stream, length, pause, &rv), nullptr);
  EXPECT_EQ(rv, NS_OK);
  EXPECT_EQ(ReadDataLine(buffer, "\n"_ns), "0123456789abcdef"_ns);
}
