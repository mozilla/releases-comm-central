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

  await createSubfolder(inbox1, "testFolder1");
  const testFolder1 = inbox1.getChildNamed("testFolder1");
  await createMessages(testFolder1, 12);

  await createSubfolder(inbox2, "testFolder2");
  const testFolder2 = inbox2.getChildNamed("testFolder2");
  await createMessages(testFolder2, 8);
  await TestUtils.waitForTick();

  Assert.equal(
    12,
    testFolder1.getNumUnread(false),
    "Unread count of the testFolder1 folder after adding messages should be correct"
  );
});

add_task(async function test_folder_isTag() {
  const files = {
    "background.js": async () => {
      // Check accounts are as expected.
      const [testFolder1] = await browser.folders.query({
        name: "testFolder1",
      });
      browser.test.assertTrue(
        !!testFolder1,
        `Should find the testFolder1 folder`
      );
      browser.test.assertEq(
        testFolder1.accountId,
        "account1",
        `testFolder1 should have the correct accountId`
      );

      const [testFolder2] = await browser.folders.query({
        name: "testFolder2",
      });
      browser.test.assertTrue(
        !!testFolder2,
        `Should find the testFolder2 folder`
      );
      browser.test.assertEq(
        testFolder2.accountId,
        "account2",
        `testFolder2 should have the correct accountId`
      );

      // Test query() to retrieve all tag folders.
      const virtualTagFolders = await browser.folders.query({ isTag: true });
      browser.test.assertEq(
        5,
        virtualTagFolders.length,
        "Should have found the correct number of virtual tag folders"
      );
      window.assertDeepEqual(
        [
          {
            id: "tag://$label1",
            name: "Important",
            path: "/tag/$label1",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: true,
            isUnified: false,
            isVirtual: true,
            accountId: "",
          },
          {
            id: "tag://$label2",
            name: "Work",
            path: "/tag/$label2",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: true,
            isUnified: false,
            isVirtual: true,
            accountId: "",
          },
          {
            id: "tag://$label3",
            name: "Personal",
            path: "/tag/$label3",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: true,
            isUnified: false,
            isVirtual: true,
            accountId: "",
          },
          {
            id: "tag://$label4",
            name: "To Do",
            path: "/tag/$label4",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: true,
            isUnified: false,
            isVirtual: true,
            accountId: "",
          },
          {
            id: "tag://$label5",
            name: "Later",
            path: "/tag/$label5",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: true,
            isUnified: false,
            isVirtual: true,
            accountId: "",
          },
        ],
        virtualTagFolders,
        "Virtual tag folders returned by query() should be correct."
      );

      // Tag some messages in testFolder1 with $label1.
      const { messages: messages1 } = await browser.messages.list(
        testFolder1.id
      );
      browser.test.assertEq(
        12,
        messages1.length,
        "Should have found the correct number of messages in testFolder1"
      );
      for (let i = 0; i < messages1.length / 2; i++) {
        await browser.messages.update(messages1[i].id, { tags: ["$label1"] });
      }
      // Check that messages are tagged.
      const { messages: messages1Tagged } = await browser.messages.list(
        testFolder1.id
      );
      browser.test.assertEq(
        6,
        messages1Tagged.filter(m => m.tags.includes("$label1")).length,
        "Should have found the correct number of tagged messages in testFolder1"
      );

      // Tag some messages in testFolder2 with $label1.
      const { messages: messages2 } = await browser.messages.list(
        testFolder2.id
      );
      browser.test.assertEq(
        8,
        messages2.length,
        "Should have found the correct number of messages in testFolder2"
      );
      for (let i = 0; i < messages2.length / 2; i++) {
        await browser.messages.update(messages2[i].id, { tags: ["$label1"] });
      }
      // Check that messages are tagged.
      const { messages: messages2Tagged } = await browser.messages.list(
        testFolder2.id
      );
      browser.test.assertEq(
        4,
        messages2Tagged.filter(m => m.tags.includes("$label1")).length,
        "Should have found the correct number of tagged messages in testFolder2"
      );

      const tests = [
        {
          use: "$label1",
          path: "/tag/$label1",
          numOfMessages: 10,
          subFolders: [],
        },
        {
          use: "$label2",
          path: "/tag/$label2",
          numOfMessages: 0,
          subFolders: [],
        },
        {
          use: "$label3",
          path: "/tag/$label3",
          numOfMessages: 0,
          subFolders: [],
        },
        {
          use: "$label4",
          path: "/tag/$label4",
          numOfMessages: 0,
          subFolders: [],
        },
        {
          use: "$label5",
          path: "/tag/$label5",
          numOfMessages: 0,
          subFolders: [],
        },
      ];

      for (const test of tests) {
        const virtualTagFolder = virtualTagFolders.find(
          folder => folder.path == test.path
        );
        browser.test.assertTrue(
          !!virtualTagFolder,
          `Should have found the virtual tag folder for ${test.use}`
        );

        // Verify getTagFolder().
        const virtualTagFolderFromGetTagFolder =
          await browser.folders.getTagFolder(test.use);
        browser.test.assertTrue(
          virtualTagFolderFromGetTagFolder,
          `Should have found the virtual tag folder for ${test.use} using folders.getTagFolder()`
        );
        window.assertDeepEqual(
          virtualTagFolderFromGetTagFolder,
          virtualTagFolder,
          `The virtual tag folder for ${test.use} retrieved via folders.getTagFolder() should be consistent`,
          {
            strict: true,
          }
        );

        // Check that virtual tag folders can be used with folders.get().
        const virtualTagFolderFromGet = await browser.folders.get(
          virtualTagFolder.id,
          false
        );
        window.assertDeepEqual(
          virtualTagFolderFromGet,
          virtualTagFolder,
          `The virtual tag folder for ${test.use} retrieved via folders.get() should be consistent`,
          {
            strict: true,
          }
        );

        // Test folders.getSubFolders() (include all nested subfolders).
        const subfolders = await browser.folders.getSubFolders(
          virtualTagFolder.id,
          true
        );
        window.assertDeepEqual(
          [],
          subfolders,
          `Return value of folders.getSubFolders() for the virtual tag folder for ${test.use} should be correct`,
          {
            strict: true,
          }
        );

        // In MV2, getParentFolders() returns [], because root folders are not
        // considdered as real folders (backward compatibility).
        const parentFolders = await browser.folders.getParentFolders(
          virtualTagFolder.id
        );
        window.assertDeepEqual(
          [],
          parentFolders,
          `Return value of getParentFolders() should be correct`
        );

        // Test folders.getFolderCapabilities().
        const folderCapabilities = await browser.folders.getFolderCapabilities(
          virtualTagFolder.id
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
          `Return value for folders.getFolderCapabilities() for the virtual tag folder for ${test.use} should be correct.`,
          {
            strict: true,
          }
        );

        // Test folders.rename() throws.
        await browser.test.assertRejects(
          browser.folders.rename(
            virtualTagFolder.id,
            `${virtualTagFolder.name}-2`
          ),
          `folders.rename() failed, the folder ${virtualTagFolder.name} cannot be renamed`,
          "folders.rename() should reject for virtual tag folders"
        );

        // Test folders.create() throws.
        await browser.test.assertRejects(
          browser.folders.create(virtualTagFolder.id, "Impossible"),
          `The destination used in folders.create() cannot be a virtual tag folder`,
          "folders.create() should reject for virtual tag folders"
        );

        // Test folders.delete() throws.
        await browser.test.assertRejects(
          browser.folders.delete(virtualTagFolder.id),
          `folders.delete() failed, the folder ${virtualTagFolder.name} cannot be deleted`,
          "folders.delete() should reject for virtual tag folders"
        );

        // Test folders.move() throws.
        await browser.test.assertRejects(
          browser.folders.move(virtualTagFolder.id, testFolder1.id),
          `folders.move() failed, cannot delete source folder ${virtualTagFolder.name}`,
          "folders.move() should reject for virtual tag folders"
        );

        // Test folders.copy(). Probably not that useful, as the copied folders
        // are no longer virtual search folders and therfore end up being empty.
        // The destination folder is checked at the end of this task.
        await browser.folders.copy(virtualTagFolder.id, testFolder1.id);

        // Retrieve messages from the the virtual tag folder via messages.query(). The messages from
        // the POP3 account should be seen from the virtual tag folder, without looking at subfolders.
        const { messages: queryMessages } = await browser.messages.query({
          folderId: virtualTagFolder.id,
          includeSubFolders: false,
        });
        browser.test.assertEq(
          test.numOfMessages,
          queryMessages.length,
          `Return value of messages.query() for the virtual tag folder for ${test.use} should be correct`
        );

        // Retrieve messages from the virtual tag folder via messages.list().
        const { messages: listMessages } = await browser.messages.list(
          virtualTagFolder.id
        );
        browser.test.assertEq(
          test.numOfMessages,
          listMessages.length,
          `Return value of messages.list() for the virtual tag folder for ${test.use} should be correct`
        );
      }

      // Verify the copied folders. Folders are empty and no longer virtual.
      const copiedFolders = await browser.folders.getSubFolders(
        testFolder1.id,
        true
      );
      window.assertDeepEqual(
        [
          {
            id: "account1://Inbox/testFolder1/Important",
            name: "Important",
            path: "/Inbox/testFolder1/Important",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Inbox/testFolder1/Later",
            name: "Later",
            path: "/Inbox/testFolder1/Later",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Inbox/testFolder1/Personal",
            name: "Personal",
            path: "/Inbox/testFolder1/Personal",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Inbox/testFolder1/To Do",
            name: "To Do",
            path: "/Inbox/testFolder1/To Do",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Inbox/testFolder1/Work",
            name: "Work",
            path: "/Inbox/testFolder1/Work",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
        ],
        copiedFolders,
        `Should find the correctly copied folders`
      );

      // Check that some messages are unread in testFolder1.
      const info1 = await browser.folders.getFolderInfo(testFolder1.id);
      window.assertDeepEqual(
        {
          totalMessageCount: 12,
          unreadMessageCount: 12,
          newMessageCount: 12,
        },
        info1,
        `Return value for folders.getFolderInfo() for testFolder1 should be correct.`
      );

      // Check the virtual tag folder for $label1.
      const tag1Folder = await browser.folders.getTagFolder("$label1");
      const info2 = await browser.folders.getFolderInfo(tag1Folder.id);
      window.assertDeepEqual(
        {
          totalMessageCount: 0,
          unreadMessageCount: 0,
          newMessageCount: 0,
        },
        info2,
        `Expected broken behavior: Return value for folders.getFolderInfo() for virtual tag folders should be all zero, because those stats are only updated if the folder is viewed in the UI.`
      );

      // Mark the unified inbox as read.
      await browser.folders.markAsRead(tag1Folder.id);

      const info3 = await browser.folders.getFolderInfo(tag1Folder.id);
      window.assertDeepEqual(
        {
          totalMessageCount: 0,
          unreadMessageCount: 0,
          newMessageCount: 0,
        },
        info3,
        `Expected broken behavior: Return value for folders.getFolderInfo() for virtual tag folders should be all zero, because those stats are only updated if the folder is viewed in the UI.`
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
        "messagesTagsList",
        "messagesTags",
        "messagesUpdate",
      ],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Test that the root tag folder is not exposed in MV3.
add_task(async function test_folder_isTag_getParentFolders_MV3() {
  const files = {
    "background.js": async () => {
      // Get the unified inbox folder.
      const [virtualTagFolder] = await browser.folders.query({
        isTag: true,
      });
      browser.test.assertTrue(
        virtualTagFolder,
        "Should have found at least one virtual tag folder"
      );

      // Get the parent folder including subfolders. Should be empty, as we do
      // not expose the smart account.
      const parentFoldersAndSubFolders = await browser.folders.getParentFolders(
        virtualTagFolder.id,
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
        virtualTagFolder.id,
        false
      );
      window.assertDeepEqual(
        [],
        parentFolders,
        `Return value of getParentFolders() excluding subfolders should be correct`
      );

      // Test getFolderInfo() throws for the virtual tags root folder, which
      // is not exposed to the API.
      await browser.test.assertRejects(
        browser.folders.getFolderInfo("tag://"),
        `Folder not found: tag://`,
        "folders.getFolderInfo() should reject for the tags root folders"
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
