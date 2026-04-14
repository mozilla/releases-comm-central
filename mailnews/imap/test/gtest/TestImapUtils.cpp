/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsImapUtils.h"
#include "nsImapMailFolder.h"

// Invocation:
// $ ./mach gtest "TestImapUtils.*"

// Test AllocateImapUidString() and ParseUidString.
TEST(TestImapUtils, ImapUidSets)
{
  static const struct {
    nsTArray<ImapUid> uids;   // Individual IMAP UIDs.
    nsLiteralCString uidSet;  // Uids as an IMAP UID set string.
    uint32_t count;           // Number of UIDs.
  } uidTests[] = {
      {{42}, "42"_ns, 1},
      {{1, 2, 3, 4, 5}, "1:5"_ns, 5},
      {{10, 20, 30}, "10,20,30"_ns, 3},
      {{1, 2, 3, 4, 5, 10, 11, 12}, "1:5,10:12"_ns, 8},
      // Preserve ordering (not sure how important this is).
      {{5, 4, 3, 2, 1}, "5,4,3,2,1"_ns, 5},
  };

  // Test AllocateImapUidString().
  for (auto const& t : uidTests) {
    nsCString got;
    uint32_t count = t.count;
    AllocateImapUidString(t.uids.Elements(), count, nullptr, got);
    ASSERT_EQ(t.uidSet, got);
    ASSERT_EQ(t.count, count);  // Shouldn't be clipped.
  }

  // Test ParseUidString().
  for (auto const& t : uidTests) {
    nsTArray<ImapUid> gotUids;
    ParseUidString(t.uidSet.get(), gotUids);
    ASSERT_EQ(t.uids, gotUids);
  }
}

// Test nsImapMailFolder::AllocateUidStringFromKeys().
TEST(TestImapUtils, AllocateUidStringFromKeys)
{
  static const struct {
    nsTArray<ImapUid> uids;   // Individual IMAP UIDs.
    nsLiteralCString uidSet;  // Uids as an IMAP UID set string.
  } uidTests[] = {
      {{42}, "42"_ns},
      {{1, 2, 3, 4, 5}, "1:5"_ns},
      {{10, 20, 30}, "10,20,30"_ns},
      {{1, 2, 3, 4, 5, 10, 11, 12}, "1:5,10:12"_ns},
      // TODO: See https://bugzilla.mozilla.org/show_bug.cgi?id=2031555
      // {{5, 4, 3, 2, 1}, "1:5"_ns},
  };

  for (auto const& t : uidTests) {
    nsCString got;
    nsImapMailFolder::AllocateUidStringFromKeys(t.uids, got);
    ASSERT_EQ(t.uidSet, got);
  }
}
