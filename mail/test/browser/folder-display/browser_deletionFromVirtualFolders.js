/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that deleting messages works from a virtual folder.
 */

"use strict";

var {
  assert_messages_in_view,
  assert_selected_and_displayed,
  assert_tab_titled_from,
  be_in_folder,
  create_folder,
  get_smart_folder_named,
  inboxFolder,
  make_new_sets_in_folder,
  mc,
  open_selected_message_in_new_tab,
  open_selected_message_in_new_window,
  press_delete,
  select_click_row,
  switch_tab,
  wait_for_all_messages_to_load,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  plan_for_modal_dialog,
  plan_for_window_close,
  wait_for_modal_dialog,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { MailViewConstants } = ChromeUtils.import(
  "resource:///modules/MailViewManager.jsm"
);

var baseFolder, folder, lastMessageFolder;

var tabFolder, tabMessage, tabMessageBackground, curMessage, nextMessage;

var setNormal;

/**
 * The message window controller.
 */
var msgc;

add_task(function setupModule(module) {
  baseFolder = create_folder("DeletionFromVirtualFoldersA");
  // For setTagged, we want exactly as many messages as we plan to delete, so
  // that we can test that the message window and tabs close when they run out
  // of things to display.
  let [, setTagged] = make_new_sets_in_folder(baseFolder, [
    { count: 4 },
    { count: 4 },
  ]);
  setTagged.addTag("$label1"); // Important, by default
  // We depend on the count for this, too
  [setNormal] = make_new_sets_in_folder(inboxFolder, [{ count: 4 }]);

  // Add the view picker to the toolbar
  let toolbar = mc.e("mail-bar3");
  toolbar.insertItem("mailviews-container", null);
  Assert.ok(mc.e("mailviews-container"));
});

// Check whether this message is displayed in the folder tab
var VERIFY_FOLDER_TAB = 0x1;
// Check whether this message is displayed in the foreground message tab
var VERIFY_MESSAGE_TAB = 0x2;
// Check whether this message is displayed in the background message tab
var VERIFY_BACKGROUND_MESSAGE_TAB = 0x4;
// Check whether this message is displayed in the message window
var VERIFY_MESSAGE_WINDOW = 0x8;
var VERIFY_ALL = 0xf;

/**
 * Verify that the message is displayed in the given tabs. The index is
 * optional.
 */
function _verify_message_is_displayed_in(aFlags, aMessage, aIndex) {
  if (aFlags & VERIFY_FOLDER_TAB) {
    switch_tab(tabFolder);
    assert_selected_and_displayed(aMessage);
    if (aIndex !== undefined) {
      assert_selected_and_displayed(aIndex);
    }
  }
  if (aFlags & VERIFY_MESSAGE_TAB) {
    // Verify the title first
    assert_tab_titled_from(tabMessage, aMessage);
    switch_tab(tabMessage);
    // Verify the title again, just in case
    assert_tab_titled_from(tabMessage, aMessage);
    assert_selected_and_displayed(aMessage);
    if (aIndex !== undefined) {
      assert_selected_and_displayed(aIndex);
    }
  }
  if (aFlags & VERIFY_BACKGROUND_MESSAGE_TAB) {
    // Only verify the title
    assert_tab_titled_from(tabMessageBackground, aMessage);
  }
  if (aFlags & VERIFY_MESSAGE_WINDOW) {
    assert_selected_and_displayed(msgc, aMessage);
    if (aIndex !== undefined) {
      assert_selected_and_displayed(msgc, aIndex);
    }
  }
}

add_task(function test_create_virtual_folders() {
  be_in_folder(baseFolder);

  // Apply the mail view
  mc.window.RefreshAllViewPopups(mc.e("viewPickerPopup"));
  mc.window.ViewChange(":$label1");
  wait_for_all_messages_to_load();

  // - save it
  plan_for_modal_dialog(
    "mailnews:virtualFolderProperties",
    subtest_save_mail_view
  );
  // we have to use value here because the option mechanism is not sophisticated
  //  enough.
  mc.window.ViewChange(MailViewConstants.kViewItemVirtual);
  wait_for_modal_dialog("mailnews:virtualFolderProperties");
});

function subtest_save_mail_view(savc) {
  savc.window.onOK();
}

async function _open_first_message() {
  // Enter the folder and open a message
  tabFolder = be_in_folder(folder);
  curMessage = select_click_row(0);
  assert_selected_and_displayed(curMessage);

  // Open the tab with the message
  tabMessage = open_selected_message_in_new_tab();
  assert_selected_and_displayed(curMessage);
  assert_tab_titled_from(tabMessage, curMessage);

  switch_tab(tabFolder);

  // Open another tab with the message, this time in the background
  tabMessageBackground = open_selected_message_in_new_tab(true);
  assert_tab_titled_from(tabMessageBackground, curMessage);

  // Open the window with the message
  switch_tab(tabFolder);
  msgc = await open_selected_message_in_new_window();
  assert_selected_and_displayed(msgc, curMessage);
}

add_task(async function test_open_first_message_in_virtual_folder() {
  folder = baseFolder.getChildNamed(baseFolder.prettyName + "-Important");
  if (!folder) {
    throw new Error("DeletionFromVirtualFoldersA-Important was not created!");
  }

  await _open_first_message();
});

/**
 * Perform a deletion from the folder tab, verify the others update correctly
 * (advancing to the next message).
 */
add_task(function test_delete_from_virtual_folder_in_folder_tab() {
  // - plan to end up on the guy who is currently at index 1
  curMessage = mc.dbView.getMsgHdrAt(1);
  // while we're at it, figure out who is at 2 for the next step
  nextMessage = mc.dbView.getMsgHdrAt(2);
  // - delete the message
  press_delete();

  // - verify all displays
  _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Perform a deletion from the message tab, verify the others update correctly
 *  (advancing to the next message).
 */
add_task(function test_delete_from_virtual_folder_in_message_tab() {
  switch_tab(tabMessage);
  // nextMessage is the guy we want to see once the delete completes.
  press_delete();
  curMessage = nextMessage;

  // - verify all displays
  _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);

  // figure out the next guy...
  nextMessage = mc.dbView.getMsgHdrAt(1);
  if (!nextMessage) {
    throw new Error("We ran out of messages early?");
  }
});

/**
 * Perform a deletion from the message window, verify the others update
 *  correctly (advancing to the next message).
 */
add_task(function test_delete_from_virtual_folder_in_message_window() {
  // - delete
  press_delete(msgc);
  curMessage = nextMessage;
  // - verify all displays
  _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Delete the last message in that folder, which should close all message
 *  displays.
 */
add_task(
  function test_delete_last_message_from_virtual_folder_closes_message_displays() {
    // - since we have both foreground and background message tabs, we don't need
    // to open yet another tab to test

    // - prep for the message window disappearing
    plan_for_window_close(msgc);

    // - let's arbitrarily perform the deletion on this message tab
    switch_tab(tabMessage);
    press_delete();

    // - the message window should have gone away...
    // (this also helps ensure that the 3pane gets enough event loop time to do
    //  all that it needs to accomplish)
    wait_for_window_close(msgc);
    msgc = null;

    // - and we should now be on the folder tab and there should be no other tabs
    if (mc.tabmail.tabInfo.length != 1) {
      throw new Error("There should only be one tab left!");
    }
    // the below check is implied by the previous check if things are sane-ish
    if (mc.tabmail.currentTabInfo != tabFolder) {
      throw new Error("We should be on the folder tab!");
    }
  }
);

/**
 * Open the first message in the smart inbox.
 */
add_task(async function test_open_first_message_in_smart_inbox() {
  // Show the smart folders view.
  mc.folderTreeView.activeModes = "smart";
  // Select the smart inbox
  folder = get_smart_folder_named("Inbox");
  be_in_folder(folder);
  assert_messages_in_view(setNormal);
  // Open the first message
  await _open_first_message();
});

/**
 * Perform a deletion from the folder tab, verify the others update correctly
 * (advancing to the next message).
 */
add_task(function test_delete_from_smart_inbox_in_folder_tab() {
  // - plan to end up on the guy who is currently at index 1
  curMessage = mc.dbView.getMsgHdrAt(1);
  // while we're at it, figure out who is at 2 for the next step
  nextMessage = mc.dbView.getMsgHdrAt(2);
  // - delete the message
  press_delete();

  // - verify all displays
  _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Perform a deletion from the message tab, verify the others update correctly
 *  (advancing to the next message).
 */
add_task(function test_delete_from_smart_inbox_in_message_tab() {
  switch_tab(tabMessage);
  // nextMessage is the guy we want to see once the delete completes.
  press_delete();
  curMessage = nextMessage;

  // - verify all displays
  _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);

  // figure out the next guy...
  nextMessage = mc.dbView.getMsgHdrAt(1);
  if (!nextMessage) {
    throw new Error("We ran out of messages early?");
  }
});

/**
 * Perform a deletion from the message window, verify the others update
 *  correctly (advancing to the next message).
 */
add_task(function test_delete_from_smart_inbox_in_message_window() {
  // - delete
  press_delete(msgc);
  curMessage = nextMessage;
  // - verify all displays
  _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Delete the last message in that folder, which should close all message
 *  displays.
 */
add_task(
  function test_delete_last_message_from_smart_inbox_closes_message_displays() {
    // - since we have both foreground and background message tabs, we don't need
    // to open yet another tab to test

    // - prep for the message window disappearing
    plan_for_window_close(msgc);

    // - let's arbitrarily perform the deletion on this message tab
    switch_tab(tabMessage);
    press_delete();

    // - the message window should have gone away...
    // (this also helps ensure that the 3pane gets enough event loop time to do
    //  all that it needs to accomplish)
    wait_for_window_close(msgc);
    msgc = null;

    // - and we should now be on the folder tab and there should be no other tabs
    if (mc.tabmail.tabInfo.length != 1) {
      throw new Error("There should only be one tab left!");
    }
    // the below check is implied by the previous check if things are sane-ish
    if (mc.tabmail.currentTabInfo != tabFolder) {
      throw new Error("We should be on the folder tab!");
    }
  }
);

/**
 * Switch back to the all folders mode for further tests.
 */
add_task(function test_switch_back_to_all_folders_mode() {
  // The activeModes setter automatically toggles off the mode if is currently
  // visible.
  mc.folderTreeView.activeModes = "smart";

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
