/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test tabmail behaviour when tabs close.
 */

"use strict";

var {
  assert_selected_tab,
  be_in_folder,
  collapse_all_threads,
  create_folder,
  make_display_threaded,
  make_new_sets_in_folder,
  mc,
  open_selected_message_in_new_tab,
  open_selected_messages,
  select_click_row,
  switch_tab,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var gFolder;

var MSGS_PER_THREAD = 3;

add_task(function setupModule(module) {
  gFolder = create_folder("test-tabmail-closing folder");
  make_new_sets_in_folder(gFolder, [{ msgsPerThread: MSGS_PER_THREAD }]);
});

/**
 * Test that if we open up a message in a tab from the inbox tab, that
 * if we immediately close that tab, we switch back to the inbox tab.
 */
add_task(function test_closed_single_message_tab_returns_to_inbox() {
  be_in_folder(gFolder);
  make_display_threaded();
  let inboxTab = mc.tabmail.currentTabInfo;

  select_click_row(0);
  // Open a message in a new tab...
  open_selected_message_in_new_tab(false);

  // Open a second message in a new tab...
  switch_tab(0);
  select_click_row(1);
  open_selected_message_in_new_tab(false);

  // Close the second tab
  mc.tabmail.closeTab(2);

  // We should have gone back to the inbox tab
  assert_selected_tab(inboxTab);

  // Close the first tab
  mc.tabmail.closeTab(1);
});

/**
 * Test that if we open up some message tabs from the inbox tab, and then
 * switch around in those tabs, closing the tabs doesn't immediately jump
 * you back to the inbox tab.
 */
add_task(function test_does_not_go_to_opener_if_switched() {
  be_in_folder(gFolder);
  make_display_threaded();

  select_click_row(0);
  // Open a message in a new tab...
  open_selected_message_in_new_tab(false);

  // Open a second message in a new tab...
  switch_tab(0);
  select_click_row(1);
  open_selected_message_in_new_tab(false);

  // Switch to the first tab
  switch_tab(1);
  let firstTab = mc.tabmail.currentTabInfo;

  // Switch back to the second tab
  switch_tab(2);

  // Close the second tab
  mc.tabmail.closeTab(2);

  // We should have gone back to the second tab
  assert_selected_tab(firstTab);

  // Close the first tab
  mc.tabmail.closeTab(1);
});

/**
 * Test that if we open a whole thread up in message tabs, closing
 * the last message tab takes us to the second last message tab as opposed
 * to the inbox tab.
 */
add_task(function test_opening_thread_in_tabs_closing_behaviour() {
  be_in_folder(gFolder);
  make_display_threaded();
  collapse_all_threads();

  // Open a thread as a series of message tabs.
  select_click_row(0);
  open_selected_messages(mc);

  // At this point, the last message tab should be selected already.  We
  // close that tab, and the second last message tab should be selected.
  // We should close that tab, and the third last tab should be selected,
  // etc.
  for (let i = MSGS_PER_THREAD; i > 0; --i) {
    let previousTab = mc.tabmail.tabContainer.getItemAtIndex(i - 1);
    mc.tabmail.closeTab(i);
    Assert.equal(
      previousTab,
      mc.tabmail.tabContainer.selectedItem,
      "Expected tab at index " + (i - 1) + " to be selected."
    );
  }
});
