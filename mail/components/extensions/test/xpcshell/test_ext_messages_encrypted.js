/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
var { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

const SMIME_DATA_DIR = "../../../../../mailnews/test/data/smime/";
const OPENPGP_TEST_DIR = "../../../../test/browser/openpgp";

const OPENPGP_KEY_PATH = PathUtils.join(
  do_get_file(OPENPGP_TEST_DIR).path,
  "data",
  "keys",
  "alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
);

add_setup(async () => {
  // Prepare OpenPGP messages.
  await OpenPGPTestUtils.initOpenPGP();

  const _account = createAccount();
  const _identity = addIdentity(_account);
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    null,
    new FileUtils.File(OPENPGP_KEY_PATH)
  );
  _identity.setUnicharAttribute("openpgp_key_id", id);

  const _test1 = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );
  await createMessageFromFile(
    _test1,
    do_get_file("messages/encryptedNestedMessages.eml").path
  );

  const _test2 = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test2"
  );
  await createMessageFromFile(
    _test2,
    do_get_file("messages/msg-with-enc-openpgp-attachment.eml").path
  );

  const _test3 = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test3"
  );
  await createMessageFromFile(
    _test3,
    do_get_file("messages/msg-with-enc-openpgp-inline.eml").path
  );

  // Prepare SMIME messages.
  SmimeUtils.ensureNSS();

  SmimeUtils.loadPEMCertificate(
    do_get_file(SMIME_DATA_DIR + "TestCA.pem"),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(SMIME_DATA_DIR + "Alice.p12"),
    "nss"
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(SMIME_DATA_DIR + "Bob.p12"),
    "nss"
  );

  const _test4 = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test4"
  );
  const message4 = await IOUtils.readUTF8(
    do_get_file(SMIME_DATA_DIR + "alice.env.eml").path
  );
  // The message does not have a Message-ID header, which will cause issues for
  // our NNTP test server. Add it manually.
  await createMessageFromString(
    _test4,
    "Message-ID: <test4@sample.message>\r\n" + message4
  );

  const _test5 = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test5"
  );
  const message5 = await IOUtils.readUTF8(
    do_get_file(SMIME_DATA_DIR + "alice.sig.SHA256.opaque.env.eml").path
  );
  // The message does not have a Message-ID header, which will cause issues for
  // our NNTP test server. Add it manually.
  await createMessageFromString(
    _test5,
    "Message-ID: <test5@sample.message>\r\n" + message5
  );
});

// Test an OpenPGP/MIME encrypted message with nested attachments.
add_task(async function test_openpgp_enc_nested_messages() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test1" });
        const { accountId } = folder;
        const { type } = await browser.accounts.get(accountId);

        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(1, messages.length);
        browser.test.assertEq(1, messages[0].id);

        // Get the still encrypted tree. It should be marked as encrypted but not
        // decrypted (decryptionStatus = skipped).
        const fullEncrypted = await browser.messages.getFull(1, {
          decrypt: false,
        });
        browser.test.assertEq(
          "skipped",
          fullEncrypted.decryptionStatus,
          "The decryptionStatus should be correct"
        );

        // Get the raw decrypted content of the message (id: 1) via getRaw().
        const raw1file = await browser.messages.getRaw(1, { decrypt: true });
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(raw1file instanceof File);
        browser.test.assertEq("message-1.eml", raw1file.name);
        browser.test.assertEq(type == "imap" ? 4024 : 3971, raw1file.size);
        const raw1content = await raw1file.text();
        browser.test.assertTrue(
          !raw1content.includes("-----BEGIN PGP MESSAGE-----"),
          "getRaw() of the outer message should be decrypted"
        );
        browser.test.assertTrue(
          raw1content.includes("<sample.eml@mime.sample>"),
          "getRaw() of the outer message should include the message ID of the outer message"
        );
        browser.test.assertTrue(
          raw1content.includes("<sample-attached.eml@mime.sample>"),
          "getRaw() of the outer message should include the message ID of the nested message"
        );
        browser.test.assertTrue(
          raw1content.includes("<sample-nested-attached.eml@mime.sample>"),
          "getRaw() of the outer message should include the message ID of the inner nested message"
        );

        // Get the full decrypted content of the message (id: 1) via getFull().
        const full1 = await browser.messages.getFull(1, { decrypt: true });
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 2884,
            decryptionStatus: "success",
            headers: {
              "message-id": ["<sample.eml@mime.sample>"],
              date: ["Fri, 20 May 2000 00:29:55 -0400"],
              to: ["Alice Lovelace <alice@openpgp.example>"],
              from: ["Batman <bruce@wayne-enterprises.com>"],
              subject: ["Encrypted, attached message with attachments"],
              "mime-version": ["1.0"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "multipart/mixed",
                headers: {
                  "content-type": [
                    'multipart/mixed; boundary="------------M20GNGI1rLZhtbYD7WFekIXJ"',
                  ],
                },
                size: 2884,
                partName: "1",
                parts: [
                  {
                    contentType: "multipart/mixed",
                    headers: {
                      "content-type": [
                        'multipart/mixed;   boundary="------------49CVLb1N6p6Spdka4qq7Naeg"',
                      ],
                    },
                    size: 2884,
                    partName: "1.1",
                    parts: [
                      {
                        contentType: "text/html",
                        headers: {
                          "content-type": ["text/html; charset=UTF-8"],
                          "content-transfer-encoding": ["7bit"],
                        },
                        size: 248,
                        partName: "1.1.1",
                        body: '<html>\n  <head>\n\n    <meta http-equiv="content-type" content="text/html; charset=UTF-8">\n  </head>\n  <body>\n    <p>This message has one normal attachment and one email attachment,\n      which itself has 3 attachments.<br>\n    </p>\n  </body>\n</html>',
                      },
                      {
                        contentType: "message/rfc822",
                        headers: {
                          "content-type": [
                            'message/rfc822; charset=UTF-8; name="message1.eml"',
                          ],
                          "content-disposition": [
                            'attachment; filename="message1.eml"',
                          ],
                          "content-transfer-encoding": ["7bit"],
                        },
                        size: 2517,
                        partName: "1.1.2",
                        name: "message1.eml",
                      },
                      {
                        contentType: "image/png",
                        headers: {
                          "content-type": ["image/png;"],
                          "content-transfer-encoding": ["base64"],
                          "content-disposition": [
                            'attachment;  filename="yellowPixel.png"',
                          ],
                        },
                        size: 119,
                        partName: "1.1.3",
                        name: "yellowPixel.png",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          full1,
          "getFull() for the outer message should be correct"
        );

        // List the attachments from the decrypted outer message.
        // Note: listAttachments() is always acting on the decrypted message.
        const attachments1 = await browser.messages.listAttachments(1);
        window.assertDeepEqual(
          [
            {
              contentType: "message/rfc822",
              name: "message1.eml",
              size: 442,
              partName: "1.1.2",
              message: {
                id: 2,
                date: new Date("2000-05-17T23:32:47.000Z"),
                author: "Superman <clark.kent@dailyplanet.com>",
                recipients: ["Jimmy <jimmy.olsen@dailyplanet.com>"],
                ccList: [],
                bccList: [],
                subject: "Test message 1",
                read: false,
                new: false,
                headersOnly: false,
                flagged: false,
                junk: false,
                junkScore: 0,
                headerMessageId: "sample-attached.eml@mime.sample",
                size: 442,
                tags: [],
                external: true,
              },
            },
            {
              contentType: "image/png",
              name: "yellowPixel.png",
              size: 119,
              partName: "1.1.3",
            },
          ],
          attachments1,
          "Attachments of the outer message should be correct",
          {
            strict: true,
          }
        );

        // Get the actual attachments of the outer message as File objects.
        // Note: getAttachmentFile() is always acting on the decrypted message.
        const file112 = await browser.messages.getAttachmentFile(1, "1.1.2");
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(file112 instanceof File);
        browser.test.assertEq("message1.eml", file112.name);
        browser.test.assertEq(2517, file112.size);
        const file112content = await file112.text();
        browser.test.assertTrue(
          !file112content.includes("<sample.eml@mime.sample>"),
          "file112content should not include the message ID of the outer message"
        );
        browser.test.assertTrue(
          file112content.includes("<sample-attached.eml@mime.sample>"),
          "file112content should include the message ID of the nested message"
        );
        browser.test.assertTrue(
          file112content.includes("<sample-nested-attached.eml@mime.sample>"),
          "file112content should include the message ID of the inner nested message"
        );

        const file113 = await browser.messages.getAttachmentFile(1, "1.1.3");
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(file113 instanceof File);
        browser.test.assertEq("yellowPixel.png", file113.name);
        browser.test.assertEq(119, file113.size);

        // Get the raw content of the nested message (id: 2) via getRaw().
        const raw2file = await browser.messages.getRaw(2);
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(raw2file instanceof File);
        browser.test.assertEq("message-2.eml", raw2file.name);
        browser.test.assertEq(2517, raw2file.size);
        const raw2content = await raw2file.text();
        browser.test.assertEq(
          raw2content,
          file112content,
          "getRaw() of the attached message and getAttachmentFile() of the attached message should be identical"
        );

        // Get the full content of the nested message via getFull().
        const full2 = await browser.messages.getFull(2);
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 1180,
            decryptionStatus: "none",
            headers: {
              "message-id": ["<sample-attached.eml@mime.sample>"],
              from: ["Superman <clark.kent@dailyplanet.com>"],
              to: ["Jimmy <jimmy.olsen@dailyplanet.com>"],
              subject: ["Test message 1"],
              date: ["Wed, 17 May 2000 19:32:47 -0400"],
              "mime-version": ["1.0"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "multipart/mixed",
                headers: {
                  "content-type": [
                    'multipart/mixed;\tboundary="----=_NextPart_000_0002_01BFC036.AE309650"',
                  ],
                },
                size: 1180,
                partName: "1",
                parts: [
                  {
                    contentType: "text/plain",
                    headers: {
                      "content-type": ['text/plain;\tcharset="iso-8859-1"'],
                      "content-transfer-encoding": ["7bit"],
                    },
                    size: 35,
                    partName: "1.1",
                    body: "Message with multiple attachments.\n",
                  },
                  {
                    contentType: "image/png",
                    headers: {
                      "content-type": ['image/png;\tname="whitePixel.png"'],
                      "content-transfer-encoding": ["base64"],
                      "content-disposition": [
                        'attachment;\tfilename="whitePixel.png"',
                      ],
                    },
                    size: 69,
                    partName: "1.2",
                    name: "whitePixel.png",
                  },
                  {
                    contentType: "image/png",
                    headers: {
                      "content-type": ['image/png;\tname="greenPixel.png"'],
                      "content-transfer-encoding": ["base64"],
                      "content-disposition": ["attachment"],
                    },
                    size: 119,
                    partName: "1.3",
                    name: "greenPixel.png",
                  },
                  {
                    contentType: "image/png",
                    headers: {
                      "content-type": ["image/png"],
                      "content-transfer-encoding": ["base64"],
                      "content-disposition": [
                        'attachment;\tfilename="redPixel.png"',
                      ],
                    },
                    size: 119,
                    partName: "1.4",
                    name: "redPixel.png",
                  },
                  {
                    contentType: "message/rfc822",
                    headers: {
                      "content-type": [
                        'message/rfc822; charset=UTF-8; name="message2.eml"',
                      ],
                      "content-disposition": [
                        'attachment; filename="message2.eml"',
                      ],
                      "content-transfer-encoding": ["7bit"],
                    },
                    size: 838,
                    partName: "1.5",
                    name: "message2.eml",
                  },
                ],
              },
            ],
          },
          full2,
          "getFull() of the nested message should be correct"
        );

        // List the attachments from the nested message.
        const attachments2 = await browser.messages.listAttachments(2);
        window.assertDeepEqual(
          [
            {
              contentType: "image/png",
              name: "whitePixel.png",
              size: 69,
              partName: "1.2",
            },
            {
              contentType: "image/png",
              name: "greenPixel.png",
              size: 119,
              partName: "1.3",
            },
            {
              contentType: "image/png",
              name: "redPixel.png",
              size: 119,
              partName: "1.4",
            },
            {
              contentType: "message/rfc822",
              name: "message2.eml",
              size: 100,
              partName: "1.5",
              message: {
                id: 3,
                date: new Date("2000-05-16T23:32:47.000Z"),
                author: "Jimmy <jimmy.olsen@dailyplanet.com>",
                recipients: ["Superman <clark.kent@dailyplanet.com>"],
                ccList: [],
                bccList: [],
                subject: "Test message 2",
                read: false,
                new: false,
                headersOnly: false,
                flagged: false,
                junk: false,
                junkScore: 0,
                headerMessageId: "sample-nested-attached.eml@mime.sample",
                size: 100,
                tags: [],
                external: true,
              },
            },
          ],
          attachments2,
          "Attachments of the nested message should be correct",
          {
            strict: true,
          }
        );

        // Get the actual attachments of the nested message as File objects.
        const files = new Map();
        const expectedAttachments2 = [
          {
            name: "whitePixel.png",
            size: 69,
            partName: "1.2",
          },
          {
            name: "greenPixel.png",
            size: 119,
            partName: "1.3",
          },
          {
            name: "redPixel.png",
            size: 119,
            partName: "1.4",
          },
          {
            name: "message2.eml",
            size: 838,
            partName: "1.5",
          },
        ];
        for (const expectedAttachment2 of expectedAttachments2) {
          const f = await browser.messages.getAttachmentFile(
            2,
            expectedAttachment2.partName
          );
          files.set(expectedAttachment2.partName, f);
          // eslint-disable-next-line mozilla/use-isInstance
          browser.test.assertTrue(f instanceof File);
          browser.test.assertEq(
            expectedAttachment2.name,
            f.name,
            `Name of part ${expectedAttachment2.partName} should be correct`
          );
          browser.test.assertEq(
            expectedAttachment2.size,
            f.size,
            `Size of part ${expectedAttachment2.partName} should be correct`
          );
        }

        // Check content of the inner nested message (part 1.5, id: 3).
        const file15content = await files.get("1.5").text();
        browser.test.assertTrue(
          !file15content.includes("<sample.eml@mime.sample>"),
          "file15content should not include the message ID of the outer message"
        );
        browser.test.assertTrue(
          !file15content.includes("<sample-attached.eml@mime.sample>"),
          "file15content should not include the message ID of the nested message"
        );
        browser.test.assertTrue(
          file15content.includes("<sample-nested-attached.eml@mime.sample>"),
          "file15content should include the message ID of the inner nested message"
        );

        // Get the raw content of the inner nested message (part 1.5, id: 3) via
        // getRaw().
        const raw3file = await browser.messages.getRaw(3);
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(raw3file instanceof File);
        browser.test.assertEq("message-3.eml", raw3file.name);
        browser.test.assertEq(838, raw3file.size);
        const raw3content = await raw3file.text();
        browser.test.assertEq(
          raw3content,
          file15content,
          "getRaw() of the inner attached message and getAttachmentFile() of the inner attached message should be identical"
        );

        // Get the full content of the inner nested message via getFull().
        const full3 = await browser.messages.getFull(3);
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 100,
            decryptionStatus: "none",
            headers: {
              "message-id": ["<sample-nested-attached.eml@mime.sample>"],
              from: ["Jimmy <jimmy.olsen@dailyplanet.com>"],
              to: ["Superman <clark.kent@dailyplanet.com>"],
              subject: ["Test message 2"],
              date: ["Wed, 16 May 2000 19:32:47 -0400"],
              "mime-version": ["1.0"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "multipart/mixed",
                headers: {
                  "content-type": [
                    'multipart/mixed;  boundary="----=_NextPart_000_0003_01BFC036.AE309650"',
                  ],
                },
                size: 100,
                partName: "1",
                parts: [
                  {
                    contentType: "text/plain",
                    headers: {
                      "content-type": ['text/plain;  charset="iso-8859-1"'],
                      "content-transfer-encoding": ["7bit"],
                    },
                    size: 31,
                    partName: "1.1",
                    body: "This message has an attachment\n",
                  },
                  {
                    contentType: "image/png",
                    headers: {
                      "content-type": ['image/png;  name="whitePixel.png"'],
                      "content-transfer-encoding": ["base64"],
                      "content-disposition": [
                        'attachment;  filename="whitePixel.png"',
                      ],
                    },
                    size: 69,
                    partName: "1.2",
                    name: "whitePixel.png",
                  },
                ],
              },
            ],
          },
          full3,
          "getFull() of the inner nested message should be correct"
        );

        // List the attachments from the inner nested message.
        const attachments3 = await browser.messages.listAttachments(3);
        window.assertDeepEqual(
          [
            {
              contentType: "image/png",
              name: "whitePixel.png",
              size: 69,
              partName: "1.2",
            },
          ],
          attachments3,
          "Attachments of the inner nested message should be correct",
          {
            strict: true,
          }
        );

        // Get the actual attachments of the inner nested message as File objects.
        const expectedAttachments3 = [
          {
            name: "whitePixel.png",
            size: 69,
            partName: "1.2",
          },
        ];
        for (const expectedAttachment3 of expectedAttachments3) {
          const f = await browser.messages.getAttachmentFile(
            3,
            expectedAttachment3.partName
          );
          files.set(expectedAttachment3.partName, f);
          // eslint-disable-next-line mozilla/use-isInstance
          browser.test.assertTrue(f instanceof File);
          browser.test.assertEq(
            expectedAttachment3.name,
            f.name,
            `Name of part ${expectedAttachment3.partName} should be correct`
          );
          browser.test.assertEq(
            expectedAttachment3.size,
            f.size,
            `Size of part ${expectedAttachment3.partName} should be correct`
          );
        }

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Test an OpenPGP/INLINE encrypted message.
add_task(async function test_openpgp_enc_msg_inline() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test3" });
        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(1, messages.length);
        const msgId = messages[0].id;

        // Get the still encrypted mime tree.
        const fullEncrypted = await browser.messages.getFull(msgId, {
          decrypt: false,
        });
        // Check the still encrypted mime tree. Important: decryptionStatus == "skipped".
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 335,
            decryptionStatus: "skipped",
            headers: {
              "message-id": ["<openpgp.enc.inline@mime.sample>"],
              date: ["Thu, 13 Jun 2024 22:08:14 +0200"],
              "mime-version": ["1.0"],
              to: ["alice@openpgp.example"],
              from: ["bob@openpgp.example"],
              subject: ["OpenPGP inline encrypted"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "text/plain",
                headers: {
                  "content-type": ["text/plain; charset=UTF-8; format=flowed"],
                  "content-transfer-encoding": ["7bit"],
                },
                size: 335,
                partName: "1",
              },
            ],
          },
          fullEncrypted,
          "The still encrypted tree should be correct"
        );

        // Get the raw decrypted content of the message.
        const rawFile = await browser.messages.getRaw(msgId, { decrypt: true });
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(rawFile instanceof File);
        const rawContent = (await rawFile.text())
          .replaceAll("\r\n", "\n")
          .split("\n")
          .filter(line => !line.startsWith("X-Mozilla-Status"));
        window.assertDeepEqual(
          [
            "Message-Id: <openpgp.enc.inline@mime.sample>",
            "Date: Thu, 13 Jun 2024 22:08:14 +0200",
            "Mime-Version: 1.0",
            "To: alice@openpgp.example",
            "From: bob@openpgp.example",
            "Subject: OpenPGP inline encrypted",
            "Content-Type: ",
            "Content-Transfer-Encoding: 8bit",
            "",
            "Somewhere over the rainbow",
            "",
            "",
          ],
          rawContent,
          "getRaw() for the decrypted message should be correct"
        );

        // Get the decrypted mime tree.
        const fullDecrypted = await browser.messages.getFull(msgId);
        // Check the decrypted mime tree. Important: decryptionStatus == "success".
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 28,
            decryptionStatus: "success",
            headers: {
              "message-id": ["<openpgp.enc.inline@mime.sample>"],
              date: ["Thu, 13 Jun 2024 22:08:14 +0200"],
              "mime-version": ["1.0"],
              to: ["alice@openpgp.example"],
              from: ["bob@openpgp.example"],
              subject: ["OpenPGP inline encrypted"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "text/plain",
                headers: {
                  "content-type": [""],
                  "content-transfer-encoding": ["8bit"],
                },
                size: 28,
                partName: "1",
                body: "Somewhere over the rainbow\n\n",
              },
            ],
          },
          fullDecrypted,
          "The decrypted tree should be correct"
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Test a message with an OpenPGP encrypted attachment.
add_task(async function test_openpgp_enc_msg_attachment() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test2" });
        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(1, messages.length);
        const msgId = messages[0].id;

        // Get the still encrypted mime tree.
        const fullEncrypted = await browser.messages.getFull(msgId, {
          decrypt: false,
        });
        // Check the still encrypted mime tree. Important: decryptionStatus == "skipped".
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 372,
            decryptionStatus: "skipped",
            headers: {
              date: ["Tue, 11 Jun 2024 10:15:42 +0200"],
              "mime-version": ["1.0"],
              from: ["bob@openpgp.example"],
              to: ["alice@openpgp.example"],
              subject: ["message with encrypted attachment"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "multipart/mixed",
                headers: {
                  "content-type": [
                    'multipart/mixed; boundary="------------FGUqlZlVFriqCYaAUQpdbRZu"',
                  ],
                  "content-language": ["en-US"],
                },
                size: 372,
                partName: "1",
                parts: [
                  {
                    contentType: "text/plain",
                    headers: {
                      "content-type": [
                        "text/plain; charset=UTF-8; format=flowed",
                      ],
                      "content-transfer-encoding": ["7bit"],
                    },
                    size: 46,
                    partName: "1.1",
                    body: "Hello Alice, the encrypted file is attached.\r\n",
                  },
                  {
                    contentType: "text/plain",
                    headers: {
                      "content-type": [
                        'text/plain; charset=UTF-8; name="encrypted-attachment.txt.asc"',
                      ],
                      "content-disposition": [
                        'attachment; filename="encrypted-attachment.txt.asc"',
                      ],
                      "content-transfer-encoding": ["base64"],
                    },
                    size: 326,
                    partName: "1.2",
                    name: "encrypted-attachment.txt.asc",
                  },
                ],
              },
            ],
          },
          fullEncrypted,
          "The still encrypted tree should be correct"
        );

        // Get the raw decrypted content of the message.
        const rawFile = await browser.messages.getRaw(msgId, { decrypt: true });
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(rawFile instanceof File);
        const rawContent = (await rawFile.text())
          .replaceAll("\r\n", "\n")
          .split("\n")
          .filter(line => !line.startsWith("X-Mozilla-Status"));
        window.assertDeepEqual(
          [
            "Message-Id: <openpgp.enc.attachment@mime.sample>",
            'Content-Type: multipart/mixed; boundary="------------FGUqlZlVFriqCYaAUQpdbRZu"',
            "Date: Tue, 11 Jun 2024 10:15:42 +0200",
            "Mime-Version: 1.0",
            "From: bob@openpgp.example",
            "Content-Language: en-US",
            "To: alice@openpgp.example",
            "Subject: message with encrypted attachment",
            "",
            "--------------FGUqlZlVFriqCYaAUQpdbRZu",
            "Content-Type: text/plain; charset=UTF-8; format=flowed",
            "Content-Transfer-Encoding: 7bit",
            "",
            "Hello Alice, the encrypted file is attached.",
            "",
            "--------------FGUqlZlVFriqCYaAUQpdbRZu",
            'Content-Type: text/plain; charset="UTF-8"; name="encrypted-attachment.txt"',
            'Content-Disposition: attachment; filename="encrypted-attachment.txt"',
            "Content-Transfer-Encoding: base64",
            "",
            "VW5pY29ybi1QYXJ0eQo=",
            "",
            "--------------FGUqlZlVFriqCYaAUQpdbRZu--",
            "",
          ],
          rawContent,
          "getRaw() for the decrypted message should be correct"
        );

        // Get the decrypted mime tree.
        const fullDecrypted = await browser.messages.getFull(msgId);
        // Check the decrypted mime tree. Important: decryptionStatus == "success".
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 60,
            decryptionStatus: "success",
            headers: {
              date: ["Tue, 11 Jun 2024 10:15:42 +0200"],
              "mime-version": ["1.0"],
              from: ["bob@openpgp.example"],
              to: ["alice@openpgp.example"],
              subject: ["message with encrypted attachment"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "multipart/mixed",
                headers: {
                  "content-type": [
                    'multipart/mixed; boundary="------------FGUqlZlVFriqCYaAUQpdbRZu"',
                  ],
                  "content-language": ["en-US"],
                },
                size: 60,
                partName: "1",
                parts: [
                  {
                    contentType: "text/plain",
                    headers: {
                      "content-type": [
                        "text/plain; charset=UTF-8; format=flowed",
                      ],
                      "content-transfer-encoding": ["7bit"],
                    },
                    size: 46,
                    partName: "1.1",
                    body: "Hello Alice, the encrypted file is attached.\r\n",
                  },
                  {
                    contentType: "text/plain",
                    headers: {
                      "content-type": [
                        'text/plain; charset="UTF-8"; name="encrypted-attachment.txt"',
                      ],
                      "content-disposition": [
                        'attachment; filename="encrypted-attachment.txt"',
                      ],
                      "content-transfer-encoding": ["base64"],
                    },
                    size: 14,
                    partName: "1.2",
                    name: "encrypted-attachment.txt",
                  },
                ],
              },
            ],
          },
          fullDecrypted,
          "The decrypted tree should be correct"
        );

        // List the decrypted attachments.
        const attachments = await browser.messages.listAttachments(msgId);
        window.assertDeepEqual(
          [
            {
              contentType: "text/plain",
              name: "encrypted-attachment.txt",
              size: 14,
              partName: "1.2",
            },
          ],
          attachments,
          "Attachments of should be correct",
          { strict: true }
        );

        // Get the decrypted attachment.
        const file12 = await browser.messages.getAttachmentFile(msgId, "1.2");
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(file12 instanceof File);
        browser.test.assertEq(14, file12.size);
        const content12 = await file12.text();
        browser.test.assertEq(
          "Unicorn-Party",
          content12.trim(),
          "content12 should be correct"
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Test an S/MIME encrypted message.
add_task(async function test_smime_enc_not_signed() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test4" });
        const { accountId } = folder;
        const { type } = await browser.accounts.get(accountId);

        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(1, messages.length);
        const msgId = messages[0].id;

        // Get the still encrypted tree. It should be marked as encrypted but not
        // decrypted (decryptionStatus = skipped).
        const fullEncrypted = await browser.messages.getFull(msgId, {
          decrypt: false,
        });
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 650,
            decryptionStatus: "skipped",
            headers: {
              "mime-version": ["1.0"],
              date: ["Tue, 21 Nov 2023 20:50:06 +0000"],
              from: ["Alice@example.com"],
              to: ["Bob@example.com"],
              subject: ["enveloped"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "application/pkcs7-mime",
                headers: {
                  "content-type": [
                    "application/pkcs7-mime; name=smime.p7m;    smime-type=enveloped-data",
                  ],
                  "content-transfer-encoding": ["base64"],
                  "content-disposition": ["attachment; filename=smime.p7m"],
                  "content-description": ["S/MIME Encrypted Message"],
                },
                size: 650,
                partName: "1",
                name: "smime.p7m",
              },
            ],
          },
          fullEncrypted,
          "getFull() for the encrypted message should be correct"
        );

        // Get the raw decrypted content of the message.
        const rawFile = await browser.messages.getRaw(msgId, { decrypt: true });
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(rawFile instanceof File);
        browser.test.assertEq(type == "imap" ? 359 : 306, rawFile.size);
        const rawContent = (await rawFile.text())
          .replaceAll("\r\n", "\n")
          .split("\n")
          .filter(line => !line.startsWith("X-Mozilla-Status"));
        window.assertDeepEqual(
          [
            "Message-Id: <test4@sample.message>",
            "Mime-Version: 1.0",
            "Date: Tue, 21 Nov 2023 20:50:06 +0000",
            "From: Alice@example.com",
            "To: Bob@example.com",
            "Subject: enveloped",
            "Content-Type: text/plain; charset=utf-8; format=flowed",
            "Content-Transfer-Encoding: quoted-printable",
            "",
            "This is a test message from Alice to Bob.",
            "",
          ],
          rawContent,
          "getRaw() for the decrypted message should be correct"
        );

        // Get the full decrypted content of the message.
        const fullDecrypted = await browser.messages.getFull(msgId, {
          decrypt: true,
        });
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 43,
            decryptionStatus: "success",
            headers: {
              "mime-version": ["1.0"],
              date: ["Tue, 21 Nov 2023 20:50:06 +0000"],
              from: ["Alice@example.com"],
              to: ["Bob@example.com"],
              subject: ["enveloped"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "text/plain",
                headers: {
                  "content-type": ["text/plain; charset=utf-8; format=flowed"],
                  "content-transfer-encoding": ["quoted-printable"],
                },
                size: 43,
                partName: "1",
                body: "This is a test message from Alice to Bob.\r\n",
              },
            ],
          },
          fullDecrypted,
          "getFull() for the decrypted message should be correct"
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Test an S/MIME encrypted and signed message.
add_task(async function test_smime_enc_signed() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test5" });
        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(1, messages.length);
        const msgId = messages[0].id;

        // Get the still encrypted tree. It should be marked as encrypted but not
        // decrypted (decryptionStatus = skipped).
        const fullEncrypted = await browser.messages.getFull(msgId, {
          decrypt: false,
        });
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 3099,
            decryptionStatus: "skipped",
            headers: {
              "mime-version": ["1.0"],
              date: ["Tue, 21 Nov 2023 20:50:06 +0000"],
              from: ["Alice@example.com"],
              to: ["Bob@example.com"],
              subject: ["opaque-signed then enveloped sig.SHA256"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "application/pkcs7-mime",
                headers: {
                  "content-type": [
                    "application/pkcs7-mime; name=smime.p7m;    smime-type=enveloped-data",
                  ],
                  "content-transfer-encoding": ["base64"],
                  "content-disposition": ["attachment; filename=smime.p7m"],
                  "content-description": ["S/MIME Encrypted Message"],
                },
                size: 3099,
                partName: "1",
                name: "smime.p7m",
              },
            ],
          },
          fullEncrypted,
          "getFull() for the encrypted message should be correct"
        );

        // Get the raw decrypted content of the message.
        const rawBinaryString = await browser.messages.getRaw(msgId, {
          data_format: "BinaryString",
          decrypt: true,
        });
        const rawContent = rawBinaryString
          .replaceAll("\r\n", "\n")
          .split("\n")
          .filter(line => !line.startsWith("X-Mozilla-Status"));
        window.assertDeepEqual(
          [
            "Message-Id: <test5@sample.message>",
            "Mime-Version: 1.0",
            "Date: Tue, 21 Nov 2023 20:50:06 +0000",
            "From: Alice@example.com",
            "To: Bob@example.com",
            "Subject: opaque-signed then enveloped sig.SHA256",
            "Content-Type: application/pkcs7-mime; name=smime.p7m;    smime-type=signed-data",
            "Content-Transfer-Encoding: base64",
            "Content-Disposition: attachment; filename=smime.p7m",
            "Content-Description: S/MIME Cryptographic Signature",
            "",
            "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",
            "",
          ],
          rawContent,
          "getRaw() for the decrypted message should be correct"
        );

        // Get the full decrypted content of the message.
        const fullDecrypted = await browser.messages.getFull(msgId, {
          decrypt: true,
        });
        window.assertDeepEqual(
          {
            contentType: "message/rfc822",
            partName: "",
            size: 1772,
            decryptionStatus: "success",
            headers: {
              "mime-version": ["1.0"],
              date: ["Tue, 21 Nov 2023 20:50:06 +0000"],
              from: ["Alice@example.com"],
              to: ["Bob@example.com"],
              subject: ["opaque-signed then enveloped sig.SHA256"],
              "content-type": ["message/rfc822"],
            },
            parts: [
              {
                contentType: "application/pkcs7-mime",
                headers: {
                  "content-type": [
                    "application/pkcs7-mime; name=smime.p7m;    smime-type=signed-data",
                  ],
                  "content-transfer-encoding": ["base64"],
                  "content-disposition": ["attachment; filename=smime.p7m"],
                  "content-description": ["S/MIME Cryptographic Signature"],
                },
                size: 1772,
                partName: "1",
                name: "smime.p7m",
              },
            ],
          },
          fullDecrypted,
          "getFull() for the decrypted message should be correct"
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
