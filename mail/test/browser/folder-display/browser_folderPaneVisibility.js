/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the folder pane collapses properly, stays collapsed amongst tab
 * changes, and that persistence works (to a first approximation).
 */

"use strict";

var {
  be_in_folder,
  close_tab,
  create_folder,
  get_about_3pane,
  make_message_sets_in_folders,
  open_folder_in_new_tab,
  open_selected_message_in_new_tab,
  select_click_row,
  switch_tab,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  folder = await create_folder("FolderPaneVisibility");
  await make_message_sets_in_folders([folder], [{ count: 3 }]);
});

/**
 * When displaying a folder, assert that the folder pane is visible and all the
 * menus, splitters, etc. are set up right.
 */
function assert_folder_pane_visible() {
  const win = get_about_3pane();

  Assert.equal(
    win.paneLayout.folderPaneVisible,
    true,
    "The tab does not think that the folder pane is visible, but it should!"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(win.document.getElementById("folderTree")),
    "The folder tree should not be collapsed!"
  );
  Assert.equal(
    win.folderPaneSplitter.isCollapsed,
    false,
    "The folder tree splitter should not be collapsed!"
  );

  window.view_init(); // Force the view menu to update.
  const paneMenuItem = document.getElementById("menu_showFolderPane");
  Assert.equal(
    paneMenuItem.getAttribute("checked"),
    "true",
    "The Folder Pane menu item should be checked."
  );
}

/**
 * When displaying a folder, assert that the folder pane is hidden and all the
 * menus, splitters, etc. are set up right.
 */
function assert_folder_pane_hidden() {
  const win = get_about_3pane();

  Assert.equal(
    win.paneLayout.folderPaneVisible,
    false,
    "The tab thinks that the folder pane is visible, but it shouldn't!"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(win.document.getElementById("folderTree")),
    "The folder tree should be collapsed!"
  );
  Assert.equal(
    win.folderPaneSplitter.isCollapsed,
    true,
    "The folder tree splitter should be collapsed!"
  );

  window.view_init(); // Force the view menu to update.
  const paneMenuItem = document.getElementById("menu_showFolderPane");
  Assert.notEqual(
    paneMenuItem.getAttribute("checked"),
    "true",
    "The Folder Pane menu item should not be checked."
  );
}

function toggle_folder_pane() {
  // Since we don't have a shortcut to toggle the folder pane, we're going to
  // have to collapse it ourselves
  get_about_3pane().commandController.doCommand("cmd_toggleFolderPane");
}

/**
 * By default, the folder pane should be visible.
 */
add_task(async function test_folder_pane_visible_state_is_right() {
  await be_in_folder(folder);
  assert_folder_pane_visible();
});

/**
 * Toggle the folder pane off.
 */
add_task(function test_toggle_folder_pane_off() {
  toggle_folder_pane();
  assert_folder_pane_hidden();
});

/**
 * Toggle the folder pane on.
 */
add_task(function test_toggle_folder_pane_on() {
  toggle_folder_pane();
  assert_folder_pane_visible();
});

/**
 * Make sure that switching to message tabs of folder tabs with a different
 * folder pane state does not break. This test should cover all transition
 * states.
 */
add_task(async function test_folder_pane_is_sticky() {
  Assert.equal(document.getElementById("tabmail").tabInfo.length, 1);
  const tabFolderA = await be_in_folder(folder);
  assert_folder_pane_visible();

  // [folder+ => (new) message]
  await select_click_row(0);
  const tabMessage = await open_selected_message_in_new_tab();

  // [message => folder+]
  await switch_tab(tabFolderA);
  assert_folder_pane_visible();

  // [folder+ => (new) folder+]
  const tabFolderB = await open_folder_in_new_tab(folder);
  assert_folder_pane_visible();

  // [folder pane toggle + => -]
  toggle_folder_pane();
  assert_folder_pane_hidden();

  // [folder- => folder+]
  await switch_tab(tabFolderA);
  assert_folder_pane_visible();

  // (redundant) [ folder pane toggle + => -]
  toggle_folder_pane();
  assert_folder_pane_hidden();

  // [folder- => message]
  await switch_tab(tabMessage);

  // [message => folder-]
  close_tab(tabMessage);
  assert_folder_pane_hidden();

  // the tab we are on now doesn't matter, so we don't care
  assert_folder_pane_hidden();
  await switch_tab(tabFolderB);

  // [ folder pane toggle - => + ]
  toggle_folder_pane();
  assert_folder_pane_visible();

  // [folder+ => folder-]
  close_tab(tabFolderB);
  assert_folder_pane_hidden();

  // (redundant) [ folder pane toggle - => + ]
  toggle_folder_pane();
  assert_folder_pane_visible();
});

/**
 * Test that if we serialize and restore the tabs then the folder pane is in the
 * expected collapsed/non-collapsed state. Because of the special "first tab"
 * situation, we need to do this twice to test each case for the first tab.  For
 * additional thoroughness we also flip the state we have the other tabs be in.
 */
add_task(async function test_folder_pane_persistence_generally_works() {
  await be_in_folder(folder);

  const tabmail = document.getElementById("tabmail");

  // helper to open tabs with the folder pane in the desired states (1 for
  //  visible, 0 for hidden)
  async function openTabs(aConfig) {
    for (const [iTab, folderPaneVisible] of aConfig.entries()) {
      if (iTab != 0) {
        await open_folder_in_new_tab(folder);
      }
      if (
        tabmail.currentAbout3Pane.paneLayout.folderPaneVisible !=
        folderPaneVisible
      ) {
        toggle_folder_pane();
      }
    }
  }

  // close everything but the first tab.
  function closeTabs() {
    while (tabmail.tabInfo.length > 1) {
      tabmail.closeTab(1);
    }
  }

  async function verifyTabs(aConfig) {
    for (const [iTab, folderPaneVisible] of aConfig.entries()) {
      info("tab " + iTab);

      await switch_tab(iTab);
      if (tabmail.currentAbout3Pane.document.readyState != "complete") {
        await BrowserTestUtils.waitForEvent(tabmail.currentAbout3Pane, "load");
        await new Promise(resolve =>
          tabmail.currentAbout3Pane.setTimeout(resolve)
        );
      }

      if (folderPaneVisible) {
        assert_folder_pane_visible();
      } else {
        assert_folder_pane_hidden();
      }
    }
  }

  const configs = [
    // 1st time: [+ - - + +]
    [1, 0, 0, 1, 1],
    // 2nd time: [- + + - -]
    [0, 1, 1, 0, 0],
  ];

  for (const config of configs) {
    await openTabs(config);
    await verifyTabs(config); // make sure openTabs did its job right
    const state = tabmail.persistTabs();
    closeTabs();

    Assert.equal(state.tabs[0].state.folderPaneVisible, config[0]);
    Assert.equal(state.tabs[1].state.folderPaneVisible, config[1]);
    Assert.equal(state.tabs[2].state.folderPaneVisible, config[2]);
    Assert.equal(state.tabs[3].state.folderPaneVisible, config[3]);
    Assert.equal(state.tabs[4].state.folderPaneVisible, config[4]);

    // toggle the state for the current tab so we can be sure that it knows how
    // to change things.
    toggle_folder_pane();

    tabmail.restoreTabs(state);
    await verifyTabs(config);
    closeTabs();

    // toggle the first tab again.  This sets closed properly for the second pass and
    // restores it to open for when we are done.
    toggle_folder_pane();
  }
  // For one last time, make sure.
  assert_folder_pane_visible();
});
