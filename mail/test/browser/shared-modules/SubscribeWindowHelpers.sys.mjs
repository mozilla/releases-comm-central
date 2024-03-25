/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  get_about_3pane,
  right_click_on_folder,
} from "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs";

import {
  input_value,
  delete_all_existing,
} from "resource://testing-common/mail/KeyboardHelpers.sys.mjs";

import {
  click_menus_in_sequence,
  promise_modal_dialog,
} from "resource://testing-common/mail/WindowHelpers.sys.mjs";

import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * Open a subscribe dialog from the context menu.
 *
 * @param {nsIMsgFolder} aFolder - The folder to open the subscribe dialog for.
 * @param {function} aFunction - Callback that will be invoked with a window
 *   for the subscribe dialogue as parameter.
 */
export async function open_subscribe_window_from_context_menu(
  aFolder,
  aFunction
) {
  const win = get_about_3pane();

  await right_click_on_folder(aFolder);
  const callback = async function (win) {
    // When the "stop button" is disabled, the panel is populated.
    await TestUtils.waitForCondition(
      () => win.document.getElementById("stopButton").disabled
    );
    await aFunction(win);
    win.close();
  };
  const dialogPromise = promise_modal_dialog("mailnews:subscribe", callback);
  await click_menus_in_sequence(
    win.document.getElementById("folderPaneContext"),
    [{ id: "folderPaneContext-subscribe" }]
  );
  await dialogPromise;
}

/**
 * Enter a string in the text box for the search value.
 *
 * @param {Window} swc - A subscribe window.
 * @param {string} text - The text to enter.
 */
export function enter_text_in_search_box(swc, text) {
  const textbox = swc.document.getElementById("namefield");
  delete_all_existing(swc, textbox);
  input_value(swc, text, textbox);
}

/**
 * Check whether the given newsgroup is in the searchview.
 *
 * @param {Window} swc - A subscribe window.
 * @param {string} name - Name of the newsgroup.
 * @returns {boolean} Result of the check.
 */
export function check_newsgroup_displayed(swc, name) {
  const tree = swc.document.getElementById("searchTree");
  if (!tree.columns) {
    // Maybe not yet available.
    return false;
  }
  const treeview = tree.view;
  const nameCol = tree.columns.getNamedColumn("nameColumn2");
  for (let i = 0; i < treeview.rowCount; i++) {
    if (treeview.getCellText(i, nameCol) == name) {
      return true;
    }
  }
  return false;
}
