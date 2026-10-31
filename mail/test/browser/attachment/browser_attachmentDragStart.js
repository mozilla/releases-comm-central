/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that only attachments that are allowed to be loaded can be dragged.
 */

"use strict";

var { create_body_part, create_enclosure_attachment } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AttachmentHelpers.sys.mjs"
  );
var { be_in_folder, create_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { add_message_sets_to_folders, create_message } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
  );
const { SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const aboutMessage = get_about_message();
let folder;
let regularMessage;
let linkMessage;

add_setup(async function () {
  folder = await create_folder("AttachmentDragStart");
  regularMessage = new SyntheticMessageSet([
    create_message({
      attachments: [{ body: "Some text", filename: "regular.txt", format: "" }],
    }),
  ]);
  linkMessage = new SyntheticMessageSet([
    create_message({
      bodyPart: create_body_part("Here is a link", [
        create_enclosure_attachment(
          "link.txt",
          "text/plain",
          "https://example.com/link.txt"
        ),
      ]),
    }),
  ]);
  await add_message_sets_to_folders([folder], [regularMessage, linkMessage]);
  await be_in_folder(folder);
  registerCleanupFunction(() => folder.deleteSelf(null));
});

/**
 * Dispatch a dragstart event on an element.
 *
 * @param {Element} element
 * @returns {DataTransfer} the data transfer of the event.
 */
function dragStart(element) {
  const dataTransfer = new aboutMessage.DataTransfer();
  element.dispatchEvent(
    new aboutMessage.DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    })
  );
  return dataTransfer;
}

/**
 * Check what dragging the attachment of a message transfers.
 *
 * @param {SyntheticMessageSet} message - A message with one attachment.
 * @param {string} name - The attachment name.
 * @param {boolean} allowed - Whether the attachment should be transferred.
 */
async function checkDragStart(message, name, allowed) {
  await select_click_row(message);
  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  await TestUtils.waitForCondition(
    () => attachmentList.getItemAtIndex(0)?.attachment.name == name,
    `Attachment list should show ${name}`
  );
  const item = attachmentList.getItemAtIndex(0);
  attachmentList.selectItem(item);

  for (const element of [
    item,
    aboutMessage.document.getElementById("attachmentName"),
  ]) {
    const dataTransfer = dragStart(element);
    if (allowed) {
      Assert.equal(
        dataTransfer.mozGetDataAt("text/x-moz-url-data", 0),
        item.attachment.url,
        `Dragging ${element.id || "item"} should transfer the attachment url`
      );
    } else {
      Assert.equal(
        dataTransfer.mozItemCount,
        0,
        `Dragging ${element.id || "item"} should not transfer anything`
      );
    }
  }
}

add_task(async function test_drag_regular_attachment() {
  await checkDragStart(regularMessage, "regular.txt", true);
});

add_task(async function test_drag_disallowed_link_attachment() {
  await checkDragStart(linkMessage, "link.txt", false);
});
