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
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { delete_mail_marked_as_junk, mark_selected_messages_as_junk } =
  ChromeUtils.import("resource://testing-common/mozmill/JunkHelpers.jsm");

// One folder's enough
var folder = null;

add_setup(async function () {
  folder = await create_folder("JunkCommandsA");
  await make_message_sets_in_folders([folder], [{ count: 30 }]);
});

/**
 * The number of messages to mark as junk and expect to be deleted.
 */
var NUM_MESSAGES_TO_JUNK = 8;

/**
 * Helper to check whether a folder has the right number of messages.
 *
 * @param aFolder the folder to check
 * @param aNumMessages the number of messages the folder should contain.
 */
function _assert_folder_total_messages(aFolder, aNumMessages) {
  const curMessages = aFolder.getTotalMessages(false);
  if (curMessages != aNumMessages) {
    throw new Error(
      "The folder " +
        aFolder.prettyName +
        " should have " +
        aNumMessages +
        " messages, but actually has " +
        curMessages +
        " messages."
    );
  }
}

/**
 * Test deleting junk messages with no messages marked as junk.
 */
add_task(async function test_delete_no_junk_messages() {
  const initialNumMessages = folder.getTotalMessages(false);
  await be_in_folder(folder);
  await select_none();
  await delete_mail_marked_as_junk(0);
  // Check if we still have the same number of messages
  _assert_folder_total_messages(folder, initialNumMessages);
});

/**
 * Test deleting junk messages with some messages marked as junk.
 */
add_task(async function test_delete_junk_messages() {
  const initialNumMessages = folder.getTotalMessages(false);
  await be_in_folder(folder);
  await select_click_row(1);
  const selectedMessages = await select_shift_click_row(NUM_MESSAGES_TO_JUNK);
  Assert.equal(
    selectedMessages.length,
    NUM_MESSAGES_TO_JUNK,
    `should have selected correct number of msgs`
  );
  // Mark these messages as junk
  mark_selected_messages_as_junk();
  // Now delete junk mail
  await delete_mail_marked_as_junk(NUM_MESSAGES_TO_JUNK);
  // Check that we have the right number of messages left
  _assert_folder_total_messages(
    folder,
    initialNumMessages - NUM_MESSAGES_TO_JUNK
  );
  // Check that none of the message keys exist any more
  const db = folder.getDBFolderInfoAndDB({});
  for (const msgHdr of selectedMessages) {
    const key = msgHdr.messageKey;
    if (db.containsKey(key)) {
      throw new Error(
        "The database shouldn't contain key " + key + ", but does."
      );
    }
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
