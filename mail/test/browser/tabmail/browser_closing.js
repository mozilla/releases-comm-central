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
  make_message_sets_in_folders,
  open_selected_message_in_new_tab,
  open_selected_messages,
  select_click_row,
  switch_tab,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var gFolder;

var MSGS_PER_THREAD = 3;

add_setup(async function () {
  gFolder = await create_folder("test-tabmail-closing folder");
  await make_message_sets_in_folders(
    [gFolder],
    [{ msgsPerThread: MSGS_PER_THREAD }]
  );
});

/**
 * Test that if we open up a message in a tab from the inbox tab, that
 * if we immediately close that tab, we switch back to the inbox tab.
 */
add_task(async function test_closed_single_message_tab_returns_to_inbox() {
  await be_in_folder(gFolder);
  await make_display_threaded();
  const inboxTab = document.getElementById("tabmail").currentTabInfo;

  await select_click_row(0);
  // Open a message in a new tab...
  await open_selected_message_in_new_tab(false);

  // Open a second message in a new tab...
  await switch_tab(0);
  await select_click_row(1);
  await open_selected_message_in_new_tab(false);

  // Close the second tab
  document.getElementById("tabmail").closeTab(2);

  // We should have gone back to the inbox tab
  assert_selected_tab(inboxTab);

  // Close the first tab
  document.getElementById("tabmail").closeTab(1);
});

/**
 * Test that if we open up some message tabs from the inbox tab, and then
 * switch around in those tabs, closing the tabs doesn't immediately jump
 * you back to the inbox tab.
 */
add_task(async function test_does_not_go_to_opener_if_switched() {
  await be_in_folder(gFolder);
  await make_display_threaded();

  await select_click_row(0);
  // Open a message in a new tab...
  await open_selected_message_in_new_tab(false);

  // Open a second message in a new tab...
  await switch_tab(0);
  await select_click_row(1);
  await open_selected_message_in_new_tab(false);

  // Switch to the first tab
  await switch_tab(1);
  const firstTab = document.getElementById("tabmail").currentTabInfo;

  // Switch back to the second tab
  await switch_tab(2);

  // Close the second tab
  document.getElementById("tabmail").closeTab(2);

  // We should have gone back to the second tab
  assert_selected_tab(firstTab);

  // Close the first tab
  document.getElementById("tabmail").closeTab(1);
});

/**
 * Test that if we open a whole thread up in message tabs, closing
 * the last message tab takes us to the second last message tab as opposed
 * to the inbox tab.
 */
add_task(async function test_opening_thread_in_tabs_closing_behaviour() {
  await be_in_folder(gFolder);
  await make_display_threaded();
  await collapse_all_threads();

  // Open a thread as a series of message tabs.
  await select_click_row(0);
  open_selected_messages(window);

  // At this point, the last message tab should be selected already.  We
  // close that tab, and the second last message tab should be selected.
  // We should close that tab, and the third last tab should be selected,
  // etc.
  for (let i = MSGS_PER_THREAD; i > 0; --i) {
    const previousTab = document
      .getElementById("tabmail")
      .tabContainer.getItemAtIndex(i - 1);
    document.getElementById("tabmail").closeTab(i);
    Assert.equal(
      previousTab,
      document.getElementById("tabmail").tabContainer.selectedItem,
      "Expected tab at index " + (i - 1) + " to be selected."
    );
  }
}).skip();

/**
 * @typedef {object} TestTab
 * @property {Element} node - The tab's DOM node.
 * @property {number} index - The tab's index.
 * @property {object} info - The tabInfo for this tab, as used in #tabmail.
 */

/**
 * Open some message tabs in the background from the folder tab.
 *
 * @param {number} numAdd - The number of tabs to add.
 *
 * @param {TestTab[]} An array of tab objects corresponding to all the open
 *   tabs.
 */
async function openTabs(numAdd) {
  await be_in_folder(gFolder);
  await select_click_row(0);
  for (let i = 0; i < numAdd; i++) {
    await open_selected_message_in_new_tab(true);
  }
  const tabs = document.getElementById("tabmail").tabInfo.map((info, index) => {
    return {
      info,
      index,
      node: info.tabNode,
    };
  });
  Assert.equal(tabs.length, numAdd + 1, "Have expected number of tabs");
  return tabs;
}

/**
 * Assert that a tab is closed.
 *
 * @param {TestTab} fromTab - The tab to close from.
 * @param {Function} closeMethod - The (async) method to call on fromTab.node in
 *   order to perform the tab close.
 * @param {TestTab} switchToTab - The tab we expect to switch to after closing
 *   tab.
 * @param {TestTab[]} [closingTabs] - The tabs we expect to close after calling
 *   the closeMethod. This is just fromTab by default.
 */
async function assertClose(fromTab, closeMethod, switchToTab, closingTabs) {
  let desc;
  if (closingTabs) {
    const closingIndices = closingTabs.map(t => t.index).join(",");
    desc = `closing tab #${closingIndices} using tab #${fromTab.index}`;
  } else {
    closingTabs = [fromTab];
    desc = `closing tab #${fromTab.index}`;
  }
  const numTabsBefore = document.getElementById("tabmail").tabInfo.length;
  for (const tab of closingTabs) {
    Assert.ok(
      tab.node.parentNode,
      `tab #${tab.index} should be in the DOM tree before ${desc}`
    );
  }
  fromTab.node.scrollIntoView();
  await closeMethod(fromTab.node);
  for (const tab of closingTabs) {
    Assert.ok(
      !tab.node.parentNode,
      `tab #${tab.index} should be removed from the DOM tree after ${desc}`
    );
  }
  Assert.equal(
    document.getElementById("tabmail").tabInfo.length,
    numTabsBefore - closingTabs.length,
    `Number of tabs after ${desc}`
  );
  assert_selected_tab(
    switchToTab.info,
    `tab #${switchToTab.index} is selected after ${desc}`
  );
}

/**
 * Close a tab using its close button.
 *
 * @param {Element} tab - The tab to close.
 */
function closeWithButton(tab) {
  EventUtils.synthesizeMouseAtCenter(
    tab.querySelector(".tab-close-button"),
    {},
    tab.ownerGlobal
  );
}

/**
 * Close a tab using a middle mouse click.
 *
 * @param {Element} tab - The tab to close.
 */
function closeWithMiddleClick(tab) {
  EventUtils.synthesizeMouseAtCenter(tab, { button: 1 }, tab.ownerGlobal);
}

/**
 * Close the currently selected tab.
 *
 * @param {Element} tab - The tab to close.
 */
function closeWithKeyboard(tab) {
  if (AppConstants.platform == "macosx") {
    EventUtils.synthesizeKey("w", { accelKey: true }, tab.ownerGlobal);
  } else {
    EventUtils.synthesizeKey("w", { ctrlKey: true }, tab.ownerGlobal);
  }
}

/**
 * Open the context menu of a tab.
 *
 * @param {Element} tab - The tab to open the context menu of.
 */
async function openContextMenu(tab) {
  const win = tab.ownerGlobal;
  const contextMenu = win.document.getElementById("tabContextMenu");
  const shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    tab,
    { type: "contextmenu", button: 2 },
    win
  );
  await shownPromise;
}

/**
 * Close the context menu, without selecting anything.
 *
 * @param {Element} tab - The tab to close the context menu of.
 */
async function closeContextMenu(tab) {
  const win = tab.ownerGlobal;
  const contextMenu = win.document.getElementById("tabContextMenu");
  const hiddenPromise = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popuphidden"
  );
  contextMenu.hidePopup();
  await hiddenPromise;
}

/**
 * Open a tab's context menu and select an item.
 *
 * @param {Element} tab - The tab to open the context menu on.
 * @param {string} itemId - The id of the menu item to select.
 */
async function selectFromContextMenu(tab, itemId) {
  const doc = tab.ownerDocument;
  const contextMenu = doc.getElementById("tabContextMenu");
  const item = doc.getElementById(itemId);
  await openContextMenu(tab);
  const hiddenPromise = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popuphidden"
  );
  contextMenu.activateItem(item);
  await hiddenPromise;
}

/**
 * Close a tab using its context menu.
 *
 * @param {Element} tab - The tab to close.
 */
async function closeWithContextMenu(tab) {
  await selectFromContextMenu(tab, "tabContextMenuClose");
}

/**
 * Close all other tabs using a tab's context menu.
 *
 * @param {Element} tab - The tab to not close.
 */
async function closeOtherTabsWithContextMenu(tab) {
  await selectFromContextMenu(tab, "tabContextMenuCloseOtherTabs");
}

/**
 * Test closing unselected tabs with the mouse or keyboard.
 */
add_task(async function test_close_unselected_tab_methods() {
  const tabs = await openTabs(3);

  // Can't close the first tab.
  Assert.ok(
    BrowserTestUtils.is_hidden(tabs[0].node.querySelector(".tab-close-button")),
    "Close button should be hidden for the first tab"
  );
  // Middle click does nothing.
  closeWithMiddleClick(tabs[0].node);
  assert_selected_tab(tabs[0].info);
  // Keyboard shortcut does nothing.
  closeWithKeyboard(tabs[0].node);
  assert_selected_tab(tabs[0].info);
  // Context close item is disabled.
  await openContextMenu(tabs[0].node);
  Assert.ok(
    document.getElementById("tabContextMenuClose").disabled,
    "Close context menu item should be disabled for the first tab"
  );
  await closeContextMenu(tabs[0].node);

  // Close unselected tabs. The selected tab should stay the same.
  await assertClose(tabs[3], closeWithButton, tabs[0]);
  await assertClose(tabs[1], closeWithMiddleClick, tabs[0]);
  await assertClose(tabs[2], closeWithContextMenu, tabs[0]);
  // Keyboard shortcut cannot be used to close an unselected tab.
});

/**
 * Test closing selected tabs with the mouse or keyboard.
 */
add_task(async function test_close_selected_tab_methods() {
  const tabs = await openTabs(4);

  // Select tab by clicking it.
  EventUtils.synthesizeMouseAtCenter(tabs[4].node, {}, window);
  assert_selected_tab(tabs[4].info);
  await assertClose(tabs[4], closeWithButton, tabs[3]);

  // Select tab #2 by clicking tab #3 and using the shortcut to go back.
  EventUtils.synthesizeMouseAtCenter(tabs[3].node, {}, window);
  assert_selected_tab(tabs[3].info);
  EventUtils.synthesizeKey("VK_TAB", { ctrlKey: true, shiftKey: true }, window);
  assert_selected_tab(tabs[2].info);
  await assertClose(tabs[2], closeWithKeyboard, tabs[3]);

  // Note: Current open tabs is: #0, #1, #2, #3.

  // Select tab #1 by using the shortcut to go forward from tab #0.
  EventUtils.synthesizeMouseAtCenter(tabs[0].node, {}, window);
  assert_selected_tab(tabs[0].info);
  EventUtils.synthesizeKey("VK_TAB", { ctrlKey: true }, window);
  assert_selected_tab(tabs[1].info);
  await assertClose(tabs[1], closeWithMiddleClick, tabs[3]);

  // Note: Current open tabs is: #0, #3.
  // Close tabs #3 using the context menu.
  await assertClose(tabs[3], closeWithContextMenu, tabs[0]);
});

/**
 * Test closing other tabs with the context menu.
 */
add_task(async function test_close_other_tabs() {
  const tabs = await openTabs(3);

  EventUtils.synthesizeMouseAtCenter(tabs[3].node, {}, window);
  assert_selected_tab(tabs[3].info);
  // Close tabs #1 and #2 using the context menu of #3.
  await assertClose(tabs[3], closeOtherTabsWithContextMenu, tabs[3], [
    tabs[1],
    tabs[2],
  ]);

  // Note: Current open tabs is: #0 #3.
  // The tab #3 closeOtherItem is now disabled since only tab #0 is left, which
  // cannot be closed.
  await openContextMenu(tabs[3].node);
  Assert.ok(
    document.getElementById("tabContextMenuCloseOtherTabs").disabled,
    "Close context menu item should be disabled for the first tab"
  );
  await closeContextMenu(tabs[3].node);

  // But we can close tab #3 using tab #0 context menu.
  await assertClose(tabs[0], closeOtherTabsWithContextMenu, tabs[0], [tabs[3]]);
});
