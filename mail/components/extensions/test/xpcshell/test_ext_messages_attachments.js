/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);
var { TestUtils } = ChromeUtils.import(
  "resource://testing-common/TestUtils.jsm"
);

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_attachments() {
    let _account = createAccount();
    let _testFolder = await createSubfolder(
      _account.incomingServer.rootFolder,
      "test1"
    );

    let textAttachment = {
      body: "textAttachment",
      filename: "test.txt",
      contentType: "text/plain",
    };
    let binaryAttachment = {
      body: btoa("binaryAttachment"),
      filename: "test",
      contentType: "application/octet-stream",
      encoding: "base64",
    };

    await createMessages(_testFolder, {
      count: 1,
      subject: "0 attachments",
    });
    await createMessages(_testFolder, {
      count: 1,
      subject: "1 text attachment",
      attachments: [textAttachment],
    });
    await createMessages(_testFolder, {
      count: 1,
      subject: "1 binary attachment",
      attachments: [binaryAttachment],
    });
    await createMessages(_testFolder, {
      count: 1,
      subject: "2 attachments",
      attachments: [binaryAttachment, textAttachment],
    });

    let extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          let [account] = await browser.accounts.list();
          let testFolder = account.folders.find(f => f.name == "test1");
          let { messages } = await browser.messages.list(testFolder);
          browser.test.assertEq(4, messages.length);

          let attachments, attachment, file;

          // "0 attachments" message.

          attachments = await browser.messages.listAttachments(messages[0].id);
          browser.test.assertEq("0 attachments", messages[0].subject);
          browser.test.assertEq(0, attachments.length);

          // "1 text attachment" message.

          attachments = await browser.messages.listAttachments(messages[1].id);
          browser.test.assertEq("1 text attachment", messages[1].subject);
          browser.test.assertEq(1, attachments.length);

          attachment = attachments[0];
          browser.test.assertEq("text/plain", attachment.contentType);
          browser.test.assertEq("test.txt", attachment.name);
          browser.test.assertEq("1.2", attachment.partName);
          browser.test.assertEq(14, attachment.size);

          file = await browser.messages.getAttachmentFile(
            messages[1].id,
            attachment.partName
          );
          browser.test.assertTrue(file instanceof File);
          browser.test.assertEq("test.txt", file.name);
          browser.test.assertEq(14, file.size);

          browser.test.assertEq("textAttachment", await file.text());

          let reader = new FileReader();
          let data = await new Promise(resolve => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
          });

          browser.test.assertEq(
            "data:text/plain;base64,dGV4dEF0dGFjaG1lbnQ=",
            data
          );

          // "1 binary attachment" message.

          attachments = await browser.messages.listAttachments(messages[2].id);
          browser.test.assertEq("1 binary attachment", messages[2].subject);
          browser.test.assertEq(1, attachments.length);

          attachment = attachments[0];
          browser.test.assertEq(
            attachment.contentType,
            "application/octet-stream"
          );
          browser.test.assertEq("test", attachment.name);
          browser.test.assertEq("1.2", attachment.partName);
          browser.test.assertEq(16, attachment.size);

          file = await browser.messages.getAttachmentFile(
            messages[2].id,
            attachment.partName
          );
          browser.test.assertTrue(file instanceof File);
          browser.test.assertEq("test", file.name);
          browser.test.assertEq(16, file.size);

          browser.test.assertEq("binaryAttachment", await file.text());

          reader = new FileReader();
          data = await new Promise(resolve => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
          });

          browser.test.assertEq(
            "data:application/octet-stream;base64,YmluYXJ5QXR0YWNobWVudA==",
            data
          );

          // "2 attachments" message.

          attachments = await browser.messages.listAttachments(messages[3].id);
          browser.test.assertEq("2 attachments", messages[3].subject);
          browser.test.assertEq(2, attachments.length);

          attachment = attachments[0];
          browser.test.assertEq(
            attachment.contentType,
            "application/octet-stream"
          );
          browser.test.assertEq("test", attachment.name);
          browser.test.assertEq("1.2", attachment.partName);
          browser.test.assertEq(16, attachment.size);

          file = await browser.messages.getAttachmentFile(
            messages[3].id,
            attachment.partName
          );
          browser.test.assertTrue(file instanceof File);
          browser.test.assertEq("test", file.name);
          browser.test.assertEq(16, file.size);

          browser.test.assertEq("binaryAttachment", await file.text());

          attachment = attachments[1];
          browser.test.assertEq("text/plain", attachment.contentType);
          browser.test.assertEq("test.txt", attachment.name);
          browser.test.assertEq("1.3", attachment.partName);
          browser.test.assertEq(14, attachment.size);

          file = await browser.messages.getAttachmentFile(
            messages[3].id,
            attachment.partName
          );
          browser.test.assertTrue(file instanceof File);
          browser.test.assertEq("test.txt", file.name);
          browser.test.assertEq(14, file.size);

          browser.test.assertEq("textAttachment", await file.text());

          await browser.test.assertRejects(
            browser.messages.listAttachments(0),
            /^Message not found: \d+\.$/,
            "Bad message ID should throw"
          );
          await browser.test.assertRejects(
            browser.messages.getAttachmentFile(0, "1.2"),
            /^Message not found: \d+\.$/,
            "Bad message ID should throw"
          );
          browser.test.assertThrows(
            () => browser.messages.getAttachmentFile(messages[3].id, "silly"),
            /^Type error for parameter partName .* for messages\.getAttachmentFile\.$/,
            "Bad part name should throw"
          );
          await browser.test.assertRejects(
            browser.messages.getAttachmentFile(messages[3].id, "1.42"),
            /Part 1.42 not found in message \d+\./,
            "Non-existent part should throw"
          );

          browser.test.notifyPass("finished");
        },
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["accountsRead", "messagesRead"],
      },
    });

    await extension.startup();
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);
