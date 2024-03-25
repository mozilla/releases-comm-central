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
  assert_message_pane_focused,
  assert_messages_not_in_view,
  assert_number_of_tabs_open,
  assert_selected_and_displayed,
  assert_tab_mode_name,
  assert_tab_titled_from,
  be_in_folder,
  close_tab,
  create_folder,
  get_about_3pane,
  make_message_sets_in_folders,
  plan_for_message_display,
  reset_open_message_behavior,
  set_mail_view,
  set_open_message_behavior,
  switch_tab,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { MailViewConstants } = ChromeUtils.importESModule(
  "resource:///modules/MailViewManager.sys.mjs"
);

// One folder's enough
var folder = null;

// A list of the message headers in this folder
var msgHdrsInFolder = null;

// Number of messages to open for multi-message tests
var NUM_MESSAGES_TO_OPEN = 5;

add_setup(async function () {
  folder = await create_folder("OpeningMessagesNoBackingViewA");
  await make_message_sets_in_folders([folder], [{ count: 10 }]);
});

/**
 * Test opening a single message without a backing view in a new tab.
 */
async function test_open_single_message_without_backing_view_in_tab() {
  set_open_message_behavior("NEW_TAB");
  const folderTab = document.getElementById("tabmail").currentTabInfo;
  const preCount =
    document.getElementById("tabmail").tabContainer.allTabs.length;
  await be_in_folder(folder);

  const win = get_about_3pane();

  if (!msgHdrsInFolder) {
    msgHdrsInFolder = [];
    // Make a list of all the message headers in this folder
    for (let i = 0; i < 10; i++) {
      msgHdrsInFolder.push(win.gDBView.getMsgHdrAt(i));
    }
  }
  // Get a reference to a header
  const msgHdr = msgHdrsInFolder[4];
  // Open it
  MailUtils.displayMessage(msgHdr);
  // This is going to trigger a message display in the main 3pane window. Since
  // the message will open in a new tab, we shouldn't
  // plan_for_message_display().
  await wait_for_message_display_completion(window, true);
  // Check that the tab count has increased by 1
  assert_number_of_tabs_open(preCount + 1);
  // Check that the currently displayed tab is a message tab (i.e. our newly
  // opened tab is in the foreground)
  assert_tab_mode_name(null, "mailMessageTab");
  // Check that the message header displayed is the right one
  await assert_selected_and_displayed(msgHdr);
  // Check that the message pane is focused
  assert_message_pane_focused();
  // Clean up, close the tab
  close_tab(document.getElementById("tabmail").currentTabInfo);
  await switch_tab(folderTab);
  reset_open_message_behavior();
}
add_task(test_open_single_message_without_backing_view_in_tab);

/**
 * Test opening multiple messages without backing views in new tabs.
 */
async function test_open_multiple_messages_without_backing_views_in_tabs() {
  set_open_message_behavior("NEW_TAB");
  const folderTab = document.getElementById("tabmail").currentTabInfo;
  const preCount =
    document.getElementById("tabmail").tabContainer.allTabs.length;
  await be_in_folder(folder);

  // Get a reference to a bunch of headers
  const msgHdrs = msgHdrsInFolder.slice(0, NUM_MESSAGES_TO_OPEN);

  // Open them
  MailUtils.displayMessages(msgHdrs);
  // This is going to trigger a message display in the main 3pane window. Since
  // the message will open in a new tab, we shouldn't
  // plan_for_message_display().
  await wait_for_message_display_completion(window, true);
  // Check that the tab count has increased by the correct number
  assert_number_of_tabs_open(preCount + NUM_MESSAGES_TO_OPEN);
  // Check that the currently displayed tab is a message tab (i.e. one of our
  // newly opened tabs is in the foreground)
  assert_tab_mode_name(null, "mailMessageTab");

  // Now check whether each of the NUM_MESSAGES_TO_OPEN tabs has the correct
  // title
  for (let i = 0; i < NUM_MESSAGES_TO_OPEN; i++) {
    await assert_tab_titled_from(
      document.getElementById("tabmail").tabInfo[preCount + i],
      msgHdrs[i]
    );
  }

  // Check whether each tab has the correct message and whether the message pane
  // is focused in each case, then close it to load the previous tab.
  for (let i = 0; i < NUM_MESSAGES_TO_OPEN; i++) {
    await assert_selected_and_displayed(msgHdrs.pop());
    assert_message_pane_focused();
    close_tab(document.getElementById("tabmail").currentTabInfo);
  }
  await switch_tab(folderTab);
  reset_open_message_behavior();
}
add_task(test_open_multiple_messages_without_backing_views_in_tabs);

/**
 * Test opening a message without a backing view in a new window.
 */
async function test_open_message_without_backing_view_in_new_window() {
  set_open_message_behavior("NEW_WINDOW");
  await be_in_folder(folder);

  // Select a message
  const msgHdr = msgHdrsInFolder[6];

  const newWindowPromise = promise_new_window("mail:messageWindow");
  // Open it
  MailUtils.displayMessage(msgHdr);
  const msgc = await newWindowPromise;
  await wait_for_message_display_completion(msgc, true);

  await assert_selected_and_displayed(msgc, msgHdr);
  // Clean up, close the window
  await BrowserTestUtils.closeWindow(msgc);
  reset_open_message_behavior();
}
add_task(test_open_message_without_backing_view_in_new_window).skip(); // TODO

/**
 * Test reusing an existing window to open a new message.
 */
async function test_open_message_without_backing_view_in_existing_window() {
  set_open_message_behavior("EXISTING_WINDOW");
  await be_in_folder(folder);

  // Open up a window
  const firstMsgHdr = msgHdrsInFolder[3];
  const newWindowPromise = promise_new_window("mail:messageWindow");
  MailUtils.displayMessage(firstMsgHdr);
  const msgc = await newWindowPromise;
  await wait_for_message_display_completion(msgc, true);

  // Open another message
  const msgHdr = msgHdrsInFolder[7];
  plan_for_message_display(msgc);
  MailUtils.displayMessage(msgHdr);
  await wait_for_message_display_completion(msgc, true);

  // Check if our old window displays the message
  await assert_selected_and_displayed(msgc, msgHdr);
  // Clean up, close the window
  await BrowserTestUtils.closeWindow(msgc);
  reset_open_message_behavior();
}
add_task(test_open_message_without_backing_view_in_existing_window).skip(); // TODO

/**
 * Time to throw a spanner in the works. Set a mail view for the folder that
 * excludes every message.
 */
add_task(async function test_filter_out_all_messages() {
  await set_mail_view(MailViewConstants.kViewItemTags, "$label1");
  // Make sure all the messages have actually disappeared
  assert_messages_not_in_view(msgHdrsInFolder);
});

/**
 * Re-run all the tests.
 */
add_task(
  async function test_open_single_message_without_backing_view_in_tab_filtered() {
    await test_open_single_message_without_backing_view_in_tab();
  }
);

add_task(
  async function test_open_multiple_messages_without_backing_views_in_tabs_filtered() {
    await test_open_multiple_messages_without_backing_views_in_tabs();
  }
);

add_task(
  async function test_open_message_without_backing_view_in_new_window_filtered() {
    await test_open_message_without_backing_view_in_new_window();
  }
).skip(); // TODO

add_task(
  async function test_open_message_without_backing_view_in_existing_window_filtered() {
    await test_open_message_without_backing_view_in_existing_window();
  }
).skip(); // TODO

/**
 * Good hygiene: remove the view picker from the toolbar.
 */
add_task(function test_cleanup() {
  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
