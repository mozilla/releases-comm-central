/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "mark_selected_messages_as_junk",
  "delete_mail_marked_as_junk",
];

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var {
  mc,
  get_about_3pane,
  plan_to_wait_for_folder_events,
  wait_for_message_display_completion,
  wait_for_folder_events,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

/**
 * Mark the selected messages as junk. This is done by pressing the J key.
 */
function mark_selected_messages_as_junk() {
  get_about_3pane().document.getElementById("threadTree").focus();
  EventUtils.synthesizeKey("j", {}, mc);
}

/**
 * Delete all mail marked as junk in the selected folder. This is done by
 * activating the menu option from the Tools menu.
 *
 * @param aNumDeletesExpected The number of deletes expected.
 */
async function delete_mail_marked_as_junk(aNumDeletesExpected) {
  const about3Pane = get_about_3pane();

  // Monkey patch and wrap around the deleteJunkInFolder function, mainly for
  // the case where deletes aren't expected.
  const realDeleteJunkInFolder = about3Pane.deleteJunkInFolder;
  let numMessagesDeleted = null;
  const fakeDeleteJunkInFolder = function () {
    numMessagesDeleted = realDeleteJunkInFolder();
    return numMessagesDeleted;
  };
  try {
    about3Pane.deleteJunkInFolder = fakeDeleteJunkInFolder;

    // If something is loading, make sure it finishes loading...
    await wait_for_message_display_completion();
    if (aNumDeletesExpected != 0) {
      plan_to_wait_for_folder_events(
        "DeleteOrMoveMsgCompleted",
        "DeleteOrMoveMsgFailed"
      );
    }

    about3Pane.goDoCommand("cmd_deleteJunk");

    if (aNumDeletesExpected != 0) {
      await wait_for_folder_events();
    }

    // If timeout waiting for numMessagesDeleted to turn non-null,
    // this either means that deleteJunkInFolder didn't get called or that it
    // didn't return a value."

    await TestUtils.waitForCondition(
      () => numMessagesDeleted === aNumDeletesExpected,
      `Should have got ${aNumDeletesExpected} deletes, not ${numMessagesDeleted}`
    );
  } finally {
    about3Pane.deleteJunkInFolder = realDeleteJunkInFolder;
  }
}
