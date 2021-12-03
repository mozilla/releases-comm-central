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
  make_new_sets_in_folder,
  mc,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

// Get original preference value
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var prefName = "mail.advance_on_spacebar";
var prefValue = Services.prefs.getBoolPref(prefName);

add_task(function setupModule(module) {
  // Create four unread messages in a sample folder
  let folder = create_folder("Sample");
  make_new_sets_in_folder(folder, [{ count: 4 }]);
  be_in_folder(folder);
});

registerCleanupFunction(function teardownModule(module) {
  // Restore original preference value
  Services.prefs.setBoolPref(prefName, prefValue);
});

/**
 * The second of four simple messages is selected and [Shift-]Space is
 * pressed to determine if focus changes to a new message.
 *
 * @param aAdvance whether to advance
 * @param aShift whether to press Shift key
 */
function subtest_advance_on_spacebar(aAdvance, aShift) {
  // Set preference
  Services.prefs.setBoolPref(prefName, aAdvance);
  // Select the second message
  let oldmessage = select_click_row(1);
  wait_for_message_display_completion(mc);
  // Press [Shift-]Space
  EventUtils.synthesizeKey(" ", { shiftKey: aShift });
  // Check that message focus changes iff aAdvance is true
  let newmessage = mc.folderDisplay.selectedMessage;
  aAdvance
    ? Assert.notEqual(oldmessage, newmessage)
    : Assert.equal(oldmessage, newmessage);
}

/**
 * Test that focus remains on current message when preference is false
 * and spacebar is pressed.
 */
add_task(function test_noadvance_on_space() {
  subtest_advance_on_spacebar(false, false);
});

/**
 * Test that focus remains on current message when preference is false
 * and shift-spacebar is pressed.
 */
add_task(function test_noadvance_on_shiftspace() {
  subtest_advance_on_spacebar(false, true);
});

/**
 * Test that focus advances to next message when preference is true
 * and spacebar is pressed.
 */
add_task(function test_advance_on_space() {
  subtest_advance_on_spacebar(true, false);
});

/**
 * Test that focus advances to previous message when preference is true
 * and shift-spacebar is pressed.
 */
add_task(function test_advance_on_shiftspace() {
  subtest_advance_on_spacebar(true, true);
});
