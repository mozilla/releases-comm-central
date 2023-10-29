/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");

const servers = ["server", "rssRoot"];
const realFolders = ["plain", "inbox", "junk", "trash", "rssFeed"];

const folderPaneContextData = {
  "folderPaneContext-getMessages": [...servers, "rssFeed"],
  "folderPaneContext-pauseAllUpdates": ["rssRoot"],
  "folderPaneContext-pauseUpdates": ["rssFeed"],
  "folderPaneContext-openNewTab": true,
  "folderPaneContext-openNewWindow": true,
  "folderPaneContext-searchMessages": [...servers, ...realFolders],
  "folderPaneContext-subscribe": ["rssRoot", "rssFeed"],
  "folderPaneContext-newsUnsubscribe": [],
  "folderPaneContext-new": [...servers, ...realFolders],
  "folderPaneContext-remove": ["plain", "junk", "virtual", "rssFeed"],
  "folderPaneContext-rename": ["plain", "junk", "virtual", "rssFeed"],
  "folderPaneContext-compact": [...servers, ...realFolders],
  "folderPaneContext-markMailFolderAllRead": [...realFolders, "virtual"],
  "folderPaneContext-markNewsgroupAllRead": [],
  "folderPaneContext-emptyTrash": ["trash"],
  "folderPaneContext-emptyJunk": ["junk"],
  "folderPaneContext-sendUnsentMessages": [],
  "folderPaneContext-favoriteFolder": [...realFolders, "virtual"],
  "folderPaneContext-properties": [...realFolders, "virtual"],
  "folderPaneContext-markAllFoldersRead": [...servers],
  "folderPaneContext-settings": [...servers],
  "folderPaneContext-manageTags": ["tags"],
  "folderPaneContext-moveMenu": ["plain", "virtual", "rssFeed"],
  "folderPaneContext-copyMenu": ["plain", "rssFeed"],
};

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const context = about3Pane.document.getElementById("folderPaneContext");
let account;
let rootFolder,
  plainFolder,
  inboxFolder,
  junkFolder,
  trashFolder,
  virtualFolder;
let rssRootFolder, rssFeedFolder;
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

  plainFolder = rootFolder.createLocalSubfolder("folderPaneContextFolder");
  inboxFolder = rootFolder.createLocalSubfolder("folderPaneContextInbox");
  inboxFolder.setFlag(Ci.nsMsgFolderFlags.Inbox);
  junkFolder = rootFolder.createLocalSubfolder("folderPaneContextJunk");
  junkFolder.setFlag(Ci.nsMsgFolderFlags.Junk);
  trashFolder = rootFolder.createLocalSubfolder("folderPaneContextTrash");
  trashFolder.setFlag(Ci.nsMsgFolderFlags.Trash);

  virtualFolder = rootFolder.createLocalSubfolder("folderPaneContextVirtual");
  virtualFolder.setFlag(Ci.nsMsgFolderFlags.Virtual);
  const msgDatabase = virtualFolder.msgDatabase;
  const folderInfo = msgDatabase.dBFolderInfo;
  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setCharProperty("searchFolderUri", plainFolder.URI);

  const rssAccount = FeedUtils.createRssAccount("rss");
  rssRootFolder = rssAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rss.xml?folderPaneContext",
    rssRootFolder,
    null
  );
  await TestUtils.waitForCondition(() => rssRootFolder.subFolders.length == 2);
  rssFeedFolder = rssRootFolder.getChildNamed("Test Feed");

  about3Pane.folderPane.activeModes = ["all", "tags"];
  tagsFolder = about3Pane.folderPane._modes.tags._tagsFolder.subFolders[0];

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
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

        Assert.ok(BrowserTestUtils.is_hidden(nameInput));
        Assert.ok(BrowserTestUtils.is_visible(existingNameInput));
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
