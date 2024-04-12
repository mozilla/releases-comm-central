/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  be_in_folder,
  create_folder,
  make_message_sets_in_folders,
  select_click_row,
  select_none,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { delete_mail_marked_as_junk, mark_selected_messages_as_junk } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/JunkHelpers.sys.mjs"
  );
var { GlodaMsgIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/IndexMsg.sys.mjs"
);
var { GlodaIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaIndexer.sys.mjs"
);

// One folder's enough
var folder = null;

async function indexMsgs() {
  console.info("Triggering Gloda Index");
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await TestUtils.waitForCondition(
    () => !GlodaIndexer.indexing,
    "waiting for Gloda to finish indexing",
    2000
  );
}

add_setup(async function () {
  folder = await create_folder("JunkCommandsA");
  await make_message_sets_in_folders([folder], [{ count: 30 }]);
  registerCleanupFunction(() => folder.deleteSelf(null));
});

/**
 * Test deleting junk messages with no messages marked as junk.
 */
add_task(async function test_delete_no_junk_messages() {
  const initialNumMessages = folder.getTotalMessages(false);
  await be_in_folder(folder);
  await select_none();
  await delete_mail_marked_as_junk(0);
  // Check if we still have the same number of messages
  Assert.equal(
    folder.getTotalMessages(false),
    initialNumMessages,
    "should have the same nbr of msgs"
  );
});

/**
 * Test deleting junk messages with some messages marked as junk.
 */
add_task(async function test_delete_junk_messages() {
  const initialNumMessages = folder.getTotalMessages(false);
  await be_in_folder(folder);
  await select_click_row(1);

  // The number of messages to mark as junk and expect to be deleted.
  const NUM_MESSAGES_TO_JUNK = 8;

  const selectedMessages = await select_shift_click_row(NUM_MESSAGES_TO_JUNK);
  Assert.equal(
    selectedMessages.length,
    NUM_MESSAGES_TO_JUNK,
    `should have selected correct number of msgs`
  );
  // Mark these messages as junk
  mark_selected_messages_as_junk();

  // Index messages after they have been set as junk, to get around the error
  // "Exception while attempting to mark message with gloda state afterdb commit"
  await indexMsgs();

  // Now delete junk mail
  await delete_mail_marked_as_junk(NUM_MESSAGES_TO_JUNK);
  Assert.equal(
    folder.getTotalMessages(false),
    initialNumMessages - NUM_MESSAGES_TO_JUNK,
    "should have the right number of mail left"
  );
  // Check that none of the message keys exist any more
  const db = folder.getDBFolderInfoAndDB({});
  for (const msgHdr of selectedMessages) {
    const key = msgHdr.messageKey;
    Assert.ok(!db.containsKey(key), `db should not contain ${key}`);
  }
});
