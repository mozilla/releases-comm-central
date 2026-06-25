/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the "Copy To" folder context menu item for message/rfc822 attachments.
 *
 * - Verifies the menu appears and is enabled for message/rfc822 attachments.
 * - Verifies the menu is hidden for non-rfc822 attachments.
 * - Verifies selecting a folder triggers importToFolder.
 *
 * NetUtil.asyncFetch cannot resolve message URLs in mochitest, so we mock
 * importToFolder on the prototype to exercise the import pipeline.
 */

"use strict";

var { close_popup, create_folder, get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
var { AttachmentInfo } = ChromeUtils.importESModule(
  "resource:///modules/AttachmentInfo.sys.mjs"
);
var { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

let targetFolder;

add_setup(async function () {
  targetFolder = await create_folder("CopyToFolderTarget");
  targetFolder.setFlag(Ci.nsMsgFolderFlags.Mail);
});

registerCleanupFunction(() => {
  targetFolder.deleteSelf(null);
});

/**
 * Open the attachment item context menu for the first attachment and return
 * the aboutMessage window and the context menu element.
 */
async function openAttachmentContextMenu(aboutMessage) {
  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  const contextMenu = aboutMessage.document.getElementById(
    "attachmentItemContext"
  );
  const shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    attachmentList.getItemAtIndex(0),
    { type: "contextmenu" },
    aboutMessage
  );
  await shownPromise;
  return { aboutMessage, contextMenu, attachmentList };
}

/**
 * Test that the "Copy To" menu is visible and enabled for message/rfc822
 * attachments.
 */
add_task(async function test_copyToFolder_visible_for_rfc822() {
  const file = new FileUtils.File(
    getTestFilePath("data/rfc822_base64_attachment.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  // Show the attachment pane.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );

  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  Assert.equal(attachmentList.itemCount, 1, "should have one attachment");
  Assert.equal(
    attachmentList.getItemAtIndex(0).attachment.contentType,
    "message/rfc822",
    "attachment should be message/rfc822"
  );

  const { contextMenu } = await openAttachmentContextMenu(aboutMessage);

  try {
    const copyToMenu = aboutMessage.document.getElementById(
      "context-copyToFolder"
    );
    Assert.ok(
      !copyToMenu.hidden,
      "Copy To menu should be visible for rfc822 attachment"
    );
    Assert.ok(
      !copyToMenu.disabled,
      "Copy To menu should be enabled for rfc822 attachment"
    );
  } finally {
    await close_popup(aboutMessage, contextMenu);
  }

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that the "Copy To" menu is hidden for non-rfc822 attachments.
 */
add_task(async function test_copyToFolder_hidden_for_non_rfc822() {
  const file = new FileUtils.File(
    getTestFilePath("data/multiple_attachments.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  // Show the attachment pane.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );

  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  Assert.greater(attachmentList.itemCount, 0, "should have attachments");
  Assert.notEqual(
    attachmentList.getItemAtIndex(0).attachment.contentType,
    "message/rfc822",
    "first attachment should not be message/rfc822"
  );

  const { contextMenu } = await openAttachmentContextMenu(aboutMessage);

  try {
    const copyToMenu = aboutMessage.document.getElementById(
      "context-copyToFolder"
    );
    Assert.ok(
      copyToMenu.hidden,
      "Copy To menu should be hidden for non-rfc822 attachment"
    );
  } finally {
    await close_popup(aboutMessage, contextMenu);
  }

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that the "Copy To" menu is visible for attachments with an .eml
 * filename even when the content type is not message/rfc822. Some messages
 * have wrong MIME types — the .eml filename fallback ensures these are
 * still recognized as importable attached messages.
 */
add_task(async function test_copyToFolder_visible_for_eml_filename() {
  const file = new FileUtils.File(
    getTestFilePath("data/eml_wrong_mime_type.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  // Show the attachment pane.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );

  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  Assert.equal(attachmentList.itemCount, 1, "should have one attachment");
  Assert.notEqual(
    attachmentList.getItemAtIndex(0).attachment.contentType,
    "message/rfc822",
    "content type should not be message/rfc822"
  );
  Assert.ok(
    /[?&]filename=.*\.eml(&|$)/.test(
      attachmentList.getItemAtIndex(0).attachment.url
    ),
    "url should contain an .eml filename"
  );

  const { contextMenu } = await openAttachmentContextMenu(aboutMessage);

  try {
    const copyToMenu = aboutMessage.document.getElementById(
      "context-copyToFolder"
    );
    Assert.ok(
      !copyToMenu.hidden,
      "Copy To menu should be visible for .eml-named attachment with wrong MIME type"
    );
    Assert.ok(!copyToMenu.disabled, "Copy To menu should be enabled");
  } finally {
    await close_popup(aboutMessage, contextMenu);
  }

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that selecting a folder from the "Copy To" submenu triggers
 * importToFolder and the message appears in the target folder.
 */
add_task(async function test_copyToFolder_imports_message() {
  const file = new FileUtils.File(
    getTestFilePath("data/rfc822_base64_attachment.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  // Show the attachment pane.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );

  // Mock importToFolder on the prototype — the real method calls
  // fetchAttachment() which needs a working NetUtil.asyncFetch.
  const origImportToFolder = AttachmentInfo.prototype.importToFolder;
  let importCalled = false;
  AttachmentInfo.prototype.importToFolder = async function (_folder) {
    importCalled = true;
    const canned =
      "From: test@example.com\r\n" +
      "To: recipient@example.com\r\n" +
      "Subject: Context menu imported\r\n" +
      "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
      "Message-ID: <contextmenu@example.com>\r\n" +
      "Content-Type: text/plain\r\n" +
      "\r\n" +
      "Context menu import body.\r\n";

    const uint8 = new TextEncoder().encode(canned);
    let rawStr = "";
    for (let j = 0; j < uint8.length; j += 8192) {
      rawStr += String.fromCharCode.apply(null, uint8.subarray(j, j + 8192));
    }
    const normalized = rawStr.replace(/\r\n?|\n/g, "\r\n");

    const msgFilePath = await IOUtils.createUniqueFile(
      PathUtils.tempDir,
      "test-copyto-import.eml",
      0o600
    );
    await IOUtils.write(
      msgFilePath,
      MailStringUtils.byteStringToUint8Array(normalized)
    );
    const msgFile = await IOUtils.getFile(msgFilePath);
    await MailUtils.copyFileMessageAsync(msgFile, targetFolder, null);
    await IOUtils.remove(msgFilePath);
  };

  try {
    // Get the selected attachments from the context menu (same as
    // onShowAttachmentItemContextMenu does).
    const attachmentList =
      aboutMessage.document.getElementById("attachmentList");
    const attachments = [attachmentList.getItemAtIndex(0).attachment];

    // Synthesize a fake event as if the folder-menupopup fired a command.
    const fakeEvent = new Event("command", { bubbles: true });
    Object.defineProperty(fakeEvent, "target", {
      value: { _folder: targetFolder },
    });

    await aboutMessage.HandleCopyAttachmentToFolder(fakeEvent, attachments);

    Assert.ok(importCalled, "importToFolder should have been called");

    await TestUtils.waitForCondition(
      () => targetFolder.getTotalMessages(false) > 0,
      "Message should appear in target folder"
    );

    const msgs = [...targetFolder.messages];
    Assert.equal(msgs.length, 1, "one message should have been imported");
    Assert.equal(
      msgs[0].mime2DecodedSubject,
      "Context menu imported",
      "imported message should have the correct subject"
    );
  } finally {
    AttachmentInfo.prototype.importToFolder = origImportToFolder;
    await BrowserTestUtils.closeWindow(msgc);
  }
});
