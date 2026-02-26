/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests various configurations of the folders menulist widget.
 */

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
const { GmailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);

const TEST_DOCUMENT_URL =
  getRootDirectory(gTestPath) + "files/folderMenuPopup.xhtml";

const tabmail = document.getElementById("tabmail");
let win, doc;

const gmailInboxMenu = {
  localName: "menu",
  label: "Inbox",
  children: [
    { localName: "menuitem", label: "Inbox" },
    { localName: "menuseparator" },
    { localName: "menuitem", label: "inbox subfolder" },
  ],
};
const gmailSentMenu = {
  localName: "menu",
  label: "Sent",
  children: [
    { localName: "menuitem", label: "Sent" },
    { localName: "menuseparator" },
    { localName: "menuitem", label: "sent subfolder" },
  ],
};
const gmailMenu = {
  localName: "menu",
  label: "Gmail",
  children: [
    { localName: "menuitem", label: "Gmail" },
    { localName: "menuseparator" },
    gmailInboxMenu,
    { localName: "menuitem", label: "Drafts" },
    gmailSentMenu,
    { localName: "menuitem", label: "All Mail" },
    { localName: "menuitem", label: "Spam" },
    { localName: "menuitem", label: "Trash" },
    { localName: "menuitem", label: "another folder" },
  ],
};
const pop3Menu = {
  localName: "menu",
  label: "POP3",
  children: [
    { localName: "menuitem", label: "POP3" },
    { localName: "menuseparator" },
    { localName: "menuitem", label: "Inbox" },
    { localName: "menuitem", label: "Trash" },
  ],
};
const feedsMenu = {
  localName: "menu",
  label: "Feeds",
  children: [
    { localName: "menuitem", label: "Feeds" },
    { localName: "menuseparator" },
    { localName: "menuitem", label: "Trash" },
    { localName: "menuitem", label: "Test Feed" },
  ],
};
const localFoldersMenu = {
  localName: "menu",
  label: "Local Folders",
  children: [
    { localName: "menuitem", label: "Local Folders" },
    { localName: "menuseparator" },
    { localName: "menuitem", label: "Inbox" },
    { localName: "menuitem", label: "Trash" },
    { localName: "menuitem", label: "Outbox" },
  ],
};
const localFoldersNoOutboxMenu = {
  localName: "menu",
  label: "Local Folders",
  children: [
    { localName: "menuitem", label: "Local Folders" },
    { localName: "menuseparator" },
    { localName: "menuitem", label: "Inbox" },
    { localName: "menuitem", label: "Trash" },
  ],
};

add_setup(async function () {
  const localAccount = MailServices.accounts.createLocalMailAccount();

  // Set up a Gmail IMAP account. We use a Gmail account for this test
  // because there is special handling that ordinary IMAP accounts don't have.

  const gmailServer = new GmailServer(this);
  gmailServer.daemon.createMailbox("INBOX/inbox subfolder", {
    subscribed: true,
  });
  gmailServer.daemon.createMailbox("[Gmail]/Sent Mail/sent subfolder", {
    subscribed: true,
  });
  gmailServer.daemon.createMailbox("another folder", { subscribed: true });

  const gmailAccount = MailServices.accounts.createAccount();
  gmailAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  gmailAccount.incomingServer.port = gmailServer.port;
  gmailAccount.incomingServer.password = "password";
  gmailAccount.incomingServer.prettyName = "Gmail";

  const gmailIdentity = MailServices.accounts.createIdentity();
  gmailIdentity.email = "imap@invalid";
  gmailAccount.addIdentity(gmailIdentity);
  gmailAccount.defaultIdentity = gmailIdentity;

  const gmailRootFolder = gmailAccount.incomingServer.rootFolder;
  gmailAccount.incomingServer.performExpand(window.msgWindow);
  await TestUtils.waitForCondition(
    () => gmailRootFolder.subFolders.length == 3,
    "waiting for folders to be created"
  );
  const gmailGmailFolder = gmailRootFolder.getChildNamed("[Gmail]");
  await TestUtils.waitForCondition(
    () => gmailGmailFolder.subFolders.length == 5,
    "waiting for [Gmail] subfolders to be created"
  );

  // Set up a deferred POP3 account.

  const pop3Account = MailServices.accounts.createAccount();
  pop3Account.incomingServer = MailServices.accounts
    .createIncomingServer("user", "test.test", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);
  pop3Account.incomingServer.prettyName = "POP3";

  pop3Account.incomingServer.deferredToAccount = localAccount.key;
  pop3Account.incomingServer.deferGetNewMail = true;

  // Set up a feeds account.

  const feedsAccount = FeedUtils.createRssAccount("Feeds");
  const feedsRootFolder = feedsAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rss.xml?feedBodyDisplay",
    feedsRootFolder,
    null
  );
  await TestUtils.waitForCondition(
    () => feedsRootFolder.subFolders.length == 2
  );

  const tab = tabmail.openTab("contentTab", { url: TEST_DOCUMENT_URL });
  await BrowserTestUtils.browserLoaded(tab.browser);
  await SimpleTest.promiseFocus(tab.browser);

  win = tab.browser.contentWindow;
  doc = tab.browser.contentDocument;

  registerCleanupFunction(async function () {
    tabmail.closeTab(tab);
    MailServices.accounts.removeAccount(gmailAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(feedsAccount, false);
    MailServices.accounts.removeAccount(localAccount, false);
  });
});

add_task(async function testNoMode() {
  const list = doc.getElementById("noMode");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [gmailMenu, pop3Menu, feedsMenu, localFoldersMenu]);
});

add_task(async function testFilingServers() {
  // As used in the Copies & Folders page in Account Settings.
  const list = doc.getElementById("filingServers");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    { localName: "menuitem", label: "Gmail" },
    { localName: "menuitem", label: "Feeds" },
    { localName: "menuitem", label: "Local Folders" },
  ]);
});

add_task(async function testFilingFolders() {
  // As used in the Copies & Folders page in Account Settings.
  const list = doc.getElementById("filingFolders");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    {
      localName: "menu",
      label: "Gmail",
      children: [
        gmailInboxMenu,
        { localName: "menuitem", label: "Drafts" },
        gmailSentMenu,
        { localName: "menuitem", label: "All Mail" },
        { localName: "menuitem", label: "Spam" },
        { localName: "menuitem", label: "Trash" },
        { localName: "menuitem", label: "another folder" },
      ],
    },
    {
      localName: "menu",
      label: "Feeds",
      children: [
        { localName: "menuitem", label: "Trash" },
        { localName: "menuitem", label: "Test Feed" },
      ],
    },
    {
      localName: "menu",
      label: "Local Folders",
      children: [
        { localName: "menuitem", label: "Inbox" },
        { localName: "menuitem", label: "Trash" },
      ],
    },
  ]);
});

add_task(async function testFilingServersAndFolders() {
  // As used in the filters dialog.
  const list = doc.getElementById("filingServersAndFolders");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [gmailMenu, feedsMenu, localFoldersNoOutboxMenu]);
});

add_task(async function testFilingSpecials() {
  // As used in the "move/copy to" menus.
  const list = doc.getElementById("filingSpecials");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    { localName: "menu", label: "Recent Destinations", children: [] },
    { localName: "menu", label: "Favorites", children: [] },
    { localName: "menuseparator" },
    gmailMenu,
    feedsMenu,
    localFoldersNoOutboxMenu,
    // TODO: Add the most-recently-used folder.
    // TODO: Test with some recent destinations and favourite folders.
  ]);
});

add_task(async function testSearchServersAndFolders() {
  // As used in the search dialog.
  const list = doc.getElementById("searchServersAndFolders");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [gmailMenu, feedsMenu, localFoldersMenu]);
});

add_task(async function testGetMail() {
  const list = doc.getElementById("getMail");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    { localName: "menuitem", label: "Static Item" },
    { localName: "menuseparator" },
    { localName: "menuitem", label: "Gmail" },
    { localName: "menuitem", label: "POP3" },
    { localName: "menuitem", label: "Feeds" },
  ]);
});

add_task(async function testNewFolder() {
  // As used in the new folder dialog.
  const list = doc.getElementById("newFolder");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [gmailMenu, feedsMenu, localFoldersNoOutboxMenu]);
});

add_task(async function testSubscribe() {
  // As used in the subscribe dialog.
  const list = doc.getElementById("subscribe");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    {
      localName: "menuitem",
      label: "Gmail",
    },
  ]);
});

add_task(async function testDeferred() {
  // As used in the POP3 account settings.
  const list = doc.getElementById("deferred");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    {
      localName: "menuitem",
      label: "Global Inbox (Local Folders)",
    },
    { localName: "menuitem", label: "Feeds" },
  ]);
});

add_task(async function testNotDeferred() {
  // As used in the folder location toolbar item.
  const list = doc.getElementById("notDeferred");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    {
      localName: "menu",
      label: "Gmail",
      children: [
        gmailInboxMenu,
        { localName: "menuitem", label: "Drafts" },
        gmailSentMenu,
        { localName: "menuitem", label: "All Mail" },
        { localName: "menuitem", label: "Spam" },
        { localName: "menuitem", label: "Trash" },
        { localName: "menuitem", label: "another folder" },
      ],
    },
    {
      localName: "menu",
      label: "Feeds",
      children: [
        { localName: "menuitem", label: "Trash" },
        { localName: "menuitem", label: "Test Feed" },
      ],
    },
    {
      localName: "menu",
      label: "Local Folders",
      children: [
        { localName: "menuitem", label: "Inbox" },
        { localName: "menuitem", label: "Trash" },
        { localName: "menuitem", label: "Outbox" },
      ],
    },
  ]);
});

add_task(async function testFeeds() {
  // As used in the feed subscriptions dialog.
  const list = doc.getElementById("feeds");
  const popup = list.menupopup;

  EventUtils.synthesizeMouseAtCenter(list, {}, win);
  await handlePopup(popup, [
    {
      localName: "menu",
      label: "Feeds",
      children: [
        { localName: "menuitem", label: "Feeds" },
        { localName: "menuseparator" },
        { localName: "menuitem", label: "Test Feed" },
      ],
    },
  ]);
});

/**
 * Compares the items of a menupopup to the expected items, then hides the popup.
 * Opening the popup is the responsibility of the caller.
 *
 * @param {XULPopupElement} popup - The popup to check.
 * @param {object[]} expectedItems - An array objects, one for each expected
 *   item. Each object should have a localName, a label, and optionally an
 *   array of children.
 */
async function handlePopup(popup, expectedItems) {
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");

  const actualItems = popup.children;
  Assert.deepEqual(
    Array.from(actualItems, a => a.localName),
    expectedItems.map(e => e.localName)
  );
  Assert.deepEqual(
    Array.from(actualItems, a => a.label),
    expectedItems.map(e => e.label)
  );

  for (let i = 0; i < expectedItems.length; i++) {
    if (expectedItems[i].children) {
      actualItems[i].openMenu(true);
      await handlePopup(actualItems[i].menupopup, expectedItems[i].children);
    }
  }

  popup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
}
