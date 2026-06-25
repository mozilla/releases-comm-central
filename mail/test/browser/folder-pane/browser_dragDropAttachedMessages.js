/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that dropping a message/rfc822 attachment onto a folder imports the
 * attached message.
 *
 * The drag-and-drop UI wiring is tested via a synthetic drop event.
 * NetUtil.asyncFetch cannot resolve message URLs in mochitest, so we mock
 * importToFolder on the prototype to exercise the pipeline.
 */

"use strict";

var { be_in_folder, create_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { inboxFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
var { add_message_to_folder, create_message } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
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

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;

let targetFolder;

add_setup(async function () {
  targetFolder = await create_folder("DragDropTarget");
  targetFolder.setFlag(Ci.nsMsgFolderFlags.Mail);

  // Put a test message in the inbox so we have a valid URL for the data
  // transfer used in the drag-and-drop test.
  await add_message_to_folder(
    [inboxFolder],
    create_message({ subject: "Test message for drag source" })
  );
});

registerCleanupFunction(() => {
  inboxFolder.propagateDelete(targetFolder, true);
});

/**
 * Test drag-and-drop: firing a synthetic drop event on the folder tree
 * triggers importToFolder on the AttachmentInfo instance. We mock
 * importToFolder on the prototype because NetUtil.asyncFetch cannot resolve
 * message URLs in mochitest.
 */
add_task(async function test_drop_triggers_import() {
  await be_in_folder(inboxFolder);
  const msgHdr = [...inboxFolder.messages][0];
  Assert.ok(msgHdr, "inbox should have at least one message");

  const msgUri = msgHdr.folder.getUriForMsg(msgHdr);

  // Build the same data transfer setupDataTransfer() in mailCore.js produces.
  const contentType = "message/rfc822";
  const name = "test-message.eml";
  // Use a mailbox: URL (not mailbox-message:) — AttachmentInfo rejects
  // -message: schemes. setupDataTransfer() uses attachment.url which is
  // always a necko-compatible URL like imap: or mailbox:.
  const attachmentUrl = msgUri.replace("mailbox-message:", "mailbox:");
  const transferInfo = [
    attachmentUrl +
      "&type=" +
      contentType +
      "&filename=" +
      encodeURIComponent(name),
    name,
    0,
    contentType,
    msgUri,
  ];

  const dataTransfer = new DataTransfer();
  dataTransfer.mozSetDataAt("text/x-moz-url", transferInfo.join("\n"), 0);
  dataTransfer.mozSetDataAt("text/x-moz-url-data", attachmentUrl, 0);
  dataTransfer.mozSetDataAt("text/x-moz-url-desc", name, 0);
  dataTransfer.mozSetDataAt(
    "application/x-moz-file-promise-url",
    attachmentUrl,
    0
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
      "Subject: Drag-drop imported\r\n" +
      "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
      "Message-ID: <dragdrop@example.com>\r\n" +
      "Content-Type: text/plain\r\n" +
      "\r\n" +
      "Drag-drop body.\r\n";

    const uint8 = new TextEncoder().encode(canned);
    let rawStr = "";
    for (let j = 0; j < uint8.length; j += 8192) {
      rawStr += String.fromCharCode.apply(null, uint8.subarray(j, j + 8192));
    }
    const normalized = rawStr.replace(/\r\n?|\n/g, "\r\n");

    const msgFilePath = await IOUtils.createUniqueFile(
      PathUtils.tempDir,
      "test-import.eml",
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
    const targetRow = about3Pane.folderPane.getRowForFolder(targetFolder);
    const dropEvent = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    Object.defineProperty(dropEvent, "target", { value: targetRow });
    Object.defineProperty(dropEvent.dataTransfer, "dropEffect", {
      value: "copy",
    });

    await about3Pane.folderPane._onDrop(dropEvent);

    Assert.ok(importCalled, "importToFolder should have been called");

    await TestUtils.waitForCondition(
      () => targetFolder.getTotalMessages(false) > 0,
      "Message should appear in target folder"
    );

    const msgs = [...targetFolder.messages];
    Assert.equal(msgs.length, 1, "one message should have been imported");
    Assert.equal(
      msgs[0].mime2DecodedSubject,
      "Drag-drop imported",
      "imported message should have the correct subject"
    );
  } finally {
    AttachmentInfo.prototype.importToFolder = origImportToFolder;
  }
});
