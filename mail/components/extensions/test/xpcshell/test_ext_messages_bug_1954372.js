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
    skip_if: () => IS_IMAP, // no attachments support for IMAP tests
  },
  async function test_setup() {
    const _account = await createAccount();
    const _testFolder = await createSubfolder(
      _account.incomingServer.rootFolder,
      "test1"
    );

    await createMessageFromString(
      _testFolder,
      `Message-ID: <dee7b8bf-0c49-486b-b710-265a3b0be77e@mime.sample>
MIME-Version: 1.0
To: User@invalid
From: User <admin@invalid>
Subject: umlaut
Content-Language: en-US
Content-Type: multipart/mixed; boundary="------------PS4eoTwBacO1aHmKumdgIzBH"

This message is in MIME format.  The first part should be readable text,
while the remaining parts are likely unreadable without MIME-aware tools.

--------------PS4eoTwBacO1aHmKumdgIzBH
Content-Type: text/xml; charset=UTF-8; name="utf-8_o_umlaut.xml"
Content-Disposition: attachment; filename="utf-8_o_umlaut.xml"
Content-Transfer-Encoding: base64

PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjxhPsO2PC9hPg==

--------------PS4eoTwBacO1aHmKumdgIzBH--`
    );
  }
);

add_task(
  {
    skip_if: () => IS_IMAP,
  },
  async function test_message_with_text_as_attachment() {
    const extension = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          const [account] = await browser.accounts.list();
          const testFolder = account.folders.find(f => f.name == "test1");
          const { messages } = await browser.messages.list(testFolder.id);
          browser.test.assertEq(1, messages.length);
          const message = messages[0];

          // Request attachments.
          const attachments = await browser.messages.listAttachments(
            message.id
          );
          browser.test.assertEq(1, attachments.length);
          browser.test.assertEq("1.1", attachments[0].partName);
          browser.test.assertEq("utf-8_o_umlaut.xml", attachments[0].name);

          // Get the attachment and verify its encoding.
          const att = await browser.messages.getAttachmentFile(
            message.id,
            "1.1"
          );

          const content = await att.text();
          browser.test.assertEq(
            '<?xml version="1.0" encoding="UTF-8"?>\r\n<a>ö</a>',
            content
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
