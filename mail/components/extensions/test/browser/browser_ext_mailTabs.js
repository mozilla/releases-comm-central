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
    function awaitMessage(messageToSend, ...sendArgs) {
      return new Promise(resolve => {
        browser.test.onMessage.addListener(function listener(...args) {
          browser.test.onMessage.removeListener(listener);
          resolve(args);
        });
        if (messageToSend) {
          browser.test.sendMessage(messageToSend, ...sendArgs);
        }
      });
    }

    function assertDeepEqual(expected, actual) {
      if (Array.isArray(expected)) {
        browser.test.assertTrue(Array.isArray(actual));
        browser.test.assertEq(expected.length, actual.length);
        for (let i = 0; i < expected.length; i++) {
          assertDeepEqual(expected[i], actual[i]);
        }
        return;
      }

      let expectedKeys = Object.keys(expected);
      let actualKeys = Object.keys(actual);
      // Ignore any extra keys on the actual object.
      browser.test.assertTrue(expectedKeys.length <= actualKeys.length);

      for (let key of expectedKeys) {
        browser.test.assertTrue(actualKeys.includes(key), `Key ${key} exists`);
        if (expected[key] === null) {
          browser.test.assertTrue(actual[key] === null);
          continue;
        }
        if (["array", "object"].includes(typeof expected[key])) {
          assertDeepEqual(expected[key], actual[key]);
          continue;
        }
        browser.test.assertEq(expected[key], actual[key]);
      }
    }

    async function checkCurrent(expected) {
      let [current] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      assertDeepEqual(expected, current);
    }

    let [accountId] = await awaitMessage();
    let { folders } = await browser.accounts.get(accountId);
    let state = {
      sortType: null,
      sortOrder: null,
      layout: "standard",
      folderPaneVisible: null,
      messagePaneVisible: null,
      displayedFolder: {
        accountId,
        name: "Local Folders",
        path: "/",
      },
    };
    await checkCurrent(state);
    await awaitMessage("checkRealLayout", state);

    browser.mailTabs.update({ displayedFolder: folders[0] });
    state.sortType = "date";
    state.sortOrder = "ascending";
    state.folderPaneVisible = false;
    state.messagePaneVisible = true;
    state.displayedFolder = folders[0];
    delete state.displayedFolder.subFolders;
    await checkCurrent(state);
    await awaitMessage("checkRealLayout", state);
    await awaitMessage("checkRealSort", state);

    state.sortOrder = "descending";
    for (let value of ["date", "subject", "author"]) {
      await browser.mailTabs.update({
        sortType: value,
        sortOrder: "descending",
      });
      state.sortType = value;
      await awaitMessage("checkRealSort", state);
    }
    state.sortOrder = "ascending";
    for (let value of ["author", "subject", "date"]) {
      await browser.mailTabs.update({
        sortType: value,
        sortOrder: "ascending",
      });
      state.sortType = value;
      await awaitMessage("checkRealSort", state);
    }

    for (let key of ["folderPaneVisible", "messagePaneVisible"]) {
      for (let value of [false, true]) {
        await browser.mailTabs.update({ [key]: value });
        state[key] = value;
        await checkCurrent(state);
        await awaitMessage("checkRealLayout", state);
      }
    }
    for (let value of ["wide", "vertical", "standard"]) {
      await browser.mailTabs.update({ layout: value });
      state.layout = value;
      await checkCurrent(state);
      await awaitMessage("checkRealLayout", state);
    }

    let selectedMessages = await browser.mailTabs.getSelectedMessages();
    browser.test.assertEq(null, selectedMessages.id);
    browser.test.assertEq(0, selectedMessages.messages.length);

    browser.test.notifyPass("mailTabs");
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: { permissions: ["accountsRead", "messagesRead"] },
  });

  extension.onMessage("checkRealLayout", expected => {
    let intValue = ["standard", "wide", "vertical"].indexOf(expected.layout);
    is(Services.prefs.getIntPref("mail.pane_config.dynamic"), intValue);
    if (typeof expected.messagePaneVisible == "boolean") {
      is(
        document.getElementById("messagepaneboxwrapper").collapsed,
        !expected.messagePaneVisible
      );
    }
    if (typeof expected.folderPaneVisible == "boolean") {
      is(
        document.getElementById("folderPaneBox").collapsed,
        !expected.folderPaneVisible
      );
    }
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

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  window.gFolderTreeView.selectFolder(rootFolder);
});

add_task(async function test_displayedFolderChanged() {
  async function background() {
    function awaitMessage() {
      return new Promise(resolve => {
        browser.test.onMessage.addListener(function listener(...args) {
          browser.test.onMessage.removeListener(listener);
          resolve(args);
        });
      });
    }

    let [accountId] = await awaitMessage();

    let [current] = await browser.mailTabs.query({
      active: true,
      currentWindow: true,
    });
    browser.test.assertEq(accountId, current.displayedFolder.accountId);
    browser.test.assertEq("/", current.displayedFolder.path);

    async function selectFolder(newFolderPath) {
      return new Promise(resolve => {
        browser.mailTabs.onDisplayedFolderChanged.addListener(function listener(
          tab,
          folder
        ) {
          browser.mailTabs.onDisplayedFolderChanged.removeListener(listener);
          browser.test.assertEq(current.id, tab.id);
          browser.test.assertEq(accountId, folder.accountId);
          browser.test.assertEq(newFolderPath, folder.path);
          resolve();
        });
        browser.test.sendMessage("selectFolder", newFolderPath);
      });
    }
    await selectFolder("/test1");
    await selectFolder("/test2");
    await selectFolder("/");

    async function selectFolderByUpdate(newFolderPath) {
      return new Promise(resolve => {
        browser.mailTabs.onDisplayedFolderChanged.addListener(function listener(
          tab,
          folder
        ) {
          browser.mailTabs.onDisplayedFolderChanged.removeListener(listener);
          browser.test.assertEq(current.id, tab.id);
          browser.test.assertEq(accountId, folder.accountId);
          browser.test.assertEq(newFolderPath, folder.path);
          resolve();
        });
        browser.mailTabs.update({
          displayedFolder: { accountId, path: newFolderPath },
        });
      });
    }
    await selectFolderByUpdate("/test1");
    await selectFolderByUpdate("/test2");
    await selectFolderByUpdate("/");
    await selectFolderByUpdate("/test1");

    await new Promise(setTimeout);
    browser.test.notifyPass("mailTabs");
  }

  let folderMap = new Map([
    ["/", rootFolder],
    ["/test1", subFolders.test1],
    ["/test2", subFolders.test2],
  ]);

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: { permissions: ["accountsRead", "messagesRead"] },
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
      return new Promise(resolve => {
        browser.mailTabs.onSelectedMessagesChanged.addListener(
          function listener(tab, messageList) {
            browser.mailTabs.onSelectedMessagesChanged.removeListener(listener);
            resolve(messageList);
          }
        );
        browser.test.sendMessage("selectMessage", newMessages);
      });
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

    await new Promise(setTimeout);
    browser.test.notifyPass("mailTabs");
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: { permissions: ["accountsRead", "messagesRead"] },
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
    function awaitMessage(messageToSend, ...sendArgs) {
      return new Promise(resolve => {
        browser.test.onMessage.addListener(function listener(...args) {
          browser.test.onMessage.removeListener(listener);
          resolve(args);
        });
        if (messageToSend) {
          browser.test.sendMessage(messageToSend, ...sendArgs);
        }
      });
    }

    let [accountId] = await awaitMessage();
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
    await awaitMessage("checkRealLayout", {
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
    await awaitMessage("checkRealLayout", {
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
    await awaitMessage("checkRealLayout", {
      messagePaneVisible: false,
      folderPaneVisible: false,
      displayedFolder: "/test2",
    });

    await browser.mailTabs.update(allMailTabs[0].id, {
      folderPaneVisible: true,
      messagePaneVisible: true,
    });
    await awaitMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test2",
    });

    // Switch back to the first mail tab.
    await browser.tabs.update(allMailTabs[1].id, { active: true });

    // Should be in the same state it was in.
    await awaitMessage("checkRealLayout", {
      messagePaneVisible: true,
      folderPaneVisible: true,
      displayedFolder: "/test1",
    });

    browser.test.notifyPass("mailTabs");
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: { permissions: ["accountsRead"] },
  });

  extension.onMessage("checkRealLayout", async expected => {
    is(
      document.getElementById("messagepaneboxwrapper").collapsed,
      !expected.messagePaneVisible
    );
    is(
      document.getElementById("folderPaneBox").collapsed,
      !expected.folderPaneVisible
    );
    is(
      window.gFolderTreeView.getSelectedFolders()[0].URI,
      account.incomingServer.serverURI + expected.displayedFolder
    );
    extension.sendMessage();
  });

  let tabmail = document.getElementById("tabmail");
  window.openContentTab("about:config");
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

    await new Promise(resolve => {
      browser.test.onMessage.addListener(function listener(...args) {
        browser.test.onMessage.removeListener(listener);
        resolve(args);
      });
      browser.test.sendMessage("checkRealLayout", {
        folderPaneVisible: false,
        messagePaneVisible: true,
      });
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
    background,
    manifest: { permissions: ["accountsRead", "messagesRead"] },
  });

  extension.onMessage("checkRealLayout", expected => {
    is(
      document.getElementById("messagepaneboxwrapper").collapsed,
      !expected.messagePaneVisible
    );
    is(
      document.getElementById("folderPaneBox").collapsed,
      !expected.folderPaneVisible
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  tabmail.closeOtherTabs(tabmail.tabModes.folder.tabs[0]);
});
