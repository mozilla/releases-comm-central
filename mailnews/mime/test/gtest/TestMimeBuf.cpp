/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <stdint.h>

#include "gtest/gtest.h"
#include "mimebuf.h"
#include "nsMimeStringResources.h"
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
