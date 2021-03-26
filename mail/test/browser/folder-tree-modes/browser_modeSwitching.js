/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the ability to swtich between multiple folder modes.
 */

"use strict";

var {
  assert_folder_visible,
  inboxFolder,
  make_new_sets_in_folder,
  mc,
  select_no_folders,
  toggle_main_menu,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var rootFolder;
var unreadFolder;
var favoriteFolder;
var tree;
var modeList_menu;
var modeList_appmenu;
var modeList_popupmenu;
var view_menu;
var view_menupopup;
var appmenu_button;
var appmenu_mainView;
var menu_state;

add_task(function setupModule(module) {
  rootFolder = inboxFolder.server.rootFolder;

  // Create one folder with unread messages and one favorite folder.
  inboxFolder.createSubfolder("UnreadFolder", null);
  unreadFolder = inboxFolder.getChildNamed("UnreadFolder");

  inboxFolder.createSubfolder("FavoriteFolder", null);
  favoriteFolder = inboxFolder.getChildNamed("FavoriteFolder");

  make_new_sets_in_folder(unreadFolder, [{ count: 1 }]);
  favoriteFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);

  modeList_menu = mc.e("menu_FolderViewsPopup");
  modeList_appmenu = mc.e("appMenu-foldersView");
  modeList_popupmenu = mc.e("folderListPopup");

  view_menu = mc.e("menu_View");
  view_menupopup = mc.e("menu_View_Popup");
  appmenu_button = mc.window.document.getElementById("button-appmenu");
  appmenu_mainView = mc.e("appMenu-mainView");

  tree = mc.folderTreeView;

  select_no_folders();

  // Main menu is needed for this whole test file.
  menu_state = toggle_main_menu(true);

  // Show the Folder Pane header toolbar.
  mc.e("folderPaneHeader").removeAttribute("collapsed");
});

/**
 * Check whether the expected folder mode is selected in menus and internally.
 *
 * @param {string} aMode - The name of the expected mode.
 */
function assert_mode_selected(aMode) {
  Assert.ok(tree.activeModes.includes(aMode));

  // We need to open the menu because only then the right mode is set in them.
  if (["linux", "win"].includes(AppConstants.platform)) {
    // On OS X the main menu seems not accessible for clicking from tests.
    mc.click(view_menu);
    let popuplist = mc.click_menus_in_sequence(
      view_menupopup,
      [{ id: modeList_menu.parentNode.id }],
      true
    );
    for (let mode of tree.activeModes) {
      Assert.ok(
        modeList_menu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
      );
    }
    mc.close_popup_sequence(popuplist);
  }
  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, mc.window);

  mc.click_through_appmenu([
    { id: "appmenu_View" },
    { id: "appmenu_FolderViews" },
  ]);

  for (let mode of tree.activeModes) {
    Assert.ok(
      modeList_appmenu
        .querySelector(`[value="${mode}"]`)
        .hasAttribute("checked")
    );
  }

  mc.click(mc.e("buttonFolderList"));
  for (let mode of tree.activeModes) {
    Assert.ok(
      modeList_popupmenu
        .querySelector(`[value="${mode}"]`)
        .hasAttribute("checked")
    );
  }
}

/**
 * Check whether the expected folder mode is unselected in menus and internally.
 *
 * @param {string} mode - The name of the missing mode.
 */
function assert_mode_not_selected(mode) {
  Assert.ok(!tree.activeModes.includes(mode));

  // We need to open the menu because only then the right mode is set in them.
  if (["linux", "win"].includes(AppConstants.platform)) {
    // On OS X the main menu seems not accessible for clicking from tests.
    mc.click(view_menu);
    let popuplist = mc.click_menus_in_sequence(
      view_menupopup,
      [{ id: modeList_menu.parentNode.id }],
      true
    );
    Assert.ok(
      !modeList_menu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
    );
    mc.close_popup_sequence(popuplist);
  }

  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, mc.window);

  mc.click_through_appmenu([
    { id: "appmenu_View" },
    { id: "appmenu_FolderViews" },
  ]);

  Assert.ok(
    !modeList_appmenu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
  );

  mc.click(mc.e("buttonFolderList"));
  Assert.ok(
    !modeList_popupmenu
      .querySelector(`[value="${mode}"]`)
      .hasAttribute("checked")
  );
}

/**
 * Toggle the folder mode by clicking in the menu.
 *
 * @param mode  The base name of the mode to select.
 */
function select_mode_in_menu(mode) {
  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, mc.window);

  mc.click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_FolderViews" }],
    { value: mode }
  );
}

/**
 * Check the all folders mode.
 */
function subtest_toggle_all_folders(show) {
  let mode = "all";
  select_mode_in_menu(mode);

  if (show) {
    assert_mode_selected(mode);
  } else {
    assert_mode_not_selected(mode);
  }
}

/**
 * Check the unread folders mode.
 */
function subtest_toggle_unread_folders(show) {
  let mode = "unread";
  select_mode_in_menu(mode);

  if (show) {
    assert_mode_selected(mode);

    // Mode is hierarchical, parent folders are shown.
    assert_folder_visible(inboxFolder.server.rootFolder);
    assert_folder_visible(inboxFolder);
    assert_folder_visible(unreadFolder);
  } else {
    assert_mode_not_selected(mode);
  }
}

/**
 * Check the favorite folders mode.
 */
function subtest_toggle_favorite_folders(show) {
  let mode = "favorite";
  select_mode_in_menu(mode);

  if (show) {
    assert_mode_selected(mode);

    // Mode is hierarchical, parent folders are shown.
    assert_folder_visible(inboxFolder.server.rootFolder);
    assert_folder_visible(inboxFolder);
    assert_folder_visible(favoriteFolder);
  } else {
    assert_mode_not_selected(mode);
  }
}

/**
 * Check the recent folders mode.
 */
function subtest_toggle_recent_folders(show) {
  let mode = "recent";
  select_mode_in_menu(mode);

  if (show) {
    assert_mode_selected(mode);
  } else {
    assert_mode_not_selected(mode);
  }
}

/**
 * Check the smart folders mode.
 */
function subtest_toggle_smart_folders(show) {
  let mode = "smart";
  select_mode_in_menu(mode);

  if (show) {
    assert_mode_selected(mode);
  } else {
    assert_mode_not_selected(mode);
  }
}

/**
 * Toggle folder modes through different means and sequences.
 */
add_task(function test_toggling_modes() {
  subtest_toggle_all_folders(true);
  subtest_toggle_smart_folders(true);
  subtest_toggle_unread_folders(true);
  subtest_toggle_favorite_folders(true);
  subtest_toggle_recent_folders(true);

  subtest_toggle_unread_folders(false);
  subtest_toggle_favorite_folders(false);
  subtest_toggle_all_folders(false);
  subtest_toggle_recent_folders(false);
  subtest_toggle_smart_folders(false);

  // Confirm that the all folders mode is visible even after all the modes have
  // been deselected in order to ensure that the Folder Pane is never empty.
  assert_mode_selected("all");
});

registerCleanupFunction(function teardownModule() {
  inboxFolder.propagateDelete(unreadFolder, true, null);
  inboxFolder.propagateDelete(favoriteFolder, true, null);
  toggle_main_menu(menu_state);
});
