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

add_setup(async function test_setup() {
  const _account = createAccount();
  const _testFolder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "testFolder1"
  );

  await createMessageFromFile(
    _testFolder,
    do_get_file("messages/sample01.eml").path
  );
});

add_task(async function test_query_online() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [testFolder1] = await browser.folders.query({
          name: "testFolder1",
        });
        browser.test.assertTrue(
          !!testFolder1,
          `Should find the testFolder1 folder`
        );

        const rvOffline = await browser.messages.query({
          online: false,
          accountId: testFolder1.accountId,
          headerMessageId: "01.eml@mime.sample",
        });
        window.assertDeepEqual(
          [
            {
              id: 1,
              headerMessageId: "01.eml@mime.sample",
              external: false,
            },
          ],
          rvOffline.messages,
          "The offline query should return the expected message"
        );

        const rvOnline = await browser.messages.query({
          online: true,
          accountId: testFolder1.accountId,
          headerMessageId: "01.eml@mime.sample",
        });
        window.assertDeepEqual(
          [
            {
              id: 2,
              headerMessageId: "01.eml@mime.sample",
              external: true,
            },
          ],
          rvOnline.messages,
          "The online query should return the expected message"
        );

        const originalMessage = [
          "From: Bug Reporter <new@thunderbird.bug>",
          "Newsgroups: gmane.comp.mozilla.thundebird.user",
          "Subject: =?UTF-8?B?zrHOu8+GzqzOss63z4TOvw==?=",
          "Date: Thu, 27 May 2021 21:23:35 +0100",
          "Message-ID: <01.eml@mime.sample>",
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=utf-8;",
          "Content-Transfer-Encoding: base64",
          "Content-Disposition: inline",
          "",
          "zobOu8+GzrEK",
          "",
        ];
        const offlineMessage = (
          await browser.messages.getRaw(1, {
            data_format: "BinaryString",
          })
        )
          .replaceAll("\r\n", "\n")
          .split("\n");
        const onlineMessage = (
          await browser.messages.getRaw(2, {
            data_format: "BinaryString",
          })
        )
          .replaceAll("\r\n", "\n")
          .split("\n");
        window.assertDeepEqual(
          originalMessage,
          offlineMessage,
          "The message queried offline should have the correct contents."
        );
        window.assertDeepEqual(
          originalMessage,
          onlineMessage,
          "The message queried online should have the correct contents."
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
});
