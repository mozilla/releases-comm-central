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
var { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
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

/**
 * Test closing the tab with the mouse or keyboard.
 */
add_task(function test_close_tab_methods() {
  be_in_folder(gFolder);
  select_click_row(0);
  // Open five message tabs in the background.
  open_selected_message_in_new_tab(true);
  open_selected_message_in_new_tab(true);
  open_selected_message_in_new_tab(true);
  open_selected_message_in_new_tab(true);
  open_selected_message_in_new_tab(true);

  let numTabs = 6;

  let tabs = mc.tabmail.tabInfo.map((info, index) => {
    return {
      info,
      index,
      node: info.tabNode,
      close: info.tabNode.querySelector(".tab-close-button"),
    };
  });
  Assert.equal(tabs.length, numTabs, "Have all tabs");

  /**
   * Assert that a tab is closed.
   *
   * @param {Object} tab - The tab to close (an item from the 'tabs' array).
   * @param {Function} closeMethod - The method to call on tab in order to close
   *   it.
   * @param {Object} switchTo - The tab we expect to switch to after closing
   *   tab.
   */
  function assertClose(tab, closeMethod, switchTo) {
    Assert.equal(
      mc.tabmail.tabInfo.length,
      numTabs,
      `Number of tabs before removing tab #${tab.index}`
    );
    Assert.ok(tab.node.parentNode, `tab #${tab.index} should be in DOM tree`);
    closeMethod(tab);
    Assert.ok(
      !tab.node.parentNode,
      `tab #${tab.index} should be removed from the DOM tree`
    );
    numTabs--;
    Assert.equal(
      mc.tabmail.tabInfo.length,
      numTabs,
      `Number of tabs after removing tab #${tab.index}`
    );
    assert_selected_tab(
      switchTo.info,
      `tab #${switchTo.index} is selected after removing tab #${tab.index}`
    );
  }

  function closeWithButton(tab) {
    EventUtils.synthesizeMouseAtCenter(tab.close, {}, mc.window);
  }

  function closeWithMiddleClick(tab) {
    EventUtils.synthesizeMouseAtCenter(tab.node, { button: 1 }, mc.window);
  }

  function closeWithKeyboard() {
    if (AppConstants.platform == "macosx") {
      EventUtils.synthesizeKey("w", { accelKey: true }, mc.window);
    } else {
      EventUtils.synthesizeKey("w", { ctrlKey: true }, mc.window);
    }
  }

  // Can't close the first tab.
  Assert.ok(
    BrowserTestUtils.is_hidden(tabs[0].close),
    "Close button should be hidden for the first tab"
  );
  // Middle click does nothing.
  closeWithMiddleClick(tabs[0]);
  assert_selected_tab(tabs[0].info);
  // Keyboard shortcut does nothing.
  closeWithKeyboard();
  assert_selected_tab(tabs[0].info);

  // Close unselected tabs. The selected tab should stay the same.
  assertClose(tabs[5], closeWithButton, tabs[0]);
  assertClose(tabs[4], closeWithMiddleClick, tabs[0]);
  // Keyboard shortcut cannot be used to close an unselected tab.

  // Close selected tabs.
  // Select tab by clicking it.
  EventUtils.synthesizeMouseAtCenter(tabs[3].node, {}, mc.window);
  assert_selected_tab(tabs[3].info);
  assertClose(tabs[3], closeWithButton, tabs[2]);

  // Select tab #1 by clicking tab #2 and using the shortcut to go back.
  EventUtils.synthesizeMouseAtCenter(tabs[2].node, {}, mc.window);
  assert_selected_tab(tabs[2].info);
  EventUtils.synthesizeKey(
    "VK_TAB",
    { ctrlKey: true, shiftKey: true },
    mc.window
  );
  assert_selected_tab(tabs[1].info);
  assertClose(tabs[1], closeWithKeyboard, tabs[2]);

  // Select tab #2 (which is now the second tab) by using the shortcut to go
  // forward from the first tab.
  EventUtils.synthesizeMouseAtCenter(tabs[0].node, {}, mc.window);
  assert_selected_tab(tabs[0].info);
  EventUtils.synthesizeKey("VK_TAB", { ctrlKey: true }, mc.window);
  assert_selected_tab(tabs[2].info);
  assertClose(tabs[2], closeWithMiddleClick, tabs[0]);
});
