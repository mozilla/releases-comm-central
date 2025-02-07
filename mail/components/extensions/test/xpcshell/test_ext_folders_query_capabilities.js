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

  // Set max_recent to 1 to be able to test the difference between most recent
  // and recent.
  Services.prefs.setIntPref("mail.folder_widget.max_recent", 1);
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("extensions.webextensions.warnings-as-errors");
    Services.prefs.clearUserPref("mail.folder_widget.max_recent");
  });
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function test_FolderInfo_FolderCapabilities_and_query() {
  const files = {
    "background.js": async () => {
      const [accountId, startTime] = await window.waitForMessage();

      async function queryCheck(queryInfo, expected) {
        // Do not include root folders in this test per default.
        if (!queryInfo.hasOwnProperty("isRoot")) {
          queryInfo.isRoot = false;
        }
        const found = await browser.folders.query(queryInfo);
        window.assertDeepEqual(
          expected,
          found.map(f => f.name),
          `browser.folders.query(${JSON.stringify(
            queryInfo
          )}) should return the correct folders`
        );
        return found;
      }

      const account = await browser.accounts.get(accountId);
      const rootFolder = account.rootFolder;

      let expectedAccountFolders = [];
      const expectedAllFolders = [];
      switch (account.type) {
        case "none":
          expectedAccountFolders = ["Trash", "Outbox", "InfoTest", "OtherTest"];
          break;
        case "nntp":
          expectedAccountFolders = ["InfoTest", "OtherTest"];
          break;
        default:
          expectedAccountFolders = ["Inbox", "Trash", "InfoTest", "OtherTest"];
          break;
      }
      expectedAllFolders.push(...expectedAccountFolders);
      expectedAllFolders.push(
        "Trash",
        "Outbox",
        "NestedRoot",
        "level0",
        "level1",
        "level2",
        "level3",
        "level4",
        "level5",
        "level6",
        "level7",
        "level8",
        "level9"
      );

      // Check expected folders.
      await queryCheck({}, expectedAllFolders);
      window.assertDeepEqual(
        expectedAccountFolders,
        rootFolder.subFolders.map(f => f.name),
        "Should find the correct account folders"
      );
      // Check capabilities of all folders in the two available accounts
      // (imap/nntp/local + local).
      switch (account.type) {
        case "none": // = local
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
          await queryCheck(
            { canAddMessages: true },
            expectedAllFolders.filter(
              f => !["Outbox", "InfoTest", "OtherTest"].includes(f)
            )
          );
          await queryCheck(
            { canAddSubfolders: true },
            expectedAllFolders.filter(
              f => !["Outbox", "InfoTest", "OtherTest"].includes(f)
            )
          );
          await queryCheck(
            { canBeDeleted: true },
            expectedAllFolders.filter(
              f => !["Trash", "Outbox", "InfoTest", "OtherTest"].includes(f)
            )
          );
          await queryCheck(
            { canBeRenamed: true },
            expectedAllFolders.filter(
              f => !["Trash", "Outbox", "InfoTest", "OtherTest"].includes(f)
            )
          );
          await queryCheck(
            {
              canAddMessages: false,
              canAddSubfolders: false,
              canBeDeleted: false,
              canBeRenamed: false,
            },
            ["InfoTest", "OtherTest", "Outbox"]
          );
          break;

        default:
          await queryCheck(
            { canAddMessages: true, canAddSubfolders: true },
            expectedAllFolders.filter(f => f != "Outbox")
          );
          await queryCheck({ canAddMessages: false }, ["Outbox"]);
          await queryCheck({ canAddSubfolders: false }, ["Outbox"]);
          await queryCheck(
            { canBeDeleted: true, canBeRenamed: true },
            expectedAllFolders.filter(
              f => !["Inbox", "Trash", "Outbox"].includes(f)
            )
          );
          await queryCheck(
            { canBeDeleted: false, canBeRenamed: false },
            expectedAllFolders.filter(f =>
              ["Inbox", "Trash", "Outbox"].includes(f)
            )
          );
      }

      const folders = await browser.folders.getSubFolders(account, false);
      const InfoTestFolder = folders.find(f => f.name == "InfoTest");

      // Verify initial state of the InfoTestFolder.
      {
        window.assertDeepEqual(
          {
            id: `${InfoTestFolder.accountId}:/${InfoTestFolder.path}`,
            specialUse: [],
            isFavorite: false,
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

        const capabilities =
          await browser.folders.getFolderCapabilities(InfoTestFolder);
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
        browser.test.assertTrue(
          info.lastUsed.getTime() > startTime.getTime(),
          `Should be correct: MailFolder.lastUsed (${info.lastUsed}) > startTime (${startTime})`
        );

        // Verify lastUsedAsDestination.
        browser.test.assertTrue(
          info.lastUsedAsDestination.getTime() >= startTime.getTime(),
          `Should be correct: MailFolder.lastUsedAsDestination (${info.lastUsedAsDestination}) > startTime (${startTime})`
        );
      }

      // Check query results without favorite folder and all messages unread & new.

      // Folders.
      const f1 = await queryCheck({ isRoot: false }, expectedAllFolders);
      const f2 = await queryCheck(
        { isRoot: false, folderId: rootFolder.id },
        expectedAccountFolders
      );

      const f3 = await queryCheck({ isRoot: true, folderId: rootFolder.id }, [
        "Root",
      ]);
      for (const f of f1) {
        browser.test.assertEq(
          false,
          f.isRoot,
          "The isRoot property should be false"
        );
      }
      for (const f of f2) {
        browser.test.assertEq(
          false,
          f.isRoot,
          "The isRoot property should be false"
        );
      }
      for (const f of f3) {
        browser.test.assertEq(
          true,
          f.isRoot,
          "The isRoot property should be true"
        );
      }

      // Recent.
      await queryCheck(
        {
          folderId: rootFolder.id,
          recent: true,
          limit: browser.folders.DEFAULT_MOST_RECENT_LIMIT,
        },
        ["OtherTest"]
      );
      await queryCheck({ folderId: rootFolder.id, recent: true }, [
        "OtherTest",
        "InfoTest",
      ]);
      await queryCheck(
        { folderId: rootFolder.id, recent: false },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );

      // LastUsed recently.
      await queryCheck(
        {
          folderId: rootFolder.id,
          lastUsed: { recent: true },
          sort: "lastUsed",
          limit: browser.folders.DEFAULT_MOST_RECENT_LIMIT,
        },
        ["OtherTest"]
      );
      await queryCheck(
        {
          folderId: rootFolder.id,
          lastUsed: { recent: true },
          sort: "lastUsed",
        },
        ["OtherTest", "InfoTest"]
      );
      await queryCheck(
        {
          folderId: rootFolder.id,
          lastUsed: { recent: true },
          sort: "name",
        },
        ["InfoTest", "OtherTest"]
      );
      await queryCheck(
        { folderId: rootFolder.id, lastUsed: { recent: false } },
        expectedAccountFolders.filter(
          f => !["InfoTest", "OtherTest"].includes(f)
        )
      );

      // LastUsed with before/after
      await queryCheck(
        {
          folderId: rootFolder.id,
          lastUsed: {
            after: new Date(startTime.getTime() + 3000),
            before: new Date(startTime.getTime() + 5000),
          },
        },
        ["OtherTest"]
      );
      await queryCheck(
        {
          folderId: rootFolder.id,
          lastUsed: {
            after: new Date(startTime.getTime() + 1000),
            before: new Date(startTime.getTime() + 3000),
          },
        },
        ["InfoTest"]
      );

      // lastUsedAsDestination with before/after
      await queryCheck(
        {
          folderId: rootFolder.id,
          lastUsedAsDestination: {
            after: new Date(startTime.getTime() + 9000),
            before: new Date(startTime.getTime() + 11000),
          },
        },
        ["InfoTest"]
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
      await queryCheck({ folderId: rootFolder.id, isFavorite: true }, []);
      await queryCheck(
        { folderId: rootFolder.id, isFavorite: false },
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

      // Flip isFavorite to true and mark all messages as read. Check FolderInfo
      // and onFolderInfoChanged event.
      {
        const onFolderInfoChangedPromise = window.waitForEvent(
          "folders.onFolderInfoChanged"
        );
        const onUpdatedPromise = window.waitForEvent("folders.onUpdated");
        await browser.folders.update(InfoTestFolder, {
          isFavorite: true,
        });
        await browser.folders.markAsRead(InfoTestFolder);

        const [originalFolder, updatedFolder] = await onUpdatedPromise;
        browser.test.assertEq(false, originalFolder.isFavorite);
        browser.test.assertEq(true, updatedFolder.isFavorite);
        browser.test.assertEq(InfoTestFolder.path, originalFolder.path);

        const [mailFolder, mailFolderInfo] = await onFolderInfoChangedPromise;
        window.assertDeepEqual(
          {
            unreadMessageCount: 0,
            favorite: true, // Deprecated in MV3.
          },
          mailFolderInfo
        );
        browser.test.assertEq(true, mailFolder.isFavorite);
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
        { folderId: rootFolder.id, isFavorite: false },
        expectedAccountFolders.filter(f => f != "InfoTest")
      );
      await queryCheck({ folderId: rootFolder.id, isFavorite: true }, [
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

      // Test flipping isFavorite back to false.
      {
        const onFolderInfoChangedPromise = window.waitForEvent(
          "folders.onFolderInfoChanged"
        );
        await browser.folders.update(InfoTestFolder, { isFavorite: false });
        const [mailFolder, mailFolderInfo] = await onFolderInfoChangedPromise;
        window.assertDeepEqual({ favorite: false }, mailFolderInfo); // Deprecated in MV3
        browser.test.assertEq(false, mailFolder.isFavorite);
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
  const startTimeSeconds = Math.floor(startTime.getTime() / 1000);
  const account = createAccount();

  // Add a second account to test query working across multiple accounts.
  const localAccount = createAccount("local");
  // Create a test folder with multiple levels of subFolders.
  const nestedRoot = await createSubfolder(
    localAccount.incomingServer.rootFolder,
    "NestedRoot"
  );
  const nestedFolders = [nestedRoot];
  for (let i = 0; i < 10; i++) {
    nestedFolders.push(await createSubfolder(nestedFolders[i], `level${i}`));
  }

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

  // Enforce different MRUTime values for folders used for recent tests.
  InfoTestFolder.setStringProperty("MRUTime", startTimeSeconds + 2);
  OtherTestFolder.setStringProperty("MRUTime", startTimeSeconds + 4);

  // Mock MRMTimes.
  InfoTestFolder.setStringProperty("MRMTime", startTimeSeconds + 10);

  extension.onMessage("markSomeAsUnread", count => {
    const messages = InfoTestFolder.messages;
    while (messages.hasMoreElements() && count > 0) {
      const msg = messages.getNext();
      msg.markRead(false);
      count--;
    }
    extension.sendMessage();
  });

  extension.onMessage("clearNewMessages", () => {
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

  await extension.startup();
  extension.sendMessage(account.key, startTime);
  await extension.awaitFinish("finished");
  await extension.unload();
});
