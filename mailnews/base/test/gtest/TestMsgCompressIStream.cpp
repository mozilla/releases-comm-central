/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsMsgCompressIStream.h"
#include "nsMsgLineBuffer.h"
#include "nsString.h"
#include "nsStringStream.h"
#include "nsTArray.h"
#include "prmem.h"
#include "zlib.h"

// Compresses each chunk as raw deflate and flushes after it, the way an IMAP
// server does after COMPRESS DEFLATE. Returns the output of each flush; an
// empty chunk yields an empty block.
static nsTArray<nsCString> DeflateChunks(
    std::initializer_list<nsCString> aChunks) {
  z_stream zs{};
  EXPECT_EQ(deflateInit2(&zs, Z_DEFAULT_COMPRESSION, Z_DEFLATED, -MAX_WBITS, 8,
                         Z_DEFAULT_STRATEGY),
            Z_OK);
  nsTArray<nsCString> out;
  char buf[1024];
  for (const nsCString& chunk : aChunks) {
    nsCString& flushed = *out.AppendElement();
    zs.next_in = (Bytef*)chunk.get();
    zs.avail_in = chunk.Length();
    do {
      zs.next_out = (Bytef*)buf;
      zs.avail_out = sizeof(buf);
      deflate(&zs, Z_SYNC_FLUSH);
      flushed.Append(buf, sizeof(buf) - zs.avail_out);
    } while (zs.avail_out == 0);
  }
  deflateEnd(&zs);
  return out;
}

// Available() of nsMsgCompressIStream reports compressed bytes, so a line may
// take several reads.
static nsCString ReadLine(nsMsgLineStreamBuffer* aBuffer,
                          nsIInputStream* aStream) {
  uint32_t length;
  bool pause;
  char* line = nullptr;
  for (int i = 0; i < 100 && !line; i++) {
    line = aBuffer->ReadNextLine(aStream, length, pause);
  }
  nsCString result;
  if (line) {
    result.Assign(line, length);
    PR_Free(line);
  }
  return result;
}

// Dovecot flushes an empty block right after "OK Begin compression". If it
// arrives in the same read as the OK, the line buffer already holds it when
// compression starts; the next response comes later (bug 2087454).
TEST(TestMsgCompressIStream, PendingDataFromLineBuffer)
{
  nsTArray<nsCString> deflated =
      DeflateChunks({""_ns, "* ID (\"name\" \"Dovecot\")\r\n"_ns});
  ASSERT_EQ(deflated.Length(), 2u);

  nsCString first("1 OK Begin compression.\r\n"_ns);
  first.Append(deflated[0]);
  nsCOMPtr<nsIInputStream> stream;
  ASSERT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream), first), NS_OK);
  RefPtr<nsMsgLineStreamBuffer> buffer = new nsMsgLineStreamBuffer(4096, true);
  EXPECT_EQ(ReadLine(buffer, stream), "1 OK Begin compression."_ns);

  nsAutoCString pending;
  buffer->TakeUnreadData(pending);
  EXPECT_EQ(pending, deflated[0]);

  ASSERT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream), deflated[1]),
            NS_OK);
  RefPtr<nsMsgCompressIStream> compressed = new nsMsgCompressIStream();
  ASSERT_EQ(compressed->InitInputStream(stream, pending), NS_OK);
  EXPECT_EQ(ReadLine(buffer, compressed), "* ID (\"name\" \"Dovecot\")"_ns);
}

// Pending data that already holds a whole response.
TEST(TestMsgCompressIStream, PendingDataWithResponse)
{
  nsTArray<nsCString> deflated =
      DeflateChunks({"* OK first\r\n"_ns, "* OK second\r\n"_ns});
  nsCOMPtr<nsIInputStream> stream;
  ASSERT_EQ(NS_NewCStringInputStream(getter_AddRefs(stream), deflated[1]),
            NS_OK);
  RefPtr<nsMsgCompressIStream> compressed = new nsMsgCompressIStream();
  ASSERT_EQ(compressed->InitInputStream(stream, deflated[0]), NS_OK);
  RefPtr<nsMsgLineStreamBuffer> buffer = new nsMsgLineStreamBuffer(4096, true);
  EXPECT_EQ(ReadLine(buffer, compressed), "* OK first"_ns);
  EXPECT_EQ(ReadLine(buffer, compressed), "* OK second"_ns);
}
