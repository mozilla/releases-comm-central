/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { NNTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/NNTPServer.sys.mjs"
);
const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const servers = ["server", "nntpRoot", "rssRoot"];
const realFolders = ["plain", "inbox", "junk", "trash", "rssFeed"];

const folderPaneContextData = {
  "folderPaneContext-getMessages": [...servers, "nntpGroup", "rssFeed"],
  "folderPaneContext-pauseAllUpdates": ["rssRoot"],
  "folderPaneContext-pauseUpdates": ["rssFeed"],
  "folderPaneContext-openNewTab": true,
  "folderPaneContext-openNewWindow": true,
  "folderPaneContext-searchMessages": [...servers, ...realFolders, "nntpGroup"],
  "folderPaneContext-subscribe": ["nntpRoot", "rssRoot", "rssFeed"],
  "folderPaneContext-newsUnsubscribe": ["nntpGroup"],
  "folderPaneContext-new": ["server", "rssRoot", ...realFolders],
  "folderPaneContext-remove": [
    "plain",
    "junk",
    "virtual",
    "nntpGroup",
    "rssFeed",
  ],
  "folderPaneContext-rename": ["plain", "junk", "virtual", "rssFeed"],
  "folderPaneContext-moveMenu": ["plain", "virtual", "rssFeed"],
  "folderPaneContext-copyMenu": ["plain", "rssFeed"],
  "folderPaneContext-compact": [...servers, ...realFolders],
  "folderPaneContext-markMailFolderAllRead": [...realFolders, "virtual"],
  "folderPaneContext-markNewsgroupAllRead": ["nntpGroup"],
  "folderPaneContext-emptyTrash": ["trash"],
  "folderPaneContext-emptyJunk": ["junk"],
  "folderPaneContext-sendUnsentMessages": [],
  "folderPaneContext-favoriteFolder": [...realFolders, "virtual", "nntpGroup"],
  "folderPaneContext-properties": [...realFolders, "virtual", "nntpGroup"],
  "folderPaneContext-markAllFoldersRead": [...servers],
  "folderPaneContext-settings": [...servers],
  "folderPaneContext-manageTags": ["tags"],
};

let nntpServer;

const generator = new MessageGenerator();
const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const context = about3Pane.document.getElementById("folderPaneContext");
let account;
let rootFolder,
  plainFolder,
  inboxFolder,
  inboxSubfolder,
  junkFolder,
  trashFolder,
  virtualFolder;
let nntpRootFolder, nntpGroupFolder;
let rssRootFolder, rssFeedFolder, rssTrashFolder;
let tagsFolder;

add_setup(async function () {
  account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "pop3"
  );
  MailServices.accounts.localFoldersServer = account.incomingServer;
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  plainFolder = rootFolder
    .createLocalSubfolder("folderPaneContextFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  inboxFolder = rootFolder
    .createLocalSubfolder("folderPaneContextInbox")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  inboxFolder.setFlag(Ci.nsMsgFolderFlags.Inbox);
  inboxSubfolder = inboxFolder
    .createLocalSubfolder("folderPaneContextInboxSubfolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  junkFolder = rootFolder
    .createLocalSubfolder("folderPaneContextJunk")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  junkFolder.setFlag(Ci.nsMsgFolderFlags.Junk);
  trashFolder = rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Trash)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  virtualFolder = rootFolder
    .createLocalSubfolder("folderPaneContextVirtual")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  virtualFolder.setFlag(Ci.nsMsgFolderFlags.Virtual);
  const msgDatabase = virtualFolder.msgDatabase;
  const folderInfo = msgDatabase.dBFolderInfo;
  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setCharProperty("searchFolderUri", plainFolder.URI);

  nntpServer = new NNTPServer();
  nntpServer.addGroup("folder.pane.context.newsgroup");
  nntpServer.addMessages(
    "folder.pane.context.newsgroup",
    generator.makeMessages({ count: 8 })
  );
  const nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "localhost",
    "nntp"
  );
  nntpAccount.incomingServer.port = nntpServer.port;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("folder.pane.context.newsgroup", null);
  nntpGroupFolder = nntpRootFolder.getChildNamed(
    "folder.pane.context.newsgroup"
  );

  const rssAccount = FeedUtils.createRssAccount("rss");
  rssRootFolder = rssAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rss.xml?folderPaneContext",
    rssRootFolder,
    null
  );
  await TestUtils.waitForCondition(() => rssRootFolder.subFolders.length == 2);
  rssFeedFolder = rssRootFolder.getChildNamed("Test Feed");
  rssTrashFolder = rssRootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Trash)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  about3Pane.folderPane.activeModes = ["all", "tags"];
  tagsFolder =
    about3Pane.folderPane._modes.tags._smartMailbox.tagsFolder.subFolders[0];

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    MailServices.accounts.removeAccount(rssAccount, false);
    about3Pane.folderPane.activeModes = ["all"];
    Services.prefs.clearUserPref("mail.tabs.loadInBackground");
  });
});

/**
 * Tests that the correct menu items are visible.
 */
add_task(async function testShownItems() {
  // Check the menu has the right items for the selected folder.
  leftClickOn(rootFolder);
  await rightClickOn(rootFolder, "server");
  leftClickOn(plainFolder);
  await rightClickOn(plainFolder, "plain");
  leftClickOn(inboxFolder);
  await rightClickOn(inboxFolder, "inbox");
  leftClickOn(junkFolder);
  await rightClickOn(junkFolder, "junk");
  leftClickOn(trashFolder);
  await rightClickOn(trashFolder, "trash");
  leftClickOn(virtualFolder);
  await rightClickOn(virtualFolder, "virtual");
  leftClickOn(nntpRootFolder);
  await rightClickOn(nntpRootFolder, "nntpRoot");
  leftClickOn(nntpGroupFolder);
  await rightClickOn(nntpGroupFolder, "nntpGroup");
  leftClickOn(rssRootFolder);
  await rightClickOn(rssRootFolder, "rssRoot");
  leftClickOn(rssFeedFolder);
  await rightClickOn(rssFeedFolder, "rssFeed");
  leftClickOn(tagsFolder);
  await rightClickOn(tagsFolder, "tags");

  // Check the menu has the right items when the selected folder is not the
  // folder that was right-clicked on.
  await rightClickOn(rootFolder, "server");
  leftClickOn(rootFolder);
  await rightClickOn(plainFolder, "plain");
  await rightClickOn(inboxFolder, "inbox");
  await rightClickOn(junkFolder, "junk");
  await rightClickOn(trashFolder, "trash");
  await rightClickOn(virtualFolder, "virtual");
  await rightClickOn(rssRootFolder, "rssRoot");
  await rightClickOn(rssFeedFolder, "rssFeed");
  await rightClickOn(tagsFolder, "tags");
});

/**
 * Tests "Open in New Tab" and "Open in New Window".
 */
add_task(async function testOpen() {
  async function promiseTabOpenAndReady() {
    const event = await BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabOpen"
    );
    // Wait for about:3pane and the folder to load.
    await BrowserTestUtils.waitForEvent(
      event.detail.tabInfo.chromeBrowser,
      "folderURIChanged"
    );
    return event.detail.tabInfo;
  }

  async function promiseWindowOpenAndReady() {
    const win = await BrowserTestUtils.domWindowOpenedAndLoaded(
      undefined,
      win => win.location.href == "chrome://messenger/content/messenger.xhtml"
    );
    // Wait for about:3pane and the folder to load.
    await TestUtils.topicObserved("mail-idle-startup-tasks-finished");
    return win;
  }

  // Open in a new background tab.

  Services.prefs.setBoolPref("mail.tabs.loadInBackground", true);

  leftClickOn(plainFolder);
  let tabPromise = promiseTabOpenAndReady();
  await rightClickAndActivate(plainFolder, "folderPaneContext-openNewTab");
  let tabInfo = await tabPromise;

  Assert.equal(tabInfo.mode.name, "mail3PaneTab", "tab should be a 3-pane tab");
  Assert.notEqual(
    tabmail.currentTabInfo,
    tabInfo,
    "tab should open in the background"
  );
  Assert.equal(
    tabInfo.folder,
    plainFolder,
    "tab should load the correct folder"
  );
  tabmail.closeTab(tabInfo);

  // Open in a new foreground tab by pressing shift.

  leftClickOn(inboxFolder);
  tabPromise = promiseTabOpenAndReady();
  await rightClickAndActivate(inboxFolder, "folderPaneContext-openNewTab", {
    shiftKey: true,
  });
  tabInfo = await tabPromise;

  Assert.equal(tabInfo.mode.name, "mail3PaneTab", "tab should be a 3-pane tab");
  Assert.equal(
    tabmail.currentTabInfo,
    tabInfo,
    "tab should open in the foreground"
  );
  Assert.equal(
    tabInfo.folder,
    inboxFolder,
    "tab should load the correct folder"
  );
  tabmail.closeTab(tabInfo);

  // Open in a new foreground tab by preference.

  Services.prefs.setBoolPref("mail.tabs.loadInBackground", false);

  leftClickOn(inboxFolder);
  tabPromise = promiseTabOpenAndReady();
  await rightClickAndActivate(inboxFolder, "folderPaneContext-openNewTab");
  tabInfo = await tabPromise;

  Assert.equal(tabInfo.mode.name, "mail3PaneTab", "tab should be a 3-pane tab");
  Assert.equal(
    tabmail.currentTabInfo,
    tabInfo,
    "tab should open in the foreground"
  );
  Assert.equal(
    tabInfo.folder,
    inboxFolder,
    "tab should load the correct folder"
  );
  tabmail.closeTab(tabInfo);

  // Open in a new background tab by pressing shift.

  leftClickOn(plainFolder);
  tabPromise = promiseTabOpenAndReady();
  await rightClickAndActivate(plainFolder, "folderPaneContext-openNewTab", {
    shiftKey: true,
  });
  tabInfo = await tabPromise;

  Assert.equal(tabInfo.mode.name, "mail3PaneTab", "tab should be a 3-pane tab");
  Assert.notEqual(
    tabmail.currentTabInfo,
    tabInfo,
    "tab should open in the background"
  );
  Assert.equal(
    tabInfo.folder,
    plainFolder,
    "tab should load the correct folder"
  );
  tabmail.closeTab(tabInfo);

  // Open in a new window.

  leftClickOn(trashFolder);
  const winPromise = promiseWindowOpenAndReady();
  await rightClickAndActivate(trashFolder, "folderPaneContext-openNewWindow");
  const win = await winPromise;
  const winTabmail = win.document.getElementById("tabmail");

  Assert.equal(winTabmail.tabInfo.length, 1, "new window should have 1 tab");
  Assert.equal(
    winTabmail.currentTabInfo.mode.name,
    "mail3PaneTab",
    "tab should be a 3-pane tab"
  );
  Assert.equal(
    winTabmail.currentTabInfo.folder,
    trashFolder,
    "tab should load the correct folder"
  );
  await BrowserTestUtils.closeWindow(win);

  await SimpleTest.promiseFocus(window);
});

/**
 * Tests "New Folder", "Rename" and "Delete".
 */
add_task(async function testNewRenameDelete() {
  const newFolderPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/newFolderDialog.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const nameInput = doc.getElementById("name");
        const parentInput = doc.getElementById("msgNewFolderPicker");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        Assert.equal(doc.activeElement, nameInput);
        Assert.equal(nameInput.value, "");
        Assert.equal(parentInput.value, plainFolder.URI);
        Assert.ok(acceptButton.disabled);

        EventUtils.sendString("folderPaneContextNew", win);
        Assert.ok(!acceptButton.disabled);

        EventUtils.synthesizeMouseAtCenter(parentInput, {}, win);
        await BrowserTestUtils.waitForPopupEvent(
          parentInput.menupopup,
          "shown"
        );
        const rootFolderMenu = [...parentInput.menupopup.children].find(
          m => m._folder == rootFolder
        );
        rootFolderMenu.openMenu(true);
        await BrowserTestUtils.waitForPopupEvent(
          rootFolderMenu.menupopup,
          "shown"
        );
        rootFolderMenu.menupopup.activateItem(
          rootFolderMenu.menupopup.firstElementChild
        );
        await BrowserTestUtils.waitForPopupEvent(
          parentInput.menupopup,
          "hidden"
        );

        acceptButton.click();
      },
    }
  );
  leftClickOn(plainFolder);
  await rightClickAndActivate(plainFolder, "folderPaneContext-new");
  await newFolderPromise;

  const newFolder = rootFolder.getChildNamed("folderPaneContextNew");
  Assert.ok(newFolder);
  await TestUtils.waitForCondition(
    () => about3Pane.folderPane.getRowForFolder(newFolder, "all"),
    "waiting for folder to appear in the folder tree"
  );

  const renameFolderPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/renameFolderDialog.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const nameInput = doc.getElementById("name");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        Assert.equal(doc.activeElement, nameInput);
        Assert.equal(nameInput.value, "folderPaneContextNew");
        Assert.ok(!acceptButton.disabled);

        EventUtils.synthesizeKey("a", { accelKey: true }, win);
        EventUtils.synthesizeKey("VK_BACK_SPACE", {}, win);
        Assert.equal(nameInput.value, "");
        Assert.ok(acceptButton.disabled);

        EventUtils.sendString("folderPaneContextRenamed", win);
        acceptButton.click();
      },
    }
  );
  leftClickOn(newFolder);
  await rightClickAndActivate(newFolder, "folderPaneContext-rename");
  await renameFolderPromise;

  const renamedFolder = rootFolder.getChildNamed("folderPaneContextRenamed");
  Assert.ok(renamedFolder);
  await TestUtils.waitForCondition(
    () => about3Pane.folderPane.getRowForFolder(renamedFolder, "all"),
    "waiting for folder to be renamed in the folder tree"
  );
  Assert.ok(!about3Pane.folderPane.getRowForFolder(newFolder));

  leftClickOn(renamedFolder);
  BrowserTestUtils.promiseAlertDialog("accept");
  await rightClickAndActivate(renamedFolder, "folderPaneContext-remove");

  await TestUtils.waitForCondition(
    () => !about3Pane.folderPane.getRowForFolder(renamedFolder),
    "waiting for folder to disappear from the folder tree"
  );
});

/**
 * Tests "Properties" (folders) and "Settings" (servers).
 */
add_task(async function testPropertiesSettings() {
  const folderPropsPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/folderProps.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const nameInput = doc.getElementById("name");
        const locationInput = doc.getElementById("location");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        Assert.equal(nameInput.value, "folderPaneContextFolder");
        Assert.equal(locationInput.value, plainFolder.folderURL);

        acceptButton.click();
      },
    }
  );
  leftClickOn(plainFolder);
  await rightClickAndActivate(plainFolder, "folderPaneContext-properties");
  await folderPropsPromise;

  const virtualPropsPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const nameInput = doc.getElementById("name");
        const existingNameInput = doc.getElementById("existingName");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        Assert.ok(BrowserTestUtils.isHidden(nameInput));
        Assert.ok(BrowserTestUtils.isVisible(existingNameInput));
        Assert.equal(
          existingNameInput.value,
          `folderPaneContextVirtual on ${account.incomingServer.prettyName}`
        );

        acceptButton.click();
      },
    }
  );
  leftClickOn(virtualFolder);
  await rightClickAndActivate(virtualFolder, "folderPaneContext-properties");
  await virtualPropsPromise;

  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  leftClickOn(rootFolder);
  await rightClickAndActivate(rootFolder, "folderPaneContext-settings");
  const {
    detail: { tabInfo },
  } = await tabPromise;
  const browser = tabInfo.browser;

  Assert.equal(
    tabmail.currentTabInfo,
    tabInfo,
    "tab should open in the foreground"
  );
  Assert.equal(tabInfo.mode.name, "contentTab", "tab should be a content tab");
  if (browser.docShell.isLoadingDocument) {
    await BrowserTestUtils.browserLoaded(browser);
  }
  Assert.equal(browser.currentURI.spec, "about:accountsettings");
  await new Promise(resolve => setTimeout(resolve));
  Assert.equal(
    browser.contentDocument.querySelector("#accounttree li.selected").id,
    account.key,
    "account should be selected"
  );
  tabmail.closeTab(tabInfo);
});

/**
 * Tests "Mark Folder Read" and "Mark All Folders Read".
 */
add_task(async function testMarkAllRead() {
  about3Pane.folderPane.activeModes = ["all", "smart", "tags"];

  function addMessages(folder, count) {
    folder.addMessageBatch(
      generator
        .makeMessages({ count })
        .map(message => message.toMessageString())
    );
  }

  function checkUnreadCount(folder, expectedCount) {
    info(`Checking unread count for ${folder.URI}`);
    const unreadBadge = about3Pane.folderPane
      .getRowForFolder(folder)
      .querySelector(".unread-count");
    Assert.equal(
      folder.getNumUnread(false),
      expectedCount,
      `${folder.name} unread count`
    );
    if (expectedCount) {
      Assert.ok(
        BrowserTestUtils.isVisible(unreadBadge),
        "unread count badge should be visible"
      );
      Assert.equal(
        unreadBadge.textContent,
        expectedCount,
        "unread count badge label"
      );
    } else {
      Assert.ok(
        BrowserTestUtils.isHidden(unreadBadge),
        "unread count badge should be hidden"
      );
    }
  }

  addMessages(inboxFolder, 3);
  addMessages(inboxSubfolder, 7);
  addMessages(plainFolder, 4);

  // Mark the inbox as read.

  checkUnreadCount(inboxFolder, 3);
  checkUnreadCount(inboxSubfolder, 7);
  await rightClickAndActivate(
    inboxFolder,
    "folderPaneContext-markMailFolderAllRead"
  );
  checkUnreadCount(inboxFolder, 0);
  // Check the other folders were not marked as read.
  checkUnreadCount(inboxSubfolder, 7);
  checkUnreadCount(plainFolder, 4);

  // Mark a virtual folder as read.

  checkUnreadCount(virtualFolder, 4);
  await rightClickAndActivate(
    virtualFolder,
    "folderPaneContext-markMailFolderAllRead"
  );
  checkUnreadCount(virtualFolder, 0);
  checkUnreadCount(plainFolder, 0);

  // Mark all folders in the account as read.

  addMessages(inboxSubfolder, 1);
  addMessages(plainFolder, 5);

  const promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await rightClickAndActivate(
    rootFolder,
    "folderPaneContext-markAllFoldersRead"
  );
  await promptPromise;
  checkUnreadCount(inboxFolder, 0);
  checkUnreadCount(inboxSubfolder, 0);
  checkUnreadCount(plainFolder, 0);

  // Mark a newsgroup as read.

  checkUnreadCount(nntpGroupFolder, 8);
  await rightClickAndActivate(
    nntpGroupFolder,
    "folderPaneContext-markNewsgroupAllRead"
  );
  checkUnreadCount(nntpGroupFolder, 0);

  // Mark an RSS feed as read.

  checkUnreadCount(rssFeedFolder, 1);
  await rightClickAndActivate(
    rssFeedFolder,
    "folderPaneContext-markMailFolderAllRead"
  );
  checkUnreadCount(rssFeedFolder, 0);

  // Mark the unified inbox as read.

  const smartServer = getSmartServer();
  const smartInboxFolder = smartServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  addMessages(inboxFolder, 9);
  addMessages(inboxSubfolder, 6);
  addMessages(plainFolder, 2);
  await TestUtils.waitForTick();

  checkUnreadCount(smartInboxFolder, 15);
  await rightClickAndActivate(
    smartInboxFolder,
    "folderPaneContext-markMailFolderAllRead"
  );
  checkUnreadCount(smartInboxFolder, 0);
  checkUnreadCount(inboxFolder, 0);
  checkUnreadCount(inboxSubfolder, 0);
  checkUnreadCount(plainFolder, 2);
});

/**
 * Tests "Empty Trash" and "Empty Junk".
 * Note that this test has several commented-out assertions about the number
 * of messages in the smart trash folder. This folder doesn't get notified
 * properly due to the weird way we empty trash folders.
 */
add_task(async function testEmpty() {
  about3Pane.folderPane.activeModes = ["all", "smart"];

  const smartServer = getSmartServer();
  const smartTrashFolder = smartServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Trash
  );
  const smartJunkFolder = smartServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Junk
  );

  // Add some messages to the test folders. Different quantities of messages
  // are used to aid debugging.

  trashFolder.addMessageBatch(
    generator
      .makeMessages({ count: 8 })
      .map(message => message.toMessageString())
  );
  junkFolder.addMessageBatch(
    generator
      .makeMessages({ count: 3 })
      .map(message => message.toMessageString())
  );

  // Test emptying a real trash folder.

  Assert.equal(
    trashFolder.getTotalMessages(false),
    8,
    "trash folder should have the right message count before emptying"
  );
  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await rightClickAndActivate(trashFolder, "folderPaneContext-emptyTrash");
  await promptPromise;
  Assert.equal(
    trashFolder.getTotalMessages(false),
    0,
    "trash folder should be emptied"
  );

  // Test emptying a real junk folder.

  Assert.equal(
    junkFolder.getTotalMessages(false),
    3,
    "junk folder should have the right message count before emptying"
  );
  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await rightClickAndActivate(junkFolder, "folderPaneContext-emptyJunk");
  await promptPromise;
  Assert.equal(
    junkFolder.getTotalMessages(false),
    0,
    "junk folder should be emptied"
  );

  // Add some new messages to the test folders.

  trashFolder.addMessageBatch(
    generator
      .makeMessages({ count: 4 })
      .map(message => message.toMessageString())
  );
  rssTrashFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  junkFolder.addMessageBatch(
    generator
      .makeMessages({ count: 6 })
      .map(message => message.toMessageString())
  );

  // Test emptying the smart trash folder. All trash folders should be emptied.

  // leftClickOn(smartTrashFolder);
  // Assert.equal(
  //   smartTrashFolder.getTotalMessages(false),
  //   9,
  //   "smart trash folder should have the right message count before emptying"
  // );
  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await rightClickAndActivate(smartTrashFolder, "folderPaneContext-emptyTrash");
  await promptPromise;
  Assert.deepEqual(
    VirtualFolderHelper.wrapVirtualFolder(smartTrashFolder).searchFolders,
    [trashFolder, rssTrashFolder],
    "smart trash folder should still search the real trash folders"
  );
  // Assert.equal(
  //   smartTrashFolder.getTotalMessages(false),
  //   0,
  //   "smart trash folder should be emptied"
  // );
  Assert.equal(
    trashFolder.getTotalMessages(false),
    0,
    "trash folder should be emptied"
  );
  Assert.equal(
    rssTrashFolder.getTotalMessages(false),
    0,
    "RSS trash folder should be emptied"
  );
  // Assert.equal(about3Pane.gDBView.rowCount, 0, "view should have no rows");
  // Assert.equal(
  //   about3Pane.threadTree.table.body.rows.length,
  //   0,
  //   "no rows should be displayed"
  // );

  // Test emptying the smart junk folder. All junk folders should be emptied.

  leftClickOn(smartJunkFolder);
  Assert.equal(
    smartJunkFolder.getTotalMessages(false),
    6,
    "smart junk folder should have the right message count before emptying"
  );
  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await rightClickAndActivate(smartJunkFolder, "folderPaneContext-emptyJunk");
  await promptPromise;
  Assert.deepEqual(
    VirtualFolderHelper.wrapVirtualFolder(smartJunkFolder).searchFolders,
    [junkFolder],
    "smart junk folder should still search the real junk folder"
  );
  Assert.equal(
    smartJunkFolder.getTotalMessages(false),
    0,
    "smart junk folder should be emptied"
  );
  Assert.equal(
    junkFolder.getTotalMessages(false),
    0,
    "junk folder should be emptied"
  );
  Assert.equal(about3Pane.gDBView.rowCount, 0, "view should have no rows");
  Assert.equal(
    about3Pane.threadTree.table.body.rows.length,
    0,
    "no rows should be displayed"
  );
});

function leftClickOn(folder) {
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(folder).querySelector(".name"),
    {},
    about3Pane
  );
}

async function rightClickOn(folder, mode) {
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(folder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  checkMenuitems(context, mode);
  context.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(context, "hidden");
}

function checkMenuitems(menu, mode) {
  if (!mode) {
    // Menu should not be shown.
    Assert.equal(menu.state, "closed");
    return;
  }

  Assert.notEqual(menu.state, "closed");

  const expectedItems = [];
  for (const [id, modes] of Object.entries(folderPaneContextData)) {
    if (modes === true || modes.includes(mode)) {
      expectedItems.push(id);
    }
  }

  const actualItems = [];
  for (const item of menu.children) {
    if (["menu", "menuitem"].includes(item.localName) && !item.hidden) {
      actualItems.push(item.id);
    }
  }

  const notFoundItems = expectedItems.filter(i => !actualItems.includes(i));
  if (notFoundItems.length) {
    Assert.report(
      true,
      undefined,
      undefined,
      "items expected but not found: " + notFoundItems.join(", ")
    );
  }

  const unexpectedItems = actualItems.filter(i => !expectedItems.includes(i));
  if (unexpectedItems.length) {
    Assert.report(
      true,
      undefined,
      undefined,
      "items found but not expected: " + unexpectedItems.join(", ")
    );
  }

  if (notFoundItems.length + unexpectedItems.length == 0) {
    Assert.report(false, undefined, undefined, `all ${mode} items are correct`);
  }
}

async function rightClickAndActivate(folder, idToActivate, activateOptions) {
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(folder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  context.activateItem(
    about3Pane.document.getElementById(idToActivate),
    activateOptions
  );
  await BrowserTestUtils.waitForPopupEvent(context, "hidden");
}
