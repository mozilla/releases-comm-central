/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "open_search_window",
  "open_search_window_from_context_menu",
  "close_search_window",
  "assert_search_window_folder_displayed",
];

var folderDisplayHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var windowHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var mc = folderDisplayHelper.mc;

/**
 * Open a search window using the accel-shift-f shortcut.
 *
 * @returns the controller for the search window
 */
function open_search_window() {
  windowHelper.plan_for_new_window("mailnews:search");
  EventUtils.synthesizeKey("f", { shiftKey: true, accelKey: true }, mc.window);
  return windowHelper.wait_for_new_window("mailnews:search");
}

/**
 * Open a search window as if from the context menu. This needs the context menu
 * to be already open.
 *
 * @param aFolder the folder to open the search window for
 * @returns the controller for the search window
 */
async function open_search_window_from_context_menu(aFolder) {
  folderDisplayHelper.right_click_on_folder(aFolder);

  windowHelper.plan_for_new_window("mailnews:search");
  mc.folderTreeController.searchMessages();
  let swc = windowHelper.wait_for_new_window("mailnews:search");

  await folderDisplayHelper.close_popup(mc, mc.e("folderPaneContext"));

  return swc;
}

/**
 * Close a search window by calling window.close() on the controller.
 */
function close_search_window(aController) {
  windowHelper.close_window(aController);
}

/**
 * Assert that the given folder is selected in the search window corresponding
 * to the given controller.
 */
function assert_search_window_folder_displayed(aController, aFolder) {
  let currentFolder = aController.currentFolder;
  if (currentFolder != aFolder) {
    throw new Error(
      "The search window's selected folder should have been: " +
        aFolder.prettyName +
        ", but is actually: " +
        currentFolder.prettyName
    );
  }
}
