/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");

let servers = ["server", "rssRoot"];
let realFolders = ["plain", "inbox", "junk", "trash", "rssFeed"];

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
  "folderPaneContext-markMailFolderAllRead": [...realFolders],
  "folderPaneContext-markNewsgroupAllRead": [],
  "folderPaneContext-emptyTrash": ["trash"],
  "folderPaneContext-emptyJunk": ["junk"],
  "folderPaneContext-sendUnsentMessages": [],
  "folderPaneContext-favoriteFolder": [...realFolders, "virtual"],
  "folderPaneContext-properties": [...realFolders, "virtual"],
  "folderPaneContext-markAllFoldersRead": [...servers],
  "folderPaneContext-settings": [...servers],
  "folderPaneContext-manageTags": ["tags"],
};

let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let context = about3Pane.document.getElementById("folderPaneContext");
let rootFolder,
  plainFolder,
  inboxFolder,
  junkFolder,
  trashFolder,
  virtualFolder;
let rssRootFolder, rssFeedFolder;
let tagsFolder;

add_setup(async function () {
  let account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "pop3"
  );
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
  let msgDatabase = virtualFolder.msgDatabase;
  let folderInfo = msgDatabase.dBFolderInfo;
  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setCharProperty("searchFolderUri", plainFolder.URI);

  let rssAccount = FeedUtils.createRssAccount("rss");
  rssRootFolder = rssAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rss.xml",
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
  });
});

add_task(async function () {
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

function leftClickOn(folder) {
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(folder).querySelector(".name"),
    {},
    about3Pane
  );
}

async function rightClickOn(folder, mode) {
  let shownPromise = BrowserTestUtils.waitForEvent(context, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(folder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;
  checkMenuitems(context, mode);
  let hiddenPromise = BrowserTestUtils.waitForEvent(context, "popuphidden");
  context.hidePopup();
  await hiddenPromise;
}

function checkMenuitems(menu, mode) {
  if (!mode) {
    // Menu should not be shown.
    Assert.equal(menu.state, "closed");
    return;
  }

  Assert.notEqual(menu.state, "closed");

  let expectedItems = [];
  for (let [id, modes] of Object.entries(folderPaneContextData)) {
    if (modes === true || modes.includes(mode)) {
      expectedItems.push(id);
    }
  }

  let actualItems = [];
  for (let item of menu.children) {
    if (["menu", "menuitem"].includes(item.localName) && !item.hidden) {
      actualItems.push(item.id);
    }
  }

  let notFoundItems = expectedItems.filter(i => !actualItems.includes(i));
  if (notFoundItems.length) {
    Assert.report(
      true,
      undefined,
      undefined,
      "items expected but not found: " + notFoundItems.join(", ")
    );
  }

  let unexpectedItems = actualItems.filter(i => !expectedItems.includes(i));
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
