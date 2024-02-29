/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the ability to switch between multiple folder modes.
 */

"use strict";

var {
  assert_folder_visible,
  inboxFolder,
  make_message_sets_in_folders,
  toggle_main_menu,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { MailTelemetryForTests } = ChromeUtils.importESModule(
  "resource:///modules/MailGlue.sys.mjs"
);
var { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);
var { click_menus_in_sequence, click_through_appmenu, close_popup_sequence } =
  ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var unreadFolder;
var favoriteFolder;
var modeList_menu;
var modeList_appmenu;
var view_menu;
var view_menupopup;
var appmenu_button;
var appmenu_popup;
var menu_state;
var about3Pane;

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 2 : 1);

add_setup(async function () {
  // Create one folder with unread messages and one favorite folder.
  inboxFolder.createSubfolder("UnreadFolder", null);
  unreadFolder = inboxFolder.getChildNamed("UnreadFolder");

  inboxFolder.createSubfolder("FavoriteFolder", null);
  favoriteFolder = inboxFolder.getChildNamed("FavoriteFolder");

  await make_message_sets_in_folders([unreadFolder], [{ count: 1 }]);
  favoriteFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);

  modeList_menu = document.getElementById("menu_FolderViewsPopup");
  modeList_appmenu = document.getElementById("appMenu-foldersView");

  view_menu = document.getElementById("menu_View");
  view_menupopup = document.getElementById("menu_View_Popup");
  appmenu_button = document.getElementById("button-appmenu");
  appmenu_popup = document.getElementById("appMenu-popup");

  // Main menu is needed for this whole test file.
  menu_state = await toggle_main_menu(true);

  about3Pane = document.getElementById("tabmail").currentAbout3Pane;

  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );
  Services.telemetry.clearScalars();
});

/**
 * Check whether the expected folder mode is selected in menus and internally.
 *
 * @param {string} aMode - The name of the expected mode.
 */
async function assert_mode_selected(aMode) {
  if (aMode != "compact") {
    // "compact" isn't really a mode, we're just using this function because
    // it tests everything we want to test.
    Assert.ok(about3Pane.folderPane.activeModes.includes(aMode));
  }

  // We need to open the menu because only then the right mode is set in them.
  if (["linux", "win"].includes(AppConstants.platform)) {
    // On OS X the main menu seems not accessible for clicking from tests.
    EventUtils.synthesizeMouseAtCenter(view_menu, { clickCount: 1 }, window);
    const popuplist = await click_menus_in_sequence(
      view_menupopup,
      [{ id: modeList_menu.parentNode.id }],
      true
    );
    for (const mode of about3Pane.folderPane.activeModes) {
      Assert.ok(
        modeList_menu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
      );
    }
    close_popup_sequence(popuplist);
  }

  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, window);
  await click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_FolderViews" }],
    null,
    window
  );
  for (const mode of about3Pane.folderPane.activeModes) {
    Assert.ok(
      modeList_appmenu
        .querySelector(`[value="${mode}"]`)
        .hasAttribute("checked")
    );
  }
  appmenu_popup.hidePopup();
}

/**
 * Check whether the expected folder mode is unselected in menus and internally.
 *
 * @param {string} mode - The name of the missing mode.
 */
async function assert_mode_not_selected(mode) {
  Assert.ok(!about3Pane.folderPane.activeModes.includes(mode));

  // We need to open the menu because only then the right mode is set in them.
  if (["linux", "win"].includes(AppConstants.platform)) {
    // On OS X the main menu seems not accessible for clicking from tests.
    EventUtils.synthesizeMouseAtCenter(view_menu, { clickCount: 1 }, window);
    const popuplist = await click_menus_in_sequence(
      view_menupopup,
      [{ id: modeList_menu.parentNode.id }],
      true
    );
    Assert.ok(
      !modeList_menu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
    );
    close_popup_sequence(popuplist);
  }

  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, window);
  await click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_FolderViews" }],
    null,
    window
  );
  Assert.ok(
    !modeList_appmenu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
  );
  appmenu_popup.hidePopup();
}

/**
 * Toggle the folder mode by clicking in the menu.
 *
 * @param mode  The base name of the mode to select.
 */
async function select_mode_in_menu(mode) {
  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, window);
  await click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_FolderViews" }],
    { value: mode },
    window
  );
  appmenu_popup.hidePopup();
}

/**
 * Check the all folders mode.
 */
async function subtest_toggle_all_folders(show) {
  const mode = "all";
  await select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the unread folders mode.
 */
async function subtest_toggle_unread_folders(show) {
  const mode = "unread";
  await select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);

    // Mode is hierarchical, parent folders are shown.
    assert_folder_visible(inboxFolder.server.rootFolder);
    assert_folder_visible(inboxFolder);
    assert_folder_visible(unreadFolder);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the favorite folders mode.
 */
async function subtest_toggle_favorite_folders(show) {
  const mode = "favorite";
  await select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);

    // Mode is hierarchical, parent folders are shown.
    assert_folder_visible(inboxFolder.server.rootFolder);
    assert_folder_visible(inboxFolder);
    assert_folder_visible(favoriteFolder);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the recent folders mode.
 */
async function subtest_toggle_recent_folders(show) {
  const mode = "recent";
  await select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the smart folders mode.
 */
async function subtest_toggle_smart_folders(show) {
  const mode = "smart";
  await select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Toggle the compact mode.
 */
async function subtest_toggle_compact(compact) {
  const mode = "compact";
  await select_mode_in_menu(mode);

  if (compact) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Toggle the compact mode.
 */
async function subtest_toggle_tags(show) {
  const mode = "tags";
  await select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check that the current mode(s) are accurately recorded in telemetry.
 * Note that `reportUIConfiguration` usually only runs at start-up.
 */
function check_scalars(expected) {
  MailTelemetryForTests.reportUIConfiguration();
  const scalarName = "tb.ui.configuration.folder_tree_modes";
  const scalars = TelemetryTestUtils.getProcessScalars("parent");
  if (expected) {
    TelemetryTestUtils.assertScalar(scalars, scalarName, expected);
  } else {
    TelemetryTestUtils.assertScalarUnset(scalars, scalarName);
  }
}

/**
 * Toggle folder modes through different means and sequences.
 */
add_task(async function test_toggling_modes() {
  check_scalars();

  await subtest_toggle_all_folders(true);
  await subtest_toggle_smart_folders(true);
  check_scalars("all,smart");

  await subtest_toggle_tags(true);
  check_scalars("all,smart,tags");

  await subtest_toggle_unread_folders(true);
  await subtest_toggle_favorite_folders(true);
  await subtest_toggle_recent_folders(true);
  check_scalars("all,smart,tags,unread,favorite,recent");

  await subtest_toggle_compact(true);
  check_scalars("all,smart,tags,unread,favorite,recent (compact)");

  await subtest_toggle_unread_folders(false);
  check_scalars("all,smart,tags,favorite,recent (compact)");

  await subtest_toggle_compact(false);
  check_scalars("all,smart,tags,favorite,recent");

  await subtest_toggle_favorite_folders(false);
  check_scalars("all,smart,tags,recent");

  await subtest_toggle_all_folders(false);
  await subtest_toggle_recent_folders(false);
  await subtest_toggle_smart_folders(false);
  await subtest_toggle_tags(false);

  // Confirm that the all folders mode is visible even after all the modes have
  // been deselected in order to ensure that the Folder Pane is never empty.
  await assert_mode_selected("all");
  check_scalars("all");
});

registerCleanupFunction(async function () {
  inboxFolder.propagateDelete(unreadFolder, true);
  inboxFolder.propagateDelete(favoriteFolder, true);
  await toggle_main_menu(menu_state);
});
