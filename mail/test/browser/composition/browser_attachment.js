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
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  select_click_row,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

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

add_task(function setupModule(module) {
  folder = create_folder("ComposeAttachmentA");

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
  let messages = [
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
    add_message_to_folder(folder, create_message(messages[i]));
  }
});

/**
 * Make sure that the attachment's size is what we expect
 * @param controller the controller for the compose window
 * @param index the attachment to examine, as an index into the listbox
 * @param expectedSize the expected size of the attachment, in bytes
 */
function check_attachment_size(controller, index, expectedSize) {
  let bucket = controller.e("attachmentBucket");
  let node = bucket.querySelectorAll("richlistitem.attachmentItem")[index];

  // First, let's check that the attachment size is correct
  let size = node.attachment.size;
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
  let formattedSize = node.getAttribute("size");
  let expectedFormattedSize = messenger.formatFileSize(size);
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
 * Make sure that the attachment's size is not displayed
 * @param controller the controller for the compose window
 * @param index the attachment to examine, as an index into the listbox
 */
function check_no_attachment_size(controller, index) {
  let bucket = controller.e("attachmentBucket");
  let node = bucket.querySelectorAll("richlistitem.attachmentItem")[index];

  if (node.attachment.size != -1) {
    throw new Error("attachment.size attribute should be -1!");
  }

  // If there's no size, the size attribute is the zero-width space.
  if (node.getAttribute("size") != "\u200b") {
    throw new Error("Attachment size should not be displayed!");
  }
}

/**
 * Make sure that the total size of all attachments is what we expect.
 * @param controller the controller for the compose window
 * @param count the expected number of attachments
 */
function check_total_attachment_size(controller, count) {
  let bucket = controller.e("attachmentBucket");
  let nodes = bucket.querySelectorAll("richlistitem.attachmentItem");
  let sizeNode = controller.e("attachmentBucketSize");

  if (nodes.length != count) {
    throw new Error(
      "Saw " + nodes.length + " attachments, but expected " + count
    );
  }

  let size = 0;
  for (let i = 0; i < nodes.length; i++) {
    let currSize = nodes[i].attachment.size;
    if (currSize != -1) {
      size += currSize;
    }
  }

  // Next, make sure that the formatted size in the label is correct
  let expectedFormattedSize = messenger.formatFileSize(size);
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

add_task(function test_file_attachment() {
  let cwc = open_compose_new_mail();

  let url = filePrefix + "some/file/here.txt";
  let size = 1234;

  add_attachments(cwc, url, size);
  check_attachment_size(cwc, 0, size);
  check_total_attachment_size(cwc, 1);

  close_compose_window(cwc);
});

add_task(function test_webpage_attachment() {
  let cwc = open_compose_new_mail();

  add_attachments(cwc, "http://www.mozilla.org/");
  check_no_attachment_size(cwc, 0);
  check_total_attachment_size(cwc, 1);

  close_compose_window(cwc);
});

add_task(function test_multiple_attachments() {
  let cwc = open_compose_new_mail();

  let files = [
    { name: "foo.txt", size: 1234 },
    { name: "bar.txt", size: 5678 },
    { name: "baz.txt", size: 9012 },
  ];
  for (let i = 0; i < files.length; i++) {
    add_attachments(cwc, filePrefix + files[i].name, files[i].size);
    check_attachment_size(cwc, i, files[i].size);
  }

  check_total_attachment_size(cwc, files.length);
  close_compose_window(cwc);
});

add_task(function test_delete_attachments() {
  let cwc = open_compose_new_mail();

  let files = [
    { name: "foo.txt", size: 1234 },
    { name: "bar.txt", size: 5678 },
    { name: "baz.txt", size: 9012 },
  ];
  for (let i = 0; i < files.length; i++) {
    add_attachments(cwc, filePrefix + files[i].name, files[i].size);
    check_attachment_size(cwc, i, files[i].size);
  }

  delete_attachment(cwc, 0);
  check_total_attachment_size(cwc, files.length - 1);

  close_compose_window(cwc);
});

function subtest_rename_attachment(cwc) {
  cwc.e("loginTextbox").value = "renamed.txt";
  cwc.window.document
    .querySelector("dialog")
    .getButton("accept")
    .doCommand();
}

add_task(function test_rename_attachment() {
  let cwc = open_compose_new_mail();

  let url = filePrefix + "some/file/here.txt";
  let size = 1234;

  add_attachments(cwc, url, size);

  // Now, rename the attachment.
  let bucket = cwc.e("attachmentBucket");
  let node = bucket.querySelector("richlistitem.attachmentItem");
  cwc.click(node);
  plan_for_modal_dialog("commonDialogWindow", subtest_rename_attachment);
  cwc.window.RenameSelectedAttachment();
  wait_for_modal_dialog("commonDialogWindow");

  Assert.equal(node.getAttribute("name"), "renamed.txt");

  check_attachment_size(cwc, 0, size);
  check_total_attachment_size(cwc, 1);

  close_compose_window(cwc);
});

function subtest_open_attachment(cwc) {
  cwc.window.document
    .querySelector("dialog")
    .getButton("cancel")
    .doCommand();
}

add_task(function test_open_attachment() {
  let cwc = open_compose_new_mail();

  // set up our external file for attaching
  let file = new FileUtils.File(getTestFilePath("data/attachment.txt"));
  let fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  let url = fileHandler.getURLSpecFromFile(file);
  let size = file.fileSize;

  add_attachments(cwc, url, size);

  // Now, open the attachment.
  let bucket = cwc.e("attachmentBucket");
  let node = bucket.querySelector("richlistitem.attachmentItem");
  plan_for_modal_dialog("unknownContentTypeWindow", subtest_open_attachment);
  cwc.doubleClick(node);
  wait_for_modal_dialog("unknownContentTypeWindow");

  close_compose_window(cwc);
});

add_task(function test_forward_raw_attachment() {
  be_in_folder(folder);
  select_click_row(1);

  let cwc = open_compose_with_forward();
  check_attachment_size(cwc, 0, rawAttachment.length);
  check_total_attachment_size(cwc, 1);

  close_compose_window(cwc);
});

add_task(function test_forward_b64_attachment() {
  be_in_folder(folder);
  select_click_row(2);

  let cwc = open_compose_with_forward();
  check_attachment_size(cwc, 0, b64Size);
  check_total_attachment_size(cwc, 1);

  close_compose_window(cwc);
});

add_task(function test_forward_message_as_attachment() {
  be_in_folder(folder);
  let curMessage = select_click_row(0);

  let cwc = open_compose_with_forward_as_attachments();
  check_attachment_size(cwc, 0, curMessage.messageSize);
  check_total_attachment_size(cwc, 1);

  close_compose_window(cwc);
});

add_task(function test_forward_message_with_attachments_as_attachment() {
  be_in_folder(folder);
  let curMessage = select_click_row(1);

  let cwc = open_compose_with_forward_as_attachments();
  check_attachment_size(cwc, 0, curMessage.messageSize);
  check_total_attachment_size(cwc, 1);

  close_compose_window(cwc);
});

/**
 * Check that the compose window has the attachments we expect.
 *
 * @param aController  The controller for the compose window
 * @param aNames       An array of attachment names that are expected
 */
function check_attachment_names(aController, aNames) {
  let bucket = aController.e("attachmentBucket");
  Assert.equal(aNames.length, bucket.itemCount);
  for (let i = 0; i < aNames.length; i++) {
    Assert.equal(bucket.getItemAtIndex(i).getAttribute("name"), aNames[i]);
  }
}

/**
 * Execute a test of attachment reordering actions and check the resulting order.
 *
 * @param aCwc              The controller for the compose window
 * @param aInitialAttachmentNames  An array of attachment names specifying the
 *                                 initial set of attachments to be created
 * @param aReorder_actions  An array of objects specifying a reordering action:
 *                          { select: array of attachment item indexes to select,
 *                            button: ID of button to click in the reordering menu,
 *                            key:    keycode of key to press instead of a click,
 *                            key_modifiers: { accelKey: bool, ctrlKey: bool
 *                                             shiftKey: bool, altKey: bool, etc.},
 *                            result: an array of attachment names in the new
 *                                    order that should result
 *                          }
 * @param openPanel {boolean}   Whether to open reorderAttachmentsPanel for the test
 */
async function subtest_reordering(
  aCwc,
  aInitialAttachmentNames,
  aReorder_actions,
  aOpenPanel = true
) {
  let bucket = aCwc.e("attachmentBucket");
  let panel;

  // Create a set of attachments for the test.
  const size = 1234;
  for (let name of aInitialAttachmentNames) {
    add_attachments(aCwc, filePrefix + name, size);
  }
  aCwc.sleep(0);
  Assert.equal(bucket.itemCount, aInitialAttachmentNames.length);
  check_attachment_names(aCwc, aInitialAttachmentNames);

  if (aOpenPanel) {
    // Bring up the reordering panel.
    aCwc.window.showReorderAttachmentsPanel();
    aCwc.sleep(0);
    panel = aCwc.e("reorderAttachmentsPanel");
    await wait_for_popup_to_open(panel);
  }

  for (let action of aReorder_actions) {
    // Ensure selection.
    bucket.clearSelection();
    for (let itemIndex of action.select) {
      bucket.addItemToSelection(bucket.getItemAtIndex(itemIndex));
    }
    // Take action.
    if ("button" in action) {
      aCwc.click(aCwc.e(action.button));
    } else if ("key" in action) {
      EventUtils.synthesizeKey(action.key, action.key_modifiers, aCwc.window);
    }
    aCwc.sleep(0);
    // Check result.
    check_attachment_names(aCwc, action.result);
  }

  if (aOpenPanel) {
    // Close the panel.
    panel.hidePopup();
    aCwc.waitFor(
      () => panel.state == "closed",
      "Reordering panel didn't close"
    );
  }

  // Clean up for a new set of attachments.
  aCwc.window.RemoveAllAttachments();
}

/**
 * Bug 663695, Bug 1417856, Bug 1426344, Bug 1425891, Bug 1427037.
 * Check basic and advanced attachment reordering operations.
 * This is the main function of this test.
 */
add_task(async function test_attachment_reordering() {
  let cwc = open_compose_new_mail();
  let editorEl = cwc.window.GetCurrentEditorElement();
  let bucket = cwc.e("attachmentBucket");
  let panel = cwc.e("reorderAttachmentsPanel");
  // const openReorderPanelModifiers =
  //   (AppConstants.platform == "macosx") ? { controlKey: true }
  //                                       : { altKey: true };

  // First, some checks if the 'Reorder Attachments' panel
  // opens and closes correctly.

  // Create two attachments as otherwise the reordering panel won't open.
  const size = 1234;
  const initialAttachmentNames_0 = ["A1", "A2"];
  for (let name of initialAttachmentNames_0) {
    add_attachments(cwc, filePrefix + name, size);
    cwc.sleep(0);
  }
  Assert.equal(bucket.itemCount, initialAttachmentNames_0.length);
  check_attachment_names(cwc, initialAttachmentNames_0);

  // Show 'Reorder Attachments' panel via mouse clicks.
  let contextMenu = cwc.e("msgComposeAttachmentItemContext");
  let shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    bucket.getItemAtIndex(1),
    { type: "contextmenu" },
    cwc.window
  );
  await shownPromise;
  contextMenu.activateItem(cwc.e("composeAttachmentContext_reorderItem"));
  await wait_for_popup_to_open(panel);

  // Click on the editor which should close the panel.
  cwc.click(editorEl);
  cwc.waitFor(
    () => panel.state == "closed",
    "Reordering panel didn't close when editor was clicked."
  );

  // Clean up for a new set of attachments.
  cwc.window.RemoveAllAttachments();

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

  close_compose_window(cwc);
});

add_task(async function test_restore_attachment_pane_height() {
  let cwc = open_compose_new_mail();

  // Add 9 attachments to open a pane least 2 rows height.
  let files = [
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
    add_attachments(cwc, filePrefix + files[i].name, files[i].size);
  }

  let attachmentsBox = cwc.window.document.getElementById("attachmentsBox");
  let attachmentsView = cwc.window.document.getElementById("attachmentView");

  // Store the height of the attachment pane and the richlistbox child item.
  let viewHeight = attachmentsView.getAttribute("height");
  let richlistboxHeight = attachmentsBox.getAttribute("height");

  let modifiers =
    AppConstants.platform == "macosx"
      ? { accelKey: true, shiftKey: true }
      : { ctrlKey: true, shiftKey: true };

  let collapsedPromise = BrowserTestUtils.waitForCondition(
    () => attachmentsBox.collapsed,
    "The attachment pane is collapsed."
  );

  // Press Ctrl/Cmd+Shift+M to collapse the attachment pane.
  EventUtils.synthesizeKey("M", modifiers, cwc.window);
  await collapsedPromise;

  let visiblePromise = BrowserTestUtils.waitForCondition(
    () => !attachmentsBox.collapsed,
    "The attachment pane is visible."
  );
  // Press Ctrl/Cmd+Shift+M again.
  EventUtils.synthesizeKey("M", modifiers, cwc.window);
  await visiblePromise;

  // The height of these elements should have been properly restored.
  Assert.equal(attachmentsView.getAttribute("height"), viewHeight);
  Assert.equal(attachmentsBox.getAttribute("height"), richlistboxHeight);

  close_compose_window(cwc);
});
