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
const TEST_MESSAGE = `From: John Doe <john.doe@example.com>
Date: Sat, 24 Mar 1990 10:59:24 -0500
Newsgroups: test.subscribe.simple
Subject: H2G2 -- What does it mean?
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="XXXXboundary text"
Message-ID: <TSS1@nntp.invalid>

This is a multipart message in MIME format.

--XXXXboundary text
Content-Type: text/plain

What does the acronym H2G2 stand for? I've seen it before...

--XXXXboundary text
Content-Type: text/plain;
Content-Disposition: attachment; filename="test.txt"

This is the attachment text

--XXXXboundary text--
`;

add_task(async function test_accounts() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let [EXPECTED_MESSAGE] = await window.sendMessage("getTestMessage");

        let accounts = await browser.accounts.list();
        browser.test.assertEq(1, accounts.length, "Number of accounts.");

        let account = accounts[0];
        browser.test.assertEq("account1", account.id, "ID of first account.");
        browser.test.assertEq(
          "test.subscribe.simple",
          account.folders[0].name,
          "Name of first subscribed newsgroup."
        );
        browser.test.assertEq(
          "test.subscribe.empty",
          account.folders[1].name,
          "Name of second subscribed newsgroup."
        );

        window.assertDeepEqual(
          {
            id: "account1",
            name: "account1user on localhost",
            type: "nntp",
            folders: [
              {
                accountId: "account1",
                name: "test.subscribe.simple",
                path: "/test.subscribe.simple",
                subFolders: [],
              },
              {
                accountId: "account1",
                name: "test.subscribe.empty",
                path: "/test.subscribe.empty",
                subFolders: [],
              },
              {
                accountId: "account1",
                name: "test",
                path: "/test",
                subFolders: [],
              },
            ],
            identities: [],
          },
          account
        );

        let messages_simple = await browser.messages.list(account.folders[0]);
        browser.test.assertEq(
          1,
          messages_simple.messages.length,
          "Number of messages in first newsgroup is correct."
        );

        let messages_empty = await browser.messages.list(account.folders[1]);
        browser.test.assertEq(
          0,
          messages_empty.messages.length,
          "Number of messages in second newsgroup is correct."
        );

        let messages_test = await browser.messages.list(account.folders[2]);
        browser.test.assertEq(
          4,
          messages_test.messages.length,
          "Number of messages in third newsgroup is correct."
        );

        // Check content of MessageHeader. The msgHdr of nntp does not
        // support all fields (see bug 1696895).
        window.assertDeepEqual(
          {
            id: 1,
            date: new Date("1990-03-24T15:59:24.000Z"),
            author: "John Doe <john.doe@example.com>",
            recipients: [],
            ccList: [],
            bccList: [],
            subject: "H2G2 -- What does it mean?",
            read: false,
            flagged: false,
            junk: false,
            junkScore: 0,
            headerMessageId: "TSS1@nntp.invalid",
            size: 0,
            folder: {
              accountId: "account1",
              name: "test.subscribe.simple",
              path: "/test.subscribe.simple",
            },
            tags: [],
          },
          messages_simple.messages[0]
        );

        // Check the actual message body. Fold Windows line-endings \r\n to \n.
        let raw = await browser.messages.getRaw(1);
        browser.test.assertEq(
          raw.replace(/\r/g, ""),
          EXPECTED_MESSAGE,
          "Raw content is correct."
        );

        // Check the full mime parsed content. Fold Windows line-endings \r\n to \n.
        // This is using the jsmime.js based MimeParser.
        let full = await browser.messages.getFull(1);
        full.parts[0].parts[0].body = full.parts[0].parts[0].body.replace(
          /\r/g,
          ""
        );
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            headers: {
              from: ["John Doe <john.doe@example.com>"],
              date: ["Sat, 24 Mar 1990 10:59:24 -0500"],
              newsgroups: ["test.subscribe.simple"],
              subject: ["H2G2 -- What does it mean?"],
              "mime-version": ["1.0"],
              "content-type": ['multipart/mixed; boundary="XXXXboundary text"'],
              "message-id": ["<TSS1@nntp.invalid>"],
            },
            partName: "",
            size: 91,
            parts: [
              {
                contentType: "multipart/mixed",
                headers: {
                  from: ["John Doe <john.doe@example.com>"],
                  date: ["Sat, 24 Mar 1990 10:59:24 -0500"],
                  newsgroups: ["test.subscribe.simple"],
                  subject: ["H2G2 -- What does it mean?"],
                  "mime-version": ["1.0"],
                  "content-type": [
                    'multipart/mixed; boundary="XXXXboundary text"',
                  ],
                  "message-id": ["<TSS1@nntp.invalid>"],
                },
                partName: "1",
                size: 91,
                parts: [
                  {
                    body:
                      "What does the acronym H2G2 stand for? I've seen it before...\n",
                    contentType: "text/plain",
                    headers: {
                      "content-type": ["text/plain"],
                    },
                    partName: "1.1",
                    size: 62,
                  },
                  {
                    contentType: "text/plain",
                    headers: {
                      "content-type": ["text/plain;"],
                      "content-disposition": [
                        'attachment; filename="test.txt"',
                      ],
                    },
                    name: "test.txt",
                    partName: "1.2",
                    size: 29,
                  },
                ],
              },
            ],
          },
          full
        );

        let attachments = await browser.messages.listAttachments(1);
        browser.test.assertEq(
          1,
          attachments.length,
          "Number of attachments is content."
        );

        let attachment = attachments[0];
        browser.test.assertEq(attachment.contentType, "text/plain");
        browser.test.assertEq("test.txt", attachment.name);
        browser.test.assertEq("1.2", attachment.partName);
        browser.test.assertEq(29, attachment.size);

        let file = await browser.messages.getAttachmentFile(
          1,
          attachment.partName
        );
        browser.test.assertTrue(file instanceof File);
        browser.test.assertEq("test.txt", file.name);
        browser.test.assertEq(29, file.size);
        browser.test.assertEq(
          "This is the attachment text\n",
          (await file.text()).replace(/\r/g, "")
        );

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
          () => browser.messages.getAttachmentFile(1, "silly"),
          /^Type error for parameter partName .* for messages\.getAttachmentFile\.$/,
          "Bad part name should throw"
        );
        await browser.test.assertRejects(
          browser.messages.getAttachmentFile(1, "1.42"),
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

  let _account = createAccount();
  let rootFolder = _account.incomingServer.rootFolder;

  // Create the test.subscribe.simple newsgroup and add a tets mail.
  let simpleFolder = await createSubfolder(rootFolder, "test.subscribe.simple");
  await createMessageFromString(simpleFolder, TEST_MESSAGE);

  // Create an empty newsgroup.
  await createSubfolder(rootFolder, "test.subscribe.empty");

  // Create a test newsgroup and generate some content.
  let testFolder = await createSubfolder(rootFolder, "test");
  await createMessages(testFolder, 4);

  extension.onMessage("getTestMessage", () => {
    extension.sendMessage(TEST_MESSAGE);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
  cleanUpAccount(_account);
});
