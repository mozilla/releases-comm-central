/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ensure_table_view } = ChromeUtils.importESModule(
  "resource://testing-common/MailViewHelpers.sys.mjs"
);

let gAccount, gRootFolder, gSubFolders, gDefaultTabmail;

add_setup(async () => {
  gAccount = createAccount();
  gRootFolder = gAccount.incomingServer.rootFolder;
  await createSubfolder(gRootFolder, "test1");
  await createSubfolder(gRootFolder, "test2");
  await createSubfolder(gRootFolder, "test3");

  gSubFolders = {};
  for (const folder of gRootFolder.subFolders) {
    gSubFolders[folder.name] = folder;
  }
  await createMessages(gSubFolders.test1, 10);
  await createMessages(gSubFolders.test2, 50);

  await createMessages(gSubFolders.test3, 5);
  await createMessages(gSubFolders.test3, {
    count: 3,
    msgsPerThread: 3,
  });
  await createMessages(gSubFolders.test3, 5);
  await createMessages(gSubFolders.test3, {
    count: 4,
    msgsPerThread: 4,
  });
  await createMessages(gSubFolders.test3, 5);

  gDefaultTabmail = document.getElementById("tabmail");
  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
  await ensure_table_view(document);
});

add_task(async function test_setSelectedMessages() {
  async function background() {
    const [accountId] = await window.waitForMessage();
    const { rootFolder: accRootFolder } = await browser.accounts.get(
      accountId,
      true
    );
    const allTabs = await browser.tabs.query({});
    const queryTabs = await browser.tabs.query({ type: "mail" });
    const allMailTabs = await browser.mailTabs.query({});

    // Helper function to make sure the entire list has been awaited, before
    // the test ends.
    async function pullEntireList(listPromise) {
      const msgs = [];
      let list = await listPromise;
      while (list) {
        for (const m of list.messages) {
          msgs.push(m);
        }
        if (!list.id) {
          break;
        }
        list = await browser.messages.continueList(list.id);
      }
      return msgs;
    }

    const folder1 = accRootFolder.subFolders.find(f => f.path == "/test1");
    const folder2 = accRootFolder.subFolders.find(f => f.path == "/test2");

    const messages1 = await pullEntireList(browser.messages.list(folder1.id));
    browser.test.assertTrue(
      messages1.length > 7,
      "There should be more than 7 messages in /test1"
    );

    const messages2 = await pullEntireList(browser.messages.list(folder2.id));
    browser.test.assertTrue(
      messages2.length > 4,
      "There should be more than 4 messages in /test2"
    );

    browser.test.assertEq(3, allMailTabs.length);
    browser.test.assertEq(5, allTabs.length);
    browser.test.assertEq(3, queryTabs.length);

    const foregroundTabId = allMailTabs[1].tabId;
    browser.test.assertEq(accountId, allMailTabs[1].displayedFolder.accountId);
    browser.test.assertEq("/test1", allMailTabs[1].displayedFolder.path);
    browser.test.assertTrue(allMailTabs[1].active);

    const backgroundTabId = allMailTabs[2].tabId;
    browser.test.assertEq(accountId, allMailTabs[2].displayedFolder.accountId);
    browser.test.assertEq("/", allMailTabs[2].displayedFolder.path);

    // Check the initial real state.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });

    // Change the selection in the foreground tab.
    await browser.mailTabs.setSelectedMessages(foregroundTabId, [
      messages1.at(-7).id,
      messages1.at(-8).id,
    ]);
    // Check the current real state.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });
    // Check API return value of the foreground tab.
    const { messages: readMessagesA } =
      await browser.mailTabs.getSelectedMessages(foregroundTabId);
    window.assertDeepEqual(
      [messages1.at(-7).id, messages1.at(-8).id],
      readMessagesA.map(m => m.id)
    );

    // Change the selection in the background tab.
    await browser.mailTabs.setSelectedMessages(backgroundTabId, [
      messages2.at(-1).id,
      messages2.at(-4).id,
    ]);
    // Real state should be the same, since we're updating a background tab.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });

    // Check unchanged API return value of the foreground tab.
    const { messages: readMessagesB } =
      await browser.mailTabs.getSelectedMessages(foregroundTabId);
    window.assertDeepEqual(
      [messages1.at(-7).id, messages1.at(-8).id],
      readMessagesB.map(m => m.id)
    );
    // Check API return value of the inactive background tab.
    const { messages: readMessagesC } =
      await browser.mailTabs.getSelectedMessages(backgroundTabId);
    window.assertDeepEqual(
      [messages2.at(-1).id, messages2.at(-4).id],
      readMessagesC.map(m => m.id)
    );

    // Switch to the background tab.
    await browser.tabs.update(backgroundTabId, { active: true });
    // Check API return value of the background tab (now active).
    const { messages: readMessagesD } =
      await browser.mailTabs.getSelectedMessages(backgroundTabId);
    window.assertDeepEqual(
      [messages2.at(-1).id, messages2.at(-4).id],
      readMessagesD.map(m => m.id)
    );
    // Check real state, should now match the active background tab.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test2",
    });
    // Check unchanged API return value of the foreground tab (now inactive).
    const { messages: readMessagesE } =
      await browser.mailTabs.getSelectedMessages(foregroundTabId);
    window.assertDeepEqual(
      [messages1.at(-7).id, messages1.at(-8).id],
      readMessagesE.map(m => m.id)
    );
    // Switch back to the foreground tab.
    await browser.tabs.update(foregroundTabId, { active: true });

    // Change the selection in the foreground tab.
    await browser.mailTabs.setSelectedMessages(foregroundTabId, [
      messages2.at(-3).id,
      messages2.at(-5).id,
    ]);
    // Check API return value of the foreground tab.
    const { messages: readMessagesF } =
      await browser.mailTabs.getSelectedMessages(foregroundTabId);
    window.assertDeepEqual(
      [messages2.at(-3).id, messages2.at(-5).id],
      readMessagesF.map(m => m.id)
    );
    // Check real state.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test2",
    });
    // Check API return value of the inactive background tab.
    const { messages: readMessagesG } =
      await browser.mailTabs.getSelectedMessages(backgroundTabId);
    window.assertDeepEqual(
      [messages2.at(-1).id, messages2.at(-4).id],
      readMessagesG.map(m => m.id)
    );

    // Clear selection in background tab.
    await browser.mailTabs.setSelectedMessages(backgroundTabId, []);
    // Check API return value of the inactive background tab.
    const { messages: readMessagesH } =
      await browser.mailTabs.getSelectedMessages(backgroundTabId);
    browser.test.assertEq(0, readMessagesH.length);

    // Clear selection in foreground tab.
    await browser.mailTabs.setSelectedMessages(foregroundTabId, []);
    // Check API return value of the foreground tab.
    const { messages: readMessagesI } =
      await browser.mailTabs.getSelectedMessages(foregroundTabId);
    browser.test.assertEq(0, readMessagesI.length);

    // Should throw if messages belong to different folders.
    await browser.test.assertRejects(
      browser.mailTabs.setSelectedMessages(foregroundTabId, [
        messages2.at(-3).id,
        messages1.at(-5).id,
      ]),
      /Requested messages are not in the same folder and are also not in the current view/,
      "browser.mailTabs.setSelectedMessages() should reject, if the requested message do not belong to the same folder."
    );

    browser.test.notifyPass("mailTabs");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  extension.onMessage("checkRealLayout", async expected => {
    await check3PaneState(
      expected.folderPaneVisible,
      expected.messagePaneVisible
    );
    Assert.equal(
      "/" + (gDefaultTabmail.currentTabInfo.folder.URI || "").split("/").pop(),
      expected.displayedFolder,
      "Should display the correct folder"
    );
    extension.sendMessage();
  });

  window.openContentTab("about:buildconfig");
  window.openContentTab("about:mozilla");
  gDefaultTabmail.openTab("mail3PaneTab", { folderURI: gSubFolders.test1.URI });
  gDefaultTabmail.openTab("mail3PaneTab", {
    folderURI: gRootFolder.URI,
    background: true,
  });
  await BrowserTestUtils.waitForEvent(
    gDefaultTabmail.currentTabInfo.chromeBrowser,
    "folderURIChanged",
    false,
    event => event.detail == gSubFolders.test1.URI
  );

  await extension.startup();
  extension.sendMessage(gAccount.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  gDefaultTabmail.closeOtherTabs(0);
  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
});

add_task(async function test_setSelectedMessages_with_thread() {
  async function background() {
    const [testFolder] = await browser.folders.query({ name: "test3" });
    await browser.mailTabs.update({ displayedFolderId: testFolder.id });

    // Get the listed messages (some messages are collapsed and not visible).
    const { messages: listedMessages } =
      await browser.mailTabs.getListedMessages();
    browser.test.assertEq(
      17,
      listedMessages.length,
      "Should find the correct number of messages in collapsed threads"
    );

    // Get all messages in the test folder.
    const { messages: allMessages } = await browser.messages.list(
      testFolder.id
    );
    browser.test.assertEq(
      22,
      allMessages.length,
      "Should find the correct number of messages in the folder"
    );

    // Find the collapsed messages.
    const listedMessagesIds = listedMessages.map(m => m.id);
    const collapsedMessages = allMessages.filter(
      m => !listedMessagesIds.includes(m.id)
    );
    browser.test.assertEq(
      5,
      collapsedMessages.length,
      "Should find the correct number of collapsed messages"
    );

    // Select the first, the last and the collapsed messages. Expanding the hidden
    // threads should not cause the wrong "last" message to be selected (see bug
    // 1953713).
    const testMessages = [
      listedMessages[0],
      listedMessages[16],
      ...collapsedMessages,
    ];
    await browser.mailTabs.setSelectedMessages(testMessages.map(m => m.id));

    const { messages: selectedMessages } =
      await browser.mailTabs.getSelectedMessages();
    window.assertDeepEqual(
      testMessages.map(m => m.id).sort(),
      selectedMessages.map(m => m.id).sort(),
      "The correct messages should be selected"
    );

    browser.test.notifyPass("mailTabs");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("mailTabs");
  await extension.unload();
});
