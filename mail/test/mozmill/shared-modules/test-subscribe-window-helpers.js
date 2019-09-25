/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var MODULE_NAME = "subscribe-window-helpers";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers"];

var { input_value, delete_all_existing } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);
var windowHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var folderDisplayHelper;
var mc;

function setupModule() {
  folderDisplayHelper = collector.getModule("folder-display-helpers");
  mc = folderDisplayHelper.mc;
}

function installInto(module) {
  setupModule();

  // Now copy helper functions
  module.open_subscribe_window_from_context_menu = open_subscribe_window_from_context_menu;
  module.enter_text_in_search_box = enter_text_in_search_box;
  module.check_newsgroup_displayed = check_newsgroup_displayed;
}

/**
 * Open a subscribe dialog from the context menu.
 *
 * @param aFolder the folder to open the subscribe dialog for
 * @param aFunction Callback that will be invoked with a controller
 *        for the subscribe dialogue as parameter
 */
function open_subscribe_window_from_context_menu(aFolder, aFunction) {
  folderDisplayHelper.right_click_on_folder(aFolder);
  let callback = function(controller) {
    // When the "stop button" is disabled, the panel is populated.
    controller.waitFor(() => controller.e("stopButton").disabled);
    aFunction(controller);
  };
  windowHelper.plan_for_modal_dialog("mailnews:subscribe", callback);
  mc.click(mc.eid("folderPaneContext-subscribe"));
  windowHelper.wait_for_modal_dialog("mailnews:subscribe");
  folderDisplayHelper.close_popup(mc, mc.eid("folderPaneContext"));
}

/**
 * Enter a string in the text box for the search value.
 *
 * @param swc A controller for a subscribe dialog
 * @param text The text to enter
 */
function enter_text_in_search_box(swc, text) {
  let textbox = swc.eid("namefield");
  delete_all_existing(swc, textbox);
  input_value(swc, text, textbox);
}

/**
 * Check that the search view is currently displayed.
 *
 * @param swc A controller for the subscribe window.
 * @returns {Boolean} Result of the check.
 */
function check_searchview(swc) {
  return swc.eid("subscribedeck").selectedIndex == 1;
}

/**
 * Check whether the given newsgroup is in the searchview.
 *
 * @param swc A controller for the subscribe window
 * @param name Name of the newsgroup
 * @returns {Boolean} Result of the check
 */
function check_newsgroup_displayed(swc, name) {
  let tree = swc.eid("searchTree").getNode();
  let treeview = tree.view;
  let nameCol = tree.columns.getColumnFor(swc.eid("nameColumn2").getNode());
  for (let i = 0; i < treeview.rowCount; i++) {
    if (treeview.getCellText(i, nameCol) == name) {
      return true;
    }
  }
  return false;
}

/**
 * Close a search window by calling window.close() on the controller.
 *
 * @param swc A controller for the subscribe window
 */
function close_subscribe_window(swc) {
  windowHelper.close_window(swc);
}
