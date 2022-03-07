/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the Drag and Drop functionalities of the attachment bucket in the
 * message compose window.
 */

/* globals gFolderTreeView */

"use strict";

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { CloudFileTestProvider } = ChromeUtils.import(
  "resource://testing-common/mozmill/CloudfileHelpers.jsm"
);
var { gMockFilePicker, gMockFilePickReg } = ChromeUtils.import(
  "resource://testing-common/mozmill/AttachmentHelpers.jsm"
);

var {
  open_compose_new_mail,
  close_compose_window,
  add_attachments,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  mc,
  create_folder,
  create_message,
  add_message_to_folder,
  select_click_row,
  be_in_folder,
  FAKE_SERVER_HOSTNAME,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

var gCloudFileProvider;
var gCloudFileAccount;
const kFiles = [
  "./data/attachment.txt",
  "./data/base64-bug1586890.eml",
  "./data/base64-encoded-msg.eml",
  "./data/base64-with-whitespace.eml",
  "./data/body-greek.eml",
  "./data/body-utf16.eml",
];

add_task(async function setupModule(module) {
  gFolderTreeView._tree.focus();

  // Prepare the mock file picker.
  gMockFilePickReg.register();
  gMockFilePicker.returnFiles = collectFiles(kFiles);

  // Register an extension based cloudFile provider.
  gCloudFileProvider = new CloudFileTestProvider("testProvider");
  await gCloudFileProvider.register(this);
  gCloudFileAccount = await gCloudFileProvider.createAccount("testAccount");
});

registerCleanupFunction(async function teardownModule(module) {
  gMockFilePickReg.unregister();
  // Remove the cloudFile account and unregister the provider.
  await gCloudFileProvider.removeAccount(gCloudFileAccount);
  await gCloudFileProvider.unregister();

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
    let editor = win.GetCurrentEditor();

    await BrowserTestUtils.waitForCondition(() => {
      editor.selectAll();
      return editor.getSelectedElement("img");
    }, "Confirm the image was added to the message body");

    Assert.equal(
      win.document.getElementById("attachmentBucket").itemCount,
      0,
      "Confirm the file hasn't been attached"
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

/**
 * Get the attachment item for the given url.
 *
 * @param {Element} bucket - The element to search in for the attachment item.
 * @param {string} url - The url of the attachment to find.
 *
 * @return {Element?} - The item with the given attachment url, or null if none
 *   was found.
 */
function getAttachmentItem(bucket, url) {
  for (let child of bucket.childNodes) {
    if (child.attachment.url == url) {
      return child;
    }
  }
  return null;
}

/**
 * Assert that the given bucket has the given selected items.
 *
 * @param {Element} bucket - The bucket to check.
 * @param {Element[]} selectedItems - The expected selected items in the bucket.
 */
function assertSelection(bucket, selectedItems) {
  for (let child of bucket.childNodes) {
    if (selectedItems.includes(child)) {
      Assert.ok(
        child.selected,
        `${child.attachment.url} item should be selected`
      );
    } else {
      Assert.ok(
        !child.selected,
        `${child.attachment.url} item should not be selected`
      );
    }
  }
}

/**
 * Select the given attachment items in the bucket.
 *
 * @param {Element} bucket - The attachment bucket to select from.
 * @param {Element[]} itemSet - The set of attachment items to select. This must
 *   contain at least one item.
 */
function selectAttachments(bucket, itemSet) {
  let win = bucket.ownerGlobal;
  let first = true;
  for (let item of itemSet) {
    item.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(item, { ctrlKey: !first }, win);
    first = false;
  }
  assertSelection(bucket, itemSet);
}

/**
 * Perform a single drag operation between attachment buckets.
 *
 * @param {Element} dragSrc - The attachment item to start dragging from.
 * @param {Element} destBucket - The attachment bucket to drag to.
 * @param {string[]} expectUrls - The expected list of all the attachment urls
 *   in the destBucket after the drop. Note this should include both the current
 *   attachments as well as the expected gained attachments.
 */
async function moveAttachments(dragSrc, destBucket, expectUrls) {
  let srcWindow = dragSrc.ownerGlobal;
  let destWindow = destBucket.ownerGlobal;
  let dragOverTarget = getDragOverTarget(destWindow);
  let dropTarget = getDropTarget(destWindow);

  let [dragOverResult, dataTransfer] = EventUtils.synthesizeDragOver(
    dragSrc,
    dragOverTarget,
    null,
    null,
    srcWindow,
    destWindow
  );

  EventUtils.synthesizeDropAfterDragOver(
    dragOverResult,
    dataTransfer,
    dropTarget,
    destWindow
  );

  await TestUtils.waitForCondition(
    () => destBucket.itemCount == expectUrls.length,
    `Destination bucket has ${expectUrls.length} attachments`
  );
  for (let url of expectUrls) {
    Assert.ok(
      getAttachmentItem(destBucket, url),
      `Should have attachment ${url}`
    );
  }
}

/**
 * Perform a series of drag and drop of attachments from the given source bucket
 * to the given destination bucket.
 *
 * @param {Element} srcBucket - The bucket to drag from. It must contain 6
 *   attachment items and be open.
 * @param {Element} destBucket - The bucket to drag to. It must be empty.
 */
async function drag_between_buckets(srcBucket, destBucket) {
  Assert.equal(srcBucket.itemCount, 6, "Src bucket starts with 6 attachments");
  Assert.equal(
    destBucket.itemCount,
    0,
    "Dest bucket starts with no attachments"
  );

  let attachmentSet = Array.from(srcBucket.childNodes, item => {
    return { url: item.attachment.url, srcItem: item };
  });

  let dragSession = Cc["@mozilla.org/widget/dragservice;1"].getService(
    Ci.nsIDragService
  );
  dragSession.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  // NOTE: Attachment #4 is never dragged from the source to the destination
  // bucket as part of this test.

  let destUrls = [];

  // Select attachment #2, and drag it.
  selectAttachments(srcBucket, [attachmentSet[2].srcItem]);
  destUrls.push(attachmentSet[2].url);
  await moveAttachments(attachmentSet[2].srcItem, destBucket, destUrls);

  // Start with attachment #3 selected, but drag attachment #1.
  // The drag operation should at first change the selection to attachment #1,
  // such that it becomes the transferred file.
  selectAttachments(srcBucket, [attachmentSet[3].srcItem]);
  destUrls.push(attachmentSet[1].url);
  await moveAttachments(attachmentSet[1].srcItem, destBucket, destUrls);
  // Confirm that attachment #1 was selected.
  assertSelection(srcBucket, [attachmentSet[1].srcItem]);

  // Select two attachments. And then start a drag on one of them.
  // We expect both the selected attachments to move.
  selectAttachments(srcBucket, [
    attachmentSet[0].srcItem,
    attachmentSet[3].srcItem,
  ]);
  destUrls.push(attachmentSet[0].url, attachmentSet[3].url);
  await moveAttachments(attachmentSet[3].srcItem, destBucket, destUrls);

  // Select three attachments, two of which are already added.
  // Expect the new one to be added.
  selectAttachments(srcBucket, [
    attachmentSet[1].srcItem,
    attachmentSet[5].srcItem,
    attachmentSet[2].srcItem,
  ]);
  destUrls.push(attachmentSet[5].url);
  await moveAttachments(attachmentSet[1].srcItem, destBucket, destUrls);

  dragService.endDragSession(true);
}

/**
 * Test dragging regular attachments from one composition window to another.
 */
add_task(async function test_drag_and_drop_between_composition_windows() {
  let ctrlSrc = open_compose_new_mail();
  let ctrlDest = open_compose_new_mail();

  // Add attachments (via mocked file picker).
  await ctrlSrc.window.AttachFile();

  let srcAttachmentArea = ctrlSrc.window.document.getElementById(
    "attachmentArea"
  );

  // Wait for attachment area to be visible and open in response.
  await TestUtils.waitForCondition(
    () => !srcAttachmentArea.hidden && srcAttachmentArea.open,
    "Attachment area is visible and open"
  );

  let srcBucket = ctrlSrc.window.document.getElementById("attachmentBucket");
  let dstBucket = ctrlDest.window.document.getElementById("attachmentBucket");
  await drag_between_buckets(srcBucket, dstBucket);

  // Make sure a dragged attachment can be converted to a cloudFile attachment.
  try {
    await ctrlSrc.window.UpdateAttachment(dstBucket.childNodes[0], {
      cloudFileAccount: gCloudFileAccount,
    });
    Assert.ok(
      dstBucket.childNodes[0].attachment.sendViaCloud,
      "Regular attachment should have been converted to a cloudFile attachment."
    );
  } catch (ex) {
    Assert.ok(
      false,
      `Converting a drag'n'dropped regular attachment to a cloudFile attachment should succeed: ${ex.message}`
    );
  }

  close_compose_window(ctrlSrc);
  close_compose_window(ctrlDest);
});

/**
 * Test dragging cloudFile attachments from one composition window to another.
 */
add_task(async function test_cloud_drag_and_drop_between_composition_windows() {
  let ctrlSrc = open_compose_new_mail();
  let ctrlDest = open_compose_new_mail();

  // Add cloudFile attachments (via mocked file picker).
  await ctrlSrc.window.attachToCloudNew(gCloudFileAccount);

  let srcAttachmentArea = ctrlSrc.window.document.getElementById(
    "attachmentArea"
  );

  // Wait for attachment area to be visible and open in response.
  await TestUtils.waitForCondition(
    () => !srcAttachmentArea.hidden && srcAttachmentArea.open,
    "Attachment area is visible and open"
  );

  let srcBucket = ctrlSrc.window.document.getElementById("attachmentBucket");
  let dstBucket = ctrlDest.window.document.getElementById("attachmentBucket");
  await drag_between_buckets(srcBucket, dstBucket);

  // Make sure a dragged cloudFile attachment can be converted to a regular
  // attachment.
  try {
    await ctrlSrc.window.UpdateAttachment(dstBucket.childNodes[0], {
      cloudFileAccount: null,
    });
    Assert.ok(
      !dstBucket.childNodes[0].attachment.sendViaCloud,
      "CloudFile Attachment should have been converted to a regular attachment."
    );
  } catch (ex) {
    Assert.ok(
      false,
      `Converting a drag'n'dropped cloudFile attachment to a regular attachment should succeed: ${ex.message}`
    );
  }

  close_compose_window(ctrlSrc);
  close_compose_window(ctrlDest);
});

/**
 * Test dragging attachments from one composition window to another.
 */
add_task(async function test_drag_and_drop_between_composition_windows() {
  let ctrlDest = open_compose_new_mail();

  let folder = await create_folder("AttachmentsForComposition");
  await add_message_to_folder(
    [folder],
    create_message({
      attachments: [0, 1, 2, 3, 4, 5].map(num => {
        return {
          body: "",
          filename: `file${num}.txt`,
          format: "",
        };
      }),
    })
  );
  be_in_folder(folder);
  select_click_row(0);
  let srcAttachmentArea = mc.window.document.getElementById("attachmentView");

  Assert.ok(!srcAttachmentArea.collapsed, "Attachment area is visible");

  let srcBucket = mc.window.document.getElementById("attachmentList");
  EventUtils.synthesizeMouseAtCenter(
    mc.window.document.getElementById("attachmentBar"),
    {},
    mc.window
  );
  Assert.ok(!srcBucket.collapsed, "Attachment list is visible");

  await drag_between_buckets(
    srcBucket,
    ctrlDest.window.document.getElementById("attachmentBucket")
  );

  close_compose_window(ctrlDest);
});

function collectFiles(files) {
  return files.map(filename => new FileUtils.File(getTestFilePath(filename)));
}
