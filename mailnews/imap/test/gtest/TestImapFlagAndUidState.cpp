/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsImapFlagAndUidState.h"
#include "nsImapUtils.h"

// Invocation:
// $ ./mach gtest "TestImapFlagAndUidState.*"

static RefPtr<nsImapFlagAndUidState> CreateState() {
  return new nsImapFlagAndUidState(10);
}

static bool Has(nsImapFlagAndUidState* state, ImapUid uid) {
  bool found = false;
  EXPECT_EQ(NS_OK, state->HasMessage(uid, &found));
  return found;
}

static imapMessageFlagsType FlagsOf(nsImapFlagAndUidState* state, ImapUid uid) {
  imapMessageFlagsType flags = kNoImapMsgFlag;
  EXPECT_EQ(NS_OK, state->GetMessageFlagsByUid(uid, &flags));
  return flags;
}

static int32_t NumMessages(nsImapFlagAndUidState* state) {
  int32_t count = -1;
  EXPECT_EQ(NS_OK, state->GetNumberOfMessages(&count));
  return count;
}

static ImapUid UidAt(nsImapFlagAndUidState* state, int32_t index) {
  ImapUid uid = 0;
  EXPECT_EQ(NS_OK, state->GetUidOfMessage(index, &uid));
  return uid;
}

static imapMessageFlagsType FlagsAt(nsImapFlagAndUidState* state,
                                    int32_t index) {
  imapMessageFlagsType flags = kNoImapMsgFlag;
  EXPECT_EQ(NS_OK, state->GetMessageFlags(index, &flags));
  return flags;
}

TEST(TestImapFlagAndUidState, SequentialAdds)
{
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  state->AddUidFlagPair(10, kImapMsgSeenFlag, 0);
  state->AddUidFlagPair(15, kImapMsgAnsweredFlag, 1);
  state->AddUidFlagPair(16, kNoImapMsgFlag, 2);
  EXPECT_EQ(3, NumMessages(state));
  EXPECT_EQ(10u, UidAt(state, 0));
  EXPECT_EQ(kImapMsgSeenFlag, FlagsAt(state, 0));
  EXPECT_EQ(15u, UidAt(state, 1));
  EXPECT_EQ(kImapMsgAnsweredFlag, FlagsAt(state, 1));
  EXPECT_EQ(16u, UidAt(state, 2));
  EXPECT_EQ(kNoImapMsgFlag, FlagsAt(state, 2));
  EXPECT_EQ(0u, UidAt(state, 3));

  state->Reset();
  EXPECT_EQ(0, NumMessages(state));
}

// In a partial fetch (CONDSTORE), the server only mentions some messages.
TEST(TestImapFlagAndUidState, Gaps)
{
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  state->AddUidFlagPair(68, kImapMsgSeenFlag, 69);
  state->AddUidFlagPair(71, kImapMsgAnsweredFlag, 71);
  EXPECT_EQ(72, NumMessages(state));
  for (int32_t i = 0; i < 69; i++) {
    EXPECT_EQ(0u, UidAt(state, i));
    EXPECT_EQ(kNoImapMsgFlag, FlagsAt(state, i));
  }
  EXPECT_EQ(68u, UidAt(state, 69));
  EXPECT_EQ(kImapMsgSeenFlag, FlagsAt(state, 69));
  EXPECT_EQ(0u, UidAt(state, 70));
  EXPECT_EQ(71u, UidAt(state, 71));
  EXPECT_EQ(kImapMsgAnsweredFlag, FlagsAt(state, 71));
}

TEST(TestImapFlagAndUidState, Expunge)
{
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  state->AddUidFlagPair(10, kImapMsgSeenFlag, 0);
  state->AddUidFlagPair(15, kImapMsgDeletedFlag, 1);
  state->AddUidFlagPair(20, kImapMsgDeletedFlag, 2);
  EXPECT_EQ(2, state->NumberOfDeletedMessages());

  // The index is 1-relative here.
  EXPECT_EQ(NS_ERROR_INVALID_ARG, state->ExpungeByIndex(0));
  EXPECT_EQ(NS_ERROR_INVALID_ARG, state->ExpungeByIndex(4));
  EXPECT_EQ(3, NumMessages(state));

  EXPECT_EQ(NS_OK, state->ExpungeByIndex(2));
  EXPECT_EQ(2, NumMessages(state));
  EXPECT_EQ(10u, UidAt(state, 0));
  EXPECT_EQ(20u, UidAt(state, 1));
  EXPECT_EQ(kImapMsgDeletedFlag, FlagsAt(state, 1));
  EXPECT_EQ(1, state->NumberOfDeletedMessages());

  // This one wasn't marked as deleted.
  EXPECT_EQ(NS_OK, state->ExpungeByIndex(1));
  EXPECT_EQ(1, NumMessages(state));
  EXPECT_EQ(20u, UidAt(state, 0));
  EXPECT_EQ(1, state->NumberOfDeletedMessages());

  state->Reset();
  EXPECT_EQ(0, state->NumberOfDeletedMessages());
}

// AllocateImapUidString() leaves out messages which are gone.
TEST(TestImapFlagAndUidState, UidStringAfterExpunge)
{
  // The first message is gone.
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  state->SetPartialUIDFetch(false);
  state->AddUidFlagPair(10, kImapMsgSeenFlag, 0);
  state->AddUidFlagPair(69, kImapMsgSeenFlag, 1);
  state->AddUidFlagPair(70, kImapMsgSeenFlag, 2);
  state->AddUidFlagPair(71, kImapMsgSeenFlag, 3);
  state->ExpungeByIndex(2);
  nsTArray<ImapUid> uids = {69, 71};
  uint32_t count = uids.Length();
  nsCString uidString;
  AllocateImapUidString(uids.Elements(), count, state, uidString);
  EXPECT_STREQ("71", uidString.get());

  // A message in the middle is gone.
  state->Reset();
  state->SetPartialUIDFetch(false);
  state->AddUidFlagPair(10, kImapMsgSeenFlag, 0);
  state->AddUidFlagPair(69, kImapMsgSeenFlag, 1);
  state->AddUidFlagPair(70, kImapMsgSeenFlag, 2);
  state->AddUidFlagPair(71, kImapMsgSeenFlag, 3);
  state->AddUidFlagPair(73, kImapMsgSeenFlag, 4);
  state->ExpungeByIndex(4);
  uids = {69, 71, 73};
  count = uids.Length();
  uidString.Truncate();
  AllocateImapUidString(uids.Elements(), count, state, uidString);
  EXPECT_STREQ("69,73", uidString.get());
}

TEST(TestImapFlagAndUidState, LookupByUid)
{
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  EXPECT_FALSE(Has(state, 10));

  state->AddUidFlagPair(10, kImapMsgSeenFlag, 0);
  state->AddUidFlagPair(15, kImapMsgAnsweredFlag, 1);
  EXPECT_TRUE(Has(state, 10));
  EXPECT_FALSE(Has(state, 12));
  EXPECT_EQ(kImapMsgAnsweredFlag, FlagsOf(state, 15));
  EXPECT_EQ(kNoImapMsgFlag, FlagsOf(state, 12));

  // A message added after a lookup.
  state->AddUidFlagPair(20, kImapMsgFlaggedFlag, 2);
  EXPECT_EQ(kImapMsgFlaggedFlag, FlagsOf(state, 20));

  // Changed flags, by UID and by index.
  state->AddUidFlagPair(15, kImapMsgSeenFlag, 1);
  EXPECT_EQ(kImapMsgSeenFlag, FlagsOf(state, 15));
  state->SetMessageFlags(1, kImapMsgDraftFlag);
  EXPECT_EQ(kImapMsgDraftFlag, FlagsOf(state, 15));

  state->Reset();
  EXPECT_FALSE(Has(state, 10));
  state->AddUidFlagPair(30, kImapMsgSeenFlag, 0);
  EXPECT_FALSE(Has(state, 20));
  EXPECT_EQ(kImapMsgSeenFlag, FlagsOf(state, 30));
}

TEST(TestImapFlagAndUidState, LookupByUidWithGaps)
{
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  state->AddUidFlagPair(10, kImapMsgSeenFlag, 2);
  state->AddUidFlagPair(70, kImapMsgAnsweredFlag, 5);
  state->AddUidFlagPair(90, kImapMsgFlaggedFlag, 9);
  EXPECT_FALSE(Has(state, 0));
  EXPECT_EQ(kImapMsgSeenFlag, FlagsOf(state, 10));
  EXPECT_EQ(kImapMsgAnsweredFlag, FlagsOf(state, 70));
  EXPECT_EQ(kImapMsgFlaggedFlag, FlagsOf(state, 90));

  // Fill a gap after a lookup.
  EXPECT_FALSE(Has(state, 40));
  state->AddUidFlagPair(40, kImapMsgDraftFlag, 4);
  EXPECT_EQ(kImapMsgDraftFlag, FlagsOf(state, 40));
  EXPECT_EQ(kImapMsgAnsweredFlag, FlagsOf(state, 70));
}

TEST(TestImapFlagAndUidState, LookupByUidAfterExpunge)
{
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  state->AddUidFlagPair(10, kImapMsgSeenFlag, 0);
  state->AddUidFlagPair(15, kImapMsgAnsweredFlag, 1);
  state->AddUidFlagPair(20, kImapMsgFlaggedFlag, 2);
  EXPECT_TRUE(Has(state, 15));

  // The index is 1-relative here.
  state->ExpungeByIndex(2);
  EXPECT_FALSE(Has(state, 15));
  EXPECT_EQ(kImapMsgSeenFlag, FlagsOf(state, 10));
  EXPECT_EQ(kImapMsgFlaggedFlag, FlagsOf(state, 20));
  state->SetMessageFlags(1, kImapMsgDraftFlag);
  EXPECT_EQ(kImapMsgDraftFlag, FlagsOf(state, 20));
}

// Servers should not do this, but the first index wins if they do.
TEST(TestImapFlagAndUidState, LookupByUidOfConfusedServer)
{
  RefPtr<nsImapFlagAndUidState> state = CreateState();
  state->AddUidFlagPair(10, kImapMsgSeenFlag, 1);
  state->AddUidFlagPair(10, kImapMsgAnsweredFlag, 3);
  EXPECT_EQ(kImapMsgSeenFlag, FlagsOf(state, 10));

  // A lower index, then a higher one.
  state->AddUidFlagPair(10, kImapMsgFlaggedFlag, 0);
  EXPECT_EQ(kImapMsgFlaggedFlag, FlagsOf(state, 10));
  state->AddUidFlagPair(10, kImapMsgDraftFlag, 2);
  EXPECT_EQ(kImapMsgFlaggedFlag, FlagsOf(state, 10));

  // Another message takes over the index.
  state->AddUidFlagPair(11, kImapMsgDraftFlag, 0);
  EXPECT_EQ(kImapMsgDraftFlag, FlagsOf(state, 11));
  EXPECT_EQ(kImapMsgSeenFlag, FlagsOf(state, 10));
  state->AddUidFlagPair(12, kImapMsgDraftFlag, 1);
  state->AddUidFlagPair(13, kImapMsgDraftFlag, 2);
  state->AddUidFlagPair(14, kImapMsgDraftFlag, 3);
  EXPECT_FALSE(Has(state, 10));
}
