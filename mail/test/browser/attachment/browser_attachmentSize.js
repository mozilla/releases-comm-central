/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var folder;
var messenger;
var epsilon;

var {
  create_body_part,
  create_deleted_attachment,
  create_detached_attachment,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AttachmentHelpers.jsm"
);
var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  get_about_message,
  msgGen,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { SyntheticPartLeaf, SyntheticPartMultiMixed } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var textAttachment =
  "Can't make the frug contest, Helen; stomach's upset. I'll fix you, " +
  "Ubik! Ubik drops you back in the thick of things fast. Taken as " +
  "directed, Ubik speeds relief to head and stomach. Remember: Ubik is " +
  "only seconds away. Avoid prolonged use.";

var binaryAttachment = textAttachment;

var imageAttachment =
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAABHNCSVQICAgIfAhkiAAAAAlwS" +
  "FlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAA" +
  "A5SURBVCiRY/z//z8DKYCJJNXkaGBgYGD4D8NQ5zUgiTVAxeBqSLaBkVRPM0KtIhrQ3km0jwe" +
  "SNQAAlmAY+71EgFoAAAAASUVORK5CYII=";
var imageSize = 188;

var vcardAttachment =
  "YmVnaW46dmNhcmQNCmZuOkppbSBCb2INCm46Qm9iO0ppbQ0KZW1haWw7aW50ZXJuZXQ6Zm9v" +
  "QGJhci5jb20NCnZlcnNpb246Mi4xDQplbmQ6dmNhcmQNCg0K";
var vcardSize = 90;

var detachedName = "./attachment.txt";
var missingName = "./nonexistent.txt";
var deletedName = "deleted.txt";

// create some messages that have various types of attachments
var messages = [
  {
    name: "text_attachment",
    attachments: [{ body: textAttachment, filename: "ubik.txt", format: "" }],
    attachmentSizes: [textAttachment.length],
    attachmentTotalSize: { size: textAttachment.length, exact: true },
  },
  {
    name: "binary_attachment",
    attachments: [
      {
        body: binaryAttachment,
        contentType: "application/x-ubik",
        filename: "ubik",
        format: "",
      },
    ],
    attachmentSizes: [binaryAttachment.length],
    attachmentTotalSize: { size: binaryAttachment.length, exact: true },
  },
  {
    name: "image_attachment",
    attachments: [
      {
        body: imageAttachment,
        contentType: "image/png",
        filename: "lines.png",
        encoding: "base64",
        format: "",
      },
    ],
    attachmentSizes: [imageSize],
    attachmentTotalSize: { size: imageSize, exact: true },
  },
  {
    name: "detached_attachment",
    bodyPart: null,
    // Sizes filled in on message creation.
    attachmentSizes: [null],
    attachmentTotalSize: { size: 0, exact: true },
  },
  {
    name: "detached_attachment_with_missing_file",
    bodyPart: null,
    attachmentSizes: [-1],
    attachmentTotalSize: { size: 0, exact: false },
  },
  {
    name: "deleted_attachment",
    bodyPart: null,
    attachmentSizes: [-1],
    attachmentTotalSize: { size: 0, exact: true },
  },
  {
    name: "multiple_attachments",
    attachments: [
      { body: textAttachment, filename: "ubik.txt", format: "" },
      {
        body: binaryAttachment,
        contentType: "application/x-ubik",
        filename: "ubik",
        format: "",
      },
    ],
    attachmentSizes: [textAttachment.length, binaryAttachment.length],
    attachmentTotalSize: {
      size: textAttachment.length + binaryAttachment.length,
      exact: true,
    },
  },
  // vCards should be included in the attachment list.
  {
    name: "multiple_attachments_one_vcard",
    attachments: [
      { body: textAttachment, filename: "ubik.txt", format: "" },
      {
        body: vcardAttachment,
        contentType: "text/vcard",
        filename: "ubik.vcf",
        encoding: "base64",
        format: "",
      },
    ],
    attachmentSizes: [textAttachment.length, vcardSize],
    attachmentTotalSize: {
      size: textAttachment.length + vcardSize,
      exact: true,
    },
  },
  {
    name: "multiple_attachments_one_detached",
    bodyPart: null,
    attachments: [{ body: textAttachment, filename: "ubik.txt", format: "" }],
    attachmentSizes: [null, textAttachment.length],
    attachmentTotalSize: { size: textAttachment.length, exact: true },
  },
  {
    name: "multiple_attachments_one_detached_with_missing_file",
    bodyPart: null,
    attachments: [{ body: textAttachment, filename: "ubik.txt", format: "" }],
    attachmentSizes: [-1, textAttachment.length],
    attachmentTotalSize: { size: textAttachment.length, exact: false },
  },
  {
    name: "multiple_attachments_one_deleted",
    bodyPart: null,
    attachments: [{ body: textAttachment, filename: "ubik.txt", format: "" }],
    attachmentSizes: [-1, textAttachment.length],
    attachmentTotalSize: { size: textAttachment.length, exact: true },
  },
  // this is an attached message that itself has an attachment
  {
    name: "attached_message_with_attachment",
    bodyPart: null,
    attachmentSizes: [-1, textAttachment.length],
    attachmentTotalSize: { size: 0, exact: true },
  },
];

add_setup(async function () {
  messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

  /* Today's gory details (thanks to Jonathan Protzenko): libmime somehow
   * counts the trailing newline for an attachment MIME part. Most of the time,
   * assuming attachment has N bytes (no matter what's inside, newlines or
   * not), libmime will return N + 1 bytes. On Linux and Mac, this always
   * holds. However, on Windows, if the attachment is not encoded (that is, is
   * inline text), libmime will return N + 2 bytes.
   */
  epsilon = "@mozilla.org/windows-registry-key;1" in Cc ? 4 : 2;

  // set up our detached/deleted attachments
  var detachedFile = new FileUtils.File(
    getTestFilePath(`data/${detachedName}`)
  );
  var detached = create_body_part("Here is a file", [
    create_detached_attachment(detachedFile, "text/plain"),
  ]);

  var missingFile = new FileUtils.File(getTestFilePath(`data/${missingName}`));
  var missing = create_body_part(
    "Here is a file (but you deleted the external file, you silly oaf!)",
    [create_detached_attachment(missingFile, "text/plain")]
  );

  var deleted = create_body_part("Here is a file that you deleted", [
    create_deleted_attachment(deletedName, "text/plain"),
  ]);

  var attachedMessage = msgGen.makeMessage({
    body: { body: textAttachment },
    attachments: [{ body: textAttachment, filename: "ubik.txt", format: "" }],
  });

  /* Much like the above comment, libmime counts bytes differently on Windows,
   * where it counts newlines (\r\n) as 2 bytes. Mac and Linux treats them as
   * 1 byte.
   */
  var attachedMessageLength;
  if (epsilon == 4) {
    // Windows
    attachedMessageLength = attachedMessage.toMessageString().length;
  } else {
    // Mac/Linux
    attachedMessageLength = attachedMessage
      .toMessageString()
      .replace(/\r\n/g, "\n").length;
  }

  folder = await create_folder("AttachmentSizeA");
  for (let i = 0; i < messages.length; i++) {
    // First, add any missing info to the message object.
    switch (messages[i].name) {
      case "detached_attachment":
      case "multiple_attachments_one_detached":
        messages[i].bodyPart = detached;
        messages[i].attachmentSizes[0] = detachedFile.fileSize;
        messages[i].attachmentTotalSize.size += detachedFile.fileSize;
        break;
      case "detached_attachment_with_missing_file":
      case "multiple_attachments_one_detached_with_missing_file":
        messages[i].bodyPart = missing;
        break;
      case "deleted_attachment":
      case "multiple_attachments_one_deleted":
        messages[i].bodyPart = deleted;
        break;
      case "attached_message_with_attachment":
        messages[i].bodyPart = new SyntheticPartMultiMixed([
          new SyntheticPartLeaf("I am text!", { contentType: "text/plain" }),
          attachedMessage,
        ]);
        messages[i].attachmentSizes[0] = attachedMessageLength;
        messages[i].attachmentTotalSize.size += attachedMessageLength;
        break;
    }

    await add_message_to_folder([folder], create_message(messages[i]));
  }
});

/**
 * Make sure that the attachment's size is what we expect
 *
 * @param index the attachment's index, starting at 0
 * @param expectedSize the expected size of the attachment, in bytes
 */
function check_attachment_size(index, expectedSize) {
  const win = get_about_message();
  const list = win.document.getElementById("attachmentList");
  const node = list.querySelectorAll("richlistitem.attachmentItem")[index];

  // First, let's check that the attachment size is correct
  const size = node.attachment.size;
  Assert.ok(
    Math.abs(size - expectedSize) <= epsilon,
    `Attachment "${node.attachment.name}" size should be within ${epsilon} ` +
      `of ${expectedSize} (actual: ${size})`
  );

  // Next, make sure that the formatted size in the label is correct
  Assert.equal(
    node.getAttribute("size"),
    messenger.formatFileSize(size),
    `Attachment "${node.attachment.name}" displayed size should match`
  );
}

/**
 * Make sure that the attachment's size is not displayed
 *
 * @param index the attachment's index, starting at 0
 */
function check_no_attachment_size(index) {
  const win = get_about_message();
  const list = win.document.getElementById("attachmentList");
  const node = list.querySelectorAll("richlistitem.attachmentItem")[index];

  Assert.equal(
    node.attachment.size,
    -1,
    `Attachment "${node.attachment.name}" should have a size of -1`
  );

  // If there's no size, the size attribute is the zero-width space.
  const nodeSize = node.getAttribute("size");
  Assert.equal(
    nodeSize,
    "",
    `Attachment "${node.attachment.name}" size should not be displayed`
  );
}

/**
 * Make sure that the total size of all attachments is what we expect.
 *
 * @param count the expected number of attachments
 * @param expectedSize the expected size in bytes of all the attachments
 * @param exact true if the size of all attachments is known, false otherwise
 */
function check_total_attachment_size(count, expectedSize, exact) {
  const win = get_about_message();
  const list = win.document.getElementById("attachmentList");
  const nodes = list.querySelectorAll("richlistitem.attachmentItem");
  const sizeNode = win.document.getElementById("attachmentSize");

  Assert.equal(
    nodes.length,
    count,
    "Should have the expected number of attachments"
  );

  let lastPartID;
  let size = 0;
  for (let i = 0; i < nodes.length; i++) {
    const attachment = nodes[i].attachment;
    if (!lastPartID || attachment.partID.indexOf(lastPartID) != 0) {
      lastPartID = attachment.partID;
      const currSize = attachment.size;
      if (currSize > 0 && !isNaN(currSize)) {
        size += Number(currSize);
      }
    }
  }

  Assert.ok(
    Math.abs(size - expectedSize) <= epsilon * count,
    `Total attachments size should be within ${epsilon * count} ` +
      `of ${expectedSize} (actual: ${size})`
  );

  // Next, make sure that the formatted size in the label is correct
  const formattedSize = sizeNode.getAttribute("value");
  let expectedFormattedSize = messenger.formatFileSize(size);
  const messengerBundle = document.getElementById("bundle_messenger");

  if (!exact) {
    if (size == 0) {
      expectedFormattedSize = messengerBundle.getString(
        "attachmentSizeUnknown"
      );
    } else {
      expectedFormattedSize = messengerBundle.getFormattedString(
        "attachmentSizeAtLeast",
        [expectedFormattedSize]
      );
    }
  }
  Assert.equal(
    formattedSize,
    expectedFormattedSize,
    "Displayed attachments total size should match"
  );
}

/**
 * Make sure that the individual and total attachment sizes for this message
 * are as expected
 *
 * @param index the index of the message to check in the thread pane
 */
async function help_test_attachment_size(index) {
  await be_in_folder(folder);
  await select_click_row(index);
  info(`Testing message ${index}: ${messages[index].name}`);
  const expectedSizes = messages[index].attachmentSizes;

  const aboutMessage = get_about_message();
  aboutMessage.toggleAttachmentList(true);

  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  await TestUtils.waitForCondition(
    () => !attachmentList.collapsed,
    "Attachment list is shown"
  );

  for (let i = 0; i < expectedSizes.length; i++) {
    if (expectedSizes[i] == -1) {
      check_no_attachment_size(i);
    } else {
      check_attachment_size(i, expectedSizes[i]);
    }
  }

  const totalSize = messages[index].attachmentTotalSize;
  check_total_attachment_size(
    expectedSizes.length,
    totalSize.size,
    totalSize.exact
  );
}

add_task(async function test_attachment_sizes() {
  for (let i = 0; i < messages.length; i++) {
    await help_test_attachment_size(i);
  }
});

registerCleanupFunction(() => {
  // Remove created folders.
  folder.deleteSelf(null);
});
