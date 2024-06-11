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

  await createMessages(_folder, 1);
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample01.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample02.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample03.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample04.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample05.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample06.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample07.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample08.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample09.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/attachedMessageWithMissingHeaders.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/alternative.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/nestedMessages.eml").path
  );
  await createMessageFromFile(_folder, do_get_file("messages/invite.eml").path);

  // Load an encrypted message.
  const messagePath = PathUtils.join(
    OPENPGP_TEST_DIR.path,
    "data",
    "eml",
    "unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml"
  );
  await createMessageFromFile(_folder, messagePath);
});

add_task(async function test_messages_listInlineTextParts() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test1" });
        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(15, messages.length);

        const TEST_MESSAGES = [
          [
            // A generated message with just a plain text body, no multiparts.
            {
              contentType: "text/plain",
              content: "Hello Bob Bell!\r\n",
            },
          ],
          [
            // sample01.eml: Main body with disposition inline, base64 encoded.
            {
              contentType: "text/plain",
              content: "Άλφα\n",
            },
          ],
          [
            // sample02.eml: A multipart/mixed mime message, body is quoted
            // printable with iso-8859-1, multiple attachments.
            {
              contentType: "text/plain",
              content: "\r\nDie Hasen und die Frösche \r\n \r\n",
            },
          ],
          [
            // sample03.eml: Message with attachment only.
          ],
          [
            // sample04.eml: Message with koi8-r + base64 encoded body.
            {
              contentType: "text/plain",
              content: "Вопрос\n",
            },
          ],
          [
            // sample05.eml: Message with windows-1251 + base64 encoded body.
            {
              contentType: "text/plain",
              content: "Вопрос\n",
            },
          ],
          [
            // sample06.eml: Message without plain/text content-type.
            {
              contentType: "text/plain",
              content: "No content type\r\n",
            },
          ],
          [
            // sample07.eml: A multipart/alternative message without plain/text
            // content-type.
            {
              contentType: "text/plain",
              content: "Die Hasen\r\n",
            },
            {
              contentType: "text/html",
              content: "<html><body><b>Die Hasen</b></body></html>\r\n",
            },
          ],
          [
            // sample08.eml: A multipart/related message with an html part.
            {
              contentType: "text/html",
              content:
                '<!DOCTYPE html>\r\n<html>\r\n  <head>\r\n    <meta http-equiv="content-type" content="text/html; charset=UTF-8">\r\n  </head>\r\n  <body>\r\n    <p>Example body</p>\r\n    <img moz-do-not-send="false"\r\n      src="cid:part1.FxEY2Ivx.xSFtCdX4@example.com" alt="" width="1"\r\n      height="1" class="">\r\n    <p>with embedded image.<br>\r\n    </p>\r\n    <br>\r\n  </body>\r\n</html>',
            },
          ],
          [
            // sample09.eml: A multipart/alternative message with plain, richtext
            // and html parts.
            {
              contentType: "text/plain",
              content: "Die Hasen\r\n",
            },
            {
              contentType: "text/richtext",
              content: "<bold>Die <italic>Hasen</italic></bold>\r\n",
            },
            {
              contentType: "text/html",
              content: "<html><body><b>Die <i>Hasen</i></b></body></html>\r\n",
            },
          ],
          [
            // attachedMessageWithMissingHeaders.eml: Make sure we do not report
            // body parts of nested the message.
            {
              contentType: "text/html",
              content:
                '<html>\r\n  <head>\r\n\r\n    <meta http-equiv="content-type" content="text/html; charset=UTF-8">\r\n  </head>\r\n  <body>\r\n    <p>This message has one email attachment with missing headers.<br>\r\n    </p>\r\n  </body>\r\n</html>',
            },
          ],
          [
            // alternative.eml: The ideal case.
            {
              contentType: "text/plain",
              content: "I am TEXT!\r\n",
            },
            {
              contentType: "text/html",
              content: "<html><body>I <b>am</b> HTML!</body></html>\r\n",
            },
          ],
          [
            // nestedMessages.eml: Another test for nested messages.
            {
              contentType: "text/html",
              content:
                '<html>\n  <head>\n\n    <meta http-equiv="content-type" content="text/html; charset=UTF-8">\n  </head>\n  <body>\n    <p>This message has one normal attachment and one email attachment,\n      which itself has 3 attachments.<br>\n    </p>\n  </body>\n</html>',
            },
          ],
          [
            // invite.eml: A rather complex case with (ignored) related body parts
            // and a calendar part.
            {
              contentType: "text/plain",
              content: "You have been invited to a meeting (TEXT)\r\n",
            },
            {
              contentType: "text/html",
              content:
                "<html>\r\n <body>\r\n  <p>You have been invited to a meeting (HTML)</p>\r\n </body>\r\n</html>\r\n",
            },
            {
              contentType: "text/calendar",
              content:
                'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;TZID="FLE":20211026T090000\r\nDTEND;TZID="FLE":20211026T100000\r\nTRANSP:OPAQUE\r\nDTSTAMP:20211022T111520Z\r\nSEQUENCE:0\r\nCLASS:PUBLIC\r\nUID:36138BFC6A7B03EFC2258776003DB5C5\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
            },
          ],
          [
            // An encrypted message.
            {
              contentType: "text/plain",
              content: "Sundays are nothing without callaloo.\r\n\r\n\r\n",
            },
          ],
        ];

        for (let i = 0; i < TEST_MESSAGES.length; i++) {
          window.assertDeepEqual(
            TEST_MESSAGES[i],
            await browser.messages.listInlineTextParts(messages[i].id),
            `Should find the correct body parts for message #${i}`,
            {
              strict: true,
            }
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
