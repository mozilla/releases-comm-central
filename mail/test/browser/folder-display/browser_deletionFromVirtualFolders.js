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
  make_message_sets_in_folders,
  open_selected_message_in_new_tab,
  open_selected_message_in_new_window,
  press_delete,
  select_click_row,
  switch_tab,
  wait_for_all_messages_to_load,
  get_about_3pane,
  get_about_message,
  delete_messages,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { promise_modal_dialog } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var { MailViewConstants } = ChromeUtils.importESModule(
  "resource:///modules/MailViewManager.sys.mjs"
);

const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

var baseFolder, folder;

var tabFolder, tabMessage, tabMessageBackground, curMessage, nextMessage;

var setNormal;

/**
 * The message window.
 * @type {Window}
 */
var msgc;

add_setup(async function () {
  // Make sure the whole test runs with an unthreaded view in all folders.
  Services.prefs.setIntPref("mailnews.default_view_flags", 0);

  baseFolder = await create_folder("DeletionFromVirtualFoldersA");
  // For setTagged, we want exactly as many messages as we plan to delete, so
  // that we can test that the message window and tabs close when they run out
  // of things to display.
  const [, setTagged] = await make_message_sets_in_folders(
    [baseFolder],
    [{ count: 4 }, { count: 4 }]
  );
  setTagged.addTag("$label1"); // Important, by default
  // We depend on the count for this, too
  [setNormal] = await make_message_sets_in_folders(
    [inboxFolder],
    [{ count: 4 }]
  );

  // Show the smart folders view.
  get_about_3pane().folderPane.activeModes = ["all", "smart"];

  // Add the view picker to the toolbar
  storeState({
    mail: ["view-picker"],
  });
  await BrowserTestUtils.waitForMutationCondition(
    document.getElementById("unifiedToolbarContent"),
    {
      subtree: true,
      childList: true,
    },
    () => document.querySelector("#unifiedToolbarContent .view-picker")
  );

  registerCleanupFunction(() => {
    storeState({});
    Services.prefs.clearUserPref("mailnews.default_view_flags");
    get_about_3pane().folderPane.activeModes = ["all"];
  });
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
async function _verify_message_is_displayed_in(aFlags, aMessage, aIndex) {
  if (aFlags & VERIFY_FOLDER_TAB) {
    await switch_tab(tabFolder);
    await assert_selected_and_displayed(aMessage);
    if (aIndex !== undefined) {
      await assert_selected_and_displayed(aIndex);
    }
  }
  if (aFlags & VERIFY_MESSAGE_TAB) {
    // Verify the title first
    await assert_tab_titled_from(tabMessage, aMessage);
    await switch_tab(tabMessage);
    // Verify the title again, just in case
    await assert_tab_titled_from(tabMessage, aMessage);
    await assert_selected_and_displayed(aMessage);
    if (aIndex !== undefined) {
      await assert_selected_and_displayed(aIndex);
    }
  }
  if (aFlags & VERIFY_BACKGROUND_MESSAGE_TAB) {
    // Only verify the title
    await assert_tab_titled_from(tabMessageBackground, aMessage);
  }
  if (aFlags & VERIFY_MESSAGE_WINDOW) {
    await assert_selected_and_displayed(msgc, aMessage);
    if (aIndex !== undefined) {
      await assert_selected_and_displayed(msgc, aIndex);
    }
  }
}

add_task(async function test_create_virtual_folders() {
  await be_in_folder(baseFolder);

  // Apply the mail view
  window.RefreshAllViewPopups(
    document.getElementById("toolbarViewPickerPopup")
  );
  window.ViewChange(":$label1");
  await wait_for_all_messages_to_load();

  // - save it
  const dialogPromise = promise_modal_dialog(
    "mailnews:virtualFolderProperties",
    subtest_save_mail_view
  );
  // we have to use value here because the option mechanism is not sophisticated
  //  enough.
  window.ViewChange(MailViewConstants.kViewItemVirtual);
  await dialogPromise;
});

function subtest_save_mail_view(savc) {
  savc.document.querySelector("dialog").acceptDialog();
}

async function _open_first_message() {
  // Enter the folder and open a message
  tabFolder = await be_in_folder(folder);
  curMessage = await select_click_row(0);
  await assert_selected_and_displayed(curMessage);

  // Open the tab with the message
  tabMessage = await open_selected_message_in_new_tab();
  await assert_selected_and_displayed(curMessage);
  await assert_tab_titled_from(tabMessage, curMessage);

  await switch_tab(tabFolder);

  // Open another tab with the message, this time in the background
  tabMessageBackground = await open_selected_message_in_new_tab(true);
  await assert_tab_titled_from(tabMessageBackground, curMessage);

  // Open the window with the message
  await switch_tab(tabFolder);
  msgc = await open_selected_message_in_new_window();
  await assert_selected_and_displayed(msgc, curMessage);
}

add_task(async function test_open_first_message_in_virtual_folder() {
  folder = baseFolder.getChildNamed(baseFolder.prettyName + "-Important");
  Assert.ok(folder, "DeletionFromVirtualFoldersA-Important was not created!");

  await _open_first_message();
});

/**
 * Perform a deletion from the folder tab, verify the others update correctly
 * (advancing to the next message).
 */
add_task(async function test_delete_from_virtual_folder_in_folder_tab() {
  const { gDBView } = get_about_3pane();
  // - plan to end up on the guy who is currently at index 1
  curMessage = gDBView.getMsgHdrAt(1);
  // while we're at it, figure out who is at 2 for the next step
  nextMessage = gDBView.getMsgHdrAt(2);
  // - delete the message
  await press_delete();

  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Perform a deletion from the message tab, verify the others update correctly
 *  (advancing to the next message).
 */
add_task(async function test_delete_from_virtual_folder_in_message_tab() {
  await switch_tab(tabMessage);
  // nextMessage is the guy we want to see once the delete completes.
  await press_delete();
  curMessage = nextMessage;

  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);

  const { gDBView } = get_about_message();
  // figure out the next guy...
  nextMessage = gDBView.getMsgHdrAt(1);
  Assert.ok(nextMessage, "We ran out of messages early?");
});

/**
 * Perform a deletion from the message window, verify the others update
 *  correctly (advancing to the next message).
 */
add_task(async function test_delete_from_virtual_folder_in_message_window() {
  // - delete
  await press_delete(msgc);
  curMessage = nextMessage;
  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Delete the last message in that folder, which should close all message
 *  displays.
 */
add_task(
  async function test_delete_last_message_from_virtual_folder_closes_message_displays() {
    // - since we have both foreground and background message tabs, we don't need
    // to open yet another tab to test

    // - prep for the message window disappearing
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);

    // - let's arbitrarily perform the deletion on this message tab
    await switch_tab(tabMessage);
    await press_delete();

    // - the message window should have gone away...
    // (this also helps ensure that the 3pane gets enough event loop time to do
    //  all that it needs to accomplish)
    await closePromise;
    msgc = null;

    // - and we should now be on the folder tab and there should be no other tabs
    Assert.equal(
      document.getElementById("tabmail").tabInfo.length,
      1,
      "There should only be one tab left!"
    );
    // the below check is implied by the previous check if things are sane-ish
    Assert.deepEqual(
      document.getElementById("tabmail").currentTabInfo,
      tabFolder,
      "We should be on the folder tab!"
    );
  }
);

/**
 * Open the first message in the smart inbox.
 */
add_task(async function test_open_first_message_in_smart_inbox() {
  // Select the smart inbox
  folder = get_smart_folder_named("Inbox");
  await be_in_folder(folder);
  assert_messages_in_view(setNormal);
  // Open the first message
  await _open_first_message();
});

/**
 * Perform a deletion from the folder tab, verify the others update correctly
 * (advancing to the next message).
 */
add_task(async function test_delete_from_smart_inbox_in_folder_tab() {
  const { gDBView } = get_about_3pane();
  // - plan to end up on the guy who is currently at index 1
  curMessage = gDBView.getMsgHdrAt(1);
  // while we're at it, figure out who is at 2 for the next step
  nextMessage = gDBView.getMsgHdrAt(2);
  // - delete the message
  await press_delete();

  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Perform a deletion from the message tab, verify the others update correctly
 *  (advancing to the next message).
 */
add_task(async function test_delete_from_smart_inbox_in_message_tab() {
  await switch_tab(tabMessage);
  // nextMessage is the guy we want to see once the delete completes.
  await press_delete();
  curMessage = nextMessage;

  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);

  const { gDBView } = get_about_message();
  // figure out the next guy...
  nextMessage = gDBView.getMsgHdrAt(1);
  Assert.ok(nextMessage, "We ran out of messages early?");
});

/**
 * Perform a deletion from the message window, verify the others update
 *  correctly (advancing to the next message).
 */
add_task(async function test_delete_from_smart_inbox_in_message_window() {
  // - delete
  await press_delete(msgc);
  curMessage = nextMessage;
  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Delete the last message in that folder, which should close all message
 *  displays.
 */
add_task(
  async function test_delete_last_message_from_smart_inbox_closes_message_displays() {
    // - since we have both foreground and background message tabs, we don't need
    // to open yet another tab to test

    // - prep for the message window disappearing
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);

    // - let's arbitrarily perform the deletion on this message tab
    await switch_tab(tabMessage);
    await press_delete();

    // - the message window should have gone away...
    // (this also helps ensure that the 3pane gets enough event loop time to do
    //  all that it needs to accomplish)
    await closePromise;
    msgc = null;

    // - and we should now be on the folder tab and there should be no other tabs
    Assert.equal(
      document.getElementById("tabmail").tabInfo.length,
      1,
      "There should only be one tab left!"
    );
    // the below check is implied by the previous check if things are sane-ish
    Assert.deepEqual(
      document.getElementById("tabmail").currentTabInfo,
      tabFolder,
      "We should be on the folder tab!"
    );
  }
);
