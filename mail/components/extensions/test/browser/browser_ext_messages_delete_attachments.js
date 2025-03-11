/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(async () => {
  // Create IMAP server which supports UIDPLUS, which is needed to be notified
  // of finished message upload to update the message key (for example when
  // deleting attachments).
  const account = createAccount("imap", { extensions: ["RFC4315"] });
  const inbox = account.incomingServer.rootFolder.subFolders[0];
  const testFolder = await createSubfolder(inbox, "testFolder");

  const textAttachment = {
    body: "textAttachment",
    filename: "test.txt",
    contentType: "text/plain",
  };
  await createMessages(testFolder, {
    count: 1,
    subject: "1 text attachment",
    attachments: [textAttachment],
  });
});

add_task(async function testDeleteAttachments() {
  const files = {
    "background.js": async () => {
      const testfolder = await browser.folders
        .query({ name: "testFolder" })
        .then(rv => rv[0]);

      const message = await browser.messages
        .query({ subject: "1 text attachment" })
        .then(list => list.messages[0]);

      // Select the test folder, but not a message to trigger Bug 1910483.
      await browser.mailTabs.update({ displayedFolderId: testfolder.id });
      browser.test.assertEq(
        0,
        await browser.messageDisplay
          .getDisplayedMessages()
          .then(list => list.messages.length)
      );

      // Verify attachment of the message before deleting the attachment.
      const originalAttachments = await browser.messages.listAttachments(
        message.id
      );
      window.assertDeepEqual(
        [
          {
            contentDisposition: "attachment",
            contentType: "text/plain",
            name: "test.txt",
            partName: "1.2",
          },
        ],
        originalAttachments,
        "Should find a valid attachment"
      );

      // Delete attachment from the message.
      await browser.messages.deleteAttachments(
        message.id,
        originalAttachments.map(a => a.partName)
      );

      // Verify the message after deleting the attachment.
      const updatedAttachments = await browser.messages.listAttachments(
        message.id
      );
      window.assertDeepEqual(
        [
          {
            contentDisposition: "inline",
            contentType: "text/x-moz-deleted",
            name: "Deleted: test.txt",
            partName: "1.2",
          },
        ],
        updatedAttachments,
        "Should find the deleted attachment"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "messagesModifyPermanent"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
