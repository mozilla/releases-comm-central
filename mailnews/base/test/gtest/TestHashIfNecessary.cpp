/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"

#include "nsMsgUtils.h"

TEST(HashIfNecessary, Basics)
{
  // No hashing necessary.
  nsAutoString input(u"test"_ns);
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"test"_ns));

  // The first illegal character is replaced with a hash of the whole string.
  input = u"test ?"_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"test 44d67da4"_ns));

  // Though the illegal character is the same, the whole string is different
  // so the hash is different.
  input = u"?"_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"bd0bf74a"_ns));

  // The name must not start with a dot.
  input = u".test"_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"41a1a959"_ns));

  // The name must not end with a dot.
  input = u"test."_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"test4fe8d9d9"_ns));

  // The name must not end with a tilde.
  input = u"test~"_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"test7ddbdda9"_ns));

  // The name must not end with a space.
  input = u"test "_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"testdb1185fb"_ns));

  // The name must not exceed 55 characters. It is truncated and a hash placed
  // at the end.
  input = u"test TEST test TEST test TEST test TEST test TEST test TEST"_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(
      u"test TEST test TEST test TEST test TEST test TEa2bbf4d7"_ns));

  // No hashing necessary with this non-ASCII character. It used to be
  // different on Windows.
  input = u"test π"_ns;
  ASSERT_TRUE(NS_MsgHashIfNecessary(input).Equals(u"test π"_ns));
}
