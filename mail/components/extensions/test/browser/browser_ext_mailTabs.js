/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account, rootFolder, subFolders;

add_task(async function setup() {
  account = createAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  rootFolder.createSubfolder("test2", null);
  subFolders = {};
  for (let folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 10);
  createMessages(subFolders.test2, 50);

  window.gFolderTreeView.selectFolder(rootFolder);

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  });
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function test_update() {
  async function background() {
    async function checkCurrent(expected) {
      let [current] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      window.assertDeepEqual(expected, current);

      // Check if getCurrent() returns the same.
      let current2 = await browser.mailTabs.getCurrent();
      window.assertDeepEqual(expected, current2);
    }

    let [accountId] = await window.waitForMessage();
    let { folders } = await browser.accounts.get(accountId);

    await browser.mailTabs.update({ displayedFolder: folders[0] });
    let expected = {
      sortType: "date",
      sortOrder: "ascending",
      viewType: "ungrouped",
      layout: "standard",
      folderPaneVisible: false,
      messagePaneVisible: true,
      displayedFolder: folders[0],
    };
    delete expected.displayedFolder.subFolders;

    await checkCurrent(expected);
    await window.sendMessage("checkRealLayout", expected);
    await window.sendMessage("checkRealSort", expected);
    await window.sendMessage("checkRealView", expected);

    expected.sortOrder = "descending";
    for (let value of ["date", "subject", "author"]) {
      await browser.mailTabs.update({
        sortType: value,
        sortOrder: "descending",
      });
      expected.sortType = value;
      await window.sendMessage("checkRealSort", expected);
      await window.sendMessage("checkRealView", expected);
    }
    expected.sortOrder = "ascending";
    for (let value of ["author", "subject", "date"]) {
      await browser.mailTabs.update({
        sortType: value,
        sortOrder: "ascending",
      });
      expected.sortType = value;
      await window.sendMessage("checkRealSort", expected);
      await window.sendMessage("checkRealView", expected);
    }

    for (let key of ["folderPaneVisible", "messagePaneVisible"]) {
      for (let value of [false, true]) {
        await browser.mailTabs.update({ [key]: value });
        expected[key] = value;
        await checkCurrent(expected);
        await window.sendMessage("checkRealLayout", expected);
        await window.sendMessage("checkRealView", expected);
      }
    }
    for (let value of ["wide", "vertical", "standard"]) {
      await browser.mailTabs.update({ layout: value });
      expected.layout = value;
      await checkCurrent(expected);
      await window.sendMessage("checkRealLayout", expected);
      await window.sendMessage("checkRealView", expected);
    }

    // Test all possible switch combination.
    for (let viewType of [
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

    let selectedMessages = await browser.mailTabs.getSelectedMessages();
    browser.test.assertEq(null, selectedMessages.id);
    browser.test.assertEq(0, selectedMessages.messages.length);

    browser.test.notifyPass("mailTabs");
  }

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  extension.onMessage("checkRealLayout", expected => {
    let intValue = ["standard", "wide", "vertical"].indexOf(expected.layout);
    is(Services.prefs.getIntPref("mail.pane_config.dynamic"), intValue);
    check3PaneState(expected.folderPaneVisible, expected.messagePaneVisible);
    extension.sendMessage();
  });

  extension.onMessage("checkRealSort", expected => {
    for (let [columnId, sortType] of window.gFolderDisplay.COLUMNS_MAP) {
      sortType = sortType[2].toLowerCase() + sortType.substring(3);
      if (sortType == expected.sortType) {
        let column = document.getElementById(columnId);
        is(column.getAttribute("sortDirection"), expected.sortOrder);
        extension.sendMessage();
        return;
      }
    }
    throw new Error("This test should never get here.");
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
    let view = window.gFolderDisplay.view;
    Assert.equal(
      view.showThreaded,
      viewTypes[expected.viewType].showThreaded,
      `Correct value for showThreaded for viewType <${expected.viewType}>`
    );
    Assert.equal(
      view.showUnthreaded,
      viewTypes[expected.viewType].showUnthreaded,
      `Correct value for showUnthreaded for viewType <${expected.viewType}>`
    );
    Assert.equal(
      view.showGroupedBySort,
      viewTypes[expected.viewType].showGroupedBySort,
      `Correct value for showGroupedBySort for viewType <${expected.viewType}>`
    );
    extension.sendMessage();
  });

  check3PaneInInitialState();

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  window.gFolderTreeView.selectFolder(rootFolder);
});

add_task(async function test_displayedFolderChanged() {
  async function background() {
    let [accountId] = await window.waitForMessage();

    let [current] = await browser.mailTabs.query({
      active: true,
      currentWindow: true,
    });
    browser.test.assertEq(accountId, current.displayedFolder.accountId);
    browser.test.assertEq("/", current.displayedFolder.path);

    async function selectFolder(newFolderPath) {
      let changeListener = window.waitForEvent(
        "mailTabs.onDisplayedFolderChanged"
      );
      browser.test.sendMessage("selectFolder", newFolderPath);
      let [tab, folder] = await changeListener;
      browser.test.assertEq(current.id, tab.id);
      browser.test.assertEq(accountId, folder.accountId);
      browser.test.assertEq(newFolderPath, folder.path);
    }
    await selectFolder("/test1");
    await selectFolder("/test2");
    await selectFolder("/");

    async function selectFolderByUpdate(newFolderPath) {
      let changeListener = window.waitForEvent(
        "mailTabs.onDisplayedFolderChanged"
      );
      browser.mailTabs.update({
        displayedFolder: { accountId, path: newFolderPath },
      });
      let [tab, folder] = await changeListener;
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

  let folderMap = new Map([
    ["/", rootFolder],
    ["/test1", subFolders.test1],
    ["/test2", subFolders.test2],
  ]);

  let extension = ExtensionTestUtils.loadExtension({
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
    window.gFolderTreeView.selectFolder(folderMap.get(newFolderPath));
    await new Promise(resolve => executeSoon(resolve));
  });

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  window.gFolderTreeView.selectFolder(rootFolder);
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
      let selectPromise = window.waitForEvent(
        "mailTabs.onSelectedMessagesChanged"
      );
      browser.test.sendMessage("selectMessage", newMessages);
      let [, messageList] = await selectPromise;
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

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  window.gFolderTreeView.selectFolder(subFolders.test2);
  if (!window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }
  let allMessages = [...subFolders.test2.messages];

  extension.onMessage("selectMessage", newMessages => {
    window.gFolderDisplay.selectMessages(newMessages.map(i => allMessages[i]));
  });

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  window.gFolderTreeView.selectFolder(rootFolder);
  window.MsgToggleMessagePane();
});

add_task(async function test_background_tab() {
  async function background() {
    let [accountId] = await window.waitForMessage();
    let { folders } = await browser.accounts.get(accountId);
    let allTabs = await browser.tabs.query({});
    let queryTabs = await browser.tabs.query({ mailTab: true });
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

  let extension = ExtensionTestUtils.loadExtension({
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
    check3PaneState(expected.folderPaneVisible, expected.messagePaneVisible);
    extension.sendMessage();
  });

  let tabmail = document.getElementById("tabmail");
  window.openContentTab("about:buildconfig");
  window.openContentTab("about:mozilla");
  tabmail.openTab("folder", { folder: subFolders.test1 });

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);
  window.gFolderTreeView.selectFolder(rootFolder);
});

add_task(async function test_glodaList_tab() {
  async function background() {
    let mailTabs = await browser.mailTabs.query({});
    browser.test.assertEq(2, mailTabs.length);

    let [tab] = await browser.mailTabs.query({ active: true });
    browser.test.assertTrue(!tab.folderPaneVisible);
    browser.test.assertTrue(tab.messagePaneVisible);

    // This should have no effect, and it certainly shouldn't throw.
    await browser.mailTabs.update({
      folderPaneVisible: true,
      messagePaneVisible: false,
    });

    await window.sendMessage("checkRealLayout", {
      folderPaneVisible: false,
      messagePaneVisible: true,
    });

    [tab] = await browser.mailTabs.query({ active: true });
    browser.test.assertEq(2, mailTabs.length);
    browser.test.assertTrue(!tab.folderPaneVisible);
    browser.test.assertTrue(tab.messagePaneVisible);

    browser.test.notifyPass("mailTabs");
  }

  let tabmail = document.getElementById("tabmail");
  tabmail.openTab("glodaList", { collection: { items: [] } });

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  extension.onMessage("checkRealLayout", expected => {
    check3PaneState(expected.folderPaneVisible, expected.messagePaneVisible);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);
});

add_task(async function test_get_and_query() {
  async function background() {
    async function checkTab(expected) {
      // Check mailTabs.get().
      let mailTab = await browser.mailTabs.get(expected.tab.id);
      browser.test.assertEq(expected.tab.id, mailTab.id);

      // Check if a query for all tabs in the same window included the expected tab.
      let mailTabs = await browser.mailTabs.query({
        windowId: expected.tab.windowId,
      });
      let filteredMailTabs = mailTabs.filter(e => e.id == expected.tab.id);
      browser.test.assertEq(1, filteredMailTabs.length);

      // Check if a query for the current tab in the given window returns the current tab.
      if (expected.isCurrentTab) {
        let currentTabs = await browser.mailTabs.query({
          active: true,
          windowId: expected.tab.windowId,
        });
        browser.test.assertEq(1, currentTabs.length);
        browser.test.assertEq(expected.tab.id, currentTabs[0].id);
      }

      // Check if a query for all tabs in the currentWindow includes the expected tab.
      if (expected.isCurrentWindow) {
        let mailTabsCurrentWindow = await browser.mailTabs.query({
          currentWindow: true,
        });
        let filteredMailTabsCurrentWindow = mailTabsCurrentWindow.filter(
          e => e.id == expected.tab.id
        );
        browser.test.assertEq(1, filteredMailTabsCurrentWindow.length);
      }

      // Check mailTabs.getCurrent() and mailTabs.query({ active: true, currentWindow: true })
      if (expected.isCurrentTab && expected.isCurrentWindow) {
        let currentTab = await browser.mailTabs.getCurrent();
        browser.test.assertEq(expected.tab.id, currentTab.id);

        let currentTabs = await browser.mailTabs.query({
          active: true,
          currentWindow: true,
        });
        browser.test.assertEq(1, currentTabs.length);
        browser.test.assertEq(expected.tab.id, currentTabs[0].id);
      }
    }

    let [accountId] = await window.waitForMessage();
    let allTabs = await browser.tabs.query({});
    let queryMailTabs = await browser.tabs.query({ mailTab: true });
    let allMailTabs = await browser.mailTabs.query({});

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

    for (let mailTab of allMailTabs) {
      await checkTab({
        tab: mailTab,
        isCurrentTab: [allMailTabs[2].id, allMailTabs[5].id].includes(
          mailTab.id
        ),
        isCurrentWindow: mailTab.windowId == allMailTabs[5].windowId,
      });
    }

    // get(id) should throw if id does not belong to a mail tab.
    for (let tab of [allTabs[1], allTabs[5]]) {
      await browser.test.assertRejects(
        browser.mailTabs.get(tab.id),
        `Invalid mail tab ID: ${tab.id}`,
        "It rejects for invalid mail tab ID."
      );
    }

    // Switch to the second mail tab in both windows.
    for (let tab of [allMailTabs[1], allMailTabs[4]]) {
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
    let activeMailTab = await browser.mailTabs.getCurrent();
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

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead"],
    },
  });

  let window2 = await openNewMailWindow();
  for (let win of [window, window2]) {
    // The folder selection throws errors, if the tree view is not yet initialized.
    await TestUtils.waitForCondition(() => win.gFolderTreeView.isInited);
    win.gFolderTreeView.selectFolder(rootFolder);
    let tabmail = win.document.getElementById("tabmail");
    win.openContentTab("about:mozilla");
    tabmail.openTab("folder", { folder: subFolders.test1 });
    tabmail.openTab("folder", { folder: subFolders.test2 });
  }

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  await BrowserTestUtils.closeWindow(window2);

  window.gFolderTreeView.selectFolder(rootFolder);
  let tabmail = window.document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);
});
