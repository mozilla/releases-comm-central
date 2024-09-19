/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the behavior of the folder tree when hovering a dragged element over a
 * collapsed folder.
 */

"use strict";

var {
  assert_folder_collapsed,
  assert_folder_expanded,
  collapse_folder,
  inboxFolder,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var childFolder, dragFolder;

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const folderTree = about3Pane.folderTree;

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);
var result, dataTransfer;

add_setup(async function () {
  inboxFolder.createSubfolder("ChildFolder", null);
  childFolder = inboxFolder.getChildNamed("ChildFolder");
  inboxFolder.server.rootFolder.createSubfolder("DragFolder", null);
  dragFolder = inboxFolder.server.rootFolder.getChildNamed("DragFolder");

  registerCleanupFunction(() => {
    inboxFolder.propagateDelete(childFolder, true);
    dragFolder = inboxFolder.getChildNamed("DragFolder");
    inboxFolder.propagateDelete(dragFolder, true);
  });
});

/**
 * Test that dragging an element over a collapsed folder expands that folder
 * after 1 sec, while canceling the drag action collapses it again.
 */
add_task(async function dragAndCancel() {
  collapse_folder(inboxFolder);
  assert_folder_collapsed(inboxFolder);

  // Drag the element over the target folder.
  const dragRow = about3Pane.folderPane.getRowForFolder(dragFolder);
  const targetRow = about3Pane.folderPane.getRowForFolder(inboxFolder);
  dragService.startDragSessionForTests(
    about3Pane,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );
  [result, dataTransfer] = EventUtils.synthesizeDragOver(
    dragRow,
    targetRow,
    null,
    null,
    about3Pane,
    about3Pane
  );

  // The target folder should still be collapsed.
  const dragOverTs = Date.now();
  assert_folder_collapsed(inboxFolder);

  // The folder should be expanded after one second.
  await BrowserTestUtils.waitForEvent(folderTree, "expanded");
  Assert.greaterOrEqual(
    Date.now() - dragOverTs,
    1000,
    "Should expand folder after one second"
  );
  assert_folder_expanded(inboxFolder);

  // Cancel the drag action.
  const folderCollapsed = BrowserTestUtils.waitForEvent(
    folderTree,
    "collapsed"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  dataTransfer.dropEffect = "none";
  EventUtils.sendDragEvent(
    { type: "dragend", dataTransfer },
    targetRow,
    about3Pane
  );

  // The folder should be collapsed again.
  await folderCollapsed;
  assert_folder_collapsed(inboxFolder);
});

/**
 * Test that dragging an element over a collapsed folder expands that folder
 * after 1 sec, and the folder stays expanded after the element has been
 * dropped.
 */
add_task(async function dragAndDrop() {
  collapse_folder(inboxFolder);
  assert_folder_collapsed(inboxFolder);

  // Drag the element over the target folder.
  const dragRow = about3Pane.folderPane.getRowForFolder(dragFolder);
  const targetRow = about3Pane.folderPane.getRowForFolder(inboxFolder);
  dragService.startDragSessionForTests(
    about3Pane,
    Ci.nsIDragService.DRAGDROP_ACTION_MOVE
  );
  [result, dataTransfer] = EventUtils.synthesizeDragOver(
    dragRow,
    targetRow,
    null,
    null,
    about3Pane,
    about3Pane
  );

  // The target folder should still be collapsed.
  const dragOverTs = Date.now();
  assert_folder_collapsed(inboxFolder);

  // The folder should be expanded after one second.
  await BrowserTestUtils.waitForEvent(folderTree, "expanded");
  Assert.greaterOrEqual(
    Date.now() - dragOverTs,
    1000,
    "Should expand folder after one second"
  );
  assert_folder_expanded(inboxFolder);

  // Drop the element on the target folder.
  EventUtils.synthesizeDropAfterDragOver(
    result,
    dataTransfer,
    targetRow,
    about3Pane,
    { type: "drop" }
  );
  dragService.getCurrentSession().endDragSession(true);

  // The folder should still be expanded.
  assert_folder_expanded(inboxFolder);
});
