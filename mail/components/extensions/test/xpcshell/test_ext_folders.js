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

        let folder1 = await browser.folders.create(account, "folder1");
        browser.test.assertEq(accountId, folder1.accountId);
        browser.test.assertEq("folder1", folder1.name);
        browser.test.assertEq("/folder1", folder1.path);

        account = await browser.accounts.get(accountId);
        browser.test.assertEq(4, account.folders.length);
        browser.test.assertEq("/folder1", account.folders[3].path);

        let folder2 = await browser.folders.create(folder1, "folder2");
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

add_task(async function test_getParentFolders_getSubFolders() {
  let files = {
    "background.js": async () => {
      let [accountId] = await window.waitForMessage();
      let account = await browser.accounts.get(accountId);

      async function createSubFolder(folderOrAccount, name) {
        let subFolder = await browser.folders.create(folderOrAccount, name);
        let basePath = folderOrAccount.path || "/";
        if (!basePath.endsWith("/")) {
          basePath = basePath + "/";
        }
        browser.test.assertEq(accountId, subFolder.accountId);
        browser.test.assertEq(name, subFolder.name);
        browser.test.assertEq(`${basePath}${name}`, subFolder.path);
        return subFolder;
      }

      // Create a new root folder in the account.
      let root = await createSubFolder(account, "MyRoot");

      // Build a flat list of newly created nested folders in MyRoot.
      let flatFolders = [root];
      for (let i = 0; i < 10; i++) {
        flatFolders.push(await createSubFolder(flatFolders[i], `level${i}`));
      }

      // Test getParentFolders().

      // Pop out the last child folder and get its parents.
      let lastChild = flatFolders.pop();
      let parentsWithSubDefault = await browser.folders.getParentFolders(
        lastChild
      );
      let parentsWithSubFalse = await browser.folders.getParentFolders(
        lastChild,
        false
      );
      let parentsWithSubTrue = await browser.folders.getParentFolders(
        lastChild,
        true
      );

      browser.test.assertEq(10, parentsWithSubDefault.length, "Correct depth.");
      browser.test.assertEq(10, parentsWithSubFalse.length, "Correct depth.");
      browser.test.assertEq(10, parentsWithSubTrue.length, "Correct depth.");

      // Reverse the flatFolders array, to match the expected return value of
      // getParentFolders().
      flatFolders.reverse();

      // Build expected nested subfolder structure.
      lastChild.subFolders = [];
      let flatFoldersWithSub = [];
      for (let i = 0; i < 10; i++) {
        let f = {};
        Object.assign(f, flatFolders[i]);
        if (i == 0) {
          f.subFolders = [lastChild];
        } else {
          f.subFolders = [flatFoldersWithSub[i - 1]];
        }
        flatFoldersWithSub.push(f);
      }

      // Test return values of getParentFolders(). The way the flatFolder array
      // has been created, its entries do not have subFolder properties.
      for (let i = 0; i < 10; i++) {
        window.assertDeepEqual(parentsWithSubFalse[i], flatFolders[i]);
        window.assertDeepEqual(flatFolders[i], parentsWithSubFalse[i]);

        window.assertDeepEqual(parentsWithSubTrue[i], flatFoldersWithSub[i]);
        window.assertDeepEqual(flatFoldersWithSub[i], parentsWithSubTrue[i]);

        // Default = false
        window.assertDeepEqual(parentsWithSubDefault[i], flatFolders[i]);
        window.assertDeepEqual(flatFolders[i], parentsWithSubDefault[i]);
      }

      // Test getSubFolders().

      let expectedSubsWithSub = [flatFoldersWithSub[8]];
      let expectedSubsWithoutSub = [flatFolders[8]];

      // Test excluding subfolders (so only the direct subfolder are reported).
      let subsWithSubFalse = await browser.folders.getSubFolders(root, false);
      window.assertDeepEqual(expectedSubsWithoutSub, subsWithSubFalse);
      window.assertDeepEqual(subsWithSubFalse, expectedSubsWithoutSub);

      // Test including all subfolders.
      let subsWithSubTrue = await browser.folders.getSubFolders(root, true);
      window.assertDeepEqual(expectedSubsWithSub, subsWithSubTrue);
      window.assertDeepEqual(subsWithSubTrue, expectedSubsWithSub);

      // Test default subfolder handling of getSubFolders (= true).
      let subsWithSubDefault = await browser.folders.getSubFolders(root);
      window.assertDeepEqual(subsWithSubDefault, subsWithSubTrue);
      window.assertDeepEqual(subsWithSubTrue, subsWithSubDefault);

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
});
