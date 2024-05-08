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
var { SmartMailboxUtils } = ChromeUtils.importESModule(
  "resource:///modules/SmartMailboxUtils.sys.mjs"
);

add_setup(async function setup() {
  const account1 = createAccount("pop3");
  const rootFolder1 = account1.incomingServer.rootFolder;
  const inbox1 = rootFolder1.subFolders.find(f => f.prettyName == "Inbox");

  const account2 = createAccount("pop3");
  const rootFolder2 = account2.incomingServer.rootFolder;
  const inbox2 = rootFolder2.subFolders.find(f => f.prettyName == "Inbox");

  const smartMailbox = SmartMailboxUtils.getSmartMailbox();
  const smartInboxFolder = smartMailbox.getSmartFolder("Inbox");
  Assert.equal(
    0,
    smartInboxFolder.getNumUnread(false),
    "Unread count of the unified inbox folder before adding messages should be correct"
  );

  await createMessages(inbox1, 12);
  await createSubfolder(inbox1, "testFolder1");
  await createSubfolder(rootFolder1, "localFolder1");

  await createMessages(inbox2, 8);
  await createSubfolder(inbox2, "testFolder2");
  await createSubfolder(rootFolder2, "localFolder2");
  await TestUtils.waitForTick();

  Assert.equal(
    20,
    smartInboxFolder.getNumUnread(false),
    "Unread count of the unified inbox folder after adding messages should be correct"
  );

  // Mark some messages as unread in inbox1.
  const messages = inbox1.messages;
  let count = 5;
  while (messages.hasMoreElements() && count > 0) {
    const msg = messages.getNext();
    msg.markRead(true);
    count--;
  }
  await TestUtils.waitForTick();

  Assert.equal(
    15,
    smartInboxFolder.getNumUnread(false),
    "Unread count of the unified inbox folder after marking some messages as read should be correct"
  );
});

add_task(async function test_folder_isUnified() {
  const files = {
    "background.js": async () => {
      // Check accounts are as expected.
      const [localFolder1] = await browser.folders.query({
        name: "localFolder1",
      });
      browser.test.assertTrue(
        !!localFolder1,
        `Should find the localFolder1 folder`
      );
      browser.test.assertEq(
        localFolder1.accountId,
        "account1",
        `localFolder1 should have the correct accountId`
      );

      const [localFolder2] = await browser.folders.query({
        name: "localFolder2",
      });
      browser.test.assertTrue(
        !!localFolder2,
        `Should find the localFolder2 folder`
      );
      browser.test.assertEq(
        localFolder2.accountId,
        "account2",
        `localFolder2 should have the correct accountId`
      );

      // Get some folders, which are needed for the test.
      const unifiedFolders = await browser.folders.query({ isUnified: true });
      browser.test.assertEq(
        7,
        unifiedFolders.length,
        "Should have found the correct number of unified mailbox folders"
      );
      window.assertDeepEqual(
        [
          {
            id: "unified://Inbox",
            name: "Inbox",
            path: "/unified/Inbox",
            specialUse: ["inbox"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: true,
            isVirtual: true,
            accountId: "",
            type: "inbox",
          },
          {
            id: "unified://Drafts",
            name: "Drafts",
            path: "/unified/Drafts",
            specialUse: ["drafts"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: true,
            isVirtual: true,
            accountId: "",
            type: "drafts",
          },
          {
            id: "unified://Templates",
            name: "Templates",
            path: "/unified/Templates",
            specialUse: ["templates"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: true,
            isVirtual: true,
            accountId: "",
            type: "templates",
          },
          {
            id: "unified://Sent",
            name: "Sent",
            path: "/unified/Sent",
            specialUse: ["sent"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: true,
            isVirtual: true,
            accountId: "",
            type: "sent",
          },
          {
            id: "unified://Archives",
            name: "Archives",
            path: "/unified/Archives",
            specialUse: ["archives"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: true,
            isVirtual: true,
            accountId: "",
            type: "archives",
          },
          {
            id: "unified://Junk",
            name: "Junk",
            path: "/unified/Junk",
            specialUse: ["junk"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: true,
            isVirtual: true,
            accountId: "",
            type: "junk",
          },
          {
            id: "unified://Trash",
            name: "Trash",
            path: "/unified/Trash",
            specialUse: ["trash"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: true,
            isVirtual: true,
            accountId: "",
            type: "trash",
          },
        ],
        unifiedFolders,
        "Unified mailbox folders returned by query() should be correct."
      );

      const [inbox1] = await browser.folders.query({
        accountId: "account1",
        specialUse: ["inbox"],
      });
      browser.test.assertTrue(!!inbox1, `Should find the inbox of account1`);
      const [unifiedInboxFolder] = await browser.folders.query({
        isUnified: true,
        specialUse: ["inbox"],
      });
      browser.test.assertTrue(
        !!unifiedInboxFolder,
        `Should find the unified inbox folder`
      );

      const tests = [
        {
          use: "inbox",
          path: "/unified/Inbox",
          numOfMessages: 20,
          subFolders: [
            {
              name: "Inbox",
              specialUse: ["inbox"],
              isFavorite: false,
              isRoot: false,
              isTag: false,
              isUnified: false,
              isVirtual: false,
              id: "account1://Inbox",
              accountId: "account1",
              path: "/Inbox",
              type: "inbox",
              subFolders: [
                {
                  name: "testFolder1",
                  specialUse: [],
                  isFavorite: false,
                  isRoot: false,
                  isTag: false,
                  isUnified: false,
                  isVirtual: false,
                  id: "account1://Inbox/testFolder1",
                  accountId: "account1",
                  path: "/Inbox/testFolder1",
                  subFolders: [],
                },
              ],
            },
            {
              name: "Inbox",
              specialUse: ["inbox"],
              isFavorite: false,
              isRoot: false,
              isTag: false,
              isUnified: false,
              isVirtual: false,
              id: "account2://Inbox",
              accountId: "account2",
              path: "/Inbox",
              type: "inbox",
              subFolders: [
                {
                  name: "testFolder2",
                  specialUse: [],
                  isFavorite: false,
                  isRoot: false,
                  isTag: false,
                  isUnified: false,
                  isVirtual: false,
                  id: "account2://Inbox/testFolder2",
                  accountId: "account2",
                  path: "/Inbox/testFolder2",
                  subFolders: [],
                },
              ],
            },
          ],
        },
        {
          use: "drafts",
          path: "/unified/Drafts",
          numOfMessages: 0,
          subFolders: [],
        },
        {
          use: "sent",
          path: "/unified/Sent",
          numOfMessages: 0,
          subFolders: [],
        },
        {
          use: "trash",
          path: "/unified/Trash",
          numOfMessages: 0,
          subFolders: [
            {
              name: "Trash",
              specialUse: ["trash"],
              isFavorite: false,
              isRoot: false,
              isTag: false,
              isUnified: false,
              isVirtual: false,
              id: "account1://Trash",
              accountId: "account1",
              path: "/Trash",
              type: "trash",
              subFolders: [],
            },
            {
              name: "Trash",
              specialUse: ["trash"],
              isFavorite: false,
              isRoot: false,
              isTag: false,
              isUnified: false,
              isVirtual: false,
              id: "account2://Trash",
              accountId: "account2",
              path: "/Trash",
              type: "trash",
              subFolders: [],
            },
          ],
        },
        {
          use: "archives",
          path: "/unified/Archives",
          numOfMessages: 0,
          subFolders: [],
        },
        {
          use: "junk",
          path: "/unified/Junk",
          numOfMessages: 0,
          subFolders: [],
        },
        {
          use: "templates",
          path: "/unified/Templates",
          numOfMessages: 0,
          subFolders: [],
        },
      ];
      for (const test of tests) {
        const unifiedFolder = unifiedFolders.find(u =>
          u.specialUse.includes(test.use)
        );
        browser.test.assertTrue(
          !!unifiedFolder,
          `The unified ${test.use} folder should have been found`
        );
        browser.test.assertTrue(
          unifiedFolder.isUnified,
          `The unified ${test.use} folder should be marked as a unified mailbox folder`
        );
        browser.test.assertEq(
          test.path,
          unifiedFolder.path,
          `The path of unified ${test.use} folder should be correct`
        );

        // Verify the folder can be queried directly as well.
        const [unifiedFolderQueried] = await browser.folders.query({
          isUnified: true,
          specialUse: [test.use],
        });
        browser.test.assertTrue(
          unifiedFolderQueried,
          `Should have found the unified ${test.use} folder using folders.query()`
        );
        window.assertDeepEqual(
          unifiedFolderQueried,
          unifiedFolder,
          `The unified ${test.use} folder retrieved via folders.query() should be consistent`,
          {
            strict: true,
          }
        );

        // Verify getUnifiedFolder() without subfolders (default).
        const unifiedFolderGetter = await browser.folders.getUnifiedFolder(
          test.use
        );
        browser.test.assertTrue(
          unifiedFolderGetter,
          `Should have found the unified ${test.use} folder using folders.getUnifiedFolder()`
        );
        window.assertDeepEqual(
          unifiedFolderGetter,
          unifiedFolder,
          `The unified ${test.use} folder retrieved via folders.getUnifiedFolder() should be consistent`,
          {
            strict: true,
          }
        );

        // Check that unified mailbox folders can be used with folders.get().
        // Since the folders returned by folders.query() do not include subfolders,
        // they are not requested here as well.
        const folderWithoutSubfolders = await browser.folders.get(
          unifiedFolder.id,
          false
        );
        window.assertDeepEqual(
          folderWithoutSubfolders,
          unifiedFolder,
          `The unified ${test.use} folder retrieved via folders.get() should be consistent`,
          {
            strict: true,
          }
        );

        // Test folders.get() (include all nested sub folders).
        const folderWithSubfolders = await browser.folders.get(
          unifiedFolder.id,
          true
        );
        browser.test.assertTrue(
          !!folderWithSubfolders.subFolders,
          `The unified ${test.use} folder should include its subfolders, if requested`
        );
        window.assertDeepEqual(
          test.subFolders,
          folderWithSubfolders.subFolders,
          `The found subfolders for the unified ${test.use} folder should be correct`,
          {
            strict: true,
          }
        );

        // Verify getUnifiedFolder() with subfolders.
        const unifiedFolderGetterWithSubs =
          await browser.folders.getUnifiedFolder(test.use, true);
        browser.test.assertTrue(
          unifiedFolderGetterWithSubs,
          `Should have found the unified ${test.use} folder using folders.getUnifiedFolder() with subfolders`
        );
        window.assertDeepEqual(
          unifiedFolderGetterWithSubs,
          folderWithSubfolders,
          `The unified ${test.use} folder retrieved via folders.getUnifiedFolder() with subfolders should be consistent`,
          {
            strict: true,
          }
        );

        // Test folders.getSubFolders() (include all nested subfolders).
        const subfolders = await browser.folders.getSubFolders(
          unifiedFolder.id,
          true
        );
        window.assertDeepEqual(
          test.subFolders,
          subfolders,
          `Return value of folders.getSubFolders() for the unified ${test.use} folder should be correct`,
          {
            strict: true,
          }
        );

        // In MV2, getParentFolders() returns [], because root folders are not
        // considdered as real folders (backward compatibility).
        const parentFolders = await browser.folders.getParentFolders(
          unifiedFolder.id
        );
        window.assertDeepEqual(
          [],
          parentFolders,
          `Return value of getParentFolders() should be correct`
        );

        // Test folders.getFolderCapabilities().
        const folderCapabilities = await browser.folders.getFolderCapabilities(
          unifiedFolder.id
        );
        window.assertDeepEqual(
          {
            canAddMessages: false,
            canAddSubfolders: false,
            canBeDeleted: false,
            canBeRenamed: false,
            canDeleteMessages: true,
          },
          folderCapabilities,
          `Return value for folders.getFolderCapabilities() for the unified ${test.use} folder should be correct.`,
          {
            strict: true,
          }
        );

        // Test folders.rename() throws.
        await browser.test.assertRejects(
          browser.folders.rename(unifiedFolder.id, `${unifiedFolder.name}-2`),
          `folders.rename() failed, the folder ${unifiedFolder.name} cannot be renamed`,
          "folders.rename() should reject for unified mailbox folders"
        );

        // Test folders.create() throws.
        await browser.test.assertRejects(
          browser.folders.create(unifiedFolder.id, "Impossible"),
          `The destination used in folders.create() cannot be a unified mailbox folder`,
          "folders.create() should reject for unified mailbox folders"
        );

        // Test folders.delete() throws.
        await browser.test.assertRejects(
          browser.folders.delete(unifiedFolder.id),
          `folders.delete() failed, the folder ${unifiedFolder.name} cannot be deleted`,
          "folders.delete() should reject for unified mailbox folders"
        );

        // Test folders.move() throws.
        await browser.test.assertRejects(
          browser.folders.move(unifiedFolder.id, localFolder1.id),
          `folders.move() failed, cannot delete source folder ${unifiedFolder.name}`,
          "folders.move() should reject for unified mailbox folders"
        );

        // Test folders.copy(). Probably not that useful, as the copied folders
        // are no longer virtual search folders and therfore end up being empty.
        // The destination folder is checked at the end of this task.
        await browser.folders.copy(unifiedFolder.id, localFolder1.id);

        // Retrieve messages from the unified mailbox folder via messages.query(). The messages from
        // the POP3 account should be seen from the unified mailbox folder, without looking at subfolders.
        const { messages: queryMessages } = await browser.messages.query({
          folderId: unifiedFolder.id,
          includeSubFolders: false,
        });
        browser.test.assertEq(
          test.numOfMessages,
          queryMessages.length,
          `Return value of messages.query() for the unified ${test.use} folder should be correct`
        );

        // Retrieve messages from the unified mailbox folder via messages.list().
        const { messages: listMessages } = await browser.messages.list(
          unifiedFolder.id
        );
        browser.test.assertEq(
          test.numOfMessages,
          listMessages.length,
          `Return value of messages.list() for the unified ${test.use} folder should be correct`
        );

        // Update isFavorite.
        browser.test.assertTrue(
          !unifiedFolder.isFavorite,
          `The unified ${test.use} folder should not yet be a favorite`
        );
        await browser.folders.update(unifiedFolder.id, { isFavorite: true });
        const updatedUnifiedFolder = await browser.folders.get(
          unifiedFolder.id
        );
        browser.test.assertTrue(
          updatedUnifiedFolder.isFavorite,
          `The updated unified ${test.use} folder should be a favorite`
        );
        // Revert isFavorite.
        await browser.folders.update(unifiedFolder.id, { isFavorite: false });
        const revertedUnifiedFolder = await browser.folders.get(
          unifiedFolder.id
        );
        browser.test.assertTrue(
          !revertedUnifiedFolder.isFavorite,
          `The reverted unified ${test.use} folder should no longer be a favorite`
        );
      }

      // Verify the copied folders. Folders are empty and no longer virtual.
      const copiedFolders = await browser.folders.getSubFolders(
        localFolder1.id,
        true
      );
      window.assertDeepEqual(
        [
          {
            name: "Archives",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            id: "account1://localFolder1/Archives",
            accountId: "account1",
            path: "/localFolder1/Archives",
            subFolders: [],
          },
          {
            name: "Drafts",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            id: "account1://localFolder1/Drafts",
            accountId: "account1",
            path: "/localFolder1/Drafts",
            subFolders: [],
          },
          {
            name: "Inbox",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            id: "account1://localFolder1/Inbox",
            accountId: "account1",
            path: "/localFolder1/Inbox",
            subFolders: [],
          },
          {
            name: "Junk",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            id: "account1://localFolder1/Junk",
            accountId: "account1",
            path: "/localFolder1/Junk",
            subFolders: [],
          },
          {
            name: "Sent",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            id: "account1://localFolder1/Sent",
            accountId: "account1",
            path: "/localFolder1/Sent",
            subFolders: [],
          },
          {
            name: "Templates",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            id: "account1://localFolder1/Templates",
            accountId: "account1",
            path: "/localFolder1/Templates",
            subFolders: [],
          },
          {
            name: "Trash",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            id: "account1://localFolder1/Trash",
            accountId: "account1",
            path: "/localFolder1/Trash",
            subFolders: [],
          },
        ],
        copiedFolders,
        `Should find the correctly copied folders`
      );

      // Check that some messages are unread in the inbox of account1.
      const info1 = await browser.folders.getFolderInfo(inbox1.id);
      window.assertDeepEqual(
        {
          totalMessageCount: 12,
          unreadMessageCount: 7,
          newMessageCount: 7,
        },
        info1,
        `Return value for folders.getFolderInfo() for the inbox of account1 should be correct.`
      );
      // Check the unified inbox folder.
      const unifiedInboxInfo = await browser.folders.getFolderInfo(
        unifiedInboxFolder.id
      );
      window.assertDeepEqual(
        {
          totalMessageCount: 20,
          unreadMessageCount: 15,
          newMessageCount: 0,
        },
        unifiedInboxInfo,
        `Return value for folders.getFolderInfo() for the unified inbox folder should be correct.`
      );

      // Mark the unified inbox as read.
      await browser.folders.markAsRead(unifiedInboxFolder.id);

      // Verify.
      const updatedInfo1 = await browser.folders.getFolderInfo(inbox1.id);
      window.assertDeepEqual(
        {
          totalMessageCount: 12,
          unreadMessageCount: 0,
          newMessageCount: 0,
        },
        updatedInfo1,
        `Return value for folders.getFolderInfo() for the updated inbox of account1 should be correct.`
      );
      const updatedUnifiedInboxInfo = await browser.folders.getFolderInfo(
        unifiedInboxFolder.id
      );
      window.assertDeepEqual(
        {
          totalMessageCount: 20,
          unreadMessageCount: 0,
          newMessageCount: 0,
        },
        updatedUnifiedInboxInfo,
        `Return value for folders.getFolderInfo() for the updated unified inbox folder should be correct.`
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [
        "accountsRead",
        "messagesRead",
        "accountsFolders",
        "messagesDelete",
      ],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Test that the unified root folder is not exposed in MV3.
add_task(async function test_folder_isUnified_getParentFolders_MV3() {
  const files = {
    "background.js": async () => {
      // Get the unified inbox folder.
      const [unifiedInboxFolder] = await browser.folders.query({
        isUnified: true,
        specialUse: ["inbox"],
      });
      browser.test.assertTrue(
        unifiedInboxFolder,
        "Should have found the unified inbox folder"
      );

      // Get the parent folder including subfolders. Should be empty, as we do
      // not expose the smart account.
      const parentFoldersAndSubFolders = await browser.folders.getParentFolders(
        unifiedInboxFolder.id,
        true
      );
      window.assertDeepEqual(
        [],
        parentFoldersAndSubFolders,
        `Return value of getParentFolders() including subfolders should be correct`
      );

      // Get the parent folder excluding subfolders. Should be empty, as we do
      // not expose the smart account.
      const parentFolders = await browser.folders.getParentFolders(
        unifiedInboxFolder.id,
        false
      );
      window.assertDeepEqual(
        [],
        parentFolders,
        `Return value of getParentFolders() excluding subfolders should be correct`
      );

      // Test getFolderInfo() throws for the unified mailbox root folder, which
      // is not exposed to the API.
      await browser.test.assertRejects(
        browser.folders.getFolderInfo("unified://"),
        `Folder not found: unified://`,
        "folders.getFolderInfo() should reject for the unified mailbox root folders"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [
        "accountsRead",
        "messagesRead",
        "accountsFolders",
        "messagesDelete",
      ],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
