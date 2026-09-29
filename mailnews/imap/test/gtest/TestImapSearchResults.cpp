/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsImapSearchResults.h"

// Invocation:
// $ ./mach gtest "TestImapSearchResults.*"

static nsTArray<ImapUid> ParseSearchLines(
    std::initializer_list<const char*> lines) {
  nsImapSearchResultSequence* sequence =
      nsImapSearchResultSequence::CreateSearchResultSequence();
  for (const char* line : lines) {
    sequence->AddSearchResultLine(line);
  }
  nsTArray<ImapUid> uids;
  nsImapSearchResultIterator iterator(*sequence);
  while (ImapUid uid = iterator.GetNextMatchUid()) {
    uids.AppendElement(uid);
  }
  delete sequence;
  return uids;
}

TEST(TestImapSearchResults, Uids)
{
  ASSERT_EQ(ParseSearchLines({"* SEARCH 1 2 3\r\n"}),
            (nsTArray<ImapUid>{1, 2, 3}));
  ASSERT_EQ(ParseSearchLines({"* SEARCH 4 5\r\n", "* SEARCH 6\r\n"}),
            (nsTArray<ImapUid>{4, 5, 6}));
  ASSERT_EQ(ParseSearchLines({"* SEARCH 7 8\n", "* SEARCH 9\n"}),
            (nsTArray<ImapUid>{7, 8, 9}));
  ASSERT_EQ(ParseSearchLines({"* SEARCH 1 2 (MODSEQ 5)\r\n"}),
            (nsTArray<ImapUid>{1, 2}));
}

TEST(TestImapSearchResults, NoUids)
{
  ASSERT_TRUE(ParseSearchLines({"* SEARCH\r\n"}).IsEmpty());
  ASSERT_TRUE(ParseSearchLines({"* SEARCH\n"}).IsEmpty());
}
