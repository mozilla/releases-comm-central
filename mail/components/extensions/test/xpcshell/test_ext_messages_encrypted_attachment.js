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

const OPENPGP_TEST_DIR = do_get_file("../../../../test/browser/openpgp");
const OPENPGP_KEY_PATH = PathUtils.join(
  OPENPGP_TEST_DIR.path,
  "data",
  "keys",
  "alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
);

add_setup(async () => {
  await OpenPGPTestUtils.initOpenPGP();

  const _account = createAccount();
  const _identity = addIdentity(_account);
  const _folder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    null,
    new FileUtils.File(OPENPGP_KEY_PATH)
  );
  _identity.setUnicharAttribute("openpgp_key_id", id);

  await createMessageFromFile(
    _folder,
    do_get_file("messages/encryptedNestedMessages.eml").path
  );
});

add_task(async function test_messages_encrypted_attachment() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test1" });
        const { accountId } = folder;
        const { type } = await browser.accounts.get(accountId);

        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(1, messages.length);
        browser.test.assertEq(1, messages[0].id);

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
