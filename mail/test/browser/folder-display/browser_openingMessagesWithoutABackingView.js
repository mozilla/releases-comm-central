/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that messages without a backing view are opened correctly. Examples of
 * messages without a backing view are those opened from the command line or
 * desktop search integration results.
 */

"use strict";

var {
  add_to_toolbar,
  assert_message_pane_focused,
  assert_messages_not_in_view,
  assert_number_of_tabs_open,
  assert_selected_and_displayed,
  assert_tab_mode_name,
  assert_tab_titled_from,
  be_in_folder,
  close_message_window,
  close_tab,
  create_folder,
  make_new_sets_in_folder,
  mc,
  plan_for_message_display,
  remove_from_toolbar,
  reset_open_message_behavior,
  set_mail_view,
  set_open_message_behavior,
  switch_tab,
  wait_for_message_display_completion,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { async_plan_for_new_window, wait_for_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { MailViewConstants } = ChromeUtils.import(
  "resource:///modules/MailViewManager.jsm"
);

// One folder's enough
var folder = null;

// A list of the message headers in this folder
var msgHdrsInFolder = null;

// Number of messages to open for multi-message tests
var NUM_MESSAGES_TO_OPEN = 5;

add_task(function setupModule(module) {
  folder = create_folder("OpeningMessagesNoBackingViewA");
  make_new_sets_in_folder(folder, [{ count: 10 }]);
  // We don't obey mail view persistence unless the view picker is there
  add_to_toolbar(mc.e("mail-bar3"), "mailviews-container");
});

/**
 * Test opening a single message without a backing view in a new tab.
 */
function test_open_single_message_without_backing_view_in_tab() {
  set_open_message_behavior("NEW_TAB");
  let folderTab = mc.tabmail.currentTabInfo;
  let preCount = mc.tabmail.tabContainer.allTabs.length;
  be_in_folder(folder);

  if (!msgHdrsInFolder) {
    msgHdrsInFolder = [];
    // Make a list of all the message headers in this folder
    for (let i = 0; i < 10; i++) {
      msgHdrsInFolder.push(mc.dbView.getMsgHdrAt(i));
    }
  }
  // Get a reference to a header
  let msgHdr = msgHdrsInFolder[4];
  // Open it
  MailUtils.displayMessage(msgHdr);
  // This is going to trigger a message display in the main 3pane window. Since
  // the message will open in a new tab, we shouldn't
  // plan_for_message_display().
  wait_for_message_display_completion(mc, true);
  // Check that the tab count has increased by 1
  assert_number_of_tabs_open(preCount + 1);
  // Check that the currently displayed tab is a message tab (i.e. our newly
  // opened tab is in the foreground)
  assert_tab_mode_name(null, "message");
  // Check that the message header displayed is the right one
  assert_selected_and_displayed(msgHdr);
  // Check that the message pane is focused
  assert_message_pane_focused();
  // Clean up, close the tab
  close_tab(mc.tabmail.currentTabInfo);
  switch_tab(folderTab);
  reset_open_message_behavior();
}
add_task(test_open_single_message_without_backing_view_in_tab);

/**
 * Test opening multiple messages without backing views in new tabs.
 */
function test_open_multiple_messages_without_backing_views_in_tabs() {
  set_open_message_behavior("NEW_TAB");
  let folderTab = mc.tabmail.currentTabInfo;
  let preCount = mc.tabmail.tabContainer.allTabs.length;
  be_in_folder(folder);

  // Get a reference to a bunch of headers
  let msgHdrs = msgHdrsInFolder.slice(0, NUM_MESSAGES_TO_OPEN);

  // Open them
  MailUtils.displayMessages(msgHdrs);
  // This is going to trigger a message display in the main 3pane window. Since
  // the message will open in a new tab, we shouldn't
  // plan_for_message_display().
  wait_for_message_display_completion(mc, true);
  // Check that the tab count has increased by the correct number
  assert_number_of_tabs_open(preCount + NUM_MESSAGES_TO_OPEN);
  // Check that the currently displayed tab is a message tab (i.e. one of our
  // newly opened tabs is in the foreground)
  assert_tab_mode_name(null, "message");

  // Now check whether each of the NUM_MESSAGES_TO_OPEN tabs has the correct
  // title
  for (let i = 0; i < NUM_MESSAGES_TO_OPEN; i++) {
    assert_tab_titled_from(mc.tabmail.tabInfo[preCount + i], msgHdrs[i]);
  }

  // Check whether each tab has the correct message and whether the message pane
  // is focused in each case, then close it to load the previous tab.
  for (let i = 0; i < NUM_MESSAGES_TO_OPEN; i++) {
    assert_selected_and_displayed(msgHdrs.pop());
    assert_message_pane_focused();
    close_tab(mc.tabmail.currentTabInfo);
  }
  switch_tab(folderTab);
  reset_open_message_behavior();
}
add_task(test_open_multiple_messages_without_backing_views_in_tabs);

/**
 * Test opening a message without a backing view in a new window.
 */
async function test_open_message_without_backing_view_in_new_window() {
  set_open_message_behavior("NEW_WINDOW");
  be_in_folder(folder);

  // Select a message
  let msgHdr = msgHdrsInFolder[6];

  let newWindowPromise = async_plan_for_new_window("mail:messageWindow");
  // Open it
  MailUtils.displayMessage(msgHdr);
  let msgc = await newWindowPromise;
  wait_for_message_display_completion(msgc, true);

  assert_selected_and_displayed(msgc, msgHdr);
  // Clean up, close the window
  close_message_window(msgc);
  reset_open_message_behavior();
}
add_task(test_open_message_without_backing_view_in_new_window);

/**
 * Test reusing an existing window to open a new message.
 */
async function test_open_message_without_backing_view_in_existing_window() {
  set_open_message_behavior("EXISTING_WINDOW");
  be_in_folder(folder);

  // Open up a window
  let firstMsgHdr = msgHdrsInFolder[3];
  let newWindowPromise = async_plan_for_new_window("mail:messageWindow");
  MailUtils.displayMessage(firstMsgHdr);
  let msgc = await newWindowPromise;
  wait_for_message_display_completion(msgc, true);

  // Open another message
  let msgHdr = msgHdrsInFolder[7];
  plan_for_message_display(msgc);
  MailUtils.displayMessage(msgHdr);
  wait_for_message_display_completion(msgc, true);

  // Check if our old window displays the message
  assert_selected_and_displayed(msgc, msgHdr);
  // Clean up, close the window
  close_message_window(msgc);
  reset_open_message_behavior();
}
add_task(test_open_message_without_backing_view_in_existing_window);

/**
 * Time to throw a spanner in the works. Set a mail view for the folder that
 * excludes every message.
 */
add_task(function test_filter_out_all_messages() {
  set_mail_view(MailViewConstants.kViewItemTags, "$label1");
  // Make sure all the messages have actually disappeared
  assert_messages_not_in_view(msgHdrsInFolder);
});

/**
 * Re-run all the tests.
 */
add_task(
  function test_open_single_message_without_backing_view_in_tab_filtered() {
    test_open_single_message_without_backing_view_in_tab();
  }
);

add_task(
  function test_open_multiple_messages_without_backing_views_in_tabs_filtered() {
    test_open_multiple_messages_without_backing_views_in_tabs();
  }
);

add_task(
  async function test_open_message_without_backing_view_in_new_window_filtered() {
    await test_open_message_without_backing_view_in_new_window();
  }
);

add_task(
  async function test_open_message_without_backing_view_in_existing_window_filtered() {
    await test_open_message_without_backing_view_in_existing_window();
  }
);

/**
 * Good hygiene: remove the view picker from the toolbar.
 */
add_task(function test_cleanup() {
  remove_from_toolbar(mc.e("mail-bar3"), "mailviews-container");

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
