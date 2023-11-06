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

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);
  registerCleanupFunction(async () => {
    await ensure_cards_view();
    Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  });
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function test_create() {
  async function background() {
    async function testIt(config, expected = config) {
      const test = {
        ...config,
      };
      test.displayedFolder = config.displayedFolder.id;

      const mailTab = await browser.mailTabs.create(test);
      window.assertDeepEqual(expected, mailTab);
      await window.sendMessage("checkRealLayout", expected);
      await window.sendMessage("checkRealSort", expected);
      await window.sendMessage("checkRealView", expected);

      const selectedMessages = await browser.mailTabs.getSelectedMessages(
        mailTab.id
      );
      browser.test.assertEq(null, selectedMessages.id);
      browser.test.assertEq(0, selectedMessages.messages.length);
      await browser.tabs.remove(mailTab.id);
    }

    const [accountId] = await window.waitForMessage();
    const { folders } = await browser.accounts.get(accountId);
    const displayedFolder = folders[0];
    delete displayedFolder.subFolders;

    // Test defaults.
    const expected = {
      sortType: "date",
      sortOrder: "descending",
      viewType: "groupedByThread",
      layout: "standard",
      folderPaneVisible: true,
      messagePaneVisible: true,
      displayedFolder,
    };
    await testIt({ displayedFolder }, expected);

    // Test ascending sort.
    expected.sortOrder = "ascending";
    for (const value of ["date", "subject", "author"]) {
      expected.sortType = value;
      await testIt(expected);
    }

    // Test descending sort.
    expected.sortOrder = "descending";
    for (const value of ["author", "subject", "date"]) {
      expected.sortType = value;
      await testIt(expected);
    }

    // Test visibilities.
    for (const key of ["folderPaneVisible", "messagePaneVisible"]) {
      for (const value of [false, true]) {
        expected[key] = value;
        await testIt(expected);
      }
    }

    // Test layouts.
    for (const value of ["wide", "vertical", "standard"]) {
      expected.layout = value;
      await testIt(expected);
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
      expected.viewType = viewType;
      await testIt(expected);
    }

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
