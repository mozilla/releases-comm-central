/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "assert_messages_in_search_view",
  "assert_search_window_folder_displayed",
  "close_search_window",
  "open_search_window",
  "open_search_window_from_context_menu",
  "select_click_search_row",
  "select_shift_click_search_row",
];

var { get_about_3pane, mc, right_click_on_folder } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var windowHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Assert } = ChromeUtils.importESModule(
  "resource://testing-common/Assert.sys.mjs"
);
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

/**
 * Open a search window using the accel-shift-f shortcut.
 *
 * @returns {Window} The search window.
 */
function open_search_window() {
  windowHelper.plan_for_new_window("mailnews:search");
  EventUtils.synthesizeKey("f", { shiftKey: true, accelKey: true }, mc);
  return windowHelper.wait_for_new_window("mailnews:search");
}

/**
 * Open a search window as if from the context menu. This needs the context menu
 * to be already open.
 *
 * @param {nsIMsgFolder} aFolder - The folder to open the search window for.
 * @returns {Window} The search window.
 */
async function open_search_window_from_context_menu(aFolder) {
  let win = get_about_3pane();
  let context = win.document.getElementById("folderPaneContext");
  let item = win.document.getElementById("folderPaneContext-searchMessages");
  await right_click_on_folder(aFolder);

  windowHelper.plan_for_new_window("mailnews:search");
  context.activateItem(item);
  return windowHelper.wait_for_new_window("mailnews:search");
}

/**
 * Close a search window by calling window.close().
 *
 * @param {Window} win - The search window to close.
 */
function close_search_window(win) {
  windowHelper.close_window(win);
}

/**
 * Assert that the given folder is selected in the search window.
 *
 * @param {Window} aWin - A search window.
 * @param {nsIMsgFolder} aFolder - The expected folder.
 */
function assert_search_window_folder_displayed(aWin, aFolder) {
  let currentFolder = aWin.gCurrentFolder;
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
function select_click_search_row(aViewIndex, aWin) {
  let tree = aWin.document.getElementById("threadTree");
  tree.scrollToRow(aViewIndex);
  let coords = tree.getCoordsForCellItem(
    aViewIndex,
    tree.columns.subjectCol,
    "cell"
  );
  let treeChildren = tree.lastElementChild;
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
function select_shift_click_search_row(aViewIndex, aWin) {
  let tree = aWin.document.getElementById("threadTree");
  tree.scrollToRow(aViewIndex);
  let coords = tree.getCoordsForCellItem(
    aViewIndex,
    tree.columns.subjectCol,
    "cell"
  );
  let treeChildren = tree.lastElementChild;
  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
    { shiftKey: true },
    aWin
  );

  utils.sleep(0);
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
function assert_messages_in_search_view(aSynSets, aWin) {
  if (!Array.isArray(aSynSets)) {
    aSynSets = [aSynSets];
  }

  // Iterate over all the message sets, retrieving the message header.  Use
  // this to construct a URI to populate a dictionary mapping.
  let synMessageURIs = {}; // map URI to message header
  for (let messageSet of aSynSets) {
    for (let msgHdr of messageSet.msgHdrs()) {
      synMessageURIs[msgHdr.folder.getUriForMsg(msgHdr)] = msgHdr;
    }
  }

  // Iterate over the contents of the view, nulling out values in
  // synMessageURIs for found messages, and exploding for missing ones.
  let dbView = aWin.gFolderDisplay.view.dbView;
  let treeView = aWin.gFolderDisplay.view.dbView.QueryInterface(Ci.nsITreeView);
  let rowCount = treeView.rowCount;

  for (let iViewIndex = 0; iViewIndex < rowCount; iViewIndex++) {
    let msgHdr = dbView.getMsgHdrAt(iViewIndex);
    let uri = msgHdr.folder.getUriForMsg(msgHdr);
    Assert.ok(
      uri in synMessageURIs,
      "The view should show the message header" + msgHdr.messageKey
    );
    delete synMessageURIs[uri];
  }

  // Iterate over our URI set and make sure every message was shown.
  for (let uri in synMessageURIs) {
    let msgHdr = synMessageURIs[uri];
    Assert.ok(
      false,
      "The view is should include the message header" + msgHdr.messageKey
    );
  }
}
