/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);
var { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);

const OPENPGP_TEST_DIR = do_get_file("../../../../test/browser/openpgp");
const OPENPGP_KEY_PATH = PathUtils.join(
  OPENPGP_TEST_DIR.path,
  "data",
  "keys",
  "alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
);

/**
 * Test the messages.getRaw and messages.getFull functions. Since each message
 * is unique and there are minor differences between the account
 * implementations, we don't compare exactly with a reference message.
 */
add_task(async function test_plain() {
  let _account = createAccount();
  let _folder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );
  await createMessages(_folder, 1);

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length);

      for (let account of accounts) {
        let folder = account.folders.find(f => f.name == "test1");
        let { messages } = await browser.messages.list(folder);
        browser.test.assertEq(1, messages.length);

        let [message] = messages;
        browser.test.assertEq("Big Meeting Today", message.subject);
        browser.test.assertEq(
          '"Andy Anway" <andy@anway.invalid>',
          message.author
        );

        // The msgHdr of NNTP messages have no recipients.
        if (account.type != "nntp") {
          browser.test.assertEq(
            "Bob Bell <bob@bell.invalid>",
            message.recipients[0]
          );
        }

        // From andy@anway.invalid
        // Content-Type: text/plain; charset=ISO-8859-1; format=flowed
        // Subject: Big Meeting Today
        // From: "Andy Anway" <andy@anway.invalid>
        // To: "Bob Bell" <bob@bell.invalid>
        // Message-Id: <0@made.up.invalid>
        // Date: Wed, 06 Nov 2019 22:37:40 +1300
        //
        // Hello Bob Bell!
        //

        let rawMessage = await browser.messages.getRaw(message.id);
        // Fold Windows line-endings \r\n to \n.
        rawMessage = rawMessage.replace(/\r/g, "");
        browser.test.assertEq("string", typeof rawMessage);
        browser.test.assertTrue(
          rawMessage.includes("Subject: Big Meeting Today\n")
        );
        browser.test.assertTrue(
          rawMessage.includes('From: "Andy Anway" <andy@anway.invalid>\n')
        );
        browser.test.assertTrue(
          rawMessage.includes('To: "Bob Bell" <bob@bell.invalid>\n')
        );
        browser.test.assertTrue(rawMessage.includes("Hello Bob Bell!\n"));

        // {
        //   "contentType": "message/rfc822",
        //   "headers": {
        //     "content-type": ["text/plain; charset=ISO-8859-1; format=flowed"],
        //     "subject": ["Big Meeting Today"],
        //     "from": ["\"Andy Anway\" <andy@anway.invalid>"],
        //     "to": ["\"Bob Bell\" <bob@bell.invalid>"],
        //     "message-id": ["<0@made.up.invalid>"],
        //     "date": ["Wed, 06 Nov 2019 22:37:40 +1300"]
        //   },
        //   "partName": "",
        //   "size": 17,
        //   "parts": [
        //     {
        //       "body": "Hello Bob Bell!\n\n",
        //       "contentType": "text/plain",
        //       "headers": {
        //         "content-type": ["text/plain; charset=ISO-8859-1; format=flowed"]
        //       },
        //       "partName": "1",
        //       "size": 17
        //     }
        //   ]
        // }

        let fullMessage = await browser.messages.getFull(message.id);
        browser.test.log(JSON.stringify(fullMessage));
        browser.test.assertEq("object", typeof fullMessage);
        browser.test.assertEq("message/rfc822", fullMessage.contentType);

        browser.test.assertEq("object", typeof fullMessage.headers);
        for (let header of [
          "content-type",
          "date",
          "from",
          "message-id",
          "subject",
          "to",
        ]) {
          browser.test.assertTrue(Array.isArray(fullMessage.headers[header]));
          browser.test.assertEq(1, fullMessage.headers[header].length);
        }
        browser.test.assertEq(
          "Big Meeting Today",
          fullMessage.headers.subject[0]
        );
        browser.test.assertEq(
          '"Andy Anway" <andy@anway.invalid>',
          fullMessage.headers.from[0]
        );
        browser.test.assertEq(
          '"Bob Bell" <bob@bell.invalid>',
          fullMessage.headers.to[0]
        );

        browser.test.assertTrue(Array.isArray(fullMessage.parts));
        browser.test.assertEq(1, fullMessage.parts.length);
        browser.test.assertEq("object", typeof fullMessage.parts[0]);
        browser.test.assertEq(
          "Hello Bob Bell!",
          fullMessage.parts[0].body.trimRight()
        );
      }

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["accountsRead", "messagesRead"] },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(_account);
});

/**
 * Test that mime parsers for all message types retrieve the correctly decoded
 * headers and bodies. Bodies should no not be returned, if it is an attachment.
 * Sizes are not checked for.
 */
add_task(async function test_encoding() {
  let _account = createAccount();
  let _folder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );

  // Main body with disposition inline, base64 encoded,
  // subject is UTF-8 encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample01.eml").path
  );
  // A multipart/mixed mime message, to header is iso-8859-1 encoded word,
  // body is quoted printable with iso-8859-1, attachments with different names
  // and filenames.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample02.eml").path
  );
  // Message with attachment only, From header is iso-8859-1 encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample03.eml").path
  );
  // Message with koi8-r + base64 encoded body, subject is koi8-r encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample04.eml").path
  );
  // Message with windows-1251 + base64 encoded body, subject is windows-1251
  // encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample05.eml").path
  );
  // Message without plain/text content-type.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample06.eml").path
  );
  // A multipart/alternative message without plain/text content-type.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample07.eml").path
  );

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length);

      let expectedData = {
        "01.eml@mime.sample": {
          msgHeaders: {
            subject: "αλφάβητο",
            author: "Bug Reporter <new@thunderbird.bug>",
          },
          msgParts: {
            contentType: "message/rfc822",
            partName: "",
            size: 0,
            headers: {
              from: ["Bug Reporter <new@thunderbird.bug>"],
              newsgroups: ["gmane.comp.mozilla.thundebird.user"],
              subject: ["αλφάβητο"],
              date: ["Thu, 27 May 2021 21:23:35 +0100"],
              "message-id": ["<01.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ["text/plain; charset=utf-8;"],
              "content-transfer-encoding": ["base64"],
              "content-disposition": ["inline"],
            },
            parts: [
              {
                contentType: "text/plain",
                partName: "1",
                size: 0,
                body: "Άλφα\n",
                headers: {
                  "content-type": ["text/plain; charset=utf-8;"],
                },
              },
            ],
          },
        },
        "02.eml@mime.sample": {
          msgHeaders: {
            subject: "Test message from Microsoft Outlook 00",
            author: '"Doug Sauder" <doug@example.com>',
          },
          msgParts: {
            contentType: "message/rfc822",
            partName: "",
            size: 0,
            headers: {
              from: ['"Doug Sauder" <doug@example.com>'],
              to: ["Heinz Müller <mueller@example.com>"],
              subject: ["Test message from Microsoft Outlook 00"],
              date: ["Wed, 17 May 2000 19:32:47 -0400"],
              "message-id": ["<02.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/mixed; boundary="----=_NextPart_000_0002_01BFC036.AE309650"',
              ],
              "x-priority": ["3 (Normal)"],
              "x-msmail-priority": ["Normal"],
              "x-mailer": [
                "Microsoft Outlook IMO, Build 9.0.2416 (9.0.2910.0)",
              ],
              importance: ["Normal"],
              "x-mimeole": ["Produced By Microsoft MimeOLE V5.00.2314.1300"],
            },
            parts: [
              {
                contentType: "multipart/mixed",
                partName: "1",
                size: 0,
                headers: {
                  "content-type": [
                    'multipart/mixed; boundary="----=_NextPart_000_0002_01BFC036.AE309650"',
                  ],
                },
                parts: [
                  {
                    contentType: "text/plain",
                    partName: "1.1",
                    size: 0,
                    body: `\nDie Hasen und die Frösche \n \n`,
                    headers: {
                      "content-type": ['text/plain; charset="iso-8859-1"'],
                    },
                  },
                  {
                    contentType: "image/png",
                    partName: "1.2",
                    size: 0,
                    name: "blueball2.png",
                    headers: {
                      "content-type": ['image/png; name="blueball1.png"'],
                    },
                  },
                  {
                    contentType: "image/png",
                    partName: "1.3",
                    size: 0,
                    name: "greenball.png",
                    headers: {
                      "content-type": ['image/png; name="greenball.png"'],
                    },
                  },
                  {
                    contentType: "image/png",
                    partName: "1.4",
                    size: 0,
                    name: "redball.png",
                    headers: {
                      "content-type": ["image/png"],
                    },
                  },
                ],
              },
            ],
          },
        },
        "03.eml@mime.sample": {
          msgHeaders: {
            subject: "Test message from Microsoft Outlook 00",
            author: "Heinz Müller <mueller@example.com>",
          },
          msgParts: {
            contentType: "message/rfc822",
            partName: "",
            size: 0,
            headers: {
              from: ["Heinz Müller <mueller@example.com>"],
              to: ['"Joe Blow" <jblow@example.com>'],
              subject: ["Test message from Microsoft Outlook 00"],
              date: ["Wed, 17 May 2000 19:35:05 -0400"],
              "message-id": ["<03.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ['image/png; name="doubelspace  ball.png"'],
              "content-transfer-encoding": ["base64"],
              "content-disposition": [
                'attachment; filename="doubelspace  ball.png"',
              ],
              "x-priority": ["3 (Normal)"],
              "x-msmail-priority": ["Normal"],
              "x-mailer": [
                "Microsoft Outlook IMO, Build 9.0.2416 (9.0.2910.0)",
              ],
              importance: ["Normal"],
              "x-mimeole": ["Produced By Microsoft MimeOLE V5.00.2314.1300"],
            },
            parts: [
              {
                contentType: "image/png",
                name: "doubelspace  ball.png",
                partName: "1",
                size: 0,
                headers: {
                  "content-type": ['image/png; name="doubelspace  ball.png"'],
                },
              },
            ],
          },
        },
        "04.eml@mime.sample": {
          msgHeaders: {
            subject: "Алфавит",
            author: "Bug Reporter <new@thunderbird.bug>",
          },
          msgParts: {
            contentType: "message/rfc822",
            partName: "",
            size: 0,
            headers: {
              from: ["Bug Reporter <new@thunderbird.bug>"],
              newsgroups: ["gmane.comp.mozilla.thundebird.user"],
              subject: ["Алфавит"],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "message-id": ["<04.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ["text/plain; charset=koi8-r;"],
              "content-transfer-encoding": ["base64"],
            },
            parts: [
              {
                contentType: "text/plain",
                partName: "1",
                size: 0,
                body: "Вопрос\n",
                headers: {
                  "content-type": ["text/plain; charset=koi8-r;"],
                },
              },
            ],
          },
        },
        "05.eml@mime.sample": {
          msgHeaders: {
            subject: "Алфавит",
            author: "Bug Reporter <new@thunderbird.bug>",
          },
          msgParts: {
            contentType: "message/rfc822",
            partName: "",
            size: 0,
            headers: {
              from: ["Bug Reporter <new@thunderbird.bug>"],
              newsgroups: ["gmane.comp.mozilla.thundebird.user"],
              subject: ["Алфавит"],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "message-id": ["<05.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ["text/plain; charset=windows-1251;"],
              "content-transfer-encoding": ["base64"],
            },
            parts: [
              {
                contentType: "text/plain",
                partName: "1",
                size: 0,
                body: "Вопрос\n",
                headers: {
                  "content-type": ["text/plain; charset=windows-1251;"],
                },
              },
            ],
          },
        },
        "06.eml@mime.sample": {
          msgHeaders: {
            subject: "I have no content type",
            author: "Bug Reporter <new@thunderbird.bug>",
          },
          msgParts: {
            contentType: "message/rfc822",
            partName: "",
            size: 0,
            headers: {
              from: ["Bug Reporter <new@thunderbird.bug>"],
              newsgroups: ["gmane.comp.mozilla.thundebird.user"],
              subject: ["I have no content type"],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "message-id": ["<06.eml@mime.sample>"],
              "mime-version": ["1.0"],
            },
            parts: [
              {
                contentType: "text/plain",
                partName: "1",
                size: 0,
                body: "No content type\n",
                headers: {
                  "content-type": ["text/plain"],
                },
              },
            ],
          },
        },
        "07.eml@mime.sample": {
          msgHeaders: {
            subject: "Default content-types",
            author: "Doug Sauder <dwsauder@example.com>",
          },
          msgParts: {
            contentType: "message/rfc822",
            partName: "",
            size: 0,
            headers: {
              from: ["Doug Sauder <dwsauder@example.com>"],
              to: ["Heinz <mueller@example.com>"],
              subject: ["Default content-types"],
              date: ["Fri, 19 May 2000 00:29:55 -0400"],
              "message-id": ["<07.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/alternative; boundary="=====================_714967308==_.ALT"',
              ],
            },
            parts: [
              {
                contentType: "multipart/alternative",
                partName: "1",
                size: 0,
                headers: {
                  "content-type": [
                    'multipart/alternative; boundary="=====================_714967308==_.ALT"',
                  ],
                },
                parts: [
                  {
                    contentType: "text/plain",
                    partName: "1.1",
                    size: 0,
                    body: "Die Hasen\n",
                    headers: {
                      "content-type": ["text/plain"],
                    },
                  },
                  {
                    contentType: "text/html",
                    partName: "1.2",
                    size: 0,
                    body: "<html><body><b>Die Hasen</b></body></html>\n",
                    headers: {
                      "content-type": ["text/html"],
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      function checkMsgHeaders(expected, actual) {
        // Check if all expected properties are there.
        for (let property of Object.keys(expected)) {
          browser.test.assertEq(
            expected.hasOwnProperty(property),
            actual.hasOwnProperty(property),
            `expected property ${property} is present`
          );
          // Check property content.
          browser.test.assertEq(
            expected[property],
            actual[property],
            `property ${property} is correct`
          );
        }
      }

      function checkMsgParts(expected, actual) {
        // Check if all expected properties are there.
        for (let property of Object.keys(expected)) {
          browser.test.assertEq(
            expected.hasOwnProperty(property),
            actual.hasOwnProperty(property),
            `expected property ${property} is present`
          );
          if (
            ["parts", "headers", "size"].includes(property) ||
            (["body"].includes(property) && expected[property] == "")
          ) {
            continue;
          }
          // Check property content.
          browser.test.assertEq(
            JSON.stringify(expected[property].replaceAll("\r\n", "\n")),
            JSON.stringify(actual[property].replaceAll("\r\n", "\n")),
            `property ${property} is correct`
          );
        }

        // Check for unexpected properties.
        for (let property of Object.keys(actual)) {
          browser.test.assertEq(
            expected.hasOwnProperty(property),
            actual.hasOwnProperty(property),
            `property ${property} is expected`
          );
        }

        // Check if all expected headers are there.
        if (expected.headers) {
          for (let header of Object.keys(expected.headers)) {
            browser.test.assertEq(
              expected.headers.hasOwnProperty(header),
              actual.headers.hasOwnProperty(header),
              `expected header ${header} is present`
            );
            // Check header content.
            // Note: jsmime does not eat TABs after a CLRF.
            browser.test.assertEq(
              expected.headers[header].toString().replaceAll("\t", " "),
              actual.headers[header].toString().replaceAll("\t", " "),
              `header ${header} is correct`
            );
          }
          // Check for unexpected headers.
          for (let header of Object.keys(actual.headers)) {
            browser.test.assertEq(
              expected.headers.hasOwnProperty(header),
              actual.headers.hasOwnProperty(header),
              `header ${header} is expected`
            );
          }
        }

        // Check sub-parts.
        browser.test.assertEq(
          Array.isArray(expected.parts),
          Array.isArray(actual.parts),
          `has sub-parts`
        );
        if (Array.isArray(expected.parts)) {
          browser.test.assertEq(
            expected.parts.length,
            actual.parts.length,
            "number of parts"
          );
          for (let i in expected.parts) {
            checkMsgParts(expected.parts[i], actual.parts[i]);
          }
        }
      }

      for (let account of accounts) {
        let folder = account.folders.find(f => f.name == "test1");
        let { messages } = await browser.messages.list(folder);
        browser.test.assertEq(7, messages.length);

        for (let message of messages) {
          let fullMessage = await browser.messages.getFull(message.id);
          browser.test.assertEq("object", typeof fullMessage);

          let expected = expectedData[message.headerMessageId];
          checkMsgHeaders(expected.msgHeaders, message);
          checkMsgParts(expected.msgParts, fullMessage);
        }
      }

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["accountsRead", "messagesRead"] },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(_account);
});

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_openpgp() {
    let _account = createAccount();
    let _identity = addIdentity(_account);
    let _folder = await createSubfolder(
      _account.incomingServer.rootFolder,
      "test1"
    );

    // Load an encrypted message.

    let messagePath = PathUtils.join(
      OPENPGP_TEST_DIR.path,
      "data",
      "eml",
      "unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml"
    );
    await createMessageFromFile(_folder, messagePath);

    let extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          let [account] = await browser.accounts.list();
          let folder = account.folders.find(f => f.name == "test1");

          // Read the message, without the key set up. The headers should be
          // readable, but not the message itself.

          let { messages } = await browser.messages.list(folder);
          browser.test.assertEq(1, messages.length);

          let [message] = messages;
          browser.test.assertEq("...", message.subject);
          browser.test.assertEq(
            "Bob Babbage <bob@openpgp.example>",
            message.author
          );
          browser.test.assertEq("alice@openpgp.example", message.recipients[0]);

          let fullMessage = await browser.messages.getFull(message.id);
          browser.test.log(JSON.stringify(fullMessage));
          browser.test.assertEq("object", typeof fullMessage);
          browser.test.assertEq("message/rfc822", fullMessage.contentType);

          browser.test.assertEq("object", typeof fullMessage.headers);
          for (let header of [
            "content-type",
            "date",
            "from",
            "message-id",
            "subject",
            "to",
          ]) {
            browser.test.assertTrue(Array.isArray(fullMessage.headers[header]));
            browser.test.assertEq(1, fullMessage.headers[header].length);
          }
          browser.test.assertEq("...", fullMessage.headers.subject[0]);
          browser.test.assertEq(
            "Bob Babbage <bob@openpgp.example>",
            fullMessage.headers.from[0]
          );
          browser.test.assertEq(
            "alice@openpgp.example",
            fullMessage.headers.to[0]
          );

          browser.test.assertTrue(Array.isArray(fullMessage.parts));
          browser.test.assertEq(1, fullMessage.parts.length);

          let part = fullMessage.parts[0];
          browser.test.assertEq("object", typeof part);
          browser.test.assertEq("multipart/encrypted", part.contentType);
          browser.test.assertEq(undefined, part.parts);

          // Now set up the key and read the message again. It should all be
          // there this time.

          await window.sendMessage("load key");

          ({ messages } = await browser.messages.list(folder));
          browser.test.assertEq(1, messages.length);
          [message] = messages;
          browser.test.assertEq("...", message.subject);
          browser.test.assertEq(
            "Bob Babbage <bob@openpgp.example>",
            message.author
          );
          browser.test.assertEq("alice@openpgp.example", message.recipients[0]);

          fullMessage = await browser.messages.getFull(message.id);
          browser.test.log(JSON.stringify(fullMessage));
          browser.test.assertEq("object", typeof fullMessage);
          browser.test.assertEq("message/rfc822", fullMessage.contentType);

          browser.test.assertEq("object", typeof fullMessage.headers);
          for (let header of [
            "content-type",
            "date",
            "from",
            "message-id",
            "subject",
            "to",
          ]) {
            browser.test.assertTrue(Array.isArray(fullMessage.headers[header]));
            browser.test.assertEq(1, fullMessage.headers[header].length);
          }
          browser.test.assertEq("...", fullMessage.headers.subject[0]);
          browser.test.assertEq(
            "Bob Babbage <bob@openpgp.example>",
            fullMessage.headers.from[0]
          );
          browser.test.assertEq(
            "alice@openpgp.example",
            fullMessage.headers.to[0]
          );

          browser.test.assertTrue(Array.isArray(fullMessage.parts));
          browser.test.assertEq(1, fullMessage.parts.length);

          part = fullMessage.parts[0];
          browser.test.assertEq("object", typeof part);
          browser.test.assertEq("multipart/encrypted", part.contentType);
          browser.test.assertTrue(Array.isArray(part.parts));
          browser.test.assertEq(1, part.parts.length);

          part = part.parts[0];
          browser.test.assertEq("object", typeof part);
          browser.test.assertEq("multipart/fake-container", part.contentType);
          browser.test.assertTrue(Array.isArray(part.parts));
          browser.test.assertEq(1, part.parts.length);

          part = part.parts[0];
          browser.test.assertEq("object", typeof part);
          browser.test.assertEq("text/plain", part.contentType);
          browser.test.assertEq(
            "Sundays are nothing without callaloo.",
            part.body.trimRight()
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

    await extension.awaitMessage("load key");
    info(`Adding key from ${OPENPGP_KEY_PATH}`);
    await OpenPGPTestUtils.initOpenPGP();
    let [id] = await OpenPGPTestUtils.importPrivateKey(
      null,
      new FileUtils.File(OPENPGP_KEY_PATH)
    );
    _identity.setUnicharAttribute("openpgp_key_id", id);
    extension.sendMessage();

    await extension.awaitFinish("finished");
    await extension.unload();

    cleanUpAccount(_account);
  }
);
