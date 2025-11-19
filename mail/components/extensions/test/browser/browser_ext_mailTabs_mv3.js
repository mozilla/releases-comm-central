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
  await createSubfolder(gRootFolder, "test4");
  await createSubfolder(gRootFolder, "test5");
  await createSubfolder(gRootFolder, "test6");
  await createSubfolder(gRootFolder, "test7");
  gSubFolders = {};
  for (const folder of gRootFolder.subFolders) {
    gSubFolders[folder.name] = folder;
  }
  await createMessages(gSubFolders.test1, 10);
  await createMessages(gSubFolders.test2, 50);

  gDefaultTabmail = document.getElementById("tabmail");
  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
  await ensure_table_view(document);

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
    gDefaultTabmail.currentTabInfo.folder = gSubFolders.test1;
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
    const messages = [...gSubFolders.test1.messages].slice(0, 5);
    gDefaultTabmail.currentAbout3Pane.threadTree.selectedIndices = messages.map(
      m => gDefaultTabmail.currentAbout3Pane.gDBView.findIndexOfMsgHdr(m, false)
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
    const { rootFolder: accRootFolder } = await browser.accounts.get(
      accountId,
      true
    );
    const folder = accRootFolder.subFolders[0];

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
      gDefaultTabmail.currentAbout3Pane.gViewWrapper;

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
  extension.sendMessage(gAccount.key);
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
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
      "Number of listed messages should be correct"
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
    const about3Pane = win.document.getElementById("tabmail").currentAbout3Pane;
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
    const about3Pane = win.document.getElementById("tabmail").currentAbout3Pane;
    const menu = about3Pane.document.getElementById("mailContext");
    await closeMenuPopup(menu);
    extension.sendMessage();
  });

  gDefaultTabmail.openTab("mail3PaneTab", { folderURI: gSubFolders.test1.URI });
  await BrowserTestUtils.waitForEvent(
    gDefaultTabmail.currentTabInfo.chromeBrowser,
    "folderURIChanged",
    false,
    event => event.detail == gSubFolders.test1.URI
  );

  await extension.startup();
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  gDefaultTabmail.closeOtherTabs(0);
  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
});

add_task(async function test_getSelectedFoldersWithOpenContextMenu() {
  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
  const about3Pane = gDefaultTabmail.currentAbout3Pane;

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

    async function testSelection(description, selectedPaths, shownPaths) {
      await window.sendMessage("selectNativeFolders", selectedPaths);

      // Register a listener for the menus.onShown event.
      const { resolve: resolveOnShownPromise, promise: onShownPromise } =
        Promise.withResolvers();
      const onShownListener = info => {
        resolveOnShownPromise(info);
      };
      await browser.menus.onShown.addListener(onShownListener);

      // Verify getSelectedFolders() before the context menu is opened.
      window.assertDeepEqual(
        selectedPaths,
        (await browser.mailTabs.getSelectedFolders()).map(
          folder => folder.path
        ),
        `Selected folders should be correct (${description})`,
        { strict: true }
      );

      // Open the context menu on /test1.
      await window.sendMessage("open folderPaneContext menu", "/test1");

      // Verify getSelectedFolders() while the context menu is open.
      window.assertDeepEqual(
        selectedPaths,
        (await browser.mailTabs.getSelectedFolders()).map(
          folder => folder.path
        ),
        `Selected folders should still be correct after a context popup had been opened  (${description})`,
        { strict: true }
      );

      // Close the context menu on /test1.
      await window.sendMessage("close folderPaneContext menu");

      // Verify getSelectedFolders() after the context menu has been closed.
      window.assertDeepEqual(
        selectedPaths,
        (await browser.mailTabs.getSelectedFolders()).map(
          folder => folder.path
        ),
        `Selected folders should still be correct after a context popup had been closed (${description})`,
        { strict: true }
      );

      // Verify the selection reported to the menus API.
      const onShownInfo = await onShownPromise;
      await browser.menus.onShown.removeListener(onShownListener);
      window.assertDeepEqual(
        shownPaths,
        onShownInfo.selectedFolders.map(folder => folder.path),
        `Folders reported in onShown should be correct (${description})`,
        { strict: true }
      );
    }

    // We are going to open the context menu on folder /test1. Select other
    // folders. In total two ranges.
    await testSelection(
      "Context menu open on unselected folder",
      ["/test3", "/test4", "/test6", "/test7"],
      ["/test1"]
    );

    // We are going to open the context menu on folder /test1. Select other
    // folders and /test1. In total three ranges.
    await testSelection(
      "Context menu open on selected folder",
      ["/test1", "/test3", "/test4", "/test6", "/test7"],
      ["/test1", "/test3", "/test4", "/test6", "/test7"]
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

  const folderMap = new Map([
    ["/", gRootFolder],
    ["/test1", gSubFolders.test1],
    ["/test2", gSubFolders.test2],
    ["/test3", gSubFolders.test3],
    ["/test4", gSubFolders.test4],
    ["/test5", gSubFolders.test5],
    ["/test6", gSubFolders.test6],
    ["/test7", gSubFolders.test7],
  ]);

  extension.onMessage("selectNativeFolders", async folderPaths => {
    const folderTree = about3Pane.document.getElementById("folderTree");
    const rows = folderPaths.map(f =>
      about3Pane.folderPane.getRowForFolder(folderMap.get(f))
    );
    const selectPromise = new Promise(resolve =>
      folderTree.addEventListener("select", resolve, { once: true })
    );
    setTimeout(() => {
      folderTree.swapSelection(rows);
    });
    await selectPromise;
    await new Promise(resolve => executeSoon(resolve));
    extension.sendMessage();
  });

  extension.onMessage("open folderPaneContext menu", async folderPath => {
    const menu = about3Pane.document.getElementById("folderPaneContext");
    // Open the context menu of the folder pane.
    await openMenuPopup(
      menu,
      about3Pane.folderPane.getRowForFolder(folderMap.get(folderPath)),
      {
        type: "contextmenu",
      }
    );
    extension.sendMessage();
  });

  extension.onMessage("close folderPaneContext menu", async () => {
    const menu = about3Pane.document.getElementById("folderPaneContext");
    await closeMenuPopup(menu);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("mailTabs");
  await extension.unload();

  gDefaultTabmail.currentTabInfo.folder = gRootFolder;
});
