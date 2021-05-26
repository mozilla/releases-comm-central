/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_folders() {
    let files = {
      "background.js": async () => {
        let [accountId] = await window.waitForMessage();

        let account = await browser.accounts.get(accountId);
        browser.test.assertEq(3, account.folders.length);

        let folder1 = await browser.folders.create(
          { accountId, path: "/" },
          "folder1"
        );
        browser.test.assertEq(accountId, folder1.accountId);
        browser.test.assertEq("folder1", folder1.name);
        browser.test.assertEq("/folder1", folder1.path);

        account = await browser.accounts.get(accountId);
        browser.test.assertEq(4, account.folders.length);
        browser.test.assertEq("/folder1", account.folders[3].path);

        let folder2 = await browser.folders.create(
          { accountId, path: "/folder1" },
          "folder2"
        );
        browser.test.assertEq(accountId, folder2.accountId);
        browser.test.assertEq("folder2", folder2.name);
        browser.test.assertEq("/folder1/folder2", folder2.path);

        account = await browser.accounts.get(accountId);
        browser.test.assertEq(4, account.folders.length);
        browser.test.assertEq(1, account.folders[3].subFolders.length);
        browser.test.assertEq(
          "/folder1/folder2",
          account.folders[3].subFolders[0].path
        );

        let folder3 = await browser.folders.rename(
          { accountId, path: "/folder1/folder2" },
          "folder3"
        );
        browser.test.assertEq(accountId, folder3.accountId);
        browser.test.assertEq("folder3", folder3.name);
        browser.test.assertEq("/folder1/folder3", folder3.path);

        account = await browser.accounts.get(accountId);
        browser.test.assertEq(4, account.folders.length);
        browser.test.assertEq(1, account.folders[3].subFolders.length);
        browser.test.assertEq(
          "/folder1/folder3",
          account.folders[3].subFolders[0].path
        );

        await browser.folders.delete({ accountId, path: "/folder1/folder3" });

        account = await browser.accounts.get(accountId);
        browser.test.assertEq(4, account.folders.length);
        let trashFolder = account.folders.find(f => f.name == "Trash");
        browser.test.assertTrue(trashFolder);
        browser.test.assertEq("/Trash", trashFolder.path);
        browser.test.assertEq(1, trashFolder.subFolders.length);
        browser.test.assertEq("/Trash/folder3", trashFolder.subFolders[0].path);
        browser.test.assertEq("/folder1", account.folders[3].path);

        await browser.folders.delete({ accountId, path: "/Trash/folder3" });

        account = await browser.accounts.get(accountId);
        browser.test.assertEq(4, account.folders.length);
        browser.test.assertEq("/folder1", account.folders[3].path);

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    let extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["accountsRead", "accountsFolders"],
      },
    });

    let account = createAccount();
    // Not all folders appear immediately on IMAP. Creating a new one causes them to appear.
    await createSubfolder(account.incomingServer.rootFolder, "unused");

    // We should now have three folders. For IMAP accounts they are Inbox,
    // Trash, and unused. Otherwise they are Trash, Unsent Messages and unused.

    await extension.startup();
    extension.sendMessage(account.key);
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);
