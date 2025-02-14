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

add_setup(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_setup() {
    const _account = createAccount();
    const _testFolder1 = await createSubfolder(
      _account.incomingServer.rootFolder,
      "test1"
    );
    const _testFolder2 = await createSubfolder(
      _account.incomingServer.rootFolder,
      "test2"
    );

    const textAttachment = {
      body: "textAttachment",
      filename: "test.txt",
      contentType: "text/plain",
    };
    const binaryAttachment = {
      body: btoa("binaryAttachment"),
      filename: "test",
      contentType: "application/octet-stream",
      encoding: "base64",
    };

    await createMessages(_testFolder1, {
      count: 1,
      subject: "0 attachments",
    });
    await createMessages(_testFolder1, {
      count: 1,
      subject: "1 text attachment",
      attachments: [textAttachment],
    });
    await createMessages(_testFolder1, {
      count: 1,
      subject: "1 binary attachment",
      attachments: [binaryAttachment],
    });
    await createMessages(_testFolder1, {
      count: 1,
      subject: "2 attachments",
      attachments: [binaryAttachment, textAttachment],
    });
    await createMessageFromFile(
      _testFolder1,
      do_get_file("messages/nestedMessages.eml").path
    );
    await createMessageFromFile(
      _testFolder1,
      do_get_file("messages/attachmentOnly.eml").path
    );
    await createMessageFromFile(
      _testFolder1,
      do_get_file("messages/nestedMessageInline.eml").path
    );
    // A multipart/related message with an embedded image.
    await createMessageFromFile(
      _testFolder1,
      do_get_file("messages/sample08.eml").path
    );
    await createMessageFromFile(
      _testFolder1,
      do_get_file("messages/nestedMessageNoContentDispositionHeader.eml").path
    );

    // A binary attachment marked as inline.
    await createMessageFromFile(
      _testFolder2,
      do_get_file("messages/inlineBinaryAttachment.eml").path
    );
  }
);

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_attachments() {
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test1");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(9, messages.length);

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
          window.assertDeepEqual(
            [
              {
                contentDisposition: "attachment",
                contentType: "application/octet-stream",
                headers: {
                  "content-type": [
                    'application/octet-stream; charset=ISO-8859-1; format=flowed; name="test"',
                  ],
                  "content-transfer-encoding": ["base64"],
                  "content-disposition": ['attachment; filename="test"'],
                },
                name: "test",
                partName: "1.2",
                size: 16,
              },
              {
                contentDisposition: "attachment",
                contentType: "text/plain",
                headers: {
                  "content-type": [
                    'text/plain; charset=ISO-8859-1; format=flowed; name="test.txt"',
                  ],
                  "content-transfer-encoding": ["7bit"],
                  "content-disposition": ['attachment; filename="test.txt"'],
                },
                name: "test.txt",
                partName: "1.3",
                size: 14,
              },
            ],
            attachments,
            "Should find the correct attachments for message #3",
            { strict: true }
          );

          file = await browser.messages.getAttachmentFile(
            messages[3].id,
            attachments[0].partName
          );
          // eslint-disable-next-line mozilla/use-isInstance
          browser.test.assertTrue(file instanceof File);
          browser.test.assertEq("test", file.name);
          browser.test.assertEq(16, file.size);
          browser.test.assertEq("binaryAttachment", await file.text());

          file = await browser.messages.getAttachmentFile(
            messages[3].id,
            attachments[1].partName
          );
          // eslint-disable-next-line mozilla/use-isInstance
          browser.test.assertTrue(file instanceof File);
          browser.test.assertEq("test.txt", file.name);
          browser.test.assertEq(14, file.size);
          browser.test.assertEq("textAttachment", await file.text());

          // Test invalid function calls.
          await browser.test.assertRejects(
            browser.messages.listAttachments(100),
            /^Message not found: \d+\.$/,
            "Bad message ID should throw"
          );
          await browser.test.assertRejects(
            browser.messages.getAttachmentFile(100, "1.2"),
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

          // Test the attachment-only eml file.
          attachments = await browser.messages.listAttachments(6);
          browser.test.assertEq(
            1,
            attachments.length,
            "Should find a single attachment"
          );
          browser.test.assertEq(
            "Screenshot 2024-04-28 at 18.24.31.png",
            attachments[0].name,
            "Should find the correct attachment"
          );
          // Since we are here, let's double-check that query also considers this
          // message to have an attachment.
          const { messages: queryResult } = await browser.messages.query({
            attachment: true,
            subject: "Report",
          });
          browser.test.assertEq(
            1,
            queryResult.length,
            "Should find a single message"
          );
          browser.test.assertEq(
            6,
            queryResult[0].id,
            "Should find the correct message"
          );

          // Test related parts with a content-id.
          attachments = await browser.messages.listAttachments(messages[7].id);
          window.assertDeepEqual(
            [
              {
                contentDisposition: "inline",
                contentType: "image/png",
                name: "blue_pixel_1x1.png",
                size: 179,
                partName: "1.2",
                contentId: "part1.FxEY2Ivx.xSFtCdX4@example.com",
                headers: {
                  "content-type": ['image/png; name="blue_pixel_1x1.png"'],
                  "content-disposition": [
                    'inline; filename="blue_pixel_1x1.png"',
                  ],
                  "content-id": ["<part1.FxEY2Ivx.xSFtCdX4@example.com>"],
                  "content-transfer-encoding": ["base64"],
                },
              },
            ],
            attachments,
            "Should find the correct related attachment",
            { strict: true }
          );
          // Check that we can get the file as well.
          file = await browser.messages.getAttachmentFile(
            messages[7].id,
            "1.2"
          );
          // eslint-disable-next-line mozilla/use-isInstance
          browser.test.assertTrue(file instanceof File);
          browser.test.assertEq("blue_pixel_1x1.png", file.name);
          browser.test.assertEq(179, file.size);

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
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test1");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(9, messages.length);
          const message = messages[4];

          function validateMessage(msg, expectedValues) {
            for (const expectedValueName in expectedValues) {
              const value = msg[expectedValueName];
              const expected = expectedValues[expectedValueName];
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
          const attachments = await browser.messages.listAttachments(
            message.id
          );
          browser.test.assertEq(2, attachments.length);
          browser.test.assertEq("1.2", attachments[0].partName);
          browser.test.assertEq("1.3", attachments[1].partName);

          browser.test.assertEq("message1.eml", attachments[0].name);
          browser.test.assertEq("yellowPixel.png", attachments[1].name);

          // Validate the returned MessageHeader for attached message1.eml.
          const subMessage = attachments[0].message;
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
            size: account.type == "none" ? 442 : 444,
            tags: [],
            external: true,
          });

          // Make sure we can use getFull() on the subMessage.
          const subFull = await browser.messages.getFull(subMessage.id);
          browser.test.assertEq(
            subFull.headers["message-id"][0],
            "<sample-attached.eml@mime.sample>",
            "Message Id returned by getFull() for the attached message should be correct."
          );

          // Make sure we can use getRaw() on the subMessage.
          const subRaw = await browser.messages.getRaw(subMessage.id);
          browser.test.assertTrue(
            subRaw.startsWith("Message-ID: <sample-attached.eml@mime.sample>"),
            "Content returned by getRaw() for the attached message should be correct."
          );

          // Get attachments of sub-message messag1.eml.
          const subAttachments = await browser.messages.listAttachments(
            subMessage.id
          );
          browser.test.assertEq(4, subAttachments.length);
          browser.test.assertEq("1.2", subAttachments[0].partName);
          browser.test.assertEq("1.3", subAttachments[1].partName);
          browser.test.assertEq("1.4", subAttachments[2].partName);
          browser.test.assertEq("1.5", subAttachments[3].partName);

          browser.test.assertEq("whitePixel.png", subAttachments[0].name);
          browser.test.assertEq("greenPixel.png", subAttachments[1].name);
          browser.test.assertEq("redPixel.png", subAttachments[2].name);
          browser.test.assertEq("message2.eml", subAttachments[3].name);

          // Make sure we can get an attachment from the subMessage
          const att1 = await browser.messages.getAttachmentFile(
            subMessage.id,
            "1.2"
          );
          browser.test.assertTrue(att1.size);
          const att2 = await browser.messages.getAttachmentFile(
            subMessage.id,
            "1.5"
          );
          browser.test.assertTrue(att2.size);

          const subSubAttachments = await browser.messages.listAttachments(
            subAttachments[3].message.id
          );
          browser.test.assertEq(1, subSubAttachments.length);
          browser.test.assertEq("1.2", subSubAttachments[0].partName);
          browser.test.assertEq("whitePixel.png", subSubAttachments[0].name);
          const att3 = await browser.messages.getAttachmentFile(
            subAttachments[3].message.id,
            "1.2"
          );
          browser.test.assertTrue(att3.size);

          // Validate the returned MessageHeader for sub-message message2.eml
          // attached to sub-message message1.eml.
          const subSubMessage = subAttachments[3].message;
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
            size: account.type == "none" ? 100 : 101,
            tags: [],
            external: true,
          });

          // Test getAttachmentFile().
          // Note: X-ray vision is an undocumented feature, which is used internally
          //       to retrieve attachments of attached messages. The parts of nested
          //       messages are not returned by listAttachments(), but one could
          //       guess the correct x-ray partName to be able to retrieve nested
          //       parts. Example: Requesting part 1.2$.3 from the main message
          //       returns the same part as requesting part 1.3. from message1.eml
          //       (which is part 1.2).
          //       The schema definition for getAttachmentFile() could prevent
          //       x-ray vision by rejecting partNames which include a $, but this
          //       would also not allow the following test to verify x-ray vision.
          const fileTests = [
            {
              partName: "1.2",
              name: "message1.eml",
              size: account.type == "none" ? 2517 : 2601,
              text: "Message-ID: <sample-attached.eml@mime.sample>",
            },
            {
              partName: "1.2$.2",
              name: "whitePixel.png",
              size: 69,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC",
            },
            {
              partName: "1.2$.3",
              name: "greenPixel.png",
              size: 119,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY+C76AoAAhUBJel4xsMAAAAASUVORK5CYII=",
            },
            {
              partName: "1.2$.4",
              name: "redPixel.png",
              size: 119,
              data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY+hgkAYAAbcApOp/9LEAAAAASUVORK5CYII=",
            },
            {
              partName: "1.2$.5",
              name: "message2.eml",
              size: account.type == "none" ? 838 : 867,
              text: "Message-ID: <sample-nested-attached.eml@mime.sample>",
            },
            {
              partName: "1.2$.5$.2",
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
          const testMessages = [
            {
              id: message.id,
              expectedFileCounts: 7,
            },
            {
              id: subMessage.id,
              subPart: "1.2$.",
              expectedFileCounts: 5,
            },
            {
              id: subSubMessage.id,
              subPart: "1.2$.5$.",
              expectedFileCounts: 1,
            },
          ];
          for (const msg of testMessages) {
            let fileCounts = 0;
            for (const test of fileTests) {
              // The fileTest array has the partNames as seen from the outer
              // message and we need to rebase them to the current message, in
              // order to get something back. Negative X-Ray is not possible.
              if (msg.subPart && msg.subPart.length > test.partName.length) {
                continue;
              }

              fileCounts++;
              // 1.2$.4    from message1.eml (1.2$.)    should result in requesting 1.4
              // 1.2$.5$.2 from message1.eml (1.2$.)    should result in requesting 1.5$2
              // 1.2$.5$.2 from message2.eml (1.2$.5$.) should result in requesting 1.2
              const partName = msg.subPart
                ? `1.${test.partName.slice(msg.subPart.length)}`
                : test.partName;
              const file = await browser.messages.getAttachmentFile(
                msg.id,
                partName
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
                const reader = new FileReader();
                const data = await new Promise(resolve => {
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

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_messages_as_inline_attachments() {
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test1");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(9, messages.length);
          const message = messages[6];

          function validateMessage(msg, expectedValues) {
            for (const expectedValueName in expectedValues) {
              const value = msg[expectedValueName];
              const expected = expectedValues[expectedValueName];
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
          const attachments = await browser.messages.listAttachments(
            message.id
          );
          browser.test.assertEq(2, attachments.length);
          browser.test.assertEq("1.2", attachments[0].partName);
          browser.test.assertEq("1.3", attachments[1].partName);

          browser.test.assertEq("ForwardedMessage.eml", attachments[0].name);
          browser.test.assertEq("yellowPixel.png", attachments[1].name);

          // Validate the returned MessageHeader for attached ForwardedMessage.eml.
          const subMessage = attachments[0].message;
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
            size: account.type == "none" ? 342 : 343,
            tags: [],
            external: true,
          });

          // Make sure we can use getFull() on the subMessage.
          const subFull = await browser.messages.getFull(subMessage.id);
          browser.test.assertEq(
            subFull.headers["message-id"][0],
            "<sample-attached.eml@mime.sample>",
            "Message Id returned by getFull() for the attached message should be correct."
          );

          // Make sure we can use getRaw() on the subMessage.
          const subRaw = await browser.messages.getRaw(subMessage.id);
          browser.test.assertTrue(
            subRaw.startsWith("Message-ID: <sample-attached.eml@mime.sample>"),
            "Content returned by getRaw() for the attached message should be correct."
          );

          // Get attachments of sub-message ForwardedMessage.eml.
          const subAttachments = await browser.messages.listAttachments(
            subMessage.id
          );
          browser.test.assertEq(3, subAttachments.length);
          browser.test.assertEq("1.2", subAttachments[0].partName);
          browser.test.assertEq("1.3", subAttachments[1].partName);
          browser.test.assertEq("1.4", subAttachments[2].partName);

          browser.test.assertEq("whitePixel.png", subAttachments[0].name);
          browser.test.assertEq("greenPixel.png", subAttachments[1].name);
          browser.test.assertEq("redPixel.png", subAttachments[2].name);

          // Make sure we can get an attachment from the subMessage
          const att1 = await browser.messages.getAttachmentFile(
            subMessage.id,
            "1.2"
          );
          browser.test.assertTrue(att1.size);

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
  async function test_messages_as_inline_attachment_without_contentDisposition_header() {
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test1");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(9, messages.length);
          const message = messages[8];

          function validateMessage(msg, expectedValues) {
            for (const expectedValueName in expectedValues) {
              const value = msg[expectedValueName];
              const expected = expectedValues[expectedValueName];
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
          const attachments = await browser.messages.listAttachments(
            message.id
          );
          browser.test.assertEq(2, attachments.length);
          browser.test.assertEq("1.2", attachments[0].partName);
          browser.test.assertEq("1.3", attachments[1].partName);

          browser.test.assertEq("ForwardedMessage.eml", attachments[0].name);
          browser.test.assertEq("yellowPixel.png", attachments[1].name);

          // Validate the returned MessageHeader for attached ForwardedMessage.eml.
          const subMessage = attachments[0].message;
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
            size: account.type == "none" ? 342 : 343,
            tags: [],
            external: true,
          });

          // Make sure we can use getFull() on the subMessage.
          const subFull = await browser.messages.getFull(subMessage.id);
          browser.test.assertEq(
            subFull.headers["message-id"][0],
            "<sample-attached.eml@mime.sample>",
            "Message Id returned by getFull() for the attached message should be correct."
          );

          // Make sure we can use getRaw() on the subMessage.
          const subRaw = await browser.messages.getRaw(subMessage.id);
          browser.test.assertTrue(
            subRaw.startsWith("Message-ID: <sample-attached.eml@mime.sample>"),
            "Content returned by getRaw() for the attached message should be correct."
          );

          // Get attachments of sub-message ForwardedMessage.eml.
          const subAttachments = await browser.messages.listAttachments(
            subMessage.id
          );
          browser.test.assertEq(3, subAttachments.length);
          browser.test.assertEq("1.2", subAttachments[0].partName);
          browser.test.assertEq("1.3", subAttachments[1].partName);
          browser.test.assertEq("1.4", subAttachments[2].partName);

          browser.test.assertEq("whitePixel.png", subAttachments[0].name);
          browser.test.assertEq("greenPixel.png", subAttachments[1].name);
          browser.test.assertEq("redPixel.png", subAttachments[2].name);

          // Make sure we can get an attachment from the subMessage
          const att1 = await browser.messages.getAttachmentFile(
            subMessage.id,
            "1.2"
          );
          browser.test.assertTrue(att1.size);

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
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_detach_attachments() {
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const { os } = await browser.runtime.getPlatformInfo();
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test1");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(9, messages.length);

          async function checkAttachments(id, expected) {
            const attachments = await browser.messages.listAttachments(id);
            const expectedAttachmentPartNames = Object.keys(expected);
            browser.test.assertEq(
              expectedAttachmentPartNames.length,
              attachments.length,
              "Should have found the expected number of attachments"
            );

            for (const attachment of attachments) {
              const expectedValues = expected[attachment.partName];
              browser.test.assertTrue(
                expectedValues,
                `Should have expected the attachment ${attachment.partName}`
              );
              browser.test.assertEq(
                expectedValues.contentType,
                attachment.contentType,
                "Should find the correct content type"
              );
              browser.test.assertEq(
                expectedValues.name,
                attachment.name,
                "Should find the correct name"
              );
              browser.test.assertEq(
                expectedValues.size,
                attachment.size,
                "Should find the correct size"
              );
            }
          }

          // "1 text attachment" message.
          await checkAttachments(messages[1].id, {
            1.2: { contentType: "text/plain", name: "test.txt", size: 14 },
          });
          await browser.messages.deleteAttachments(messages[1].id, ["1.2"]);
          await checkAttachments(messages[1].id, {
            1.2: {
              contentType: "text/x-moz-deleted",
              name: "Deleted: test.txt",
              size: os == "win" ? 268 : 261,
            },
          });

          // "1 binary attachment" message.
          await checkAttachments(messages[2].id, {
            1.2: {
              contentType: "application/octet-stream",
              name: "test",
              size: 16,
            },
          });
          await browser.messages.deleteAttachments(messages[2].id, ["1.2"]);
          await checkAttachments(messages[2].id, {
            1.2: {
              contentType: "text/x-moz-deleted",
              name: "Deleted: test",
              size: os == "win" ? 276 : 269,
            },
          });

          // "2 attachments" message.
          await checkAttachments(messages[3].id, {
            1.2: {
              contentType: "application/octet-stream",
              name: "test",
              size: 16,
            },
            1.3: { contentType: "text/plain", name: "test.txt", size: 14 },
          });
          await browser.messages.deleteAttachments(messages[3].id, [
            "1.2",
            "1.3",
          ]);
          await checkAttachments(messages[3].id, {
            1.2: {
              contentType: "text/x-moz-deleted",
              name: "Deleted: test",
              size: os == "win" ? 276 : 269,
            },
            1.3: {
              contentType: "text/x-moz-deleted",
              name: "Deleted: test.txt",
              size: os == "win" ? 268 : 261,
            },
          });

          await browser.test.assertRejects(
            browser.messages.deleteAttachments(0, ["1.2"]),
            /^Message not found: \d+\.$/,
            "Bad message ID should throw"
          );

          await browser.test.assertRejects(
            browser.messages.deleteAttachments(messages[3].id, ["1.7"]),
            /^Part 1.7 not found in message \d+\.$/,
            "Bad partName should throw"
          );

          await browser.test.assertRejects(
            browser.messages.deleteAttachments(messages[3].id, ["1.2"]),
            /^Operation not permitted for deleted attachment 1.2 in message \d+\.$/,
            "Deleted attachment should throw"
          );

          browser.test.notifyPass("finished");
        },
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        background: { scripts: ["utils.js", "background.js"] },
        permissions: [
          "accountsRead",
          "messagesRead",
          "messagesModifyPermanent",
        ],
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
  async function test_binary_attachments_as_inline_attachments() {
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test2");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(1, messages.length);
          const message = messages[0];

          // Request attachments.
          const attachments = await browser.messages.listAttachments(
            message.id
          );
          browser.test.assertEq(1, attachments.length);
          browser.test.assertEq("1.2", attachments[0].partName);
          browser.test.assertEq("Simple_file.pdf", attachments[0].name);
          browser.test.assertEq("inline", attachments[0].contentDisposition);

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
