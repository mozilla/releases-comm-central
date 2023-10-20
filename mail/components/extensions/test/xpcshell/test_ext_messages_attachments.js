/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_setup() {
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
    await createMessageFromFile(
      _testFolder,
      do_get_file("messages/nestedMessages.eml").path
    );
  }
);

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_attachments() {
    let extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          let [account] = await browser.accounts.list();
          let testFolder = account.folders.find(f => f.name == "test1");
          let { messages } = await browser.messages.list(testFolder);
          browser.test.assertEq(5, messages.length);

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
          // eslint-disable-next-line mozilla/use-isInstance
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
          // eslint-disable-next-line mozilla/use-isInstance
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
          // eslint-disable-next-line mozilla/use-isInstance
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
          // eslint-disable-next-line mozilla/use-isInstance
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

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_messages_as_attachments() {
    let extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          let [account] = await browser.accounts.list();
          let testFolder = account.folders.find(f => f.name == "test1");
          let { messages } = await browser.messages.list(testFolder);
          browser.test.assertEq(5, messages.length);
          let message = messages[4];

          function validateMessage(msg, expectedValues) {
            for (let expectedValueName in expectedValues) {
              let value = msg[expectedValueName];
              let expected = expectedValues[expectedValueName];
              if (Array.isArray(expected)) {
                browser.test.assertTrue(
                  Array.isArray(value),
                  `Value for ${expectedValueName} should be an Array.`
                );
                browser.test.assertEq(
                  expected.length,
                  value.length,
                  `Value for ${expectedValueName} should have the correct Array size.`
                );
                for (let i = 0; i < expected.length; i++) {
                  browser.test.assertEq(
                    expected[i],
                    value[i],
                    `Value for ${expectedValueName}[${i}] should be correct.`
                  );
                }
              } else if (expected instanceof Date) {
                browser.test.assertTrue(
                  value instanceof Date,
                  `Value for ${expectedValueName} should be a Date.`
                );
                browser.test.assertEq(
                  expected.getTime(),
                  value.getTime(),
                  `Date value for ${expectedValueName} should be correct.`
                );
              } else {
                browser.test.assertEq(
                  expected,
                  value,
                  `Value for ${expectedValueName} should be correct.`
                );
              }
            }
          }

          // Request attachments.
          let attachments = await browser.messages.listAttachments(message.id);
          browser.test.assertEq(2, attachments.length);
          browser.test.assertEq("1.2", attachments[0].partName);
          browser.test.assertEq("1.3", attachments[1].partName);

          browser.test.assertEq("message1.eml", attachments[0].name);
          browser.test.assertEq("yellowPixel.png", attachments[1].name);

          // Validate the returned MessageHeader for attached message1.eml.
          let subMessage = attachments[0].message;
          browser.test.assertTrue(
            subMessage.id != message.id,
            `Id of attached SubMessage (${subMessage.id}) should be different from the id of the outer message (${message.id})`
          );
          validateMessage(subMessage, {
            date: new Date(958606367000),
            author: "Superman <clark.kent@dailyplanet.com>",
            recipients: ["Jimmy <jimmy.olsen@dailyplanet.com>"],
            ccList: [],
            bccList: [],
            subject: "Test message 1",
            new: false,
            headersOnly: false,
            flagged: false,
            junk: false,
            junkScore: 0,
            headerMessageId: "sample-attached.eml@mime.sample",
            size: 0,
            tags: [],
            external: true,
          });

          // Make sure we can use getFull() on the subMessage.
          let subFull = await browser.messages.getFull(subMessage.id);
          browser.test.assertEq(
            subFull.headers["message-id"][0],
            "<sample-attached.eml@mime.sample>",
            "Message Id returned by getFull() for the attached message should be correct."
          );
          browser.test.assertEq(
            subFull.name,
            "message1.eml",
            "Name returned by getFull() for the attached message should be correct."
          );

          // Make sure we can use getRaw() on the subMessage.
          let subRaw = await browser.messages.getRaw(subMessage.id);
          browser.test.assertTrue(
            subRaw.startsWith("Message-ID: <sample-attached.eml@mime.sample>"),
            "Content returned by getRaw() for the attached message should be correct."
          );

          // Get attachments of sub-message messag1.eml.
          let subAttachments = await browser.messages.listAttachments(
            subMessage.id
          );
          browser.test.assertEq(4, subAttachments.length);
          browser.test.assertEq("1.2.1.2", subAttachments[0].partName);
          browser.test.assertEq("1.2.1.3", subAttachments[1].partName);
          browser.test.assertEq("1.2.1.4", subAttachments[2].partName);
          browser.test.assertEq("1.2.1.5", subAttachments[3].partName);

          browser.test.assertEq("whitePixel.png", subAttachments[0].name);
          browser.test.assertEq("greenPixel.png", subAttachments[1].name);
          browser.test.assertEq("redPixel.png", subAttachments[2].name);
          browser.test.assertEq("message2.eml", subAttachments[3].name);

          // Validate the returned MessageHeader for sub-message message2.eml
          // attached to sub-message message1.eml.
          let subSubMessage = subAttachments[3].message;
          browser.test.assertTrue(
            ![message.id, subMessage.id].includes(subSubMessage.id),
            `Id of attached SubSubMessage (${subSubMessage.id}) should be different from the id of the outer message (${message.id}) and from the SubMessage (${subMessage.id})`
          );
          validateMessage(subSubMessage, {
            date: new Date(958519967000),
            author: "Jimmy <jimmy.olsen@dailyplanet.com>",
            recipients: ["Superman <clark.kent@dailyplanet.com>"],
            ccList: [],
            bccList: [],
            subject: "Test message 2",
            new: false,
            headersOnly: false,
            flagged: false,
            junk: false,
            junkScore: 0,
            headerMessageId: "sample-nested-attached.eml@mime.sample",
            size: 0,
            tags: [],
            external: true,
          });

          // Test getAttachmentFile().
          // Note: This function has x-ray vision into sub-messages and can get
          // any part inside the message, even if - technically - the attachments
          // belong to subMessages. There is no difference between requesting
          // part 1.2.1.2 from the main message or from message1.eml (part 1.2).
          // X-ray vision from a sub-message back into a parent is not allowed.
          let platform = await browser.runtime.getPlatformInfo();
          let fileTests = [
            {
              partName: "1.2",
              name: "message1.eml",
              size:
                platform.os != "win" &&
                (account.type == "none" || account.type == "nntp")
                  ? 2517
                  : 2601,
              text: "Message-ID: <sample-attached.eml@mime.sample>",
            },
            {
              partName: "1.2.1.2",
              name: "whitePixel.png",
              size: 69,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC",
            },
            {
              partName: "1.2.1.3",
              name: "greenPixel.png",
              size: 119,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY+C76AoAAhUBJel4xsMAAAAASUVORK5CYII=",
            },
            {
              partName: "1.2.1.4",
              name: "redPixel.png",
              size: 119,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY+hgkAYAAbcApOp/9LEAAAAASUVORK5CYII=",
            },
            {
              partName: "1.2.1.5",
              name: "message2.eml",
              size:
                platform.os != "win" &&
                (account.type == "none" || account.type == "nntp")
                  ? 838
                  : 867,
              text: "Message-ID: <sample-nested-attached.eml@mime.sample>",
            },
            {
              partName: "1.2.1.5.1.2",
              name: "whitePixel.png",
              size: 69,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC",
            },
            {
              partName: "1.3",
              name: "yellowPixel.png",
              size: 119,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY/j/iQEABOUB8pypNlQAAAAASUVORK5CYII=",
            },
          ];
          let testMessages = [
            {
              id: message.id,
              expectedFileCounts: 7,
            },
            {
              id: subMessage.id,
              subPart: "1.2.",
              expectedFileCounts: 5,
            },
            {
              id: subSubMessage.id,
              subPart: "1.2.1.5.",
              expectedFileCounts: 1,
            },
          ];
          for (let msg of testMessages) {
            let fileCounts = 0;
            for (let test of fileTests) {
              if (msg.subPart && !test.partName.startsWith(msg.subPart)) {
                await browser.test.assertRejects(
                  browser.messages.getAttachmentFile(msg.id, test.partName),
                  `Part ${test.partName} not found in message ${msg.id}.`,
                  "Sub-message should not be able to get parts from parent message"
                );
                continue;
              }
              fileCounts++;

              let file = await browser.messages.getAttachmentFile(
                msg.id,
                test.partName
              );

              // eslint-disable-next-line mozilla/use-isInstance
              browser.test.assertTrue(file instanceof File);
              browser.test.assertEq(test.name, file.name);
              browser.test.assertEq(test.size, file.size);

              if (test.text) {
                browser.test.assertTrue(
                  (await file.text()).startsWith(test.text)
                );
              }

              if (test.data) {
                let reader = new FileReader();
                let data = await new Promise(resolve => {
                  reader.onload = e => resolve(e.target.result);
                  reader.readAsDataURL(file);
                });
                browser.test.assertEq(
                  test.data,
                  data.replaceAll("\r\n", "\n").trim()
                );
              }
            }
            browser.test.assertEq(
              msg.expectedFileCounts,
              fileCounts,
              "Should have requested to correct amount of attachment files."
            );
          }
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
