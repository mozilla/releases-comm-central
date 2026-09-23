/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <stdint.h>
#include <string.h>

#include "gtest/gtest.h"
#include "mimebuf.h"
#include "msgCore.h"
#include "nsMimeStringResources.h"
#include "nsString.h"
#include "nsTArray.h"
#include "prmem.h"

TEST(TestMimeBuf, GrowBufferGrows)
{
  char* buffer = nullptr;
  int32_t size = 0;

  ASSERT_EQ(mime_GrowBuffer(16, 255, &buffer, &size), 0);
  ASSERT_NE(buffer, nullptr);
  // quantum (mime_GrowBuffer 2nd param) is the minimum growth step, so a
  // 16-byte request grows by 255.
  EXPECT_EQ(size, 255);

  ASSERT_EQ(mime_GrowBuffer(1024, 255, &buffer, &size), 0);
  EXPECT_EQ(size, 1024);

  // Already big enough: no growth, still success.
  ASSERT_EQ(mime_GrowBuffer(512, 255, &buffer, &size), 0);
  EXPECT_EQ(size, 1024);

  PR_Free(buffer);
}

// A size that has gone negative used to compare greater than any desired_size
// once cast to unsigned, so mime_GrowBuffer() returned success without having
// grown anything and the caller's memcpy ran past the end. Bug 2070267.
TEST(TestMimeBuf, GrowBufferRejectsNegativeSize)
{
  char* buffer = nullptr;
  int32_t size = -1;

  EXPECT_EQ(mime_GrowBuffer(16, 255, &buffer, &size), MIME_OUT_OF_MEMORY);
  EXPECT_EQ(buffer, nullptr);
}

// Growing past what an int32_t can hold must be refused rather than wrapped.
// Nothing is allocated, so this does not need 2GiB of memory to run.
TEST(TestMimeBuf, GrowBufferRejectsOverflow)
{
  char* buffer = nullptr;
  int32_t size = INT32_MAX - 16;

  EXPECT_EQ(mime_GrowBuffer(INT32_MAX, 255, &buffer, &size),
            MIME_OUT_OF_MEMORY);
  EXPECT_EQ(size, INT32_MAX - 16);
  EXPECT_EQ(buffer, nullptr);
}

namespace {

struct DeliveredLine {
  nsCString line;
  char byteAtLength;
};

nsTArray<DeliveredLine>* gDelivered = nullptr;

int32_t RecordLine(const char* line, int32_t length, MimeObject* closure) {
  DeliveredLine delivered;
  delivered.line.Assign(line, length);
  delivered.byteAtLength = line[length];
  gDelivered->AppendElement(delivered);
  return 0;
}

// Run `input` through mime_LineBuffer() with newline conversion on, and
// collect what the per-line callback was handed.
void BufferLines(const char* input, nsTArray<DeliveredLine>& delivered) {
  delivered.Clear();
  gDelivered = &delivered;

  char* buffer = nullptr;
  int32_t bufferSize = 0;
  int32_t bufferFp = 0;
  EXPECT_EQ(mime_LineBuffer(input, strlen(input), &buffer, &bufferSize,
                            &bufferFp, true, RecordLine, nullptr),
            0);

  PR_FREEIF(buffer);
  gDelivered = nullptr;
}

}  // namespace

// Converting the line terminator moves the end of the line, so the NUL that
// mime_LineBuffer() wrote at the old end ends up inside the line or past it.
// Callers scan forward from `line` and stop at a NUL, so a line that is not
// terminated at line[length] sends them off the end: that is what drove
// name_len negative in MimeUntypedText_uu_begin_line_p(). Bug 2071619.
TEST(TestMimeBuf, LineBufferTerminatesAtLength)
{
  // CRLF input is the one converted where MSG_LINEBREAK_LEN is 1, LF-only
  // input where it is 2. Run both, so the invariant is checked on every
  // platform.
  for (const char* input : {"begin 644 \r\nend\r\n", "begin 644 \nend\n"}) {
    nsTArray<DeliveredLine> delivered;
    BufferLines(input, delivered);
    ASSERT_EQ(delivered.Length(), 2u);

    for (const DeliveredLine& delivery : delivered) {
      EXPECT_EQ(delivery.byteAtLength, '\0')
          << "line of length " << delivery.line.Length()
          << " should be NUL-terminated at line[length]";
    }
  }
}

// Whatever terminator comes in, lines go out terminated with the platform's
// MSG_LINEBREAK, and the reported length covers it.
TEST(TestMimeBuf, LineBufferConvertsTerminators)
{
  for (const char* input : {"one\r\ntwo\r\n", "one\ntwo\n", "one\rtwo\r\n"}) {
    nsTArray<DeliveredLine> delivered;
    BufferLines(input, delivered);
    ASSERT_EQ(delivered.Length(), 2u);

    EXPECT_STREQ(delivered[0].line.get(), "one" MSG_LINEBREAK);
    EXPECT_STREQ(delivered[1].line.get(), "two" MSG_LINEBREAK);
  }
}
