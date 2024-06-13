/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account, rootFolder, subFolders;
const tabmail = document.getElementById("tabmail");

add_setup(async () => {
  account = createAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  rootFolder.createSubfolder("test2", null);
  subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 10);
  createMessages(subFolders.test2, 50);

  tabmail.currentTabInfo.folder = rootFolder;
  await ensure_table_view();

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  });
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function test_MV3_event_pages() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      for (const eventName of [
        "onDisplayedFolderChanged",
        "onSelectedMessagesChanged",
      ]) {
        browser.mailTabs[eventName].addListener((...args) => {
          // Only send the first event after background wake-up, this should be
          // the only one expected.
          if (!hasFired) {
            hasFired = true;
            browser.test.sendMessage(`${eventName} received`, args);
          }
        });
      }

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
      browser_specific_settings: {
        gecko: { id: "mailtabs@mochi.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "mailTabs.onDisplayedFolderChanged",
      "mailTabs.onSelectedMessagesChanged",
    ];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });
  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Select a folder.

  {
    tabmail.currentTabInfo.folder = subFolders.test1;
    const displayInfo = await extension.awaitMessage(
      "onDisplayedFolderChanged received"
    );
    Assert.deepEqual(
      [
        {
          active: true,
          type: "mail",
        },
        { name: "test1", path: "/test1" },
      ],
      [
        {
          active: displayInfo[0].active,
          type: displayInfo[0].type,
        },
        { name: displayInfo[1].name, path: displayInfo[1].path },
      ],
      "The primed onDisplayedFolderChanged event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
    await extension.terminateBackground({ disableResetIdleForTest: true });
    // Verify the primed persistent listeners.
    checkPersistentListeners({ primed: true });
  }

  // Select multiple messages.

  {
    const messages = [...subFolders.test1.messages].slice(0, 5);
    tabmail.currentAbout3Pane.threadTree.selectedIndices = messages.map(m =>
      tabmail.currentAbout3Pane.gDBView.findIndexOfMsgHdr(m, false)
    );
    const displayInfo = await extension.awaitMessage(
      "onSelectedMessagesChanged received"
    );
    Assert.deepEqual(
      [
        "Big Meeting Today",
        "Small Party Tomorrow",
        "Huge Shindig Yesterday",
        "Tiny Wedding In a Fortnight",
        "Red Document Needs Attention",
      ],
      displayInfo[1].messages.reverse().map(e => e.subject),
      "The primed onSelectedMessagesChanged event should return the correct values"
    );
    Assert.deepEqual(
      {
        active: true,
        type: "mail",
      },
      {
        active: displayInfo[0].active,
        type: displayInfo[0].type,
      },
      "The primed onSelectedMessagesChanged event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
  }

  await extension.unload();
});

add_task(async function test_update() {
  async function background() {
    async function checkCurrent(expected) {
      const [current] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      window.assertDeepEqual(expected, current);
    }

    const [accountId] = await window.waitForMessage();
    const { rootFolder } = await browser.accounts.get(accountId, true);
    const folder = rootFolder.subFolders[0];

    await browser.mailTabs.update({ displayedFolderId: folder.id });
    const expected = {
      sortType: "date",
      sortOrder: "descending",
      groupType: "groupedByThread",
      layout: "standard",
      folderPaneVisible: true,
      messagePaneVisible: true,
      displayedFolder: folder,
    };
    delete expected.displayedFolder.subFolders;

    await checkCurrent(expected);
    await window.sendMessage("checkRealLayout", expected);
    await window.sendMessage("checkRealSort", expected);
    await window.sendMessage("checkRealView", expected);

    expected.sortOrder = "ascending";
    for (const value of ["date", "subject", "author"]) {
      await browser.mailTabs.update({
        sortType: value,
        sortOrder: "ascending",
      });
      expected.sortType = value;
      await window.sendMessage("checkRealSort", expected);
      await window.sendMessage("checkRealView", expected);
    }
    expected.sortOrder = "descending";
    for (const value of ["author", "subject", "date"]) {
      await browser.mailTabs.update({
        sortType: value,
        sortOrder: "descending",
      });
      expected.sortType = value;
      await window.sendMessage("checkRealSort", expected);
      await window.sendMessage("checkRealView", expected);
    }

    for (const key of ["folderPaneVisible", "messagePaneVisible"]) {
      for (const value of [false, true]) {
        await browser.mailTabs.update({ [key]: value });
        expected[key] = value;
        await checkCurrent(expected);
        await window.sendMessage("checkRealLayout", expected);
        await window.sendMessage("checkRealView", expected);
      }
    }
    for (const value of ["wide", "vertical", "standard"]) {
      await browser.mailTabs.update({ layout: value });
      expected.layout = value;
      await checkCurrent(expected);
      await window.sendMessage("checkRealLayout", expected);
      await window.sendMessage("checkRealView", expected);
    }

    // Test all possible switch combination.
    for (const groupType of [
      "ungrouped",
      "groupedByThread",
      "ungrouped",
      "groupedBySortType",
      "groupedByThread",
      "groupedBySortType",
      "ungrouped",
    ]) {
      await browser.mailTabs.update({ groupType });
      expected.groupType = groupType;
      await checkCurrent(expected);
      await window.sendMessage("checkRealLayout", expected);
      await window.sendMessage("checkRealSort", expected);
      await window.sendMessage("checkRealView", expected);
    }

    const selectedMessages = await browser.mailTabs.getSelectedMessages();
    browser.test.assertEq(null, selectedMessages.id);
    browser.test.assertEq(0, selectedMessages.messages.length);

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
    const intValue = ["standard", "wide", "vertical"].indexOf(expected.layout);
    is(Services.prefs.getIntPref("mail.pane_config.dynamic"), intValue);
    await check3PaneState(
      expected.folderPaneVisible,
      expected.messagePaneVisible
    );
    Assert.equal(
      "/" + (tabmail.currentTabInfo.folder.URI || "").split("/").pop(),
      expected.displayedFolder.path,
      "Should display the correct folder"
    );
    extension.sendMessage();
  });

  extension.onMessage("checkRealSort", expected => {
    const sortTypes = {
      date: Ci.nsMsgViewSortType.byDate,
      subject: Ci.nsMsgViewSortType.bySubject,
      author: Ci.nsMsgViewSortType.byAuthor,
    };

    const { primarySortType, primarySortOrder } =
      tabmail.currentAbout3Pane.gViewWrapper;

    Assert.equal(
      primarySortOrder,
      Ci.nsMsgViewSortOrder[expected.sortOrder],
      `sort order should be ${expected.sortOrder}`
    );
    Assert.equal(
      primarySortType,
      sortTypes[expected.sortType],
      `sort type should be ${expected.sortType}`
    );

    extension.sendMessage();
  });

  extension.onMessage("checkRealView", expected => {
    const groupTypes = {
      groupedBySortType: {
        showGroupedBySort: true,
        showThreaded: false,
        showUnthreaded: false,
      },
      groupedByThread: {
        showGroupedBySort: false,
        showThreaded: true,
        showUnthreaded: false,
      },
      ungrouped: {
        showGroupedBySort: false,
        showThreaded: false,
        showUnthreaded: true,
      },
    };

    const { showThreaded, showUnthreaded, showGroupedBySort } =
      tabmail.currentAbout3Pane.gViewWrapper;

    Assert.equal(
      showThreaded,
      groupTypes[expected.groupType].showThreaded,
      `Correct value for showThreaded for groupType <${expected.groupType}>`
    );
    Assert.equal(
      showUnthreaded,
      groupTypes[expected.groupType].showUnthreaded,
      `Correct value for showUnthreaded for groupType <${expected.groupType}>`
    );
    Assert.equal(
      showGroupedBySort,
      groupTypes[expected.groupType].showGroupedBySort,
      `Correct value for showGroupedBySort for groupType <${expected.groupType}>`
    );
    extension.sendMessage();
  });

  await check3PaneState(true, true);

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.currentTabInfo.folder = rootFolder;
});

add_task(async function test_setSelectedMessages() {
  async function background() {
    const [accountId] = await window.waitForMessage();
    const { rootFolder } = await browser.accounts.get(accountId, true);
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

    const folder1 = rootFolder.subFolders.find(f => f.path == "/test1");
    const folder2 = rootFolder.subFolders.find(f => f.path == "/test2");

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
      "/" + (tabmail.currentTabInfo.folder.URI || "").split("/").pop(),
      expected.displayedFolder,
      "Should display the correct folder"
    );
    extension.sendMessage();
  });

  window.openContentTab("about:buildconfig");
  window.openContentTab("about:mozilla");
  tabmail.openTab("mail3PaneTab", { folderURI: subFolders.test1.URI });
  tabmail.openTab("mail3PaneTab", {
    folderURI: rootFolder.URI,
    background: true,
  });
  await BrowserTestUtils.waitForEvent(
    tabmail.currentTabInfo.chromeBrowser,
    "folderURIChanged",
    false,
    event => event.detail == subFolders.test1.URI
  );

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.closeOtherTabs(0);
  tabmail.currentTabInfo.folder = rootFolder;
});

add_task(async function test_getSelectedMessagesWithOpenContextMenu() {
  async function background() {
    // Add menu entry.
    await new Promise(resolve =>
      browser.menus.create(
        {
          id: "test",
          title: "test",
          contexts: ["message_list"],
        },
        resolve
      )
    );

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

    const listedMessages = await pullEntireList(
      browser.mailTabs.getListedMessages()
    );
    browser.test.assertEq(
      10,
      listedMessages.length,
      "Number of listed messages shold be correct"
    );

    async function testSelection(description, selectedIds, shownIds) {
      await browser.mailTabs.setSelectedMessages(selectedIds);

      // Register a listener for the menus.onShown event.
      const { resolve: resolveOnShownPromise, promise: onShownPromise } =
        Promise.withResolvers();
      const onShownListener = info => {
        resolveOnShownPromise(info);
      };
      await browser.menus.onShown.addListener(onShownListener);

      // Verify getSelectedMessages() before the context menu is opened.
      window.assertDeepEqual(
        selectedIds,
        (await pullEntireList(browser.mailTabs.getSelectedMessages())).map(
          msg => msg.id
        ),
        `Selected messages should be correct (${description})`,
        { strict: true }
      );

      // Open the context menu.
      await window.sendMessage("open mailContext menu");

      // Verify getSelectedMessages() while the context menu is open.
      window.assertDeepEqual(
        selectedIds,
        (await pullEntireList(browser.mailTabs.getSelectedMessages())).map(
          msg => msg.id
        ),
        `Selected messages should still be correct after a context popup had been opened  (${description})`,
        { strict: true }
      );

      // Close the context menu.
      await window.sendMessage("close mailContext menu");

      // Verify getSelectedMessages() after the context menu has been closed.
      window.assertDeepEqual(
        selectedIds,
        (await pullEntireList(browser.mailTabs.getSelectedMessages())).map(
          msg => msg.id
        ),
        `Selected messages should still be correct after a context popup had been closed (${description})`,
        { strict: true }
      );

      // Verify the selection reported to the menus API.
      const onShownInfo = await onShownPromise;
      await browser.menus.onShown.removeListener(onShownListener);
      window.assertDeepEqual(
        shownIds,
        onShownInfo.selectedMessages.messages.map(msg => msg.id),
        `Messages reported in onShown should be correct (${description})`,
        { strict: true }
      );
    }

    // We are going to open the context menu on the first message. Select other
    // messages. In total two ranges.
    await testSelection(
      "Context menu open on unselected message",
      [
        listedMessages[5].id,
        listedMessages[6].id,
        listedMessages[8].id,
        listedMessages[9].id,
      ],
      [listedMessages[0].id]
    );

    // We are going to open the context menu on the first message. Select other
    // messages and the first one. In total three ranges.
    await testSelection(
      "Context menu open on selected message",
      [
        listedMessages[0].id,
        listedMessages[5].id,
        listedMessages[6].id,
        listedMessages[8].id,
        listedMessages[9].id,
      ],
      [
        listedMessages[0].id,
        listedMessages[5].id,
        listedMessages[6].id,
        listedMessages[8].id,
        listedMessages[9].id,
      ]
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
      permissions: ["accountsRead", "messagesRead", "menus"],
    },
  });

  extension.onMessage("open mailContext menu", async () => {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    const tabmail = win.document.getElementById("tabmail");
    const about3Pane = tabmail.currentAbout3Pane;
    const menu = about3Pane.document.getElementById("mailContext");
    const threadTree = about3Pane.document.getElementById("threadTree");
    // Open the context menu of the thread pane.
    await openMenuPopup(menu, threadTree.getRowAtIndex(0), {
      type: "contextmenu",
    });
    extension.sendMessage();
  });

  extension.onMessage("close mailContext menu", async () => {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    const tabmail = win.document.getElementById("tabmail");
    const about3Pane = tabmail.currentAbout3Pane;
    const menu = about3Pane.document.getElementById("mailContext");
    await closeMenuPopup(menu);
    extension.sendMessage();
  });

  tabmail.openTab("mail3PaneTab", { folderURI: subFolders.test1.URI });
  await BrowserTestUtils.waitForEvent(
    tabmail.currentTabInfo.chromeBrowser,
    "folderURIChanged",
    false,
    event => event.detail == subFolders.test1.URI
  );

  await extension.startup();
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.closeOtherTabs(0);
  tabmail.currentTabInfo.folder = rootFolder;
});
