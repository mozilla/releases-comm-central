/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the Drag and Drop functionalities of the attachment bucket in the
 * message compose window.
 */

/* globals gFolderTreeView */

"use strict";

var { open_compose_new_mail, close_compose_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);

var { be_in_folder, FAKE_SERVER_HOSTNAME } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

add_task(function setupModule(module) {
  gFolderTreeView._tree.focus();
});

registerCleanupFunction(function teardownModule(module) {
  // Work around this test timing out at completion because of focus weirdness.
  window.gFolderDisplay.tree.focus();
});

function getDragOverTarget(win) {
  return win.document.getElementById("appcontent");
}

function getDropTarget(win) {
  return win.document.getElementById("dropAttachmentOverlay");
}

function initDragSession({ dragData, dropEffect }) {
  let dropAction;
  switch (dropEffect) {
    case null:
    case undefined:
    case "move":
      dropAction = Ci.nsIDragService.DRAGDROP_ACTION_MOVE;
      break;
    case "copy":
      dropAction = Ci.nsIDragService.DRAGDROP_ACTION_COPY;
      break;
    case "link":
      dropAction = Ci.nsIDragService.DRAGDROP_ACTION_LINK;
      break;
    default:
      throw new Error(`${dropEffect} is an invalid drop effect value`);
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.dropEffect = dropEffect;

  for (let i = 0; i < dragData.length; i++) {
    const item = dragData[i];
    for (let j = 0; j < item.length; j++) {
      dataTransfer.mozSetDataAt(item[j].type, item[j].data, i);
    }
  }

  dragService.startDragSessionForTests(dropAction);
  const session = dragService.getCurrentSession();
  session.dataTransfer = dataTransfer;

  return session;
}

/**
 * Helper method to simulate a drag and drop action above the window.
 */
async function simulateDragAndDrop(win, dragData, type) {
  let dropTarget = getDropTarget(win);
  let dragOverTarget = getDragOverTarget(win);
  let dropEffect = "move";

  let session = initDragSession({ dragData, dropEffect });

  info("Simulate drag over and wait for the drop target to be visible");

  EventUtils.synthesizeDragOver(
    dragOverTarget,
    dragOverTarget,
    dragData,
    dropEffect,
    win
  );

  // This make sure that the fake dataTransfer has still
  // the expected drop effect after the synthesizeDragOver call.
  session.dataTransfer.dropEffect = "move";

  await BrowserTestUtils.waitForCondition(
    () => dropTarget.classList.contains("show"),
    "Wait for the drop target element to be visible"
  );

  // If the dragged file is an image, the attach inline container should be
  // visible.
  if (type == "image" || type == "inline") {
    await BrowserTestUtils.waitForCondition(
      () =>
        !win.document.getElementById("addInline").classList.contains("hidden"),
      "Wait for the addInline element to be visible"
    );
  } else {
    await BrowserTestUtils.waitForCondition(
      () =>
        win.document.getElementById("addInline").classList.contains("hidden"),
      "Wait for the addInline element to be hidden"
    );
  }

  if (type == "inline") {
    // Change the drop target to the #addInline container.
    dropTarget = win.document.getElementById("addInline");
  }

  info("Simulate drop dragData on drop target");

  EventUtils.synthesizeDropAfterDragOver(
    null,
    session.dataTransfer,
    dropTarget,
    win,
    { _domDispatchOnly: true }
  );

  if (type == "inline") {
    // The dropped file shouldn't be attached but appended inline the msg body.
    await BrowserTestUtils.waitForCondition(
      () => win.document.getElementById("attachmentBucket").itemCount == 0,
      "Confirm the file hasn't been attached"
    );

    let editor = win.GetCurrentEditor();
    editor.selectAll();
    let image = editor.getSelectedElement("img");

    await BrowserTestUtils.waitForCondition(
      () => image != null,
      "Confirm the image was added to the message body"
    );
  } else {
    // The dropped files should have been attached.
    await BrowserTestUtils.waitForCondition(
      () =>
        win.document.getElementById("attachmentBucket").itemCount ==
        dragData.length,
      "Wait for the file to be attached"
    );
  }

  dragService.endDragSession(true);
}

/**
 * Test how the attachment overlay reacts to an image file being dragged above
 * the message compose window.
 */
add_task(async function test_image_file_drag() {
  let file = new FileUtils.File(getTestFilePath("data/tb-logo.png"));
  let cwc = open_compose_new_mail();

  await simulateDragAndDrop(
    cwc.window,
    [[{ type: "application/x-moz-file", data: file }]],
    "image"
  );

  close_compose_window(cwc);
});

/**
 * Test how the attachment overlay reacts to an image file being dragged above
 * the message compose window and dropped above the inline container.
 */
add_task(async function test_image_file_drag() {
  let file = new FileUtils.File(getTestFilePath("data/tb-logo.png"));
  let cwc = open_compose_new_mail();

  await simulateDragAndDrop(
    cwc.window,
    [[{ type: "application/x-moz-file", data: file }]],
    "inline"
  );

  close_compose_window(cwc);
});

/**
 * Test how the attachment overlay reacts to a text file being dragged above
 * the message compose window.
 */
add_task(async function test_text_file_drag() {
  let file = new FileUtils.File(getTestFilePath("data/attachment.txt"));
  let cwc = open_compose_new_mail();

  await simulateDragAndDrop(
    cwc.window,
    [[{ type: "application/x-moz-file", data: file }]],
    "text"
  );

  close_compose_window(cwc);
});
