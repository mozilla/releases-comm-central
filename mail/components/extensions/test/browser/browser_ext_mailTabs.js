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
  tabmail.currentAbout3Pane.displayFolder(subFolders.test1.URI);
  await ensure_table_view();

  // There are a couple of deprecated properties in MV3, which we still want to
  // test in MV2 but also report to the user. By default, tests throw when
  // deprecated properties are used.
  Services.prefs.setBoolPref(
    "extensions.webextensions.warnings-as-errors",
    false
  );
  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);
  registerCleanupFunction(async () => {
    await ensure_cards_view();
    Services.prefs.clearUserPref("extensions.webextensions.warnings-as-errors");
    Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  });
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function test_update() {
  async function background() {
    async function checkCurrent(expected) {
      const [current] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      window.assertDeepEqual(expected, current);

      // Check if getCurrent() returns the same.
      const current2 = await browser.mailTabs.getCurrent();
      window.assertDeepEqual(expected, current2);
    }

    const [accountId] = await window.waitForMessage();
    const { folders } = await browser.accounts.get(accountId);

    await browser.mailTabs.update({ displayedFolder: folders[0] });
    const expected = {
      sortType: "date",
      sortOrder: "descending",
      viewType: "groupedByThread",
      layout: "standard",
      folderPaneVisible: true,
      messagePaneVisible: true,
      displayedFolder: folders[0],
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
    for (const viewType of [
      "ungrouped",
      "groupedByThread",
      "ungrouped",
      "groupedBySortType",
      "groupedByThread",
      "groupedBySortType",
      "ungrouped",
    ]) {
      await browser.mailTabs.update({ viewType });
      expected.viewType = viewType;
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
    const viewTypes = {
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
      viewTypes[expected.viewType].showThreaded,
      `Correct value for showThreaded for viewType <${expected.viewType}>`
    );
    Assert.equal(
      showUnthreaded,
      viewTypes[expected.viewType].showUnthreaded,
      `Correct value for showUnthreaded for viewType <${expected.viewType}>`
    );
    Assert.equal(
      showGroupedBySort,
      viewTypes[expected.viewType].showGroupedBySort,
      `Correct value for showGroupedBySort for viewType <${expected.viewType}>`
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

add_task(async function test_displayedFolderChanged() {
  async function background() {
    const [accountId] = await window.waitForMessage();

    const [current] = await browser.mailTabs.query({
      active: true,
      currentWindow: true,
    });
    browser.test.assertEq(accountId, current.displayedFolder.accountId);
    browser.test.assertEq("/", current.displayedFolder.path);

    async function selectFolder(newFolderPath) {
      const changeListener = window.waitForEvent(
        "mailTabs.onDisplayedFolderChanged"
      );
      browser.test.sendMessage("selectFolder", newFolderPath);
      const [tab, folder] = await changeListener;
      browser.test.assertEq(current.id, tab.id);
      browser.test.assertEq(accountId, folder.accountId);
      browser.test.assertEq(newFolderPath, folder.path);
    }
    await selectFolder("/test1");
    await selectFolder("/test2");
    await selectFolder("/");

    async function selectFolderByUpdate(newFolderPath) {
      const changeListener = window.waitForEvent(
        "mailTabs.onDisplayedFolderChanged"
      );
      browser.mailTabs.update({
        displayedFolder: { accountId, path: newFolderPath },
      });
      const [tab, folder] = await changeListener;
      browser.test.assertEq(current.id, tab.id);
      browser.test.assertEq(accountId, folder.accountId);
      browser.test.assertEq(newFolderPath, folder.path);
    }
    await selectFolderByUpdate("/test1");
    await selectFolderByUpdate("/test2");
    await selectFolderByUpdate("/");
    await selectFolderByUpdate("/test1");

    await new Promise(resolve => setTimeout(resolve));
    browser.test.notifyPass("mailTabs");
  }

  const folderMap = new Map([
    ["/", rootFolder],
    ["/test1", subFolders.test1],
    ["/test2", subFolders.test2],
  ]);

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  extension.onMessage("selectFolder", async newFolderPath => {
    tabmail.currentTabInfo.folder = folderMap.get(newFolderPath);
    await new Promise(resolve => executeSoon(resolve));
  });

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.currentTabInfo.folder = rootFolder;
});

add_task(async function test_selectedMessagesChanged() {
  async function background() {
    function checkMessageList(expectedId, expectedCount, actual) {
      if (expectedId) {
        browser.test.assertEq(36, actual.id.length);
      } else {
        browser.test.assertEq(null, actual.id);
      }
      browser.test.assertEq(expectedCount, actual.messages.length);
    }

    // Because of bad design, we must wait for the WebExtensions mechanism to load ext-mailTabs.js,
    // or when we call addListener below, it won't happen before the event is fired.
    // This only applies if none of the earlier tests are run, but I'm saving you from wasting
    // time figuring out what's going on like I did.
    await browser.mailTabs.query({});

    async function selectMessages(...newMessages) {
      const selectPromise = window.waitForEvent(
        "mailTabs.onSelectedMessagesChanged"
      );
      browser.test.sendMessage("selectMessage", newMessages);
      const [, messageList] = await selectPromise;
      return messageList;
    }

    let messageList;
    messageList = await selectMessages(3);
    checkMessageList(false, 1, messageList);
    messageList = await selectMessages(7);
    checkMessageList(false, 1, messageList);
    messageList = await selectMessages(4, 6);
    checkMessageList(false, 2, messageList);
    messageList = await selectMessages();
    checkMessageList(false, 0, messageList);
    messageList = await selectMessages(
      2,
      3,
      5,
      7,
      11,
      13,
      17,
      19,
      23,
      29,
      31,
      37
    );
    checkMessageList(true, 10, messageList);
    messageList = await browser.messages.continueList(messageList.id);
    checkMessageList(false, 2, messageList);
    messageList = await browser.mailTabs.getSelectedMessages();
    checkMessageList(true, 10, messageList);
    messageList = await browser.messages.continueList(messageList.id);
    checkMessageList(false, 2, messageList);

    await new Promise(resolve => setTimeout(resolve));
    browser.test.notifyPass("mailTabs");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  tabmail.currentTabInfo.folder = subFolders.test2;
  tabmail.currentTabInfo.messagePaneVisible = true;

  extension.onMessage("selectMessage", newMessages => {
    tabmail.currentAbout3Pane.threadTree.selectedIndices = newMessages;
  });

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.currentTabInfo.folder = rootFolder;
});

add_task(async function test_background_tab() {
  async function background() {
    const [accountId] = await window.waitForMessage();
    const { folders } = await browser.accounts.get(accountId);
    const allTabs = await browser.tabs.query({});
    const queryTabs = await browser.tabs.query({ mailTab: true });
    let allMailTabs = await browser.mailTabs.query({});

    browser.test.assertEq(4, allTabs.length);
    browser.test.assertEq(2, queryTabs.length);
    browser.test.assertEq(2, allMailTabs.length);

    browser.test.assertEq(accountId, allMailTabs[0].displayedFolder.accountId);
    browser.test.assertEq("/", allMailTabs[0].displayedFolder.path);

    browser.test.assertEq(accountId, allMailTabs[1].displayedFolder.accountId);
    browser.test.assertEq("/test1", allMailTabs[1].displayedFolder.path);
    browser.test.assertTrue(allMailTabs[1].active);

    // Check the initial state.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });

    await browser.mailTabs.update(allMailTabs[0].id, {
      folderPaneVisible: false,
      messagePaneVisible: false,
      displayedFolder: folders.find(f => f.name == "test2"),
    });

    // Should be in the same state, since we're updating a background tab.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });

    allMailTabs = await browser.mailTabs.query({});
    browser.test.assertEq(2, allMailTabs.length);

    browser.test.assertEq(accountId, allMailTabs[0].displayedFolder.accountId);
    browser.test.assertEq("/test2", allMailTabs[0].displayedFolder.path);

    browser.test.assertEq(accountId, allMailTabs[1].displayedFolder.accountId);
    browser.test.assertEq("/test1", allMailTabs[1].displayedFolder.path);
    browser.test.assertTrue(allMailTabs[1].active);

    // Switch to the other mail tab.
    await browser.tabs.update(allMailTabs[0].id, { active: true });

    // Should have changed to the updated state.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: false,
      folderPaneVisible: false,
      displayedFolder: "/test2",
    });

    await browser.mailTabs.update(allMailTabs[0].id, {
      folderPaneVisible: true,
      messagePaneVisible: true,
    });
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test2",
    });

    // Switch back to the first mail tab.
    await browser.tabs.update(allMailTabs[1].id, { active: true });

    // Should be in the same state it was in.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });

    browser.test.notifyPass("mailTabs");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead"],
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

add_task(async function test_get_and_query() {
  async function background() {
    async function checkTab(expected) {
      // Check mailTabs.get().
      const mailTab = await browser.mailTabs.get(expected.tab.id);
      browser.test.assertEq(expected.tab.id, mailTab.id);

      // Check if a query for all tabs in the same window included the expected tab.
      const mailTabs = await browser.mailTabs.query({
        windowId: expected.tab.windowId,
      });
      const filteredMailTabs = mailTabs.filter(e => e.id == expected.tab.id);
      browser.test.assertEq(1, filteredMailTabs.length);

      // Check if a query for the current tab in the given window returns the current tab.
      if (expected.isCurrentTab) {
        const currentTabs = await browser.mailTabs.query({
          active: true,
          windowId: expected.tab.windowId,
        });
        browser.test.assertEq(1, currentTabs.length);
        browser.test.assertEq(expected.tab.id, currentTabs[0].id);
      }

      // Check if a query for all tabs in the currentWindow includes the expected tab.
      if (expected.isCurrentWindow) {
        const mailTabsCurrentWindow = await browser.mailTabs.query({
          currentWindow: true,
        });
        const filteredMailTabsCurrentWindow = mailTabsCurrentWindow.filter(
          e => e.id == expected.tab.id
        );
        browser.test.assertEq(1, filteredMailTabsCurrentWindow.length);
      }

      // Check mailTabs.getCurrent() and mailTabs.query({ active: true, currentWindow: true })
      if (expected.isCurrentTab && expected.isCurrentWindow) {
        const currentTab = await browser.mailTabs.getCurrent();
        browser.test.assertEq(expected.tab.id, currentTab.id);

        const currentTabs = await browser.mailTabs.query({
          active: true,
          currentWindow: true,
        });
        browser.test.assertEq(1, currentTabs.length);
        browser.test.assertEq(expected.tab.id, currentTabs[0].id);
      }
    }

    const [accountId] = await window.waitForMessage();
    const allTabs = await browser.tabs.query({});
    const queryMailTabs = await browser.tabs.query({ mailTab: true });
    const allMailTabs = await browser.mailTabs.query({});

    browser.test.assertEq(8, allTabs.length);
    browser.test.assertEq(6, queryMailTabs.length);
    browser.test.assertEq(6, allMailTabs.length);

    // Each window has an active tab.
    browser.test.assertTrue(allMailTabs[2].active);
    browser.test.assertTrue(allMailTabs[5].active);

    // Check tabs of window #1.
    browser.test.assertEq(accountId, allMailTabs[0].displayedFolder.accountId);
    browser.test.assertEq("/", allMailTabs[0].displayedFolder.path);
    browser.test.assertEq(accountId, allMailTabs[1].displayedFolder.accountId);
    browser.test.assertEq("/test1", allMailTabs[1].displayedFolder.path);
    browser.test.assertEq(accountId, allMailTabs[2].displayedFolder.accountId);
    browser.test.assertEq("/test2", allMailTabs[2].displayedFolder.path);
    // Check tabs of window #2 (active).
    browser.test.assertEq(accountId, allMailTabs[3].displayedFolder.accountId);
    browser.test.assertEq("/", allMailTabs[3].displayedFolder.path);
    browser.test.assertEq(accountId, allMailTabs[4].displayedFolder.accountId);
    browser.test.assertEq("/test1", allMailTabs[4].displayedFolder.path);
    browser.test.assertEq(accountId, allMailTabs[5].displayedFolder.accountId);
    browser.test.assertEq("/test2", allMailTabs[5].displayedFolder.path);

    for (const mailTab of allMailTabs) {
      await checkTab({
        tab: mailTab,
        isCurrentTab: [allMailTabs[2].id, allMailTabs[5].id].includes(
          mailTab.id
        ),
        isCurrentWindow: mailTab.windowId == allMailTabs[5].windowId,
      });
    }

    // get(id) should throw if id does not belong to a mail tab.
    for (const tab of [allTabs[1], allTabs[5]]) {
      await browser.test.assertRejects(
        browser.mailTabs.get(tab.id),
        `Invalid mail tab ID: ${tab.id}`,
        "It rejects for invalid mail tab ID."
      );
    }

    // Switch to the second mail tab in both windows.
    for (const tab of [allMailTabs[1], allMailTabs[4]]) {
      await browser.tabs.update(tab.id, { active: true });
      // Check if the new active tab is returned.
      await checkTab({
        tab,
        isCurrentTab: true,
        isCurrentWindow: tab.id == allMailTabs[5].id,
      });
    }

    // Switch active window to a non-mailtab, getCurrent() and a query for active tab should not return anything.
    await browser.tabs.update(allTabs[5].id, { active: true });
    const activeMailTab = await browser.mailTabs.getCurrent();
    browser.test.assertEq(undefined, activeMailTab);
    let activeMailTabs = await browser.mailTabs.query({
      active: true,
      currentWindow: true,
    });
    browser.test.assertEq(0, activeMailTabs.length);

    // A query over all windows should still return the active tab from the inactive window.
    activeMailTabs = await browser.mailTabs.query({
      active: true,
    });
    browser.test.assertEq(1, activeMailTabs.length);
    browser.test.assertEq(allMailTabs[1].id, activeMailTabs[0].id);

    browser.test.notifyPass("mailTabs");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead"],
    },
  });

  const window2 = await openNewMailWindow();
  for (const win of [window, window2]) {
    const winTabmail = win.document.getElementById("tabmail");
    winTabmail.currentTabInfo.folder = rootFolder;
    win.openContentTab("about:mozilla");
    winTabmail.openTab("mail3PaneTab", { folderURI: subFolders.test1.URI });
    await BrowserTestUtils.waitForEvent(
      winTabmail.currentTabInfo.chromeBrowser,
      "folderURIChanged",
      false,
      event => event.detail == subFolders.test1.URI
    );
    winTabmail.openTab("mail3PaneTab", { folderURI: subFolders.test2.URI });
    await BrowserTestUtils.waitForEvent(
      winTabmail.currentTabInfo.chromeBrowser,
      "folderURIChanged",
      false,
      event => event.detail == subFolders.test2.URI
    );
  }

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  await BrowserTestUtils.closeWindow(window2);

  tabmail.closeOtherTabs(0);
  tabmail.currentTabInfo.folder = rootFolder;
});

add_task(async function test_setSelectedMessages() {
  async function background() {
    const [accountId] = await window.waitForMessage();
    const { folders } = await browser.accounts.get(accountId);
    const allTabs = await browser.tabs.query({});
    const queryTabs = await browser.tabs.query({ mailTab: true });
    const allMailTabs = await browser.mailTabs.query({});

    const { messages: messages1 } = await browser.messages.list(
      folders.find(f => f.path == "/test1")
    );
    browser.test.assertTrue(
      messages1.length > 7,
      "There should be more than 7 messages in /test1"
    );

    const { messages: messages2 } = await browser.messages.list(
      folders.find(f => f.path == "/test2")
    );
    browser.test.assertTrue(
      messages2.length > 4,
      "There should be more than 4 messages in /test2"
    );

    browser.test.assertEq(3, allMailTabs.length);
    browser.test.assertEq(5, allTabs.length);
    browser.test.assertEq(3, queryTabs.length);

    const foregroundTab = allMailTabs[1].id;
    browser.test.assertEq(accountId, allMailTabs[1].displayedFolder.accountId);
    browser.test.assertEq("/test1", allMailTabs[1].displayedFolder.path);
    browser.test.assertTrue(allMailTabs[1].active);

    const backgroundTab = allMailTabs[2].id;
    browser.test.assertEq(accountId, allMailTabs[2].displayedFolder.accountId);
    browser.test.assertEq("/", allMailTabs[2].displayedFolder.path);

    // Check the initial real state.
    await window.sendMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });

    // Change the selection in the foreground tab.
    await browser.mailTabs.setSelectedMessages(foregroundTab, [
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
      await browser.mailTabs.getSelectedMessages(foregroundTab);
    window.assertDeepEqual(
      [messages1.at(-7).id, messages1.at(-8).id],
      readMessagesA.map(m => m.id)
    );

    // Change the selection in the background tab.
    await browser.mailTabs.setSelectedMessages(backgroundTab, [
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
      await browser.mailTabs.getSelectedMessages(foregroundTab);
    window.assertDeepEqual(
      [messages1.at(-7).id, messages1.at(-8).id],
      readMessagesB.map(m => m.id)
    );
    // Check API return value of the inactive background tab.
    const { messages: readMessagesC } =
      await browser.mailTabs.getSelectedMessages(backgroundTab);
    window.assertDeepEqual(
      [messages2.at(-1).id, messages2.at(-4).id],
      readMessagesC.map(m => m.id)
    );
    // Switch to the background tab.
    await browser.tabs.update(backgroundTab, { active: true });
    // Check API return value of the background tab (now active).
    const { messages: readMessagesD } =
      await browser.mailTabs.getSelectedMessages(backgroundTab);
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
      await browser.mailTabs.getSelectedMessages(foregroundTab);
    window.assertDeepEqual(
      [messages1.at(-7).id, messages1.at(-8).id],
      readMessagesE.map(m => m.id)
    );
    // Switch back to the foreground tab.
    await browser.tabs.update(foregroundTab, { active: true });

    // Change the selection in the foreground tab.
    await browser.mailTabs.setSelectedMessages(foregroundTab, [
      messages2.at(-3).id,
      messages2.at(-5).id,
    ]);
    // Check API return value of the foreground tab.
    const { messages: readMessagesF } =
      await browser.mailTabs.getSelectedMessages(foregroundTab);
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
      await browser.mailTabs.getSelectedMessages(backgroundTab);
    window.assertDeepEqual(
      [messages2.at(-1).id, messages2.at(-4).id],
      readMessagesG.map(m => m.id)
    );

    // Clear selection in background tab.
    await browser.mailTabs.setSelectedMessages(backgroundTab, []);
    // Check API return value of the inactive background tab.
    const { messages: readMessagesH } =
      await browser.mailTabs.getSelectedMessages(backgroundTab);
    browser.test.assertEq(0, readMessagesH.length);

    // Clear selection in foreground tab.
    await browser.mailTabs.setSelectedMessages(foregroundTab, []);
    // Check API return value of the foreground tab.
    const { messages: readMessagesI } =
      await browser.mailTabs.getSelectedMessages(foregroundTab);
    browser.test.assertEq(0, readMessagesI.length);

    // Should throw if messages belong to different folders.
    await browser.test.assertRejects(
      browser.mailTabs.setSelectedMessages(foregroundTab, [
        messages2.at(-3).id,
        messages1.at(-5).id,
      ]),
      `Message ${messages2.at(-3).id} and message ${
        messages1.at(-5).id
      } are not in the same folder, cannot select them both.`,
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
