/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/mailnews/MsgSubjectUtils.h"
#include "nsCOMPtr.h"
#include "nsString.h"

// Invocation:
// $ ./mach gtest "TestStripSubjectReplyPrefixes.*"

using mozilla::Preferences;

#define STRING_SIZE 255
struct testInfo {
  char encodedInput[STRING_SIZE];
  char expectedOutput[STRING_SIZE];
  bool expectedDidModify;
};

int testStripSubjectReplyPrefixes(const char* input, char* expectedOutput,
                                  bool expectedDidModify) {
  nsCString subject(input);
  bool didModify = mozilla::mailnews::StripSubjectReplyPrefixes(subject);

  // make sure we got the right results
  if (didModify != expectedDidModify) return 2;

  if (strcmp(expectedOutput, subject.get())) {
    return 3;
  }

  // test passed
  return 0;
}

// int main(int argc, char** argv)
TEST(TestStripSubjectReplyPrefixes, Main)
{
  // set localizedRe pref, value "SV,ÆØÅ",
  // \xC3\x86, \xC3\x98 and \xC3\x85 are the UTF-8 encodings of Æ, Ø and Å.
  nsresult rv = Preferences::SetCString("mailnews.localizedRe",
                                        "SV,\xC3\x86\xC3\x98\xC3\x85"_ns);
  EXPECT_TRUE(NS_SUCCEEDED(rv));

  // run our tests
  struct testInfo testInfoStructs[] = {
      {"SV: \xC3\x86"
       "blegr\xC3\xB8"
       "d",
       "\xC3\x86"
       "blegr\xC3\xB8"
       "d",
       true},
      {"\xC3\x86\xC3\x98\xC3\x85: Foo bar", "Foo bar", true},
      {"Re[2]: Re: topic", "topic", true},
      {"Re[2: topic", "Re[2: topic", false}};

  bool allTestsPassed = true;
  int result;
  for (unsigned int i = 0; i < std::size(testInfoStructs); i++) {
    result = testStripSubjectReplyPrefixes(
        testInfoStructs[i].encodedInput, testInfoStructs[i].expectedOutput,
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
