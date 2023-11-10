/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_setup(async function setup() {
  // There are a couple of deprecated properties in MV3, which we still want to
  // test in MV2 but also report to the user. By default, tests throw when
  // deprecated properties are used.
  Services.prefs.setBoolPref(
    "extensions.webextensions.warnings-as-errors",
    false
  );
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("extensions.webextensions.warnings-as-errors");
  });
  await new Promise(resolve => executeSoon(resolve));
});

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_folders() {
    const files = {
      "background.js": async () => {
        const [accountId, IS_IMAP] = await window.waitForMessage();

        let account = await browser.accounts.get(accountId);
        browser.test.assertEq(3, account.folders.length);

        // Test create.

        const onCreatedPromise = window.waitForEvent("folders.onCreated");
        const folder1 = await browser.folders.create(account, "folder1");
        const [createdFolder] = await onCreatedPromise;
        for (const folder of [folder1, createdFolder]) {
          browser.test.assertEq(accountId, folder.accountId);
          browser.test.assertEq("folder1", folder.name);
          browser.test.assertEq("/folder1", folder.path);
        }

        account = await browser.accounts.get(accountId);
        // Check order of the returned folders being correct (new folder not last).
        browser.test.assertEq(4, account.folders.length);
        if (IS_IMAP) {
          browser.test.assertEq("Inbox", account.folders[0].name);
          browser.test.assertEq("Trash", account.folders[1].name);
        } else {
          browser.test.assertEq("Trash", account.folders[0].name);
          browser.test.assertEq("Outbox", account.folders[1].name);
        }
        browser.test.assertEq("folder1", account.folders[2].name);
        browser.test.assertEq("unused", account.folders[3].name);

        const folder2 = await browser.folders.create(folder1, "folder+2");
        browser.test.assertEq(accountId, folder2.accountId);
        browser.test.assertEq("folder+2", folder2.name);
        browser.test.assertEq("/folder1/folder+2", folder2.path);

        account = await browser.accounts.get(accountId);
        browser.test.assertEq(4, account.folders.length);
        browser.test.assertEq(1, account.folders[2].subFolders.length);
        browser.test.assertEq(
          "/folder1/folder+2",
          account.folders[2].subFolders[0].path
        );

        // Test reject on creating already existing folder.
        await browser.test.assertRejects(
          browser.folders.create(folder1, "folder+2"),
          `folders.create() failed, because folder+2 already exists in /folder1`,
          "browser.folders.create threw exception"
        );

        // Test rename.

        {
          const onRenamedPromise = window.waitForEvent("folders.onRenamed");
          const folder3 = await browser.folders.rename(
            { accountId, path: "/folder1/folder+2" },
            "folder3"
          );
          const [originalFolder, renamedFolder] = await onRenamedPromise;
          // Test the original folder.
          browser.test.assertEq(accountId, originalFolder.accountId);
          browser.test.assertEq("folder+2", originalFolder.name);
          browser.test.assertEq("/folder1/folder+2", originalFolder.path);
          // Test the renamed folder.
          for (const folder of [folder3, renamedFolder]) {
            browser.test.assertEq(accountId, folder.accountId);
            browser.test.assertEq("folder3", folder.name);
            browser.test.assertEq("/folder1/folder3", folder.path);
          }

          account = await browser.accounts.get(accountId);
          browser.test.assertEq(4, account.folders.length);
          browser.test.assertEq(1, account.folders[2].subFolders.length);
          browser.test.assertEq(
            "/folder1/folder3",
            account.folders[2].subFolders[0].path
          );

          // Test reject on renaming absolute root.
          await browser.test.assertRejects(
            browser.folders.rename({ accountId, path: "/" }, "UhhOh"),
            `folders.rename() failed, because it cannot rename the root of the account`,
            "browser.folders.rename threw exception"
          );

          // Test reject on renaming to existing folder.
          await browser.test.assertRejects(
            browser.folders.rename(
              { accountId, path: "/folder1/folder3" },
              "folder3"
            ),
            `folders.rename() failed, because folder3 already exists in /folder1`,
            "browser.folders.rename threw exception"
          );
        }

        // Test delete (and onMoved).

        {
          // The delete request will trigger an onDelete event for IMAP and an
          // onMoved event for local folders.
          const deletePromise = window.waitForEvent(
            `folders.${IS_IMAP ? "onDeleted" : "onMoved"}`
          );
          await browser.folders.delete({ accountId, path: "/folder1/folder3" });
          // The onMoved event returns the original/deleted and the new folder.
          // The onDeleted event returns just the original/deleted folder.
          const [originalFolder, folderMovedToTrash] = await deletePromise;

          // Test the originalFolder folder.
          browser.test.assertEq(accountId, originalFolder.accountId);
          browser.test.assertEq("folder3", originalFolder.name);
          browser.test.assertEq("/folder1/folder3", originalFolder.path);

          // Check if it really is in trash folder.
          account = await browser.accounts.get(accountId);
          browser.test.assertEq(4, account.folders.length);
          const trashFolder = account.folders.find(f => f.name == "Trash");
          browser.test.assertTrue(trashFolder);
          browser.test.assertEq("/Trash", trashFolder.path);
          browser.test.assertEq(1, trashFolder.subFolders.length);
          browser.test.assertEq(
            "/Trash/folder3",
            trashFolder.subFolders[0].path
          );
          browser.test.assertEq("/folder1", account.folders[2].path);

          if (!IS_IMAP) {
            // For non IMAP folders, the delete request has triggered an onMoved
            // event, check if that has reported moving the folder to trash.
            browser.test.assertEq(accountId, folderMovedToTrash.accountId);
            browser.test.assertEq("folder3", folderMovedToTrash.name);
            browser.test.assertEq("/Trash/folder3", folderMovedToTrash.path);

            // Delete the folder from trash.
            const onDeletedPromise = window.waitForEvent("folders.onDeleted");
            await browser.folders.delete({ accountId, path: "/Trash/folder3" });
            const [deletedFolder] = await onDeletedPromise;
            browser.test.assertEq(accountId, deletedFolder.accountId);
            browser.test.assertEq("folder3", deletedFolder.name);
            browser.test.assertEq("/Trash/folder3", deletedFolder.path);
            // Check if the folder is gone.
            const trashSubfolders = await browser.folders.getSubFolders(
              trashFolder,
              false
            );
            browser.test.assertEq(
              0,
              trashSubfolders.length,
              "Folder has been deleted from trash."
            );
          } else {
            // The IMAP test server signals success for the delete request, but
            // keeps the folder. Testing for this broken behavior to get notified
            // via test fails, if this behaviour changes.
            await browser.folders.delete({ accountId, path: "/Trash/folder3" });
            const trashSubfolders = await browser.folders.getSubFolders(
              trashFolder,
              false
            );
            browser.test.assertEq(
              "/Trash/folder3",
              trashSubfolders[0].path,
              "IMAP test server cannot delete from trash, the folder is still there."
            );
          }

          // Test reject on deleting non-existing folder.
          await browser.test.assertRejects(
            browser.folders.delete({ accountId, path: "/missing" }),
            `Folder not found: /missing`,
            "browser.folders.delete threw exception"
          );

          account = await browser.accounts.get(accountId);
          browser.test.assertEq(4, account.folders.length);
          browser.test.assertEq("/folder1", account.folders[2].path);
        }

        // Test move.

        {
          await browser.folders.create(folder1, "folder4");
          const onMovedPromise = window.waitForEvent("folders.onMoved");
          const folder4_moved = await browser.folders.move(
            { accountId, path: "/folder1/folder4" },
            { accountId, path: "/" }
          );
          const [originalFolder, movedFolder] = await onMovedPromise;
          // Test the original folder.
          browser.test.assertEq(accountId, originalFolder.accountId);
          browser.test.assertEq("folder4", originalFolder.name);
          browser.test.assertEq("/folder1/folder4", originalFolder.path);
          // Test the moved folder.
          for (const folder of [folder4_moved, movedFolder]) {
            browser.test.assertEq(accountId, folder.accountId);
            browser.test.assertEq("folder4", folder.name);
            browser.test.assertEq("/folder4", folder.path);
          }

          account = await browser.accounts.get(accountId);
          browser.test.assertEq(5, account.folders.length);
          browser.test.assertEq("/folder4", account.folders[3].path);

          // Test reject on moving to already existing folder.
          await browser.test.assertRejects(
            browser.folders.move(folder4_moved, account),
            `folders.move() failed, because folder4 already exists in /`,
            "browser.folders.move threw exception"
          );
        }

        // Test copy.

        {
          const onCopiedPromise = window.waitForEvent("folders.onCopied");
          const folder4_copied = await browser.folders.copy(
            { accountId, path: "/folder4" },
            { accountId, path: "/folder1" }
          );
          const [originalFolder, copiedFolder] = await onCopiedPromise;
          // Test the original folder.
          browser.test.assertEq(accountId, originalFolder.accountId);
          browser.test.assertEq("folder4", originalFolder.name);
          browser.test.assertEq("/folder4", originalFolder.path);
          // Test the copied folder.
          for (const folder of [folder4_copied, copiedFolder]) {
            browser.test.assertEq(accountId, folder.accountId);
            browser.test.assertEq("folder4", folder.name);
            browser.test.assertEq("/folder1/folder4", folder.path);
          }

          account = await browser.accounts.get(accountId);
          browser.test.assertEq(5, account.folders.length);
          browser.test.assertEq(1, account.folders[2].subFolders.length);
          browser.test.assertEq("/folder4", account.folders[3].path);
          browser.test.assertEq(
            "/folder1/folder4",
            account.folders[2].subFolders[0].path
          );

          // Test reject on copy to already existing folder.
          await browser.test.assertRejects(
            browser.folders.copy(folder4_copied, folder1),
            `folders.copy() failed, because folder4 already exists in /folder1`,
            "browser.folders.copy threw exception"
          );
        }

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["accountsRead", "accountsFolders", "messagesDelete"],
      },
    });

    const account = createAccount();
    // Not all folders appear immediately on IMAP. Creating a new one causes them to appear.
    await createSubfolder(account.incomingServer.rootFolder, "unused");

    // We should now have three folders. For IMAP accounts they are Inbox, Trash,
    // and unused. Otherwise they are Trash, Unsent Messages and unused.

    await extension.startup();
    extension.sendMessage(account.key, IS_IMAP);
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_without_delete_permission() {
    const files = {
      "background.js": async () => {
        const [accountId] = await window.waitForMessage();

        // Test reject on delete without messagesDelete permission.
        await browser.test.assertRejects(
          browser.folders.delete({ accountId, path: "/unused" }),
          `Using folders.delete() requires the "accountsFolders" and the "messagesDelete" permission`,
          "It rejects for a missing permission."
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["accountsRead", "accountsFolders"],
      },
    });

    const account = createAccount();
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
  const files = {
    "background.js": async () => {
      const [accountId] = await window.waitForMessage();
      const account = await browser.accounts.get(accountId);

      async function createSubFolder(folderOrAccount, name) {
        const subFolder = await browser.folders.create(folderOrAccount, name);
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
      const root = await createSubFolder(account, "MyRoot");

      // Build a flat list of newly created nested folders in MyRoot.
      const flatFolders = [root];
      for (let i = 0; i < 10; i++) {
        flatFolders.push(await createSubFolder(flatFolders[i], `level${i}`));
      }

      // Test getParentFolders().

      // Pop out the last child folder and get its parents.
      const lastChild = flatFolders.pop();
      const parentsWithSubDefault = await browser.folders.getParentFolders(
        lastChild
      );
      const parentsWithSubFalse = await browser.folders.getParentFolders(
        lastChild,
        false
      );
      const parentsWithSubTrue = await browser.folders.getParentFolders(
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
      const flatFoldersWithSub = [];
      for (let i = 0; i < 10; i++) {
        const f = {};
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

      const expectedSubsWithSub = [flatFoldersWithSub[8]];
      const expectedSubsWithoutSub = [flatFolders[8]];

      // Test excluding subfolders (so only the direct subfolder are reported).
      const subsWithSubFalse = await browser.folders.getSubFolders(root, false);
      window.assertDeepEqual(expectedSubsWithoutSub, subsWithSubFalse);
      window.assertDeepEqual(subsWithSubFalse, expectedSubsWithoutSub);

      // Test including all subfolders.
      const subsWithSubTrue = await browser.folders.getSubFolders(root, true);
      window.assertDeepEqual(expectedSubsWithSub, subsWithSubTrue);
      window.assertDeepEqual(subsWithSubTrue, expectedSubsWithSub);

      // Test default subfolder handling of getSubFolders (= true).
      const subsWithSubDefault = await browser.folders.getSubFolders(root);
      window.assertDeepEqual(subsWithSubDefault, subsWithSubTrue);
      window.assertDeepEqual(subsWithSubTrue, subsWithSubDefault);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsFolders"],
    },
  });

  const account = createAccount();
  // Not all folders appear immediately on IMAP. Creating a new one causes them to appear.
  await createSubfolder(account.incomingServer.rootFolder, "unused");

  // We should now have three folders. For IMAP accounts they are Inbox,
  // Trash, and unused. Otherwise they are Trash, Unsent Messages and unused.
  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_FolderInfo_FolderCapabilities_and_query() {
  const files = {
    "background.js": async () => {
      const [accountId, startTime] = await window.waitForMessage();

      async function queryCheck(queryInfo, expected) {
        const found = await browser.folders.query(queryInfo);
        window.assertDeepEqual(
          expected,
          found.map(f => f.name),
          `browser.folders.query(${JSON.stringify(
            queryInfo
          )}) should return the correct folders`
        );
      }

      const account = await browser.accounts.get(accountId);
      // FIXME: Expose account root folder.
      const rootFolder = { id: `${accountId}://`, accountId, path: "/" };

      let expectedAllFolders;
      let expectedAccountFolders;

      // Set account specific expected folders and check capabilities.
      switch (account.type) {
        case "none":
          expectedAllFolders = [
            "Trash",
            "Outbox",
            "unused",
            "Trash",
            "Outbox",
            "unused",
            "MyRoot",
            "level0",
            "level1",
            "level2",
            "level3",
            "level4",
            "level5",
            "level6",
            "level7",
            "level8",
            "level9",
            "Trash",
            "Outbox",
            "InfoTest",
            "OtherTest",
            "Trash",
            "Outbox",
            "unused",
            "folder1",
            "folder4",
            "folder4",
          ];
          expectedAccountFolders = ["Trash", "Outbox", "InfoTest", "OtherTest"];
          await queryCheck(
            { canAddMessages: true, canAddSubfolders: true },
            expectedAllFolders.filter(f => f != "Outbox")
          );
          await queryCheck(
            { canAddMessages: false },
            expectedAllFolders.filter(f => f == "Outbox")
          );
          await queryCheck(
            { canAddSubfolders: false },
            expectedAllFolders.filter(f => f == "Outbox")
          );
          await queryCheck(
            { canBeDeleted: true, canBeRenamed: true },
            expectedAllFolders.filter(f => !["Outbox", "Trash"].includes(f))
          );
          await queryCheck(
            { canBeDeleted: false, canBeRenamed: false },
            expectedAllFolders.filter(f => ["Outbox", "Trash"].includes(f))
          );
          break;

        case "nntp":
          expectedAllFolders = [
            "unused",
            "MyRoot",
            "level0",
            "level1",
            "level2",
            "level3",
            "level4",
            "level5",
            "level6",
            "level7",
            "level8",
            "level9",
            "InfoTest",
            "OtherTest",
          ];
          expectedAccountFolders = ["InfoTest", "OtherTest"];
          await queryCheck({ canAddMessages: true }, []);
          await queryCheck({ canAddSubfolders: true }, []);
          await queryCheck({ canBeDeleted: true }, []);
          await queryCheck({ canBeRenamed: true }, []);
          await queryCheck(
            {
              canAddMessages: false,
              canAddSubfolders: false,
              canBeDeleted: false,
              canBeRenamed: false,
            },
            expectedAllFolders
          );
          break;

        default:
          expectedAllFolders = [
            "Inbox",
            "Trash",
            "folder3",
            "unused",
            "folder1",
            "folder4",
            "folder4",
            "Inbox",
            "Trash",
            "unused",
            "Inbox",
            "Trash",
            "unused",
            "MyRoot",
            "level0",
            "level1",
            "level2",
            "level3",
            "level4",
            "level5",
            "level6",
            "level7",
            "level8",
            "level9",
            "Inbox",
            "Trash",
            "InfoTest",
            "OtherTest",
          ];
          expectedAccountFolders = ["Inbox", "Trash", "InfoTest", "OtherTest"];
          await queryCheck(
            { canAddMessages: true, canAddSubfolders: true },
            expectedAllFolders
          );
          await queryCheck({ canAddMessages: false }, []);
          await queryCheck({ canAddSubfolders: false }, []);
          await queryCheck(
            { canBeDeleted: true, canBeRenamed: true },
            expectedAllFolders.filter(f => !["Inbox", "Trash"].includes(f))
          );
          await queryCheck(
            { canBeDeleted: false, canBeRenamed: false },
            expectedAllFolders.filter(f => ["Inbox", "Trash"].includes(f))
          );
      }
      browser.test.assertEq(
        expectedAccountFolders.length,
        account.folders.length
      );

      const folders = await browser.folders.getSubFolders(account, false);
      const InfoTestFolder = folders.find(f => f.name == "InfoTest");

      // Verify initial state of the InfoTestFolder.
      {
        window.assertDeepEqual(
          {
            id: `${InfoTestFolder.accountId}:/${InfoTestFolder.path}`,
            specialUse: [],
            favorite: false,
          },
          InfoTestFolder,
          "Returned MailFolder should be correct."
        );

        const info = await browser.folders.getFolderInfo(InfoTestFolder);
        window.assertDeepEqual(
          {
            totalMessageCount: 12,
            unreadMessageCount: 12,
            newMessageCount: 12,
            favorite: false, // Deprecated in MV3.
          },
          info,
          "Returned MailFolderInfo should be correct."
        );

        const capabilities = await browser.folders.getFolderCapabilities(
          InfoTestFolder
        );
        window.assertDeepEqual(
          {
            canAddMessages: account.type != "nntp",
            canAddSubfolders: account.type != "nntp",
            canBeDeleted: account.type != "nntp",
            canBeRenamed: account.type != "nntp",
            canDeleteMessages: true,
          },
          capabilities
        );

        // Verify lastUsed.
        const lastUsedSeconds = Math.floor(info.lastUsed.getTime() / 1000);
        const startTimeSeconds = Math.floor(startTime.getTime() / 1000);
        browser.test.assertTrue(
          lastUsedSeconds >= startTimeSeconds,
          `Should be correct: MailFolder.lastUsed (${lastUsedSeconds}) >= startTime (${startTimeSeconds})`
        );
      }

      // Check query results without favorite folder and all messages unread & new.

      // Recent.
      await queryCheck({}, expectedAllFolders);
      await queryCheck({ folderId: rootFolder.id, mostRecent: true }, [
        "OtherTest",
      ]);
      await queryCheck({ folderId: rootFolder.id, recent: true }, [
        "InfoTest",
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, recent: false },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );

      // Name.
      await queryCheck({ name: "level0" }, ["level0"]);
      await queryCheck({ name: { regexp: "^Level\\d$", flags: "i" } }, [
        "level0",
        "level1",
        "level2",
        "level3",
        "level4",
        "level5",
        "level6",
        "level7",
        "level8",
        "level9",
      ]);
      await queryCheck({ name: { regexp: "^level\\d$" } }, [
        "level0",
        "level1",
        "level2",
        "level3",
        "level4",
        "level5",
        "level6",
        "level7",
        "level8",
        "level9",
      ]);

      // Capabilities.
      await queryCheck({ canDeleteMessages: false }, []);
      await queryCheck({ canDeleteMessages: true }, expectedAllFolders);

      // Favorite.
      await queryCheck({ folderId: rootFolder.id, favorite: true }, []);
      await queryCheck(
        { folderId: rootFolder.id, favorite: false },
        expectedAccountFolders
      );

      // SubFolders.
      await queryCheck(
        { name: { regexp: "^Level\\d$", flags: "i" }, hasSubFolders: true },
        [
          "level0",
          "level1",
          "level2",
          "level3",
          "level4",
          "level5",
          "level6",
          "level7",
          "level8",
        ]
      );
      await queryCheck(
        {
          name: { regexp: "^Level\\d$", flags: "i" },
          hasSubFolders: { min: 1 },
        },
        [
          "level0",
          "level1",
          "level2",
          "level3",
          "level4",
          "level5",
          "level6",
          "level7",
          "level8",
        ]
      );
      await queryCheck(
        {
          name: { regexp: "^Level\\d$", flags: "i" },
          hasSubFolders: { min: 2 },
        },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasSubFolders: false },
        expectedAccountFolders
      );
      await queryCheck(
        { folderId: rootFolder.id, hasSubFolders: { max: 2 } },
        expectedAccountFolders
      );

      // Messages.
      await queryCheck({ folderId: rootFolder.id, hasMessages: true }, [
        "InfoTest",
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasMessages: false },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );
      await queryCheck({ folderId: rootFolder.id, hasUnreadMessages: true }, [
        "InfoTest",
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: false },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );
      await queryCheck({ folderId: rootFolder.id, hasNewMessages: true }, [
        "InfoTest",
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: false },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );
      await queryCheck({ folderId: rootFolder.id, hasMessages: { min: 12 } }, [
        "InfoTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasMessages: { min: 13 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: { min: 12 } },
        ["InfoTest"]
      );
      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: { min: 13 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 12 } },
        ["InfoTest"]
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 13 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 1, max: 2 } },
        ["OtherTest"]
      );

      // Special use.
      await queryCheck(
        { folderId: rootFolder.id, type: "inbox" },
        expectedAccountFolders.filter(f => f == "Inbox")
      );
      await queryCheck(
        { folderId: rootFolder.id, specialUse: ["inbox"] },
        expectedAccountFolders.filter(f => f == "Inbox")
      );
      await queryCheck(
        { folderId: rootFolder.id, specialUse: ["inbox", "trash"] },
        []
      );
      // NNTP does not have a trash folder which is set to be a drafts folder
      // here, so skip it.
      if (account.type != "nntp") {
        const folderUpdatedPromise = new Promise(resolve => {
          const listener = (oldFolder, newFolder) => {
            browser.folders.onUpdated.removeListener(listener);
            resolve({ oldFolder, newFolder });
          };
          browser.folders.onUpdated.addListener(listener);
        });

        await window.sendMessage("setAsDraft");
        await folderUpdatedPromise;

        await queryCheck(
          { folderId: rootFolder.id, specialUse: ["drafts", "trash"] },
          expectedAccountFolders.filter(f => f == "Trash")
        );
      }

      // Clear new messages and check FolderInfo and onFolderInfoChanged event.
      {
        const onFolderInfoChangedPromise = window.waitForEvent(
          "folders.onFolderInfoChanged"
        );
        await window.sendMessage("clearNewMessages");
        const [mailFolder, mailFolderInfo] = await onFolderInfoChangedPromise;
        window.assertDeepEqual(
          {
            newMessageCount: 0,
          },
          mailFolderInfo
        );
        browser.test.assertEq(InfoTestFolder.path, mailFolder.path);

        const info = await browser.folders.getFolderInfo(InfoTestFolder);
        window.assertDeepEqual(
          {
            totalMessageCount: 12,
            unreadMessageCount: 12,
            newMessageCount: 0,
            favorite: false, // Deprecated in MV3.
          },
          info
        );
      }

      // Check query results with all messages still unread but no longer new in
      // InfoTest.

      await queryCheck({ folderId: rootFolder.id, hasUnreadMessages: true }, [
        "InfoTest",
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: false },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );
      await queryCheck({ folderId: rootFolder.id, hasNewMessages: true }, [
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: false },
        expectedAccountFolders.filter(f => !["OtherTest"].includes(f))
      );
      await queryCheck(
        {
          folderId: rootFolder.id,
          hasUnreadMessages: true,
          hasNewMessages: false,
        },
        ["InfoTest"]
      );

      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: { min: 12 } },
        ["InfoTest"]
      );
      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: { min: 13 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 12 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 13 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 1, max: 2 } },
        ["OtherTest"]
      );

      // Flip favorite to true and mark all messages as read. Check FolderInfo
      // and onFolderInfoChanged event.
      {
        const onFolderInfoChangedPromise = window.waitForEvent(
          "folders.onFolderInfoChanged"
        );
        const onUpdatedPromise = window.waitForEvent("folders.onUpdated");
        await browser.folders.update(InfoTestFolder, {
          favorite: true,
        });
        await browser.folders.markAsRead(InfoTestFolder);

        const [originalFolder, updatedFolder] = await onUpdatedPromise;
        browser.test.assertEq(false, originalFolder.favorite);
        browser.test.assertEq(true, updatedFolder.favorite);
        browser.test.assertEq(InfoTestFolder.path, originalFolder.path);

        const [mailFolder, mailFolderInfo] = await onFolderInfoChangedPromise;
        window.assertDeepEqual(
          {
            unreadMessageCount: 0,
            favorite: true, // Deprecated in MV3.
          },
          mailFolderInfo
        );
        browser.test.assertEq(InfoTestFolder.path, mailFolder.path);

        const info = await browser.folders.getFolderInfo(InfoTestFolder);
        window.assertDeepEqual(
          {
            totalMessageCount: 12,
            unreadMessageCount: 0,
            newMessageCount: 0,
            favorite: true, // Deprecated in MV3.
          },
          info
        );
      }

      // Check query results with favorite folder and all messages read in InfoTest.

      // Favorite.
      await queryCheck(
        { folderId: rootFolder.id, favorite: false },
        expectedAccountFolders.filter(f => f != "InfoTest")
      );
      await queryCheck({ folderId: rootFolder.id, favorite: true }, [
        "InfoTest",
      ]);

      // Messages.
      await queryCheck({ folderId: rootFolder.id, hasMessages: true }, [
        "InfoTest",
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasMessages: false },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );
      await queryCheck({ folderId: rootFolder.id, hasUnreadMessages: true }, [
        "OtherTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: false },
        expectedAccountFolders.filter(f => !["OtherTest"].includes(f))
      );

      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: { min: 12 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasUnreadMessages: { min: 13 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 12 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 13 } },
        []
      );
      await queryCheck(
        { folderId: rootFolder.id, hasNewMessages: { min: 1, max: 2 } },
        ["OtherTest"]
      );

      // Test flipping favorite back to false.
      {
        const onFolderInfoChangedPromise = window.waitForEvent(
          "folders.onFolderInfoChanged"
        );
        await browser.folders.update(InfoTestFolder, { favorite: false });
        const [mailFolder, mailFolderInfo] = await onFolderInfoChangedPromise;
        window.assertDeepEqual({ favorite: false }, mailFolderInfo);
        browser.test.assertEq(InfoTestFolder.path, mailFolder.path);
      }

      // Test setting some messages back to unread.
      {
        const onFolderInfoChangedPromise = window.waitForEvent(
          "folders.onFolderInfoChanged"
        );
        await window.sendMessage("markSomeAsUnread", 5);
        const [mailFolder, mailFolderInfo] = await onFolderInfoChangedPromise;
        window.assertDeepEqual({ unreadMessageCount: 5 }, mailFolderInfo);
        browser.test.assertEq(InfoTestFolder.path, mailFolder.path);
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsFolders", "messagesDelete"],
    },
  });

  const startTime = new Date();
  const account = createAccount();
  // Not all folders appear immediately on IMAP. Creating a new one causes them
  // to appear.
  const InfoTestFolder = await createSubfolder(
    account.incomingServer.rootFolder,
    "InfoTest"
  );
  await createMessages(InfoTestFolder, 12);

  const OtherTestFolder = await createSubfolder(
    account.incomingServer.rootFolder,
    "OtherTest"
  );
  await createMessages(OtherTestFolder, 1);

  extension.onMessage("markSomeAsUnread", count => {
    const messages = InfoTestFolder.messages;
    while (messages.hasMoreElements() && count > 0) {
      const msg = messages.getNext();
      msg.markRead(false);
      count--;
    }
    extension.sendMessage();
  });

  extension.onMessage("clearNewMessages", count => {
    InfoTestFolder.clearNewMessages();
    extension.sendMessage();
  });

  extension.onMessage("setAsDraft", () => {
    const trash = account.incomingServer.rootFolder.subFolders.find(
      f => f.prettyName == "Trash"
    );
    trash.setFlag(Ci.nsMsgFolderFlags.Drafts);
    extension.sendMessage();
  });

  // Set max_recent to 1 to be able to test the difference between mostRecent
  // and recent.
  Services.prefs.setIntPref("mail.folder_widget.max_recent", 1);

  await extension.startup();
  extension.sendMessage(account.key, startTime);
  await extension.awaitFinish("finished");
  await extension.unload();

  Services.prefs.clearUserPref("mail.folder_widget.max_recent");
});

add_task(
  {
    // NNTP does not have special folders.
    skip_if: () => IS_NNTP,
  },
  async function test_folder_get_update_onUpdated() {
    const files = {
      "background.js": async () => {
        const [accountId] = await window.waitForMessage();

        const account = await browser.accounts.get(accountId);
        browser.test.assertEq(
          3,
          account.folders.length,
          "Should find the correct number of folders"
        );
        const trash = account.folders.find(f => f.specialUse.includes("trash"));
        browser.test.assertTrue(
          trash,
          "Should find a folder which is used as trash"
        );
        delete trash.subFolders;

        const trashViaGetter = await browser.folders.get(trash.id);
        window.assertDeepEqual(
          trash,
          trashViaGetter,
          "Should find the correct trash folder"
        );

        const folderUpdatedPromise = new Promise(resolve => {
          const listener = (oldFolder, newFolder) => {
            browser.folders.onUpdated.removeListener(listener);
            resolve({ oldFolder, newFolder });
          };
          browser.folders.onUpdated.addListener(listener);
        });

        await window.sendMessage("setAsDraft");
        const folderUpdatedEvent = await folderUpdatedPromise;

        // Prepare expected event folder value.
        trash.specialUse = ["drafts", "trash"];
        trash.type = "drafts";

        window.assertDeepEqual(
          {
            oldFolder: { specialUse: ["trash"] },
            newFolder: trash,
          },
          {
            oldFolder: { specialUse: folderUpdatedEvent.oldFolder.specialUse },
            newFolder: folderUpdatedEvent.newFolder,
          },
          "The values returned by the folders.onUpdated event should be correct."
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["accountsRead", "accountsFolders", "messagesDelete"],
      },
    });

    const account = createAccount();
    // Not all folders appear immediately on IMAP. Creating a new one causes them to appear.
    await createSubfolder(account.incomingServer.rootFolder, "unused");

    extension.onMessage("setAsDraft", () => {
      const trash = account.incomingServer.rootFolder.subFolders.find(
        f => f.prettyName == "Trash"
      );
      trash.setFlag(Ci.nsMsgFolderFlags.Drafts);
      extension.sendMessage();
    });

    // We should now have three folders. For IMAP accounts they are Inbox, Trash,
    // and unused. Otherwise they are Trash, Unsent Messages and unused.

    await extension.startup();
    extension.sendMessage(account.key, IS_IMAP);
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);
