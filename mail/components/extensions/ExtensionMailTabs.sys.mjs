/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * Returns the message belonging to the specified row index. If requested, all
 * collapsed messages are returned as well, if any.
 *
 * @param {DBViewWrapper} dbView
 * @param {integer} idx - the row index of the view
 * @param {boolean} includeCollapsedThreads - wether to include messages in
 *    collapsed threads as well
 *
 * @returns {nsIMsgDBHdr[]} The message(s) belonging to the specified row index.
 */
export function getMsgHdrsForIndex(dbView, idx, includeCollapsedThreads) {
  if (
    includeCollapsedThreads &&
    dbView.isContainer(idx) &&
    !dbView.isContainerOpen(idx)
  ) {
    const thread = dbView.getThreadContainingIndex(idx);
    const children = [];
    for (let i = 0; i < thread.numChildren; i++) {
      children.push(thread.getChildHdrAt(i));
    }
    return children;
  }
  return [dbView.getMsgHdrAt(idx)];
}

/**
 * Returns the actual selected messages. This is different from the menus API,
 * which returns the selection with respect to the context action, which could be
 * just the message being clicked, if that message is *not* part of the actually
 * selected messages.
 *
 * @param {Window} about3PaneWindow
 * @returns {nsIMsgDBHdr[]} The selected messages.
 */
export function getActualSelectedMessages(about3PaneWindow) {
  const dbView = about3PaneWindow?.gDBView;
  if (!dbView) {
    return [];
  }

  // Get the indicies which are considered to be selected by the UI, which
  // could be the ones we are *not* interested in, if a context menu is
  // opened and the UI is supressing the selection.
  const selectedIndices = about3PaneWindow.threadTree.selectedIndices;

  if (!about3PaneWindow.threadTree._selection._selectEventsSuppressed) {
    return selectedIndices.flatMap(idx =>
      getMsgHdrsForIndex(dbView, idx, true)
    );
  }

  // Get the indicies, which are considered to be invalid by the UI, which
  // includes *all* selected indices, if the UI is supressing the selection.
  // Filter out the indicies we are not interested in.
  const invalidIndices = [
    ...about3PaneWindow.threadTree._selection._invalidIndices,
  ];
  return invalidIndices
    .filter(idx => !selectedIndices.includes(idx))
    .flatMap(idx => getMsgHdrsForIndex(dbView, idx, true));
}

/**
 * Returns the actual selected folders. This is different from the menus API,
 * which returns the selection with respect to the context action, which could be
 * just the folder being clicked, if that folder is *not* part of the actually
 * selected folder.
 *
 * @param {Window} about3PaneWindow
 * @returns {nsIMsgFolder[]} The selected folders.
 */
export function getActualSelectedFolders(about3PaneWindow) {
  return [...about3PaneWindow.folderTree.selection.values()].map(row =>
    MailServices.folderLookup.getFolderForURL(row.uri)
  );
}
