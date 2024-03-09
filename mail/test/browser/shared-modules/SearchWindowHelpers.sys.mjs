/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  get_about_3pane,
  mc,
  right_click_on_folder,
} from "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs";

import { promise_new_window } from "resource://testing-common/mozmill/WindowHelpers.sys.mjs";

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import * as EventUtils from "resource://testing-common/mozmill/EventUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * Open a search window using the accel-shift-f shortcut.
 *
 * @returns {Window} The search window.
 */
export async function open_search_window() {
  const searchPromise = promise_new_window("mailnews:search");
  EventUtils.synthesizeKey("f", { shiftKey: true, accelKey: true }, mc);
  return searchPromise;
}

/**
 * Open a search window as if from the context menu. This needs the context menu
 * to be already open.
 *
 * @param {nsIMsgFolder} aFolder - The folder to open the search window for.
 * @returns {Window} The search window.
 */
export async function open_search_window_from_context_menu(aFolder) {
  const win = get_about_3pane();
  const context = win.document.getElementById("folderPaneContext");
  const item = win.document.getElementById("folderPaneContext-searchMessages");
  await right_click_on_folder(aFolder);

  const searchPromise = promise_new_window("mailnews:search");
  context.activateItem(item);
  return searchPromise;
}

/**
 * Close a search window by calling window.close().
 *
 * @param {Window} win - The search window to close.
 */
export async function close_search_window(win) {
  await BrowserTestUtils.closeWindow(win);
  await TestUtils.waitForTick();
}

/**
 * Assert that the given folder is selected in the search window.
 *
 * @param {Window} aWin - A search window.
 * @param {nsIMsgFolder} aFolder - The expected folder.
 */
export function assert_search_window_folder_displayed(aWin, aFolder) {
  const currentFolder = aWin.gCurrentFolder;
  Assert.equal(
    currentFolder,
    aFolder,
    "The search window's selected folder should have been: " +
      aFolder.prettyName +
      ", but is actually: " +
      currentFolder?.prettyName
  );
}

/**
 * Pretend we are clicking on a row with our mouse.
 *
 * @param {number} aViewIndex - The view index to click.
 * @param {Window} aWin - The window in whose context to do this.
 * @returns {nsIMsgDBHdr} The message header selected.
 */
export function select_click_search_row(aViewIndex, aWin) {
  const tree = aWin.document.getElementById("threadTree");
  tree.scrollToRow(aViewIndex);
  const coords = tree.getCoordsForCellItem(
    aViewIndex,
    tree.columns.subjectCol,
    "cell"
  );
  const treeChildren = tree.lastElementChild;
  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
    {},
    aWin
  );

  return aWin.gFolderDisplay.view.dbView.getMsgHdrAt(aViewIndex);
}

/**
 * Pretend we are clicking on a row with our mouse with the shift key pressed,
 * adding all the messages between the shift pivot and the shift selected row.
 *
 * @param {number} aViewIndex - The view index to click.
 * @param {Window} aWin - The window in whose context to do this.
 * @returns {nsIMsgDBHdr[]} The message headers for all messages that are now
 *   selected.
 */
export async function select_shift_click_search_row(aViewIndex, aWin) {
  const tree = aWin.document.getElementById("threadTree");
  tree.scrollToRow(aViewIndex);
  const coords = tree.getCoordsForCellItem(
    aViewIndex,
    tree.columns.subjectCol,
    "cell"
  );
  const treeChildren = tree.lastElementChild;
  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
    { shiftKey: true },
    aWin
  );

  await TestUtils.waitForTick();
  return aWin.gFolderDisplay.selectedMessages;
}

/**
 * Assert that the given synthetic message sets are present in the folder
 * display.
 *
 * Verify that the messages in the provided SyntheticMessageSets are the only
 * visible messages in the provided DBViewWrapper.
 *
 * @param {SyntheticMessageSet} aSynSets - Either a single SyntheticMessageSet
 *   or a list of them.
 * @param {Window} aWin - The window which we get the folderDisplay property from.
 */
export function assert_messages_in_search_view(aSynSets, aWin) {
  if (!Array.isArray(aSynSets)) {
    aSynSets = [aSynSets];
  }

  // Iterate over all the message sets, retrieving the message header.  Use
  // this to construct a URI to populate a dictionary mapping.
  const synMessageURIs = {}; // map URI to message header
  for (const messageSet of aSynSets) {
    for (const msgHdr of messageSet.msgHdrs()) {
      synMessageURIs[msgHdr.folder.getUriForMsg(msgHdr)] = msgHdr;
    }
  }

  // Iterate over the contents of the view, nulling out values in
  // synMessageURIs for found messages, and exploding for missing ones.
  const dbView = aWin.gFolderDisplay.view.dbView;
  const treeView = aWin.gFolderDisplay.view.dbView.QueryInterface(
    Ci.nsITreeView
  );
  const rowCount = treeView.rowCount;

  for (let iViewIndex = 0; iViewIndex < rowCount; iViewIndex++) {
    const msgHdr = dbView.getMsgHdrAt(iViewIndex);
    const uri = msgHdr.folder.getUriForMsg(msgHdr);
    Assert.ok(
      uri in synMessageURIs,
      "The view should show the message header" + msgHdr.messageKey
    );
    delete synMessageURIs[uri];
  }

  // Iterate over our URI set and make sure every message was shown.
  for (const uri in synMessageURIs) {
    const msgHdr = synMessageURIs[uri];
    Assert.ok(
      false,
      "The view is should include the message header" + msgHdr.messageKey
    );
  }
}
