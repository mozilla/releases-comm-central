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
          const [folderPlus2] = await browser.folders.query({
            accountId,
            path: "/folder1/folder+2",
          });
          browser.test.assertTrue(
            folderPlus2,
            "Query should have been successful"
          );
          const folder3 = await browser.folders.rename(folderPlus2, "folder3");
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
          const [forbiddenRootFolder] = await browser.folders.query({
            accountId,
            isRoot: true,
          });
          browser.test.assertTrue(
            forbiddenRootFolder,
            "Query should have been successful"
          );
          await browser.test.assertRejects(
            browser.folders.rename(forbiddenRootFolder, "UhhOh"),
            `folders.rename() failed, the folder Root cannot be renamed`,
            "browser.folders.rename threw exception"
          );

          // Test reject on renaming to existing folder.
          await browser.test.assertRejects(
            browser.folders.rename(folder3, "folder3"),
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
          const [folder3] = await browser.folders.query({
            accountId,
            path: "/folder1/folder3",
          });
          browser.test.assertTrue(folder3, "Query should have been successful");
          await browser.folders.delete(folder3);
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
            await browser.folders.delete(folderMovedToTrash);
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
            // via test fails, if this behavior changes.
            const [folderInTrash] = await browser.folders.query({
              folderId: trashFolder.id,
              name: "folder3",
            });
            browser.test.assertTrue(
              folderInTrash,
              "Query should have been successful"
            );

            await browser.folders.delete(folderInTrash);
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
            `Folder not found: ${accountId}://missing`,
            "browser.folders.delete threw exception"
          );

          account = await browser.accounts.get(accountId);
          browser.test.assertEq(4, account.folders.length);
          browser.test.assertEq("/folder1", account.folders[2].path);
        }

        // Test move.

        {
          const folder4 = await browser.folders.create(folder1, "folder4");
          const onMovedPromise = window.waitForEvent("folders.onMoved");
          const folder4_moved = await browser.folders.move(
            folder4,
            account.rootFolder
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
          const [f4] = await browser.folders.query({
            accountId,
            path: "/folder4",
          });
          browser.test.assertTrue(f4, "Query should have been successful");
          const [f1] = await browser.folders.query({
            accountId,
            path: "/folder1",
          });
          browser.test.assertTrue(f1, "Query should have been successful");
          const folder4_copied = await browser.folders.copy(f4, f1);
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

add_task(
  {
    // NNTP does not fully support nested folders.
    skip_if: () => IS_NNTP,
  },
  async function test_getParentFolders_getSubFolders() {
    const files = {
      "background.js": async () => {
        const [accountId] = await window.waitForMessage();
        const account = await browser.accounts.get(accountId);
        const expectedNestedRootFolder = {
          id: `${accountId}://NestedRoot`,
          accountId,
          name: "NestedRoot",
          path: "/NestedRoot",
          specialUse: [],
          isFavorite: false,
          isRoot: false,
          isUnified: false,
          isVirtual: false,
          subFolders: [
            {
              id: `${accountId}://NestedRoot/level0`,
              accountId,
              name: "level0",
              path: "/NestedRoot/level0",
              specialUse: [],
              isFavorite: false,
              isRoot: false,
              isUnified: false,
              isVirtual: false,
              subFolders: [
                {
                  id: `${accountId}://NestedRoot/level0/level1`,
                  accountId,
                  name: "level1",
                  path: "/NestedRoot/level0/level1",
                  specialUse: [],
                  isFavorite: false,
                  isRoot: false,
                  isUnified: false,
                  isVirtual: false,
                  subFolders: [
                    {
                      id: `${accountId}://NestedRoot/level0/level1/level2`,
                      accountId,
                      name: "level2",
                      path: "/NestedRoot/level0/level1/level2",
                      specialUse: [],
                      isFavorite: false,
                      isRoot: false,
                      isUnified: false,
                      isVirtual: false,
                      subFolders: [],
                    },
                  ],
                },
              ],
            },
          ],
        };

        const nestedRootFolder = account.rootFolder.subFolders.find(
          f => f.name == "NestedRoot"
        );
        const lastChild = Object.assign(
          {},
          nestedRootFolder.subFolders[0].subFolders[0].subFolders[0]
        );
        window.assertDeepEqual(
          expectedNestedRootFolder,
          nestedRootFolder,
          "browser.accounts.get() sould return the correct subfolders",
          {
            strict: true,
          }
        );

        // Test getSubFolders() with includeSubfolders = default.

        {
          const subFolders2 = await browser.folders.getSubFolders(
            nestedRootFolder.subFolders[0].subFolders[0]
          );
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders[0].subFolders[0].subFolders,
            subFolders2,
            "browser.folders.getSubFolders(lvl3) should return the correct subfolders",
            {
              strict: true,
            }
          );

          const subFolders1 = await browser.folders.getSubFolders(
            nestedRootFolder.subFolders[0]
          );
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders[0].subFolders,
            subFolders1,
            "browser.folders.getSubFolders(lvl2) should return the correct subfolders",
            {
              strict: true,
            }
          );

          const subFolders0 = await browser.folders.getSubFolders(
            nestedRootFolder
          );
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders,
            subFolders0,
            "browser.folders.getSubFolders(lvl1) should return the correct subfolders",
            {
              strict: true,
            }
          );
        }

        // Test getSubFolders() with includeSubfolders = true.

        {
          const subFolders2 = await browser.folders.getSubFolders(
            nestedRootFolder.subFolders[0].subFolders[0],
            true
          );
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders[0].subFolders[0].subFolders,
            subFolders2,
            "browser.folders.getSubFolders(lvl3, true) should return the correct subfolders",
            {
              strict: true,
            }
          );

          const subFolders1 = await browser.folders.getSubFolders(
            nestedRootFolder.subFolders[0],
            true
          );
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders[0].subFolders,
            subFolders1,
            "browser.folders.getSubFolders(lvl2, true) should return the correct subfolders",
            {
              strict: true,
            }
          );

          const subFolders0 = await browser.folders.getSubFolders(
            nestedRootFolder,
            true
          );
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders,
            subFolders0,
            "browser.folders.getSubFolders(lvl1, true) should return the correct subfolders",
            {
              strict: true,
            }
          );
        }

        // Test getSubFolders() with includeSubfolders = false.
        // In this section we delete the subFolders property from the expected
        // data.

        {
          const subFolders2 = await browser.folders.getSubFolders(
            nestedRootFolder.subFolders[0].subFolders[0],
            false
          );
          delete expectedNestedRootFolder.subFolders[0].subFolders[0]
            .subFolders[0].subFolders;
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders[0].subFolders[0].subFolders,
            subFolders2,
            "browser.folders.getSubFolders(lvl3, false) should return the correct subfolders",
            {
              strict: true,
            }
          );

          const subFolders1 = await browser.folders.getSubFolders(
            nestedRootFolder.subFolders[0],
            false
          );
          delete expectedNestedRootFolder.subFolders[0].subFolders[0]
            .subFolders;
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders[0].subFolders,
            subFolders1,
            "browser.folders.getSubFolders(lvl2, false) should return the correct subfolders",
            {
              strict: true,
            }
          );

          const subFolders0 = await browser.folders.getSubFolders(
            nestedRootFolder,
            false
          );
          delete expectedNestedRootFolder.subFolders[0].subFolders;
          window.assertDeepEqual(
            expectedNestedRootFolder.subFolders,
            subFolders0,
            "browser.folders.getSubFolders(lvl1, false) should return the correct subfolders",
            {
              strict: true,
            }
          );
        }

        // Test getParentFolders().

        const expectedParentFolders = [
          {
            id: `${accountId}://NestedRoot/level0/level1`,
            accountId,
            name: "level1",
            path: "/NestedRoot/level0/level1",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isUnified: false,
            isVirtual: false,
          },
          {
            id: `${accountId}://NestedRoot/level0`,
            accountId,
            name: "level0",
            path: "/NestedRoot/level0",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isUnified: false,
            isVirtual: false,
          },
          {
            id: `${accountId}://NestedRoot`,
            accountId,
            name: "NestedRoot",
            path: "/NestedRoot",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isUnified: false,
            isVirtual: false,
          },
        ];

        // Use default include option which is not to include subfolders.
        const parentsWithDefSubs = await browser.folders.getParentFolders(
          lastChild
        );
        window.assertDeepEqual(
          expectedParentFolders,
          parentsWithDefSubs,
          "browser.folders.getParentFolders(lastChild) should return the correct subfolders",
          {
            strict: true,
          }
        );

        // Request to not include subfolders.
        const parentsWithoutSubs = await browser.folders.getParentFolders(
          lastChild,
          false
        );
        window.assertDeepEqual(
          expectedParentFolders,
          parentsWithoutSubs,
          "browser.folders.getParentFolders(lastChild, false) should return the correct subfolders",
          {
            strict: true,
          }
        );

        // Request to include subfolders. Modify expected array to include subfolders.
        expectedParentFolders[0].subFolders = [lastChild];
        expectedParentFolders[1].subFolders = [expectedParentFolders[0]];
        expectedParentFolders[2].subFolders = [expectedParentFolders[1]];

        const parentsWithSubs = await browser.folders.getParentFolders(
          lastChild,
          true
        );
        window.assertDeepEqual(
          expectedParentFolders,
          parentsWithSubs,
          "browser.folders.getParentFolders(lastChild, true) should return the correct subfolders",
          {
            strict: true,
          }
        );

        browser.test.assertEq(3, parentsWithDefSubs.length, "Correct depth.");
        browser.test.assertEq(3, parentsWithoutSubs.length, "Correct depth.");
        browser.test.assertEq(3, parentsWithSubs.length, "Correct depth.");

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

    // Create a test folder with multiple levels of subFolders.
    const nestedRoot = await createSubfolder(
      account.incomingServer.rootFolder,
      "NestedRoot"
    );
    const nestedFolders = [nestedRoot];
    for (let i = 0; i < 3; i++) {
      nestedFolders.push(await createSubfolder(nestedFolders[i], `level${i}`));
    }

    // We should now have three folders.For IMAP accounts they are Inbox, Trash,
    // and NestedRoot. Otherwise they are Trash, Unsent Messages and NestedRoot.

    await extension.startup();
    extension.sendMessage(account.key);
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

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

add_task(async function test_deny_folders_operations() {
  const files = {
    "background.js": async () => {
      const [accountId] = await window.waitForMessage();
      const account = await browser.accounts.get(accountId);

      // Test folders.create() - Our IMAP test server does not have folders
      // where subFolders cannot be created.

      if (account.type != "imap") {
        const folder =
          account.type == "none"
            ? account.rootFolder.subFolders.find(f =>
                f.specialUse.includes("outbox")
              )
            : account.rootFolder;

        const capabilities = await browser.folders.getFolderCapabilities(
          folder
        );
        browser.test.assertTrue(
          !capabilities.canAddSubfolders,
          "Folder should not allow to create subfolders"
        );

        await browser.test.assertRejects(
          browser.folders.create(folder, "Nope"),
          `The destination used in folders.create() does not support to create subfolders.`,
          "browser.folders.create() should reject, if the folder does not allow to create subfolders."
        );
      }

      // Test folders.rename()

      {
        const folder = account.rootFolder;
        const capabilities = await browser.folders.getFolderCapabilities(
          folder
        );
        browser.test.assertTrue(
          !capabilities.canBeRenamed,
          "Folder should not allow to be renamed"
        );

        await browser.test.assertRejects(
          browser.folders.rename(folder, "Nope"),
          `folders.rename() failed, the folder ${folder.name} cannot be renamed`,
          "browser.folders.rename() should reject, if the folder does not allow to be renamed."
        );
      }

      // Test folders.delete()

      {
        const folder = account.rootFolder;
        const capabilities = await browser.folders.getFolderCapabilities(
          folder
        );
        browser.test.assertTrue(
          !capabilities.canBeDeleted,
          "Folder should not allow to be deleted"
        );

        await browser.test.assertRejects(
          browser.folders.delete(folder),
          `folders.delete() failed, the folder ${folder.name} cannot be deleted`,
          "browser.folders.delete() should reject, if the folder does not allow to be deleted."
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
  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("finished");
  await extension.unload();
});
