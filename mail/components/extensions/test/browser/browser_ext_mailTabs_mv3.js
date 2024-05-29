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
