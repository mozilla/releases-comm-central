/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that deleting a message in a given tab or window properly updates both
 *  that tab/window as well as all other tabs/windows.  We also test that the
 *  message tab title updates appropriately through all of this. We do all of
 *  this both for tabs that have ever been opened in the foreground, and tabs
 *  that haven't (and thus might have fake selections).
 */

"use strict";

var {
  assert_selected_and_displayed,
  assert_tab_titled_from,
  be_in_folder,
  close_tab,
  create_folder,
  get_about_3pane,
  get_about_message,
  make_message_sets_in_folders,
  open_selected_message_in_new_tab,
  open_selected_message_in_new_window,
  press_delete,
  select_click_row,
  select_control_click_row,
  select_shift_click_row,
  switch_tab,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var folder,
  lastMessageFolder,
  oneBeforeFolder,
  oneAfterFolder,
  multipleDeletionFolder1,
  multipleDeletionFolder2,
  multipleDeletionFolder3,
  multipleDeletionFolder4;

// Adjust timeout to take care of runs needing more time to run.
requestLongerTimeout(
  AppConstants.MOZ_CODE_COVERAGE || AppConstants.DEBUG || AppConstants.ASAN
    ? 5
    : 2
);

add_setup(async function () {
  // Use an ascending order because this test relies on message arrays matching.
  Services.prefs.setIntPref("mailnews.default_sort_order", 1);

  folder = await create_folder("DeletionA");
  lastMessageFolder = await create_folder("DeletionB");
  oneBeforeFolder = await create_folder("DeletionC");
  oneAfterFolder = await create_folder("DeletionD");
  multipleDeletionFolder1 = await create_folder("DeletionE");
  multipleDeletionFolder2 = await create_folder("DeletionF");
  multipleDeletionFolder3 = await create_folder("DeletionG");
  multipleDeletionFolder4 = await create_folder("DeletionH");
  // we want exactly as many messages as we plan to delete, so that we can test
  //  that the message window and tabs close when they run out of things to
  //  to display.
  await make_message_sets_in_folders([folder], [{ count: 4 }]);

  // since we don't test window close here, it doesn't really matter how many
  // messages these have

  await make_message_sets_in_folders([lastMessageFolder], [{ count: 4 }]);
  await make_message_sets_in_folders([oneBeforeFolder], [{ count: 10 }]);
  await make_message_sets_in_folders([oneAfterFolder], [{ count: 10 }]);
  await make_message_sets_in_folders(
    [multipleDeletionFolder1],
    [{ count: 30 }]
  );

  // We're depending on selecting the last message here, so these do matter
  await make_message_sets_in_folders(
    [multipleDeletionFolder2],
    [{ count: 10 }]
  );
  await make_message_sets_in_folders(
    [multipleDeletionFolder3],
    [{ count: 10 }]
  );
  await make_message_sets_in_folders(
    [multipleDeletionFolder4],
    [{ count: 10 }]
  );

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mailnews.default_sort_order");
  });
});

var tabFolder, tabMessage, tabMessageBackground, curMessage, nextMessage;

/**
 * The message window.
 * @type {Window}
 */
var msgc;

/**
 * Open up the message at aIndex in all our display mechanisms, and check to see
 * if the displays are all correct. This also sets up all our globals.
 */
async function _open_message_in_all_four_display_mechanisms_helper(
  aFolder,
  aIndex
) {
  // - Select the message in this tab.
  tabFolder = await be_in_folder(aFolder);
  curMessage = await select_click_row(aIndex);
  await assert_selected_and_displayed(curMessage);

  // - Open the tab with the message
  tabMessage = await open_selected_message_in_new_tab();
  await assert_selected_and_displayed(curMessage);
  await assert_tab_titled_from(tabMessage, curMessage);

  // go back to the folder tab
  await switch_tab(tabFolder);

  // - Open another tab with the message, this time in the background
  tabMessageBackground = await open_selected_message_in_new_tab(true);
  await assert_tab_titled_from(tabMessageBackground, curMessage);

  // - Open the window with the message
  // need to go back to the folder tab.  (well, should.)
  await switch_tab(tabFolder);
  msgc = await open_selected_message_in_new_window();
  await assert_selected_and_displayed(msgc, curMessage);
}

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
    await wait_for_message_display_completion();
    Assert.equal(
      get_about_message().gMessage,
      aMessage,
      "folder tab shows the correct message"
    );
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
    Assert.equal(
      get_about_message().gMessageURI,
      aMessage.folder.getUriForMsg(aMessage)
    );
    await assert_tab_titled_from(tabMessage, aMessage);
    Assert.equal(
      get_about_message().gMessage,
      aMessage,
      "message tab shows the correct message"
    );
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
    Assert.equal(
      get_about_message(msgc).gMessage,
      aMessage,
      "message window shows the correct message"
    );
    await assert_selected_and_displayed(msgc, aMessage);
    if (aIndex !== undefined) {
      await assert_selected_and_displayed(msgc, aIndex);
    }
  }
}

/**
 * Have a message displayed in a folder tab, message tab (foreground and
 * background), and message window. The idea is that as we delete from the
 * various sources, they should all advance in lock-step through their messages,
 * simplifying our lives (but making us explode forevermore the first time any
 * of the tests fail.)
 */
add_task(
  async function test_open_first_message_in_all_four_display_mechanisms() {
    await _open_message_in_all_four_display_mechanisms_helper(folder, 0);
  }
);

/**
 * Perform a deletion from the folder tab, verify the others update correctly
 *  (advancing to the next message).
 */
add_task(async function test_delete_in_folder_tab() {
  const about3Pane = get_about_3pane();
  // - plan to end up on the guy who is currently at index 1
  curMessage = about3Pane.gDBView.getMsgHdrAt(1);
  // while we're at it, figure out who is at 2 for the next step
  nextMessage = about3Pane.gDBView.getMsgHdrAt(2);
  // - delete the message
  await press_delete();
  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);
});

/**
 * Perform a deletion from the message tab, verify the others update correctly
 *  (advancing to the next message).
 */
add_task(async function test_delete_in_message_tab() {
  await switch_tab(tabMessage);
  // nextMessage is the guy we want to see once the delete completes.
  await press_delete();
  curMessage = nextMessage;

  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);

  // figure out the next guy...
  nextMessage = get_about_message().gDBView.getMsgHdrAt(1);
  if (!nextMessage) {
    throw new Error("We ran out of messages early?");
  }
});

/**
 * Perform a deletion from the message window, verify the others update
 *  correctly (advancing to the next message).
 */
add_task(async function test_delete_in_message_window() {
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
add_task(async function test_delete_last_message_closes_message_displays() {
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
  if (document.getElementById("tabmail").tabInfo.length != 1) {
    throw new Error("There should only be one tab left!");
  }
  // the below check is implied by the previous check if things are sane-ish
  if (document.getElementById("tabmail").currentTabInfo != tabFolder) {
    throw new Error("We should be on the folder tab!");
  }
});

/*
 * Now we retest everything, but while deleting the last message in our
 * selection. We need to make sure we select the previously next-to-last message
 * in that case.
 */

/**
 * Have the last message displayed in a folder tab, message tab (foreground and
 * background), and message window. The idea is that as we delete from the
 * various sources, they should all advance in lock-step through their messages,
 * simplifying our lives (but making us explode forevermore the first time any
 * of the tests fail.)
 */
add_task(
  async function test_open_last_message_in_all_four_display_mechanisms() {
    // since we have four messages, index 3 is the last message.
    await _open_message_in_all_four_display_mechanisms_helper(
      lastMessageFolder,
      3
    );
  }
);

/**
 * Perform a deletion from the folder tab, verify the others update correctly
 * (advancing to the next message).
 */
add_task(async function test_delete_last_message_in_folder_tab() {
  const about3Pane = get_about_3pane();
  // - plan to end up on the guy who is currently at index 2
  curMessage = about3Pane.gDBView.getMsgHdrAt(2);
  // while we're at it, figure out who is at 1 for the next step
  nextMessage = about3Pane.gDBView.getMsgHdrAt(1);
  // - delete the message
  await press_delete();

  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 2);
});

/**
 * Perform a deletion from the message tab, verify the others update correctly
 * (advancing to the next message).
 */
add_task(async function test_delete_last_message_in_message_tab() {
  // (we're still on the message tab, and nextMessage is the guy we want to see
  //  once the delete completes.)
  await press_delete();
  curMessage = nextMessage;

  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 1);
  // figure out the next guy...

  nextMessage = get_about_message().gDBView.getMsgHdrAt(0);
  if (!nextMessage) {
    throw new Error("We ran out of messages early?");
  }
});

/**
 * Perform a deletion from the message window, verify the others update
 * correctly (advancing to the next message).
 */
add_task(async function test_delete_last_message_in_message_window() {
  // Vary this up. Switch to the folder tab instead of staying on the message
  // tab
  await switch_tab(tabFolder);
  // - delete
  await press_delete(msgc);
  curMessage = nextMessage;
  // - verify all displays
  await _verify_message_is_displayed_in(VERIFY_ALL, curMessage, 0);

  // - clean up, close the message window and displays
  await BrowserTestUtils.closeWindow(msgc);
  close_tab(tabMessage);
  close_tab(tabMessageBackground);
  await switch_tab(tabFolder);
});

/*
 * Our next job is to open up a message, then delete the message one before it
 * in another view. The other selections shouldn't be affected.
 */

/**
 * Test "one before" deletion in the folder tab.
 */
add_task(async function test_delete_one_before_message_in_folder_tab() {
  // Open up message 4 in message tabs and a window (we'll delete message 3).
  await _open_message_in_all_four_display_mechanisms_helper(oneBeforeFolder, 4);

  const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(4);
  await select_click_row(3);
  await press_delete();

  // The message tab, background message tab and window shouldn't have changed
  await _verify_message_is_displayed_in(
    VERIFY_MESSAGE_TAB | VERIFY_BACKGROUND_MESSAGE_TAB | VERIFY_MESSAGE_WINDOW,
    expectedMessage
  );

  // Clean up, close everything
  await BrowserTestUtils.closeWindow(msgc);
  close_tab(tabMessage);
  close_tab(tabMessageBackground);
  await switch_tab(tabFolder);
});

/**
 * Test "one before" deletion in the message tab.
 */
add_task(async function test_delete_one_before_message_in_message_tab() {
  // Open up 3 in a message tab, then select and open up 4 in a background tab
  // and window.
  await select_click_row(3);
  tabMessage = await open_selected_message_in_new_tab(true);
  const expectedMessage = await select_click_row(4);
  tabMessageBackground = await open_selected_message_in_new_tab(true);
  msgc = await open_selected_message_in_new_window(true);

  // Switch to the message tab, and delete.
  await switch_tab(tabMessage);
  await press_delete();

  // The folder tab, background message tab and window shouldn't have changed
  await _verify_message_is_displayed_in(
    VERIFY_FOLDER_TAB | VERIFY_BACKGROUND_MESSAGE_TAB | VERIFY_MESSAGE_WINDOW,
    expectedMessage
  );

  // Clean up, close everything
  await BrowserTestUtils.closeWindow(msgc);
  close_tab(tabMessage);
  close_tab(tabMessageBackground);
  await switch_tab(tabFolder);
});

/**
 * Test "one before" deletion in the message window.
 */
add_task(async function test_delete_one_before_message_in_message_window() {
  // Open up 3 in a message window, then select and open up 4 in a background
  // and a foreground tab.
  await select_click_row(3);
  msgc = await open_selected_message_in_new_window();
  const expectedMessage = await select_click_row(4);
  tabMessage = await open_selected_message_in_new_tab();
  await switch_tab(tabFolder);
  tabMessageBackground = await open_selected_message_in_new_tab(true);

  // Press delete in the message window.
  await press_delete(msgc);

  // The folder tab, message tab and background message tab shouldn't have
  // changed
  await _verify_message_is_displayed_in(
    VERIFY_FOLDER_TAB | VERIFY_MESSAGE_TAB | VERIFY_BACKGROUND_MESSAGE_TAB,
    expectedMessage
  );

  // Clean up, close everything
  await BrowserTestUtils.closeWindow(msgc);
  close_tab(tabMessage);
  close_tab(tabMessageBackground);
  await switch_tab(tabFolder);
});

/*
 * Now do all of that again, but this time delete the message _after_ the open one.
 */

/**
 * Test "one after" deletion in the folder tab.
 */
add_task(async function test_delete_one_after_message_in_folder_tab() {
  // Open up message 4 in message tabs and a window (we'll delete message 5).
  await _open_message_in_all_four_display_mechanisms_helper(oneAfterFolder, 4);

  const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(4);
  await select_click_row(5);
  await press_delete();

  // The message tab, background message tab and window shouldn't have changed
  await _verify_message_is_displayed_in(
    VERIFY_MESSAGE_TAB | VERIFY_BACKGROUND_MESSAGE_TAB | VERIFY_MESSAGE_WINDOW,
    expectedMessage
  );

  // Clean up, close everything
  await BrowserTestUtils.closeWindow(msgc);
  close_tab(tabMessage);
  close_tab(tabMessageBackground);
  await switch_tab(tabFolder);
});

/**
 * Test "one after" deletion in the message tab.
 */
add_task(async function test_delete_one_after_message_in_message_tab() {
  // Open up 5 in a message tab, then select and open up 4 in a background tab
  // and window.
  await select_click_row(5);
  tabMessage = await open_selected_message_in_new_tab(true);
  const expectedMessage = await select_click_row(4);
  tabMessageBackground = await open_selected_message_in_new_tab(true);
  msgc = await open_selected_message_in_new_window(true);

  // Switch to the message tab, and delete.
  await switch_tab(tabMessage);
  await press_delete();

  // The folder tab, background message tab and window shouldn't have changed
  await _verify_message_is_displayed_in(
    VERIFY_FOLDER_TAB | VERIFY_BACKGROUND_MESSAGE_TAB | VERIFY_MESSAGE_WINDOW,
    expectedMessage
  );

  // Clean up, close everything
  await BrowserTestUtils.closeWindow(msgc);
  close_tab(tabMessage);
  close_tab(tabMessageBackground);
  await switch_tab(tabFolder);
});

/**
 * Test "one after" deletion in the message window.
 */
add_task(async function test_delete_one_after_message_in_message_window() {
  // Open up 5 in a message window, then select and open up 4 in a background
  // and a foreground tab.
  await select_click_row(5);
  msgc = await open_selected_message_in_new_window();
  const expectedMessage = await select_click_row(4);
  tabMessage = await open_selected_message_in_new_tab();
  await switch_tab(tabFolder);
  tabMessageBackground = await open_selected_message_in_new_tab(true);

  // Press delete in the message window.
  await press_delete(msgc);

  // The folder tab, message tab and background message tab shouldn't have
  // changed
  await _verify_message_is_displayed_in(
    VERIFY_FOLDER_TAB | VERIFY_MESSAGE_TAB | VERIFY_BACKGROUND_MESSAGE_TAB,
    expectedMessage
  );

  // Clean up, close everything
  await BrowserTestUtils.closeWindow(msgc);
  close_tab(tabMessage);
  close_tab(tabMessageBackground);
  await switch_tab(tabFolder);
});

/*
 * Delete multiple messages in a folder tab. Make sure message displays at the
 * beginning, middle and end of a selection work out.
 */

/**
 * Test deleting multiple messages in a folder tab, with message displays open
 * to the beginning of a selection.
 */
add_task(
  async function test_delete_multiple_messages_with_first_selected_message_open() {
    // Open up 2 in a message tab, background tab, and message window.
    await _open_message_in_all_four_display_mechanisms_helper(
      multipleDeletionFolder1,
      2
    );

    // We'll select 2-5, 8, 9 and 10. We expect 6 to be the next displayed
    // message.
    await select_click_row(2);
    await select_shift_click_row(5);
    await select_control_click_row(8);
    await select_control_click_row(9);
    await select_control_click_row(10);
    const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(6);

    // Delete the selected messages
    await press_delete();

    // All the displays should now be showing the expectedMessage
    await _verify_message_is_displayed_in(VERIFY_ALL, expectedMessage);

    // Clean up, close everything
    await BrowserTestUtils.closeWindow(msgc);
    close_tab(tabMessage);
    close_tab(tabMessageBackground);
    await switch_tab(tabFolder);
  }
);

/**
 * Test deleting multiple messages in a folder tab, with message displays open
 * to somewhere in the middle of a selection.
 */
add_task(
  async function test_delete_multiple_messages_with_nth_selected_message_open() {
    // Open up 9 in a message tab, background tab, and message window.
    await _open_message_in_all_four_display_mechanisms_helper(
      multipleDeletionFolder1,
      9
    );

    // We'll select 2-5, 8, 9 and 10. We expect 11 to be the next displayed
    // message.
    await select_click_row(2);
    await select_shift_click_row(5);
    await select_control_click_row(8);
    await select_control_click_row(9);
    await select_control_click_row(10);
    const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(11);

    // Delete the selected messages
    await press_delete();

    // The folder tab should now be showing message 2
    await assert_selected_and_displayed(2);

    // The other displays should now be showing the expectedMessage
    await _verify_message_is_displayed_in(
      VERIFY_MESSAGE_TAB |
        VERIFY_BACKGROUND_MESSAGE_TAB |
        VERIFY_MESSAGE_WINDOW,
      expectedMessage
    );

    // Clean up, close everything
    await BrowserTestUtils.closeWindow(msgc);
    close_tab(tabMessage);
    close_tab(tabMessageBackground);
    await switch_tab(tabFolder);
  }
);

/**
 * Test deleting multiple messages in a folder tab, with message displays open
 * to the end of a selection.
 */
add_task(
  async function test_delete_multiple_messages_with_last_selected_message_open() {
    // Open up 10 in a message tab, background tab, and message window.
    await _open_message_in_all_four_display_mechanisms_helper(
      multipleDeletionFolder1,
      9
    );

    // We'll select 2-5, 8, 9 and 10. We expect 11 to be the next displayed
    // message.
    await select_click_row(2);
    await select_shift_click_row(5);
    await select_control_click_row(8);
    await select_control_click_row(9);
    await select_control_click_row(10);
    const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(11);

    // Delete the selected messages
    await press_delete();

    // The folder tab should now be showing message 2
    await assert_selected_and_displayed(2);

    // The other displays should now be showing the expectedMessage
    await _verify_message_is_displayed_in(
      VERIFY_MESSAGE_TAB |
        VERIFY_BACKGROUND_MESSAGE_TAB |
        VERIFY_MESSAGE_WINDOW,
      expectedMessage
    );
    // Clean up, close everything
    await BrowserTestUtils.closeWindow(msgc);
    close_tab(tabMessage);
    close_tab(tabMessageBackground);
    await switch_tab(tabFolder);
  }
);

/**
 * Test deleting multiple messages in a folder tab (including the last one!),
 * with message displays open to the beginning of a selection.
 */
add_task(
  async function test_delete_multiple_messages_including_the_last_one_with_first_open() {
    // 10 messages in this folder. Open up message 1 everywhere.
    await _open_message_in_all_four_display_mechanisms_helper(
      multipleDeletionFolder2,
      1
    );

    // We'll select 1-4, 7, 8 and 9. We expect 5 to be the next displayed message.
    await select_click_row(1);
    await select_shift_click_row(4);
    await select_control_click_row(7);
    await select_control_click_row(8);
    await select_control_click_row(9);
    const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(5);

    // Delete the selected messages
    await press_delete();

    // All the displays should now be showing the expectedMessage
    await _verify_message_is_displayed_in(VERIFY_ALL, expectedMessage);

    // Clean up, close everything
    await BrowserTestUtils.closeWindow(msgc);
    close_tab(tabMessage);
    close_tab(tabMessageBackground);
    await switch_tab(tabFolder);
  }
);

/**
 * Test deleting multiple messages in a folder tab (including the last one!),
 * with message displays open to the middle of a selection.
 */
add_task(
  async function test_delete_multiple_messages_including_the_last_one_with_nth_open() {
    // 10 messages in this folder. Open up message 7 everywhere.
    await _open_message_in_all_four_display_mechanisms_helper(
      multipleDeletionFolder3,
      7
    );

    // We'll select 1-4, 7, 8 and 9. We expect 6 to be the next displayed message.
    await select_click_row(1);
    await select_shift_click_row(4);
    await select_control_click_row(7);
    await select_control_click_row(8);
    await select_control_click_row(9);
    const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(6);

    // Delete the selected messages
    await press_delete();

    // The folder tab should now be showing message 1
    await assert_selected_and_displayed(1);

    // The other displays should now be showing the expectedMessage
    await _verify_message_is_displayed_in(
      VERIFY_MESSAGE_TAB |
        VERIFY_BACKGROUND_MESSAGE_TAB |
        VERIFY_MESSAGE_WINDOW,
      expectedMessage
    );

    // Clean up, close everything
    await BrowserTestUtils.closeWindow(msgc);
    close_tab(tabMessage);
    close_tab(tabMessageBackground);
    await switch_tab(tabFolder);
  }
);

/**
 * Test deleting multiple messages in a folder tab (including the last one!),
 * with message displays open to the end of a selection.
 */
add_task(
  async function test_delete_multiple_messages_including_the_last_one_with_last_open() {
    // 10 messages in this folder. Open up message 9 everywhere.
    await _open_message_in_all_four_display_mechanisms_helper(
      multipleDeletionFolder4,
      9
    );

    // We'll select 1-4, 7, 8 and 9. We expect 6 to be the next displayed message.
    await select_click_row(1);
    await select_shift_click_row(4);
    await select_control_click_row(7);
    await select_control_click_row(8);
    await select_control_click_row(9);
    const expectedMessage = get_about_3pane().gDBView.getMsgHdrAt(6);

    // Delete the selected messages
    await press_delete();

    // The folder tab should now be showing message 1
    await assert_selected_and_displayed(1);

    // The other displays should now be showing the expectedMessage
    await _verify_message_is_displayed_in(
      VERIFY_MESSAGE_TAB |
        VERIFY_BACKGROUND_MESSAGE_TAB |
        VERIFY_MESSAGE_WINDOW,
      expectedMessage
    );

    // Clean up, close everything
    await BrowserTestUtils.closeWindow(msgc);
    close_tab(tabMessage);
    close_tab(tabMessageBackground);
    await switch_tab(tabFolder);
  }
);
