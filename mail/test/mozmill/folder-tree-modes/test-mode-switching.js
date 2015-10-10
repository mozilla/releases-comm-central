/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Bug 978592.
 * Test that switching folder modes via menu works and also compact versions
 * can be toggled properly.
 */

var MODULE_NAME = "test-unread-folders";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers"];

var rootFolder;
var inboxFolder;
var unreadFolder;
var favoriteFolder;
var toggle_menu;
var toggle_appmenu;
var tree;
var modeList_menu;
var modeList_appmenu;
var view_menu;
var view_appmenu;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  rootFolder = inboxFolder.server.rootFolder;

  // Create one folder with unread messages and one favorite folder.
  inboxFolder.createSubfolder("UnreadFolder", null);
  unreadFolder = inboxFolder.getChildNamed("UnreadFolder");

  inboxFolder.createSubfolder("FavoriteFolder", null);
  favoriteFolder = inboxFolder.getChildNamed("FavoriteFolder");

  make_new_sets_in_folder(unreadFolder, [{count: 1}]);
  favoriteFolder.flags |= Ci.nsMsgFolderFlags.Favorite;

  toggle_menu = mc.e("menu_compactFolderView");
  toggle_appmenu = mc.e("appmenu_compactFolderView");

  modeList_menu = mc.e("menu_FolderViewsPopup");
  modeList_appmenu = mc.e("appmenu_FolderViewsPopup");

  view_menu = mc.e("menu_View_Popup");
  view_appmenu = mc.e("appmenu-popup");

  tree = mc.folderTreeView;

  select_no_folders();
}

/**
 * Check if both "Compact view" checkboxes in menu are of the expected state.
 *
 * @param aChecked  Boolean whether checkbox should be checked or not.
 * @param aDisabled  Optional boolean whether the menuitem should be disabled..
 */
function assert_compact_state(aChecked, aDisabled) {
  assert_equals(toggle_menu.hasAttribute("checked"), aChecked);
  assert_equals(toggle_appmenu.hasAttribute("checked"), aChecked);
  if (aDisabled != undefined) {
    assert_equals(toggle_menu.disabled, aDisabled);
    assert_equals(toggle_appmenu.disabled, aDisabled);
  }
}

/**
 * Check whether the expected folder mode is selected in menus and internally.
 *
 * @param aMode  The name of the expected mode.
 */
function assert_mode_selected(aMode) {
  assert_equals(tree.mode, aMode);
  let baseMode = tree.baseMode();
  assert_compact_state(baseMode != tree.mode);
  // We need to open the menu because only then the right mode is set in them.
  if (!mc.mozmillModule.isMac) {
    // On OS X the main menu seems not accessible for clicking from mozmill.
    popuplist = mc.click_menus_in_sequence(view_menu, [ { id: modeList_menu.parentNode.id } ], true);
    assert_true(modeList_menu.querySelector('[value="' + baseMode + '"]').hasAttribute("checked"));
    mc.close_popup_sequence(popuplist);
  }
  popuplist = mc.click_menus_in_sequence(view_appmenu, [ { id: modeList_appmenu.parentNode.id } ], true);
  assert_true(modeList_menu.querySelector('[value="' + baseMode + '"]').hasAttribute("checked"));
  mc.close_popup_sequence(popuplist);
}

/**
 * Toggle the folder mode by clicking in the menu.
 *
 * @param aMode  The base name of the mode to select.
 */
function select_mode_in_menu(aMode) {
  mc.click_menus_in_sequence(view_appmenu, [ { id: modeList_appmenu.parentNode.id },
                                             { value: aMode } ]);
}

/**
 * Toggle the Compact view option by clicking in the menu.
 */
function toggle_compact_in_menu() {
  // For some reason, clicking the menuitem does not work by any means,
  // therefore we just simulate it here.
  let checked = toggle_appmenu.hasAttribute("checked");
  if (checked)
    toggle_appmenu.removeAttribute("checked");
  else
    toggle_appmenu.setAttribute("checked", "true");

  toggle_appmenu.doCommand();
}

/**
 * Check the all folders mode.
 */
function subtest_switch_to_all_folders(aViaMenu) {
  const mode = "all";
  if (aViaMenu)
    select_mode_in_menu(mode);
  else
    tree.mode = mode;

  assert_mode_selected(mode);
  assert_compact_state(false, true);

  // This mode should be rejected as it doesn't exist.
  tree.mode = mode + "_compact";
  assert_mode_selected(mode);
}

/**
 * Check the unread folder mode.
 */
function subtest_switch_to_unread_folders(aViaMenu) {
  const mode = "unread";
  if (aViaMenu) {
    select_mode_in_menu(mode);
    // We came from "favorites_compact" so just toggling to "unread"
    // in UI produces "unread_compact".
    assert_mode_selected(mode + "_compact");
    // OK, now turn "compact" off.
    toggle_compact_in_menu();
  } else {
    tree.mode = mode;
  }

  assert_mode_selected(mode);
  assert_compact_state(false, false);

  // Mode is hierarchical, parent folders are shown.
  assert_folder_visible(inboxFolder.server.rootFolder);
  assert_folder_visible(inboxFolder);
  assert_folder_visible(unreadFolder);
  assert_folder_not_visible(favoriteFolder);

  if (aViaMenu)
    toggle_compact_in_menu();
  else
    tree.mode = mode + "_compact";

  assert_mode_selected(mode + "_compact");
  // In compact mode parent folders are not shown.
  assert_folder_not_visible(inboxFolder.server.rootFolder);
  assert_folder_not_visible(inboxFolder);
  assert_folder_visible(unreadFolder);
  assert_folder_not_visible(favoriteFolder);
}

/**
 * Check the favorite folder mode.
 */
function subtest_switch_to_favorite_folders(aViaMenu) {
  const mode = "favorite";
  if (aViaMenu) {
    select_mode_in_menu(mode);
    // We came from "unread_compact" so just toggling to "favorite"
    // in UI produces "favorite_compact".
    assert_mode_selected(mode + "_compact");
    // OK, now turn "compact" off.
    toggle_compact_in_menu();
  } else {
    tree.mode = mode;
  }

  assert_mode_selected(mode);
  assert_compact_state(false, false);

  // Mode is hierarchical, parent folders are shown.
  assert_folder_visible(inboxFolder.server.rootFolder);
  assert_folder_visible(inboxFolder);
  assert_folder_not_visible(unreadFolder);
  assert_folder_visible(favoriteFolder);

  if (aViaMenu)
    toggle_compact_in_menu();
  else
    tree.mode = mode + "_compact";

  assert_mode_selected(mode + "_compact");
  // In compact mode parent folders are not shown.
  assert_folder_not_visible(inboxFolder.server.rootFolder);
  assert_folder_not_visible(inboxFolder);
  assert_folder_not_visible(unreadFolder);
  assert_folder_visible(favoriteFolder);
}

/**
 * Check the recent folder mode.
 */
function subtest_switch_to_recent_folders(aViaMenu) {
  const mode = "recent_compact";
  if (aViaMenu)
    select_mode_in_menu("recent");
  else
    tree.mode = mode;

  assert_mode_selected(mode);
  assert_compact_state(true, true);

  // This mode should be rejected as it doesn't exist.
  tree.mode = "recent";
  assert_mode_selected(mode);
}

/**
 * Check the smart folder mode.
 */
function subtest_switch_to_smart_folders(aViaMenu) {
  const mode = "smart";
  if (aViaMenu)
    select_mode_in_menu(mode);
  else
    tree.mode = mode;

  assert_mode_selected(mode);
  assert_compact_state(false, true);

  // This mode should be rejected as it doesn't exist.
  tree.mode = mode + "_compact";
  assert_mode_selected(mode);
}

/**
 * Toggle folder modes through different means and sequences.
 */
function test_toggling_modes() {
  subtest_switch_to_all_folders(false);
  subtest_switch_to_smart_folders(false);

  subtest_switch_to_unread_folders(false);
  subtest_switch_to_favorite_folders(false);
  subtest_switch_to_recent_folders(false);

  subtest_switch_to_unread_folders(true);
  subtest_switch_to_favorite_folders(true);
  subtest_switch_to_recent_folders(true);

  subtest_switch_to_smart_folders(true);
  subtest_switch_to_all_folders(true);
}

function teardownModule() {
  tree.mode = "all";
  inboxFolder.propagateDelete(unreadFolder, true, null);
  inboxFolder.propagateDelete(favoriteFolder, true, null);
}
