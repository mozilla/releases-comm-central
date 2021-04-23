/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "open_subscribe_window_from_context_menu",
  "enter_text_in_search_box",
  "check_newsgroup_displayed",
];

var folderDisplayHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { input_value, delete_all_existing } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);
var windowHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var mc = folderDisplayHelper.mc;

/**
 * Open a subscribe dialog from the context menu.
 *
 * @param aFolder the folder to open the subscribe dialog for
 * @param aFunction Callback that will be invoked with a controller
 *        for the subscribe dialogue as parameter
 */
async function open_subscribe_window_from_context_menu(aFolder, aFunction) {
  // Make the folder pane visible as it starts collapsed when no accounts are
  // available on startup.
  mc.e("folderPaneBox").collapsed = false;

  folderDisplayHelper.right_click_on_folder(aFolder);
  let callback = function(controller) {
    // When the "stop button" is disabled, the panel is populated.
    controller.waitFor(() => controller.e("stopButton").disabled);
    aFunction(controller);
  };
  windowHelper.plan_for_modal_dialog("mailnews:subscribe", callback);
  mc.click(mc.e("folderPaneContext-subscribe"));
  windowHelper.wait_for_modal_dialog("mailnews:subscribe");
  await folderDisplayHelper.close_popup(mc, mc.e("folderPaneContext"));
}

/**
 * Enter a string in the text box for the search value.
 *
 * @param swc A controller for a subscribe dialog
 * @param text The text to enter
 */
function enter_text_in_search_box(swc, text) {
  let textbox = swc.e("namefield");
  delete_all_existing(swc, textbox);
  input_value(swc, text, textbox);
}

/**
 * Check whether the given newsgroup is in the searchview.
 *
 * @param swc A controller for the subscribe window
 * @param name Name of the newsgroup
 * @returns {Boolean} Result of the check
 */
function check_newsgroup_displayed(swc, name) {
  let tree = swc.e("searchTree");
  if (!tree.columns) {
    // Maybe not yet available.
    return false;
  }
  let treeview = tree.view;
  let nameCol = tree.columns.getNamedColumn("nameColumn2");
  for (let i = 0; i < treeview.rowCount; i++) {
    if (treeview.getCellText(i, nameCol) == name) {
      return true;
    }
  }
  return false;
}
