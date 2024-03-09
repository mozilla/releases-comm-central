/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the space bar only advances to the next unread message
 * when mail.advance_on_spacebar is true (default).
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  get_about_message,
  make_message_sets_in_folders,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

// Get original preference value.
var prefName = "mail.advance_on_spacebar";
var prefValue = Services.prefs.getBoolPref(prefName);

add_setup(async function () {
  // Create four unread messages in a sample folder.
  const folder = await create_folder("Sample");
  await make_message_sets_in_folders([folder], [{ count: 4 }]);
  await be_in_folder(folder);
});

registerCleanupFunction(function () {
  // Restore original preference value.
  Services.prefs.setBoolPref(prefName, prefValue);
});

/**
 * The second of four simple messages is selected and [Shift-]Space is
 * pressed to determine if focus changes to a new message.
 *
 * @param {boolean} shouldAdvance - Whether the selection should advance.
 * @param {boolean} isShiftPressed - Whether to press Shift key.
 */
async function subtest_advance_on_spacebar(shouldAdvance, isShiftPressed) {
  // Set preference.
  Services.prefs.setBoolPref(prefName, shouldAdvance);
  // Select the second message.
  const oldMessage = await select_click_row(1);
  await wait_for_message_display_completion(window);
  // Press [Shift-]Space.
  EventUtils.synthesizeKey(
    " ",
    { shiftKey: isShiftPressed },
    get_about_message()
  );
  // Check that message focus changes if `shouldAdvance` is true.
  const newMessage = get_about_message().gMessage;
  shouldAdvance
    ? Assert.notEqual(oldMessage, newMessage)
    : Assert.equal(oldMessage, newMessage);
}

/**
 * Test that focus remains on current message when preference is false
 * and spacebar is pressed.
 */
add_task(async function test_noadvance_on_space() {
  await subtest_advance_on_spacebar(false, false);
});

/**
 * Test that focus remains on current message when preference is false
 * and shift-spacebar is pressed.
 */
add_task(async function test_noadvance_on_shiftspace() {
  await subtest_advance_on_spacebar(false, true);
});

/**
 * Test that focus advances to next message when preference is true
 * and spacebar is pressed.
 */
add_task(async function test_advance_on_space() {
  await subtest_advance_on_spacebar(true, false);
});

/**
 * Test that focus advances to previous message when preference is true
 * and shift-spacebar is pressed.
 */
add_task(async function test_advance_on_shiftspace() {
  await subtest_advance_on_spacebar(true, true);
});
