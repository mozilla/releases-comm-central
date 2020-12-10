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
const OPENPGP_KEY_PATH = OS.Path.join(
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
        browser.test.assertEq(
          "Bob Bell <bob@bell.invalid>",
          message.recipients[0]
        );

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
        browser.test.log(rawMessage);
        browser.test.assertEq("string", typeof rawMessage);
        browser.test.assertTrue(
          rawMessage.includes("Subject: Big Meeting Today\r\n")
        );
        browser.test.assertTrue(
          rawMessage.includes('From: "Andy Anway" <andy@anway.invalid>\r\n')
        );
        browser.test.assertTrue(
          rawMessage.includes('To: "Bob Bell" <bob@bell.invalid>\r\n')
        );
        browser.test.assertTrue(rawMessage.includes("Hello Bob Bell!\r\n"));

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

add_task(async function test_openpgp() {
  let _account = createAccount();
  let _identity = addIdentity(_account);
  let _folder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );

  // Load an encrypted message.

  let messagePath = OS.Path.join(
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
});
