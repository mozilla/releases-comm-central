/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the message pane collapses properly, stays collapsed amongst tab
 *  changes, and that persistence works (to a first approximation).
 */

"use strict";

var {
  assert_message_pane_hidden,
  assert_message_pane_visible,
  be_in_folder,
  close_tab,
  create_folder,
  make_new_sets_in_folder,
  mc,
  open_folder_in_new_tab,
  open_selected_message_in_new_tab,
  select_click_row,
  switch_tab,
  toggle_message_pane,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder;

add_task(function setupModule(module) {
  folder = create_folder("MessagePaneVisibility");
  make_new_sets_in_folder(folder, [{ count: 3 }]);
  Assert.ok(true, "setupModule ran to completion");
});

/**
 * By default, the message pane should be visible.  Make sure that this state of
 *  affairs is correct in terms of menu options, splitters, etc.
 */
add_task(function test_message_pane_visible_state_is_right() {
  be_in_folder(folder);
  assert_message_pane_visible();
  Assert.ok(true, "test_message_pane_visible_state_is_right ran to completion");
});

/**
 * Make sure the account central page does not have the message pane splitter
 *  visible.  This should go elsewhere once we have more tests involving
 *  account central.  (Layout tests?)
 */
add_task(function test_account_central_has_no_splitter() {
  be_in_folder(folder.rootFolder);
  assert_message_pane_hidden(true);
  be_in_folder(folder);
  Assert.ok(true, "test_account_central_has_no_splitter ran to completion");
});

/**
 * Toggle the message off.
 */
add_task(function test_toggle_message_pane_off() {
  toggle_message_pane();
  assert_message_pane_hidden();
  Assert.ok(true, "test_toggle_message_pane_off ran to completion");
});

/**
 * Toggle the message pane on.
 */
add_task(function test_toggle_message_pane_on() {
  toggle_message_pane();
  assert_message_pane_visible();
  Assert.ok(true, "test_toggle_message_pane_on ran to completion");
});

/**
 * Make sure that the message tab isn't broken by being invoked from a folder tab
 *  with a collapsed message pane.
 */
add_task(function test_collapsed_message_pane_does_not_break_message_tab() {
  be_in_folder(folder);

  // - toggle message pane off
  toggle_message_pane();
  assert_message_pane_hidden();

  // - open message tab, make sure the message pane is visible
  select_click_row(0);
  let tabMessage = open_selected_message_in_new_tab();
  assert_message_pane_visible(true);

  // - close the tab, sanity check the transition was okay
  close_tab(tabMessage);
  assert_message_pane_hidden();

  // - restore the state...
  toggle_message_pane();

  Assert.ok(
    true,
    "test_collapsed_message_pane_does_not_break_message_tab ran to completion"
  );
});

/**
 * Make sure that switching to message tabs or folder pane tabs with a different
 *  message pane state does not break.  This test should cover all transition
 *  states.
 */
add_task(function test_message_pane_is_sticky() {
  let tabFolderA = be_in_folder(folder);
  assert_message_pane_visible();

  // [folder+ => (new) message]
  select_click_row(0);
  let tabMessage = open_selected_message_in_new_tab();
  assert_message_pane_visible(true);

  // [message => folder+]
  switch_tab(tabFolderA);
  assert_message_pane_visible();

  // [folder+ => (new) folder+]
  let tabFolderB = open_folder_in_new_tab(folder);
  assert_message_pane_visible();

  // [folder pane toggle + => -]
  toggle_message_pane();
  assert_message_pane_hidden();

  // [folder- => folder+]
  switch_tab(tabFolderA);
  assert_message_pane_visible();

  // (redundant) [ folder pane toggle + => -]
  toggle_message_pane();
  assert_message_pane_hidden();

  // [folder- => message]
  switch_tab(tabMessage);
  assert_message_pane_visible(true);

  // [message => folder-]
  close_tab(tabMessage);
  assert_message_pane_hidden();

  // [folder- => (new) folder-]
  // (we are testing inheritance here)
  let tabFolderC = open_folder_in_new_tab(folder);
  assert_message_pane_hidden();

  // [folder- => folder-]
  close_tab(tabFolderC);
  // the tab we are on now doesn't matter, so we don't care
  assert_message_pane_hidden();
  switch_tab(tabFolderB);

  // [ folder pane toggle - => + ]
  toggle_message_pane();
  assert_message_pane_visible();

  // [folder+ => folder-]
  close_tab(tabFolderB);
  assert_message_pane_hidden();

  // (redundant) [ folder pane toggle - => + ]
  toggle_message_pane();
  assert_message_pane_visible();

  Assert.ok(true, "test_message_pane_is_sticky ran to completion");
});

/**
 * Test that if we serialize and restore the tabs that the message pane is in
 *  the expected collapsed/non-collapsed state.  Because of the special "first
 *  tab" situation, we need to do this twice to test each case for the first
 *  tab.  For additional thoroughness we also flip the state we have the other
 *  tabs be in.
 */
add_task(function test_message_pane_persistence_generally_works() {
  be_in_folder(folder);

  // helper to open tabs with the message pane in the desired states (1 for
  //  visible, 0 for hidden)
  function openTabs(aConfig) {
    let curState;
    for (let [iTab, messagePaneVisible] of aConfig.entries()) {
      if (iTab == 0) {
        curState = messagePaneVisible;
      } else {
        open_folder_in_new_tab(folder);
        if (curState != messagePaneVisible) {
          toggle_message_pane();
          curState = messagePaneVisible;
        }
      }
    }
  }

  // close everything but the first tab.
  function closeTabs() {
    while (mc.tabmail.tabInfo.length > 1) {
      close_tab(1);
    }
  }

  function verifyTabs(aConfig) {
    for (let [iTab, messagePaneVisible] of aConfig.entries()) {
      switch_tab(iTab);
      dump(" checking tab: " + iTab + "\n");
      if (messagePaneVisible) {
        assert_message_pane_visible();
      } else {
        assert_message_pane_hidden();
      }
    }
  }

  let configs = [
    // 1st time: [+ - - + +]
    [1, 0, 0, 1, 1],
    // 2nd time: [- + + - -]
    [0, 1, 1, 0, 0],
  ];
  for (let config of configs) {
    openTabs(config);
    verifyTabs(config); // make sure openTabs did its job right

    // Switch to the first tab, so that we don't cause a double message load
    // while restoring tabs (one by the first tab, one by the currently selected
    // one). This is fine because we only restore tabs at startup, and we know
    // that we don't select a message at startup.
    // XXX This should probably be fixed properly, though.
    switch_tab(0);

    let state = mc.tabmail.persistTabs();
    closeTabs();
    // toggle the state for the current tab so we can be sure that it knows how
    //  to change things.
    toggle_message_pane();
    SimpleTest.ignoreAllUncaughtExceptions(true);
    mc.tabmail.restoreTabs(state);
    verifyTabs(config);
    SimpleTest.ignoreAllUncaughtExceptions(false);
    closeTabs();

    // toggle the first tab again.  This sets - properly for the second pass and
    //  restores it to + for when we are done.
    toggle_message_pane();
  }

  Assert.ok(
    true,
    "test_message_pane_persistence_generally_works ran to completion"
  );
});
