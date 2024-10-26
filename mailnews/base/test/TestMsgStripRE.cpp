/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/ArrayUtils.h"
#include "nsCOMPtr.h"
#include "nsMsgUtils.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsISupportsPrimitives.h"
#include "nsString.h"

#define STRING_SIZE 255
struct testInfo {
  char encodedInput[STRING_SIZE];
  char expectedOutput[STRING_SIZE];
  bool expectedDidModify;
};

int testStripRe(const char* encodedInput, char* expectedOutput,
                bool expectedDidModify) {
  // call NS_StripRE with the appropriate args
  nsCString modifiedSubject;
  bool didModify;
  didModify = NS_MsgStripRE(nsDependentCString(encodedInput), modifiedSubject);

  // make sure we got the right results
  if (didModify != expectedDidModify) return 2;

  if (didModify) {
    if (strcmp(expectedOutput, modifiedSubject.get())) {
      return 3;
    }
  } else if (strcmp(expectedOutput, encodedInput)) {
    return 4;
  }

  // test passed
  return 0;
}

// int main(int argc, char** argv)
TEST(TestMsgStripRE, TestMsgStripREMain)
{
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  EXPECT_TRUE(NS_SUCCEEDED(rv));

  // set localizedRe pref, value "SV,ÆØÅ",
  // \xC3\x86, \xC3\x98 and \xC3\x85 are the UTF-8 encodings of Æ, Ø and Å.
  rv = prefBranch->SetStringPref("mailnews.localizedRe",
                                 "SV,\xC3\x86\xC3\x98\xC3\x85"_ns);
  EXPECT_TRUE(NS_SUCCEEDED(rv));

  // run our tests
  struct testInfo testInfoStructs[] = {
      // Note that re-encoding always happens in UTF-8.
      {"SV: =?ISO-8859-1?Q?=C6blegr=F8d?=", "=?UTF-8?B?w4ZibGVncsO4ZA==?=",
       true},
      {"=?ISO-8859-1?Q?SV=3A=C6blegr=F8d?=", "=?UTF-8?B?w4ZibGVncsO4ZA==?=",
       true},

      // Note that in the next two tests, the only ISO-8859-1 chars are in the
      // localizedRe piece, so once they've been stripped, the re-encoding
      // process simply writes out ASCII rather than an ISO-8859-1 encoded
      // string with no actual ISO-8859-1 special characters, which seems
      // reasonable.
      {"=?ISO-8859-1?Q?=C6=D8=C5=3A_Foo_bar?=", "Foo bar", true},
      {"=?ISO-8859-1?Q?=C6=D8=C5=3AFoo_bar?=", "Foo bar", true}};

  bool allTestsPassed = true;
  int result;
  for (unsigned int i = 0; i < MOZ_ARRAY_LENGTH(testInfoStructs); i++) {
    result = testStripRe(testInfoStructs[i].encodedInput,
                         testInfoStructs[i].expectedOutput,
                         testInfoStructs[i].expectedDidModify);
    if (result) {
      printf("Failed: %s, i=%d | result=%d\n", __FILE__, i, result);
      allTestsPassed = false;
    }
    EXPECT_TRUE(result == 0);
  }

  if (allTestsPassed) {
    printf("all tests passed\n");
  }
  EXPECT_TRUE(allTestsPassed);
}
