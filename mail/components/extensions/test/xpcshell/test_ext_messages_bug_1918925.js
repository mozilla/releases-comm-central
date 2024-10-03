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
    const _testFolder = await createSubfolder(
      _account.incomingServer.rootFolder,
      "test1"
    );

    await createMessageFromFile(
      _testFolder,
      do_get_file("messages/nestedMessagesUnusualMultipart.eml").path
    );
  }
);

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_messages_with_unusual_multiparts() {
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test1");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(1, messages.length);
          const message = messages[0];

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
          browser.test.assertEq("1.1.1.2", attachments[0].partName);
          browser.test.assertEq("1.1.1.3", attachments[1].partName);

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
          browser.test.assertEq("1.1.2", subAttachments[0].partName);
          browser.test.assertEq("1.1.3", subAttachments[1].partName);
          browser.test.assertEq("1.1.4", subAttachments[2].partName);
          browser.test.assertEq("1.1.5", subAttachments[3].partName);

          browser.test.assertEq("whitePixel.png", subAttachments[0].name);
          browser.test.assertEq("greenPixel.png", subAttachments[1].name);
          browser.test.assertEq("redPixel.png", subAttachments[2].name);
          browser.test.assertEq("message2.eml", subAttachments[3].name);

          // Make sure we can get an attachment from the subMessage
          const att1 = await browser.messages.getAttachmentFile(
            subMessage.id,
            "1.1.2"
          );
          browser.test.assertTrue(att1.size);
          const att2 = await browser.messages.getAttachmentFile(
            subMessage.id,
            "1.1.5"
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
