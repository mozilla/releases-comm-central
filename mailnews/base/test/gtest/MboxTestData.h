/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_TEST_GTEST_MBOXTESTDATA_H_
#define COMM_MAILNEWS_BASE_TEST_GTEST_MBOXTESTDATA_H_

#include "nsString.h"
#include "nsTArray.h"

// Test cases for use by both mbox reading and mbox writing.

namespace testing {

struct MboxCase {
  nsCString mbox;
  CopyableTArray<nsCString> expectedMsgs;
};

extern nsTArray<MboxCase> mboxValidCases;
extern nsTArray<MboxCase> mboxOddCases;
extern nsTArray<MboxCase> mboxAmbiguities;

}  // namespace testing

#endif  // COMM_MAILNEWS_BASE_TEST_GTEST_MBOXTESTDATA_H_
