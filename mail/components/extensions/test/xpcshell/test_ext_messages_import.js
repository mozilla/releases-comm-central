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
var { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);

add_task(async function test_import() {
  const _account = createAccount();
  await createSubfolder(_account.incomingServer.rootFolder, "test1-offline");
  await createSubfolder(_account.incomingServer.rootFolder, "test2-offline");
  await createSubfolder(_account.incomingServer.rootFolder, "test3-offline");
  await createSubfolder(_account.incomingServer.rootFolder, "test1-online");
  await createSubfolder(_account.incomingServer.rootFolder, "test2-online");
  await createSubfolder(_account.incomingServer.rootFolder, "test3-online");

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        async function do_import(expected, file, folder, options) {
          const msg = await browser.messages.import(file, folder.id, options);
          browser.test.assertEq(
            "alternative.eml@mime.sample",
            msg.headerMessageId,
            "should find the correct message after import"
          );
          const { messages } = await browser.messages.list(folder.id);
          browser.test.assertEq(
            1,
            messages.length,
            "should find the imported message in the destination folder"
          );
          for (const [propName, value] of Object.entries(expected)) {
            window.assertDeepEqual(
              value,
              messages[0][propName],
              `Property ${propName} should be correct`
            );
          }
        }

        for (const mode of ["offline", "online"]) {
          await window.sendMessage("toggleOfflineMode", mode);

          const accounts = await browser.accounts.list();
          browser.test.assertEq(1, accounts.length);
          const [account] = accounts;

          const folder1 = account.folders.find(f => f.name == `test1-${mode}`);
          const folder2 = account.folders.find(f => f.name == `test2-${mode}`);
          const folder3 = account.folders.find(f => f.name == `test3-${mode}`);
          browser.test.assertTrue(folder1, "Test folder should exist");
          browser.test.assertTrue(folder2, "Test folder should exist");
          browser.test.assertTrue(folder3, "Test folder should exist");

          const [emlFileContent] = await window.sendMessage(
            "getFileContent",
            "messages/alternative.eml"
          );
          const file = new File([emlFileContent], "test.eml");

          if (account.type == "nntp") {
            await browser.test.assertRejects(
              browser.messages.import(file, folder1.id),
              `messages.import() is not supported for ${account.type} accounts`,
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
                // FIXME: Setting new is currently broken in IMAP offline mode.
                new: !(mode == "offline" && account.type == "imap"),
                read: false,
                flagged: false,
                tags: ["$label1"],
              },
              file,
              folder2,
              {
                new: !(mode == "offline" && account.type == "imap"),
                read: false,
                flagged: false,
                tags: ["$label1"],
              }
            );
            await do_import(
              {
                new: false,
                read: true,
                flagged: true,
              },
              file,
              folder3,
              {
                read: true,
                flagged: true,
              }
            );
            await browser.test.assertRejects(
              browser.messages.import(file, folder3.id),
              `Error importing message: Destination folder already contains a message with id <alternative.eml@mime.sample>`,
              "Import the same file into the same folder again should fail."
            );
          }
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
    const raw = await IOUtils.read(do_get_file(path).path);
    extension.sendMessage(MailStringUtils.uint8ArrayToByteString(raw));
  });

  extension.onMessage("toggleOfflineMode", async mode => {
    Services.io.offline = mode == "offline";
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(_account);
});

registerCleanupFunction(() => {
  // Return to online mode at the end of the test.
  Services.io.offline = true;
});
