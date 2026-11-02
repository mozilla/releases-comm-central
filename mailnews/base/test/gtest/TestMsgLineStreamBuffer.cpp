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
