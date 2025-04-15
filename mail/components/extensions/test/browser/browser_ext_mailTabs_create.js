/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ensure_cards_view, ensure_table_view } = ChromeUtils.importESModule(
  "resource://testing-common/MailViewHelpers.sys.mjs"
);

let gAccount, gRootFolder, gSubFolders, gDefaultTabmail;

add_setup(async () => {
  gAccount = createAccount();
  gRootFolder = gAccount.incomingServer.rootFolder;
  await createSubfolder(gRootFolder, "test1");
  await createSubfolder(gRootFolder, "test2");
  gSubFolders = {};
  for (const folder of gRootFolder.subFolders) {
    gSubFolders[folder.name] = folder;
  }
  await createMessages(gSubFolders.test1, 10);
  await createMessages(gSubFolders.test2, 50);

  gDefaultTabmail = document.getElementById("tabmail");
  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
  gDefaultTabmail.currentAbout3Pane.displayFolder(gSubFolders.test1.URI);
  await ensure_table_view(document);

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);
  registerCleanupFunction(async () => {
    await ensure_cards_view(document);
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
      "/" + (gDefaultTabmail.currentTabInfo.folder.URI || "").split("/").pop(),
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
      gDefaultTabmail.currentAbout3Pane.gViewWrapper;

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
      gDefaultTabmail.currentAbout3Pane.gViewWrapper;

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
  extension.sendMessage(gAccount.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
});

add_task(async function test_create_mv3() {
  async function background() {
    async function testIt(test, expected = test) {
      const mailTab = await browser.mailTabs.create(test);
      window.assertDeepEqual(expected, mailTab);
      await window.sendMessage("checkDisplayedFolder", expected);
      await browser.tabs.remove(mailTab.tabId);
    }

    const [accountId] = await window.waitForMessage();
    const { rootFolder: accRoot } = await browser.accounts.get(accountId, true);
    const displayedFolder = accRoot.subFolders[0];
    delete displayedFolder.subFolders;

    const expected = {
      displayedFolder,
    };
    await testIt({ displayedFolderId: displayedFolder.id }, expected);
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

  extension.onMessage("checkDisplayedFolder", async expected => {
    Assert.equal(
      "/" + (gDefaultTabmail.currentTabInfo.folder.URI || "").split("/").pop(),
      expected.displayedFolder.path,
      "Should display the correct folder"
    );
    extension.sendMessage();
  });

  await check3PaneState(true, true);

  await extension.startup();
  extension.sendMessage(gAccount.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
});
