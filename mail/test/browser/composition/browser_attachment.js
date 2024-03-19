/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests attachment handling functionality of the message compose window.
 */

"use strict";

var {
  add_attachments,
  close_compose_window,
  delete_attachment,
  open_compose_new_mail,
  open_compose_with_forward,
  open_compose_with_forward_as_attachments,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  select_click_row,
  wait_for_popup_to_open,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { promise_modal_dialog } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);

var messenger;
var folder;
var epsilon;
var filePrefix;

var rawAttachment =
  "Can't make the frug contest, Helen; stomach's upset. I'll fix you, " +
  "Ubik! Ubik drops you back in the thick of things fast. Taken as " +
  "directed, Ubik speeds relief to head and stomach. Remember: Ubik is " +
  "only seconds away. Avoid prolonged use.";

var b64Attachment =
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAABHNCSVQICAgIfAhkiAAAAAlwS" +
  "FlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAA" +
  "A5SURBVCiRY/z//z8DKYCJJNXkaGBgYGD4D8NQ5zUgiTVAxeBqSLaBkVRPM0KtIhrQ3km0jwe" +
  "SNQAAlmAY+71EgFoAAAAASUVORK5CYII=";
var b64Size = 188;

add_setup(async function () {
  folder = await create_folder("ComposeAttachmentA");

  messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

  /* Today's gory details (thanks to Jonathan Protzenko): libmime somehow
   * counts the trailing newline for an attachment MIME part. Most of the time,
   * assuming attachment has N bytes (no matter what's inside, newlines or
   * not), libmime will return N + 1 bytes. On Linux and Mac, this always
   * holds. However, on Windows, if the attachment is not encoded (that is, is
   * inline text), libmime will return N + 2 bytes. Since we're dealing with
   * forwarded message data here, the bonus byte(s) appear twice.
   */
  epsilon = AppConstants.platform == "win" ? 4 : 2;
  filePrefix = AppConstants.platform == "win" ? "file:///C:/" : "file:///";

  // create some messages that have various types of attachments
  const messages = [
    // no attachment
    {},
    // raw attachment
    {
      attachments: [{ body: rawAttachment, filename: "ubik.txt", format: "" }],
    },
    // b64-encoded image attachment
    {
      attachments: [
        {
          body: b64Attachment,
          contentType: "image/png",
          filename: "lines.png",
          encoding: "base64",
          format: "",
        },
      ],
    },
  ];

  for (let i = 0; i < messages.length; i++) {
    await add_message_to_folder([folder], create_message(messages[i]));
  }
});

/**
 * Make sure that the attachment's size is what we expect.
 *
 * @param {Window} win - The compose window.
 * @param {integer} index - The attachment to examine, as an index into the listbox.
 * @param {integer} expectedSize - The expected size of the attachment, in bytes.
 */
function check_attachment_size(win, index, expectedSize) {
  const bucket = win.document.getElementById("attachmentBucket");
  const node = bucket.querySelectorAll("richlistitem.attachmentItem")[index];

  // First, let's check that the attachment size is correct
  const size = node.attachment.size;
  if (Math.abs(size - expectedSize) > epsilon) {
    throw new Error(
      "Reported attachment size (" +
        size +
        ") not within epsilon " +
        "of actual attachment size (" +
        expectedSize +
        ")"
    );
  }

  // Next, make sure that the formatted size in the label is correct
  const formattedSize = node.getAttribute("size");
  const expectedFormattedSize = messenger.formatFileSize(size);
  if (formattedSize != expectedFormattedSize) {
    throw new Error(
      "Formatted attachment size (" +
        formattedSize +
        ") does not " +
        "match expected value (" +
        expectedFormattedSize +
        ")"
    );
  }
}

/**
 * Make sure that the attachment's size is not displayed.
 *
 * @param {Window} win - The compose window.
 * @param {integer} index - The attachment to examine, as an index into the listbox.
 */
function check_no_attachment_size(win, index) {
  const bucket = win.document.getElementById("attachmentBucket");
  const node = bucket.querySelectorAll("richlistitem.attachmentItem")[index];

  if (node.attachment.size != -1) {
    throw new Error("attachment.size attribute should be -1!");
  }

  // For unknown size, the size attribute is set to empty.
  if (node.getAttribute("size") !== "") {
    throw new Error("Attachment size should not be displayed!");
  }
}

/**
 * Make sure that the total size of all attachments is what we expect.
 *
 * @param {Window} win - The compose window.
 * @param {integer} count - The expected number of attachments.
 */
function check_total_attachment_size(win, count) {
  const bucket = win.document.getElementById("attachmentBucket");
  const nodes = bucket.querySelectorAll("richlistitem.attachmentItem");
  const sizeNode = win.document.getElementById("attachmentBucketSize");

  if (nodes.length != count) {
    throw new Error(
      "Saw " + nodes.length + " attachments, but expected " + count
    );
  }

  let size = 0;
  for (let i = 0; i < nodes.length; i++) {
    const currSize = nodes[i].attachment.size;
    if (currSize != -1) {
      size += currSize;
    }
  }

  // Next, make sure that the formatted size in the label is correct
  const expectedFormattedSize = messenger.formatFileSize(size);
  if (sizeNode.textContent != expectedFormattedSize) {
    throw new Error(
      "Formatted attachment size (" +
        sizeNode.textContent +
        ") does not " +
        "match expected value (" +
        expectedFormattedSize +
        ")"
    );
  }
}

add_task(async function test_file_attachment() {
  const cwc = await open_compose_new_mail();

  const url = filePrefix + "some/file/here.txt";
  const size = 1234;

  await add_attachments(cwc, url, size);
  check_attachment_size(cwc, 0, size);
  check_total_attachment_size(cwc, 1);

  await close_compose_window(cwc);
});

add_task(async function test_webpage_attachment() {
  const cwc = await open_compose_new_mail();

  await add_attachments(cwc, "https://www.mozilla.org/");
  check_no_attachment_size(cwc, 0);
  check_total_attachment_size(cwc, 1);

  await close_compose_window(cwc);
});

add_task(async function test_multiple_attachments() {
  const cwc = await open_compose_new_mail();

  const files = [
    { name: "foo.txt", size: 1234 },
    { name: "bar.txt", size: 5678 },
    { name: "baz.txt", size: 9012 },
  ];
  for (let i = 0; i < files.length; i++) {
    await add_attachments(cwc, filePrefix + files[i].name, files[i].size);
    check_attachment_size(cwc, i, files[i].size);
  }

  check_total_attachment_size(cwc, files.length);
  await close_compose_window(cwc);
});

add_task(async function test_delete_attachments() {
  const cwc = await open_compose_new_mail();

  const files = [
    { name: "foo.txt", size: 1234 },
    { name: "bar.txt", size: 5678 },
    { name: "baz.txt", size: 9012 },
  ];
  for (let i = 0; i < files.length; i++) {
    await add_attachments(cwc, filePrefix + files[i].name, files[i].size);
    check_attachment_size(cwc, i, files[i].size);
  }

  delete_attachment(cwc, 0);
  check_total_attachment_size(cwc, files.length - 1);

  await close_compose_window(cwc);
});

function subtest_rename_attachment(cwc) {
  cwc.document.getElementById("loginTextbox").value = "renamed.txt";
  cwc.document.querySelector("dialog").getButton("accept").doCommand();
}

add_task(async function test_rename_attachment() {
  const cwc = await open_compose_new_mail();

  const url = filePrefix + "some/file/here.txt";
  const size = 1234;

  await add_attachments(cwc, url, size);

  // Now, rename the attachment.
  const bucket = cwc.document.getElementById("attachmentBucket");
  const node = bucket.querySelector("richlistitem.attachmentItem");
  EventUtils.synthesizeMouseAtCenter(node, {}, node.ownerGlobal);
  const dialogPromise = promise_modal_dialog(
    "commonDialogWindow",
    subtest_rename_attachment
  );
  cwc.RenameSelectedAttachment();
  await dialogPromise;

  Assert.equal(node.getAttribute("name"), "renamed.txt");

  check_attachment_size(cwc, 0, size);
  check_total_attachment_size(cwc, 1);

  await close_compose_window(cwc);
});

function subtest_open_attachment(cwc) {
  cwc.document.querySelector("dialog").getButton("cancel").doCommand();
}

add_task(async function test_open_attachment() {
  const cwc = await open_compose_new_mail();

  // set up our external file for attaching
  const file = new FileUtils.File(getTestFilePath("data/attachment.txt"));
  const fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  const url = fileHandler.getURLSpecFromActualFile(file);
  const size = file.fileSize;

  await add_attachments(cwc, url, size);

  // Now, open the attachment.
  const bucket = cwc.document.getElementById("attachmentBucket");
  const node = bucket.querySelector("richlistitem.attachmentItem");
  const dialogPromise = promise_modal_dialog(
    "unknownContentTypeWindow",
    subtest_open_attachment
  );
  EventUtils.synthesizeMouseAtCenter(node, { clickCount: 2 }, node.ownerGlobal);
  await dialogPromise;

  await close_compose_window(cwc);
});

add_task(async function test_forward_raw_attachment() {
  await be_in_folder(folder);
  await select_click_row(-2);

  const cwc = await open_compose_with_forward();
  check_attachment_size(cwc, 0, rawAttachment.length);
  check_total_attachment_size(cwc, 1);

  await close_compose_window(cwc);
});

add_task(async function test_forward_b64_attachment() {
  await be_in_folder(folder);
  await select_click_row(-3);

  const cwc = await open_compose_with_forward();
  check_attachment_size(cwc, 0, b64Size);
  check_total_attachment_size(cwc, 1);

  await close_compose_window(cwc);
});

add_task(async function test_forward_message_as_attachment() {
  await be_in_folder(folder);
  const curMessage = await select_click_row(-1);

  const cwc = await open_compose_with_forward_as_attachments();
  check_attachment_size(cwc, 0, curMessage.messageSize);
  check_total_attachment_size(cwc, 1);

  await close_compose_window(cwc);
});

add_task(async function test_forward_message_with_attachments_as_attachment() {
  await be_in_folder(folder);
  const curMessage = await select_click_row(-2);

  const cwc = await open_compose_with_forward_as_attachments();
  check_attachment_size(cwc, 0, curMessage.messageSize);
  check_total_attachment_size(cwc, 1);

  await close_compose_window(cwc);
});

/**
 * Check that the compose window has the attachments we expect.
 *
 * @param {Window} aWin - The compose window.
 * @param {string[]} aNames - An array of attachment names that are expected.
 */
function check_attachment_names(aWin, aNames) {
  const bucket = aWin.document.getElementById("attachmentBucket");
  Assert.equal(aNames.length, bucket.itemCount);
  for (let i = 0; i < aNames.length; i++) {
    Assert.equal(bucket.getItemAtIndex(i).getAttribute("name"), aNames[i]);
  }
}

/**
 * Execute a test of attachment reordering actions and check the resulting order.
 *
 * @param {Window} aCwc - The compose window.
 * @param {string} aInitialAttachmentNames - An array of attachment names
 *   specifying the initial set of attachments to be created.
 * @param {object[]} aReorder_actions - An array of objects specifying a
 *   reordering action:
 *   - select: array of attachment item indexes to select,
 *   - button: ID of button to click in the reordering menu,
 *   - key: keycode of key to press instead of a click,
 *   - key_modifiers: { accelKey, ctrlKey, shiftKey, altKey, etc.},
 *   - result: an array of attachment names in the new order that should result.
 * @param {boolean} openPanel - Whether to open reorderAttachmentsPanel for the test.
 */
async function subtest_reordering(
  aCwc,
  aInitialAttachmentNames,
  aReorder_actions,
  aOpenPanel = true
) {
  const bucket = aCwc.document.getElementById("attachmentBucket");
  let panel;

  // Create a set of attachments for the test.
  const size = 1234;
  for (const name of aInitialAttachmentNames) {
    await add_attachments(aCwc, filePrefix + name, size);
  }
  await new Promise(resolve => setTimeout(resolve));
  Assert.equal(bucket.itemCount, aInitialAttachmentNames.length);
  check_attachment_names(aCwc, aInitialAttachmentNames);

  if (aOpenPanel) {
    // Bring up the reordering panel.
    aCwc.showReorderAttachmentsPanel();
    await new Promise(resolve => setTimeout(resolve));
    panel = aCwc.document.getElementById("reorderAttachmentsPanel");
    await wait_for_popup_to_open(panel);
  }

  for (const action of aReorder_actions) {
    // Ensure selection.
    bucket.clearSelection();
    for (const itemIndex of action.select) {
      bucket.addItemToSelection(bucket.getItemAtIndex(itemIndex));
    }
    // Take action.
    if ("button" in action) {
      EventUtils.synthesizeMouseAtCenter(
        aCwc.document.getElementById(action.button),
        {},
        aCwc.document.getElementById(action.button).ownerGlobal
      );
    } else if ("key" in action) {
      EventUtils.synthesizeKey(action.key, action.key_modifiers, aCwc);
    }
    await new Promise(resolve => setTimeout(resolve));
    // Check result.
    check_attachment_names(aCwc, action.result);
  }

  if (aOpenPanel) {
    // Close the panel.
    panel.hidePopup();
    await TestUtils.waitForCondition(
      () => panel.state == "closed",
      "Reordering panel didn't close"
    );
  }

  // Clean up for a new set of attachments.
  aCwc.RemoveAllAttachments();
}

/**
 * Bug 663695, Bug 1417856, Bug 1426344, Bug 1425891, Bug 1427037.
 * Check basic and advanced attachment reordering operations.
 * This is the main function of this test.
 */
add_task(async function test_attachment_reordering() {
  const cwc = await open_compose_new_mail();
  const editorEl = cwc.GetCurrentEditorElement();
  const bucket = cwc.document.getElementById("attachmentBucket");
  const panel = cwc.document.getElementById("reorderAttachmentsPanel");
  // const openReorderPanelModifiers =
  //   (AppConstants.platform == "macosx") ? { controlKey: true }
  //                                       : { altKey: true };

  // First, some checks if the 'Reorder Attachments' panel
  // opens and closes correctly.

  // Create two attachments as otherwise the reordering panel won't open.
  const size = 1234;
  const initialAttachmentNames_0 = ["A1", "A2"];
  for (const name of initialAttachmentNames_0) {
    await add_attachments(cwc, filePrefix + name, size);
    await new Promise(resolve => setTimeout(resolve));
  }
  Assert.equal(bucket.itemCount, initialAttachmentNames_0.length);
  check_attachment_names(cwc, initialAttachmentNames_0);

  // Show 'Reorder Attachments' panel via mouse clicks.
  const contextMenu = cwc.document.getElementById(
    "msgComposeAttachmentItemContext"
  );
  const shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    bucket.getItemAtIndex(1),
    { type: "contextmenu" },
    cwc
  );
  await shownPromise;
  contextMenu.activateItem(
    cwc.document.getElementById("composeAttachmentContext_reorderItem")
  );
  await wait_for_popup_to_open(panel);

  // Click on the editor which should close the panel.
  EventUtils.synthesizeMouseAtCenter(editorEl, {}, editorEl.ownerGlobal);
  await TestUtils.waitForCondition(
    () => panel.state == "closed",
    "Reordering panel didn't close when editor was clicked."
  );

  // Clean up for a new set of attachments.
  cwc.RemoveAllAttachments();

  // Define checks for various moving operations.
  // Check 1: basic, mouse-only.
  const initialAttachmentNames_1 = ["a", "C", "B", "b", "bb", "x"];
  const reorderActions_1 = [
    {
      select: [1, 2, 3],
      button: "btn_sortAttachmentsToggle",
      result: ["a", "b", "B", "C", "bb", "x"],
    },
    {
      select: [4],
      button: "btn_moveAttachmentLeft",
      result: ["a", "b", "B", "bb", "C", "x"],
    },
    {
      select: [5],
      button: "btn_moveAttachmentFirst",
      result: ["x", "a", "b", "B", "bb", "C"],
    },
    {
      select: [0],
      button: "btn_moveAttachmentRight",
      result: ["a", "x", "b", "B", "bb", "C"],
    },
    {
      select: [1],
      button: "btn_moveAttachmentLast",
      result: ["a", "b", "B", "bb", "C", "x"],
    },
    {
      select: [1, 3],
      button: "btn_moveAttachmentBundleUp",
      result: ["a", "b", "bb", "B", "C", "x"],
    },
    // Bug 1417856
    {
      select: [2],
      button: "btn_sortAttachmentsToggle",
      result: ["a", "b", "B", "bb", "C", "x"],
    },
  ];

  // Check 2: basic and advanced, mouse-only.
  const initialAttachmentNames_2 = [
    "a",
    "x",
    "C",
    "y1",
    "y2",
    "B",
    "b",
    "z",
    "bb",
  ];
  const reorderActions_2 = [
    // For starters: moving a single attachment around in the list.
    {
      select: [1],
      button: "btn_moveAttachmentLeft",
      result: ["x", "a", "C", "y1", "y2", "B", "b", "z", "bb"],
    },
    {
      select: [0],
      button: "btn_moveAttachmentLast",
      result: ["a", "C", "y1", "y2", "B", "b", "z", "bb", "x"],
    },
    {
      select: [8],
      button: "btn_moveAttachmentFirst",
      result: ["x", "a", "C", "y1", "y2", "B", "b", "z", "bb"],
    },
    {
      select: [0],
      button: "btn_moveAttachmentRight",
      result: ["a", "x", "C", "y1", "y2", "B", "b", "z", "bb"],
    },

    // Moving multiple, disjunct selection with inner block up/down as-is.
    // This feature can be useful for multiple disjunct selection patterns
    // in an alternating list of attachments like
    // {photo1.jpg, description1.txt, photo2.jpg, description2.txt},
    // where the order of alternation should be inverted to become
    // {description1.txt, photo1.jpg, description2.txt, photo2.txt}.
    {
      select: [1, 3, 4, 7],
      button: "btn_moveAttachmentRight",
      result: ["a", "C", "x", "B", "y1", "y2", "b", "bb", "z"],
    },
    {
      select: [2, 4, 5, 8],
      button: "btn_moveAttachmentLeft",
      result: ["a", "x", "C", "y1", "y2", "B", "b", "z", "bb"],
    },
    {
      select: [1, 3, 4, 7],
      button: "btn_moveAttachmentLeft",
      result: ["x", "a", "y1", "y2", "C", "B", "z", "b", "bb"],
    },

    // Folding multiple, disjunct selection with inner block towards top/bottom.
    {
      select: [0, 2, 3, 6],
      button: "btn_moveAttachmentLeft",
      result: ["x", "y1", "y2", "a", "C", "z", "B", "b", "bb"],
    },
    {
      select: [0, 1, 2, 5],
      button: "btn_moveAttachmentLeft",
      result: ["x", "y1", "y2", "a", "z", "C", "B", "b", "bb"],
    },
    {
      select: [0, 1, 2, 4],
      button: "btn_moveAttachmentLeft",
      result: ["x", "y1", "y2", "z", "a", "C", "B", "b", "bb"],
    },
    {
      select: [3, 5, 6, 8],
      button: "btn_moveAttachmentRight",
      result: ["x", "y1", "y2", "a", "z", "b", "C", "B", "bb"],
    },
    {
      select: [4, 6, 7, 8],
      button: "btn_moveAttachmentRight",
      result: ["x", "y1", "y2", "a", "b", "z", "C", "B", "bb"],
    },

    // Prepare scenario for and test 'Group together' (upwards).
    {
      select: [1, 2],
      button: "btn_moveAttachmentRight",
      result: ["x", "a", "y1", "y2", "b", "z", "C", "B", "bb"],
    },
    {
      select: [0, 2, 3, 5],
      button: "btn_moveAttachmentRight",
      result: ["a", "x", "b", "y1", "y2", "C", "z", "B", "bb"],
    },
    {
      select: [1, 3, 4, 6],
      button: "btn_moveAttachmentBundleUp",
      result: ["a", "x", "y1", "y2", "z", "b", "C", "B", "bb"],
    },
    // 'Group together' (downwards) is not tested here because it is
    // only available via keyboard shortcuts, e.g. Alt+Cursor Right.

    // Sort selected attachments only.
    // Unsorted multiple selection must be collapsed upwards first if disjunct,
    // then sorted ascending.
    {
      select: [0, 5, 6, 8],
      button: "btn_sortAttachmentsToggle",
      result: ["a", "b", "bb", "C", "x", "y1", "y2", "z", "B"],
    },
    // Sorted multiple block selection must be sorted the other way round.
    {
      select: [0, 1, 2, 3],
      button: "btn_sortAttachmentsToggle",
      result: ["C", "bb", "b", "a", "x", "y1", "y2", "z", "B"],
    },
    // Sorted, multiple, disjunct selection must just be collapsed upwards.
    {
      select: [3, 8],
      button: "btn_sortAttachmentsToggle",
      result: ["C", "bb", "b", "a", "B", "x", "y1", "y2", "z"],
    },
    {
      select: [0, 2, 3],
      button: "btn_sortAttachmentsToggle",
      result: ["C", "b", "a", "bb", "B", "x", "y1", "y2", "z"],
    },

    // Bug 1417856: Sort all attachments when 1 or no attachment selected.
    {
      select: [1],
      button: "btn_sortAttachmentsToggle",
      result: ["a", "b", "B", "bb", "C", "x", "y1", "y2", "z"],
    },
    {
      select: [],
      button: "btn_sortAttachmentsToggle",
      result: ["z", "y2", "y1", "x", "C", "bb", "B", "b", "a"],
    },

    // Collapsing multiple, disjunct selection with inner block to top/bottom.
    {
      select: [3, 5, 6, 8],
      button: "btn_moveAttachmentFirst",
      result: ["x", "bb", "B", "a", "z", "y2", "y1", "C", "b"],
    },
    {
      select: [0, 2, 3, 7],
      button: "btn_moveAttachmentLast",
      result: ["bb", "z", "y2", "y1", "b", "x", "B", "a", "C"],
    },
  ];

  // Check 3: basic and advanced, keyboard-only.
  const initialAttachmentNames_3 = [
    "a",
    "x",
    "C",
    "y1",
    "y2",
    "B",
    "b",
    "z",
    "bb",
  ];
  const modAlt = { altKey: true };
  const modifiers2 =
    AppConstants.platform == "macosx"
      ? { accelKey: true, altKey: true }
      : { altKey: true };
  const reorderActions_3 = [
    // For starters: moving a single attachment around in the list.
    {
      select: [1],
      // key_moveAttachmentLeft
      key: "VK_LEFT",
      key_modifiers: modAlt,
      result: ["x", "a", "C", "y1", "y2", "B", "b", "z", "bb"],
    },
    {
      select: [0],
      // key_moveAttachmentBottom
      key: AppConstants.platform == "macosx" ? "VK_DOWN" : "VK_END",
      key_modifiers: modifiers2,
      result: ["a", "C", "y1", "y2", "B", "b", "z", "bb", "x"],
    },
    {
      select: [8],
      // key_moveAttachmentTop
      key: AppConstants.platform == "macosx" ? "VK_UP" : "VK_HOME",
      key_modifiers: modifiers2,
      result: ["x", "a", "C", "y1", "y2", "B", "b", "z", "bb"],
    },
    {
      select: [0],
      // key_moveAttachmentBottom2 (secondary shortcut on MAC, same as Win primary)
      key: "VK_END",
      key_modifiers: modAlt,
      result: ["a", "C", "y1", "y2", "B", "b", "z", "bb", "x"],
    },
    {
      select: [8],
      // key_moveAttachmentTop2 (secondary shortcut on MAC, same as Win primary)
      key: "VK_HOME",
      key_modifiers: modAlt,
      result: ["x", "a", "C", "y1", "y2", "B", "b", "z", "bb"],
    },
    {
      select: [0],
      // key_moveAttachmentRight
      key: "VK_RIGHT",
      key_modifiers: modAlt,
      result: ["a", "x", "C", "y1", "y2", "B", "b", "z", "bb"],
    },

    // Moving multiple, disjunct selection with inner block up/down as-is.
    // This feature can be useful for multiple disjunct selection patterns
    // in an alternating list of attachments like
    // {photo1.jpg, description1.txt, photo2.jpg, description2.txt},
    // where the order of alternation should be inverted to become
    // {description1.txt, photo1.jpg, description2.txt, photo2.txt}.
    {
      select: [1, 3, 4, 7],
      // key_moveAttachmentRight
      key: "VK_RIGHT",
      key_modifiers: modAlt,
      result: ["a", "C", "x", "B", "y1", "y2", "b", "bb", "z"],
    },
    {
      select: [2, 4, 5, 8],
      // key_moveAttachmentLeft
      key: "VK_LEFT",
      key_modifiers: modAlt,
      result: ["a", "x", "C", "y1", "y2", "B", "b", "z", "bb"],
    },
    {
      select: [1, 3, 4, 7],
      // key_moveAttachmentLeft
      key: "VK_LEFT",
      key_modifiers: modAlt,
      result: ["x", "a", "y1", "y2", "C", "B", "z", "b", "bb"],
    },

    // Folding multiple, disjunct selection with inner block towards top/bottom.
    {
      select: [0, 2, 3, 6],
      // key_moveAttachmentLeft
      key: "VK_LEFT",
      key_modifiers: modAlt,
      result: ["x", "y1", "y2", "a", "C", "z", "B", "b", "bb"],
    },
    {
      select: [0, 1, 2, 5],
      // key_moveAttachmentLeft
      key: "VK_LEFT",
      key_modifiers: modAlt,
      result: ["x", "y1", "y2", "a", "z", "C", "B", "b", "bb"],
    },
    {
      select: [0, 1, 2, 4],
      // key_moveAttachmentLeft
      key: "VK_LEFT",
      key_modifiers: modAlt,
      result: ["x", "y1", "y2", "z", "a", "C", "B", "b", "bb"],
    },
    {
      select: [3, 5, 6, 8],
      // key_moveAttachmentRight
      key: "VK_RIGHT",
      key_modifiers: modAlt,
      result: ["x", "y1", "y2", "a", "z", "b", "C", "B", "bb"],
    },
    {
      select: [4, 6, 7, 8],
      // key_moveAttachmentRight
      key: "VK_RIGHT",
      key_modifiers: modAlt,
      result: ["x", "y1", "y2", "a", "b", "z", "C", "B", "bb"],
    },

    // Prepare scenario for and test 'Group together' (upwards/downwards).
    {
      select: [1, 2],
      // key_moveAttachmentRight
      key: "VK_RIGHT",
      key_modifiers: modAlt,
      result: ["x", "a", "y1", "y2", "b", "z", "C", "B", "bb"],
    },
    {
      select: [0, 2, 3, 5],
      // key_moveAttachmentRight
      key: "VK_RIGHT",
      key_modifiers: modAlt,
      result: ["a", "x", "b", "y1", "y2", "C", "z", "B", "bb"],
    },
    {
      select: [1, 3, 4, 6],
      // key_moveAttachmentBundleUp
      key: "VK_UP",
      key_modifiers: modAlt,
      result: ["a", "x", "y1", "y2", "z", "b", "C", "B", "bb"],
    },
    {
      select: [5, 6],
      // key_moveAttachmentLeft
      key: "VK_LEFT",
      key_modifiers: modAlt,
      result: ["a", "x", "y1", "y2", "b", "C", "z", "B", "bb"],
    },
    {
      select: [0, 4, 5, 7],
      // key_moveAttachmentBundleDown
      key: "VK_DOWN",
      key_modifiers: modAlt,
      result: ["x", "y1", "y2", "z", "a", "b", "C", "B", "bb"],
    },

    // Collapsing multiple, disjunct selection with inner block to top/bottom.
    {
      select: [0, 4, 5, 7],
      // key_moveAttachmentTop
      key: AppConstants.platform == "macosx" ? "VK_UP" : "VK_HOME",
      key_modifiers: modifiers2,
      result: ["x", "a", "b", "B", "y1", "y2", "z", "C", "bb"],
    },
    {
      select: [0, 4, 5, 6],
      // key_moveAttachmentBottom
      key: AppConstants.platform == "macosx" ? "VK_DOWN" : "VK_END",
      key_modifiers: modifiers2,
      result: ["a", "b", "B", "C", "bb", "x", "y1", "y2", "z"],
    },
    {
      select: [0, 1, 3, 4],
      // key_moveAttachmentBottom2 (secondary shortcut on MAC, same as Win primary)
      key: "VK_END",
      key_modifiers: modAlt,
      result: ["B", "x", "y1", "y2", "z", "a", "b", "C", "bb"],
    },
    {
      select: [5, 6, 7, 8],
      // key_moveAttachmentTop2 (secondary shortcut on MAC, same as Win primary)
      key: "VK_HOME",
      key_modifiers: modAlt,
      result: ["a", "b", "C", "bb", "B", "x", "y1", "y2", "z"],
    },
  ];

  // Check 4: Alt+Y keyboard shortcut for sorting (Bug 1425891).
  const initialAttachmentNames_4 = [
    "a",
    "x",
    "C",
    "y1",
    "y2",
    "B",
    "b",
    "z",
    "bb",
  ];

  const reorderActions_4 = [
    {
      select: [1],
      // key_sortAttachmentsToggle
      key: "y",
      key_modifiers: modAlt,
      result: ["a", "b", "B", "bb", "C", "x", "y1", "y2", "z"],
    },
  ];

  // Execute the tests of reordering actions as defined above.
  await subtest_reordering(cwc, initialAttachmentNames_1, reorderActions_1);
  await subtest_reordering(cwc, initialAttachmentNames_2, reorderActions_2);
  // Check 3 (keyboard-only) with panel open.
  await subtest_reordering(cwc, initialAttachmentNames_3, reorderActions_3);
  // Check 3 (keyboard-only) without panel.
  await subtest_reordering(
    cwc,
    initialAttachmentNames_3,
    reorderActions_3,
    false
  );
  // Check 4 (Alt+Y keyboard shortcut for sorting) without panel.
  await subtest_reordering(
    cwc,
    initialAttachmentNames_4,
    reorderActions_4,
    false
  );
  // Check 4 (Alt+Y keyboard shortcut for sorting) with panel open.
  await subtest_reordering(cwc, initialAttachmentNames_4, reorderActions_4);
  // XXX When the root problem of bug 1425891 has been found and fixed, we should
  // test here if the panel stays open as it should, esp. on Windows.

  await close_compose_window(cwc);
});

add_task(async function test_restore_attachment_bucket_height() {
  const cwc = await open_compose_new_mail();

  const attachmentArea = cwc.document.getElementById("attachmentArea");
  const attachmentBucket = cwc.document.getElementById("attachmentBucket");

  Assert.ok(
    BrowserTestUtils.isHidden(attachmentArea),
    "Attachment area should be hidden initially with no attachments"
  );

  // Add 9 attachments to open a pane least 2 rows height.
  const files = [
    { name: "foo.txt", size: 1234 },
    { name: "bar.txt", size: 5678 },
    { name: "baz.txt", size: 9012 },
    { name: "foo2.txt", size: 1234 },
    { name: "bar2.txt", size: 5678 },
    { name: "baz2.txt", size: 9012 },
    { name: "foo3.txt", size: 1234 },
    { name: "bar3.txt", size: 5678 },
    { name: "baz3.txt", size: 9012 },
  ];
  for (let i = 0; i < files.length; i++) {
    await add_attachments(cwc, filePrefix + files[i].name, files[i].size);
  }

  // Store the height of the attachment bucket.
  const heightBefore = attachmentBucket.getBoundingClientRect().height;

  const modifiers =
    AppConstants.platform == "macosx"
      ? { accelKey: true, shiftKey: true }
      : { ctrlKey: true, shiftKey: true };

  const collapsedPromise = BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(attachmentArea) && !attachmentArea.open,
    "The attachment area should be visible but closed."
  );

  // Press Ctrl/Cmd+Shift+M to collapse the attachment pane.
  EventUtils.synthesizeKey("M", modifiers, cwc);
  await collapsedPromise;

  const visiblePromise = BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(attachmentArea) && attachmentArea.open,
    "The attachment area should be visible and open."
  );
  // Press Ctrl/Cmd+Shift+M again.
  EventUtils.synthesizeKey("M", modifiers, cwc);
  await visiblePromise;

  // The height of these elements should have been properly restored.
  Assert.equal(attachmentBucket.getBoundingClientRect().height, heightBefore);

  await close_compose_window(cwc);
});
