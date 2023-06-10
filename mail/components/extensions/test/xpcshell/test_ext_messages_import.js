/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);

add_task(async function test_import() {
  let _account = createAccount();
  await createSubfolder(_account.incomingServer.rootFolder, "test1");
  await createSubfolder(_account.incomingServer.rootFolder, "test2");
  await createSubfolder(_account.incomingServer.rootFolder, "test3");

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        async function do_import(expected, file, folder, options) {
          let msg = await browser.messages.import(file, folder, options);
          browser.test.assertEq(
            "alternative.eml@mime.sample",
            msg.headerMessageId,
            "should find the correct message after import"
          );
          let { messages } = await browser.messages.list(folder);
          browser.test.assertEq(
            1,
            messages.length,
            "should find the imported message in the destination folder"
          );
          for (let [propName, value] of Object.entries(expected)) {
            window.assertDeepEqual(
              value,
              messages[0][propName],
              `Property ${propName} should be correct`
            );
          }
        }

        let accounts = await browser.accounts.list();
        browser.test.assertEq(1, accounts.length);
        let [account] = accounts;
        let folder1 = account.folders.find(f => f.name == "test1");
        let folder2 = account.folders.find(f => f.name == "test2");
        let folder3 = account.folders.find(f => f.name == "test3");
        browser.test.assertTrue(folder1, "Test folder should exist");
        browser.test.assertTrue(folder2, "Test folder should exist");
        browser.test.assertTrue(folder3, "Test folder should exist");

        let [emlFileContent] = await window.sendMessage(
          "getFileContent",
          "messages/alternative.eml"
        );
        let file = new File([emlFileContent], "test.eml");

        if (account.type == "nntp" || account.type == "imap") {
          // nsIMsgCopyService.copyFileMessage() not implemented for NNTP.
          // offline/online behavior of IMAP nsIMsgCopyService.copyFileMessage()
          // is too erratic to be supported ATM.
          await browser.test.assertRejects(
            browser.messages.import(file, folder1),
            `browser.messenger.import() is not supported for ${account.type} accounts`,
            "Should throw for unsupported accounts"
          );
        } else {
          await do_import(
            {
              new: false,
              read: false,
              flagged: false,
            },
            file,
            folder1
          );
          await do_import(
            {
              new: true,
              read: true,
              flagged: true,
              tags: ["$label1"],
            },
            file,
            folder2,
            {
              new: true,
              read: true,
              flagged: true,
              tags: ["$label1"],
            }
          );
        }

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "messagesImport"],
    },
  });

  extension.onMessage("getFileContent", async path => {
    let raw = await IOUtils.read(do_get_file(path).path);
    extension.sendMessage(MailStringUtils.uint8ArrayToByteString(raw));
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(_account);
});
