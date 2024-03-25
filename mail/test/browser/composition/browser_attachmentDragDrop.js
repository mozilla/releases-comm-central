/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the Drag and Drop functionalities of the attachment bucket in the
 * message compose window.
 */

"use strict";

var { CloudFileTestProvider } = ChromeUtils.importESModule(
  "resource://testing-common/mail/CloudfileHelpers.sys.mjs"
);
var { open_compose_new_mail, close_compose_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  get_about_message,
  inboxFolder,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

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

add_setup(async function () {
  // Prepare the mock file picker.
  MockFilePicker.init(window.browsingContext);
  MockFilePicker.setFiles(collectFiles(kFiles));

  // Register an extension based cloudFile provider.
  gCloudFileProvider = new CloudFileTestProvider("testProvider");
  await gCloudFileProvider.register(this);
  gCloudFileAccount = await gCloudFileProvider.createAccount("testAccount");
});

registerCleanupFunction(async function () {
  MockFilePicker.cleanup();
  // Remove the cloudFile account and unregister the provider.
  await gCloudFileProvider.removeAccount(gCloudFileAccount);
  await gCloudFileProvider.unregister();
});

function getDragOverTarget(win) {
  return win.document.getElementById("messageArea");
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
  const dragOverTarget = getDragOverTarget(win);
  const dropEffect = "move";

  const session = initDragSession({ dragData, dropEffect });

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
  if (type == "image" || type == "inline" || type == "link") {
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
    const editor = win.GetCurrentEditor();

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
  const file = new FileUtils.File(getTestFilePath("data/tb-logo.png"));
  const cwc = await open_compose_new_mail();

  await simulateDragAndDrop(
    cwc,
    [[{ type: "application/x-moz-file", data: file }]],
    "image"
  );

  await close_compose_window(cwc);
});

/**
 * Test how the attachment overlay reacts to an image file being dragged above
 * the message compose window and dropped above the inline container.
 */
add_task(async function test_image_file_drag() {
  const file = new FileUtils.File(getTestFilePath("data/tb-logo.png"));
  const cwc = await open_compose_new_mail();

  await simulateDragAndDrop(
    cwc,
    [[{ type: "application/x-moz-file", data: file }]],
    "inline"
  );

  await close_compose_window(cwc);
});

/**
 * Test how the attachment overlay reacts to a text file being dragged above
 * the message compose window.
 */
add_task(async function test_text_file_drag() {
  const file = new FileUtils.File(getTestFilePath("data/attachment.txt"));
  const cwc = await open_compose_new_mail();

  await simulateDragAndDrop(
    cwc,
    [[{ type: "application/x-moz-file", data: file }]],
    "text"
  );

  await close_compose_window(cwc);
});

add_task(async function test_message_drag() {
  const folder = await create_folder("dragondrop");
  const subject = "Dragons don't drop from the sky";
  const body = "Dragons can fly after all.";
  await be_in_folder(folder);
  await add_message_to_folder(
    [folder],
    create_message({ subject, body: { body } })
  );
  await select_click_row(0);

  const msgStr = get_about_message().gMessageURI;
  const msgUrl =
    MailServices.messageServiceFromURI(msgStr).getUrlForUri(msgStr);

  const cwc = await open_compose_new_mail();
  const attachmentBucket = cwc.document.getElementById("attachmentBucket");

  await simulateDragAndDrop(
    cwc,
    [
      [
        { type: "text/x-moz-message", data: msgStr },
        { type: "text/x-moz-url", data: msgUrl.spec },
        {
          type: "application/x-moz-file-promise-url",
          data: msgUrl.spec + "?fileName=" + encodeURIComponent("message.eml"),
        },
        {
          type: "application/x-moz-file-promise",
          data: new window.messageFlavorDataProvider(),
        },
      ],
    ],
    "message"
  );

  const attachment = attachmentBucket.childNodes[0].attachment;
  Assert.equal(
    attachment.name,
    "Dragons don't drop from the sky.eml",
    "attachment should have expected file name"
  );
  Assert.equal(
    attachment.contentType,
    "message/rfc822",
    "attachment should say it's a message"
  );
  Assert.notEqual(attachment, 0, "attachment should not be 0 bytes");

  // Clear the added attachment.
  await cwc.RemoveAttachments([attachmentBucket.childNodes[0]]);

  // Try the same with mail.forward_add_extension false.
  Services.prefs.setBoolPref("mail.forward_add_extension", false);

  await simulateDragAndDrop(
    cwc,
    [
      [
        { type: "text/x-moz-message", data: msgStr },
        { type: "text/x-moz-url", data: msgUrl.spec },
        {
          type: "application/x-moz-file-promise-url",
          data: msgUrl.spec + "?fileName=" + encodeURIComponent("message.eml"),
        },
        {
          type: "application/x-moz-file-promise",
          data: new window.messageFlavorDataProvider(),
        },
      ],
    ],
    "message"
  );

  const attachment2 = attachmentBucket.childNodes[0].attachment;
  Assert.equal(
    attachment2.name,
    "Dragons don't drop from the sky",
    "attachment2 should have expected file name"
  );
  Assert.equal(
    attachment2.contentType,
    "message/rfc822",
    "attachment2 should say it's a message"
  );
  Assert.notEqual(attachment2, 0, "attachment2 should not be 0 bytes");

  Services.prefs.clearUserPref("mail.forward_add_extension");

  await close_compose_window(cwc);
  await be_in_folder(inboxFolder);
  folder.deleteSelf(null);
});

add_task(async function test_link_drag() {
  const cwc = await open_compose_new_mail();
  await simulateDragAndDrop(
    cwc,
    [
      [
        {
          type: "text/uri-list",
          data: "https://example.com",
        },
        {
          type: "text/x-moz-url",
          data: "https://example.com\nExample website",
        },
        { type: "application/x-moz-file", data: "" },
      ],
    ],
    "link"
  );

  const attachment =
    cwc.document.getElementById("attachmentBucket").childNodes[0].attachment;
  Assert.equal(
    attachment.name,
    "Example website",
    "Attached link has expected name"
  );
  Assert.equal(
    attachment.url,
    "https://example.com",
    "Attached link has correct URL"
  );

  await close_compose_window(cwc);
});

/**
 * Assert that the given bucket has the given selected items.
 *
 * @param {Element} bucket - The bucket to check.
 * @param {Element[]} selectedItems - The expected selected items in the bucket.
 */
function assertSelection(bucket, selectedItems) {
  for (const child of bucket.childNodes) {
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
  const win = bucket.ownerGlobal;
  let first = true;
  for (const item of itemSet) {
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
  const srcWindow = dragSrc.ownerGlobal;
  const destWindow = destBucket.ownerGlobal;
  const dragOverTarget = getDragOverTarget(destWindow);
  const dropTarget = getDropTarget(destWindow);

  const [dragOverResult, dataTransfer] = EventUtils.synthesizeDragOver(
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
  const items = Array.from(destBucket.childNodes);
  for (let i = 0; i < items.length; i++) {
    Assert.ok(
      items[i].attachment.url.startsWith("file://") &&
        items[i].attachment.url.includes(expectUrls[i].split(".")[0]),
      `Attachment url ${items[i].attachment.url} should be the correct file:// url`
    );
  }
}

/**
 * Perform a series of drag and drop of attachments from the given source bucket
 * to the given destination bucket.
 *
 * The dragged attachment will be saved as a local temporary file. This test
 * extracts the filename from the url and checks if the url of the attachment
 * in the destBucket is a file:// url and has the correct file name.
 * The original url is a mailbox:// url:
 *   mailbox:///something?number=1&part=1.4&filename=file2.txt
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

  const attachmentSet = Array.from(srcBucket.childNodes, item => {
    return { url: item.attachment.url, srcItem: item };
  });

  const dragSession = Cc["@mozilla.org/widget/dragservice;1"].getService(
    Ci.nsIDragService
  );
  dragSession.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  // NOTE: Attachment #4 is never dragged from the source to the destination
  // bucket as part of this test.

  const destUrls = [];

  // Select attachment #2, and drag it.
  selectAttachments(srcBucket, [attachmentSet[2].srcItem]);
  destUrls.push(attachmentSet[2].url.split("=").pop());
  await moveAttachments(attachmentSet[2].srcItem, destBucket, destUrls);

  // Start with attachment #3 selected, but drag attachment #1.
  // The drag operation should at first change the selection to attachment #1,
  // such that it becomes the transferred file.
  selectAttachments(srcBucket, [attachmentSet[3].srcItem]);
  destUrls.push(attachmentSet[1].url.split("=").pop());
  await moveAttachments(attachmentSet[1].srcItem, destBucket, destUrls);
  // Confirm that attachment #1 was selected.
  assertSelection(srcBucket, [attachmentSet[1].srcItem]);

  // Select two attachments. And then start a drag on one of them.
  // We expect both the selected attachments to move.
  selectAttachments(srcBucket, [
    attachmentSet[0].srcItem,
    attachmentSet[3].srcItem,
  ]);
  destUrls.push(
    attachmentSet[0].url.split("=").pop(),
    attachmentSet[3].url.split("=").pop()
  );
  await moveAttachments(attachmentSet[3].srcItem, destBucket, destUrls);

  // Select three attachments, two of which are already added.
  // Expect the new one to be added.
  selectAttachments(srcBucket, [
    attachmentSet[1].srcItem,
    attachmentSet[5].srcItem,
    attachmentSet[2].srcItem,
  ]);
  destUrls.push(attachmentSet[5].url.split("=").pop());
  await moveAttachments(attachmentSet[1].srcItem, destBucket, destUrls);
  dragService.endDragSession(true);
}

/**
 * Test dragging regular attachments from one composition window to another.
 */
add_task(async function test_drag_and_drop_between_composition_windows() {
  const ctrlSrc = await open_compose_new_mail();
  const ctrlDest = await open_compose_new_mail();

  // Add attachments (via mocked file picker).
  await ctrlSrc.AttachFile();

  const srcAttachmentArea = ctrlSrc.document.getElementById("attachmentArea");

  // Wait for attachment area to be visible and open in response.
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(srcAttachmentArea) && srcAttachmentArea.open,
    "Attachment area is visible and open"
  );

  const srcBucket = ctrlSrc.document.getElementById("attachmentBucket");
  const dstBucket = ctrlDest.document.getElementById("attachmentBucket");
  await drag_between_buckets(srcBucket, dstBucket);

  // Make sure a dragged attachment can be converted to a cloudFile attachment.
  try {
    await ctrlSrc.UpdateAttachment(dstBucket.childNodes[0], {
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

  await close_compose_window(ctrlSrc);
  await close_compose_window(ctrlDest);
});

/**
 * Test dragging cloudFile attachments from one composition window to another.
 */
add_task(async function test_cloud_drag_and_drop_between_composition_windows() {
  const ctrlSrc = await open_compose_new_mail();
  const ctrlDest = await open_compose_new_mail();

  // Add cloudFile attachments (via mocked file picker).
  await ctrlSrc.attachToCloudNew(gCloudFileAccount);

  const srcAttachmentArea = ctrlSrc.document.getElementById("attachmentArea");

  // Wait for attachment area to be visible and open in response.
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(srcAttachmentArea) && srcAttachmentArea.open,
    "Attachment area is visible and open"
  );

  const srcBucket = ctrlSrc.document.getElementById("attachmentBucket");
  const dstBucket = ctrlDest.document.getElementById("attachmentBucket");
  await drag_between_buckets(srcBucket, dstBucket);

  // Make sure a dragged cloudFile attachment can be converted to a regular
  // attachment.
  try {
    await ctrlSrc.UpdateAttachment(dstBucket.childNodes[0], {
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

  await close_compose_window(ctrlSrc);
  await close_compose_window(ctrlDest);
});

/**
 * Test dragging attachments from a message into a composition window.
 */
add_task(async function test_drag_and_drop_between_composition_windows() {
  const ctrlDest = await open_compose_new_mail();

  const folder = await create_folder("AttachmentsForComposition");
  await add_message_to_folder(
    [folder],
    create_message({
      attachments: [0, 1, 2, 3, 4, 5].map(num => {
        return {
          body: "Some Text",
          filename: `file${num}.txt`,
          format: "text/plain",
        };
      }),
    })
  );
  await be_in_folder(folder);
  await select_click_row(0);
  const aboutMessage = get_about_message();
  const srcAttachmentArea =
    aboutMessage.document.getElementById("attachmentView");
  Assert.ok(!srcAttachmentArea.collapsed, "Attachment area is visible");

  const srcBucket = aboutMessage.document.getElementById("attachmentList");
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentBar"),
    {},
    aboutMessage
  );
  Assert.ok(!srcBucket.collapsed, "Attachment list is visible");

  await drag_between_buckets(
    srcBucket,
    ctrlDest.document.getElementById("attachmentBucket")
  );

  await close_compose_window(ctrlDest);
});

function collectFiles(files) {
  return files.map(filename => new FileUtils.File(getTestFilePath(filename)));
}
