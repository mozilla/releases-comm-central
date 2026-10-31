/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Common setup code shared by the browser_getMessages tests of best case
 * scenarios. An account of each type is created, and new messages are put on
 * the server before the action being tested is performed.
 */

/* import-globals-from head.js */
/* eslint-disable sdl/no-insecure-url */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

const generator = new MessageGenerator();
let localAccount, localRootFolder;
let imapServer, imapAccount, imapRootFolder, imapInbox;
let pop3Server, pop3Account, pop3RootFolder, pop3Inbox;
let ewsServer, ewsAccount, ewsRootFolder, ewsInbox;
let graphServer, graphAccount, graphRootFolder, graphInbox;
let nntpServer, nntpAccount, nntpRootFolder, nntpFolder;

const allInboxes = [];

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);
let toolbarButton, toolbarContext;

add_setup(async function () {
  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  [imapServer, pop3Server, ewsServer, graphServer, nntpServer] =
    await ServerTestUtils.createServers([
      ServerTestUtils.serverDefs.imap.plain,
      ServerTestUtils.serverDefs.pop3.plain,
      ServerTestUtils.serverDefs.ews.plain,
      ServerTestUtils.serverDefs.graph.plain,
      ServerTestUtils.serverDefs.nntp.plain,
    ]);
  nntpServer.addGroup("getmessages.newsgroup");

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.port = 143;
  await addLoginInfo("imap://test.test", "user", "password");
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapInbox = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(imapInbox);

  pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "pop3"
  );
  pop3Account.incomingServer.prettyName = "POP3 Account";
  pop3Account.incomingServer.port = 110;
  await addLoginInfo("mailbox://test.test", "user", "password");
  pop3RootFolder = pop3Account.incomingServer.rootFolder;
  pop3Inbox = pop3RootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(pop3Inbox);

  ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "ews"
  );
  ewsAccount.incomingServer.setStringValue(
    "ews_url",
    "http://test.test/EWS/Exchange.asmx"
  );
  ewsAccount.incomingServer.prettyName = "EWS Account";
  await addLoginInfo("ews://test.test", "user", "password");
  ewsRootFolder = ewsAccount.incomingServer.rootFolder;
  ewsAccount.incomingServer.performExpand(false);
  ewsInbox = await TestUtils.waitForCondition(
    () => ewsRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox),
    "waiting for EWS folders to sync"
  );
  allInboxes.push(ewsInbox);

  graphAccount = MailServices.accounts.createAccount();
  graphAccount.addIdentity(MailServices.accounts.createIdentity());
  graphAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "graph"
  );
  graphAccount.incomingServer.setStringValue(
    "ews_url",
    "http://test.test:8080/"
  );
  graphAccount.incomingServer.prettyName = "Graph Account";
  await addLoginInfo("graph://test.test", "user", "password");
  graphRootFolder = graphAccount.incomingServer.rootFolder;
  graphAccount.incomingServer.performExpand(false);
  graphInbox = await TestUtils.waitForCondition(
    () => graphRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox),
    "waiting for Graph folders to sync"
  );
  allInboxes.push(graphInbox);

  nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "nntp"
  );
  nntpAccount.incomingServer.prettyName = "NNTP Account";
  nntpAccount.incomingServer.port = 119;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("getmessages.newsgroup");
  nntpFolder = nntpRootFolder.getChildNamed("getmessages.newsgroup");
  allInboxes.push(nntpFolder);

  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  about3Pane.displayFolder(localRootFolder);
  storeState({ mail: ["get-messages"] });

  toolbarButton = document.querySelector(
    `#unifiedToolbarContent [item-id="get-messages"]`
  );
  toolbarContext = document.getElementById("toolbarGetMessagesContext");
  await TestUtils.waitForCondition(
    () => toolbarButton.clientWidth && toolbarButton.clientHeight,
    "waiting for toolbar button"
  );

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(ewsAccount, false);
    MailServices.accounts.removeAccount(graphAccount, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    storeState({});
    await Services.logins.removeAllLoginsAsync();
  });
});

async function addMessagesToServer(type) {
  const messages = generator.makeMessages({});
  if (type == "imap") {
    await imapServer.addMessages(imapInbox, messages, false);
  } else if (type == "pop3") {
    await pop3Server.addMessages(messages);
  } else if (type == "ews") {
    await ewsServer.addMessages("inbox", messages);
  } else if (type == "graph") {
    await graphServer.addMessages("inbox", messages);
  } else if (type == "nntp") {
    await nntpServer.addMessages("getmessages.newsgroup", messages);
  }
}

async function addMessagesToAllServers() {
  for (const inbox of allInboxes) {
    await addMessagesToServer(inbox.server.type);
  }
}

async function waitForMessages(inbox) {
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 10 && inbox.numPendingUnread == 0,
    `waiting for new ${inbox.server.type} messages to be received`
  );
  await promiseServerIdle(inbox.server);
  info(`${inbox.server.type} messages received`);

  inbox.markAllMessagesRead();
  await promiseServerIdle(inbox.server);
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 0 && inbox.numPendingUnread == 0,
    `waiting for ${inbox.server.type} messages to be marked read`
  );
  info(`${inbox.server.type} messages marked as read`);
}

async function testAllServers(testCallback) {
  await addMessagesToAllServers();

  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  info("getting messages for all inboxes");
  await testCallback();

  for (const inbox of allInboxes) {
    await waitForMessages(inbox);
  }
}

async function testEachServer(testCallback) {
  await addMessagesToAllServers();

  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox`);
    await testCallback(inbox);
    await waitForMessages(inbox);

    for (const otherInbox of allInboxes) {
      if (otherInbox != inbox) {
        Assert.equal(
          otherInbox.getNumUnread(false),
          0,
          `${otherInbox.server.type} should have no new messages`
        );
      }
    }
  }

  for (const inbox of allInboxes) {
    await promiseServerIdle(inbox.server);
  }
}

async function checkPopupItemsAndActivateFirst(popup, startAtIndex) {
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  Assert.equal(
    popup.childElementCount,
    allInboxes.length + startAtIndex,
    "context menu has correct entries"
  );
  for (let i = 0; i < allInboxes.length; i++) {
    Assert.equal(
      popup.children[i + startAtIndex].textContent,
      allInboxes[i].server.prettyName,
      `${allInboxes[i].server.type} context menu item is labelled correctly`
    );
  }
  popup.activateItem(popup.children[0]);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
}

async function subtestFileMenuAll(win) {
  const doc = win.document;
  const fileMenu = doc.getElementById("menu_File");
  const fileMenuGetMessages = doc.getElementById("menu_getAllNewMsg");

  await testAllServers(async function () {
    EventUtils.synthesizeMouseAtCenter(fileMenu, {}, win);
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
    fileMenuGetMessages.openMenu(true);
    await checkPopupItemsAndActivateFirst(fileMenuGetMessages.menupopup, 3);
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");
  });
}

async function subtestFileMenu(win, thisInbox) {
  const doc = win.document;
  const fileMenu = doc.getElementById("menu_File");
  const fileMenuGetMessages = doc.getElementById("menu_getAllNewMsg");
  const fileMenuGetMessagesPopup = fileMenuGetMessages.menupopup;

  EventUtils.synthesizeMouseAtCenter(fileMenu, {}, win);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
  fileMenuGetMessages.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "shown");
  fileMenuGetMessagesPopup.activateItem(fileMenuGetMessagesPopup.children[1]);
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "hidden");
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");

  await waitForMessages(thisInbox);
  await addMessagesToServer(thisInbox.server.type);

  EventUtils.synthesizeMouseAtCenter(fileMenu, {}, win);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
  fileMenuGetMessages.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "shown");
  for (const menuitem of fileMenuGetMessagesPopup.children) {
    if (menuitem._folder == thisInbox.rootFolder) {
      fileMenuGetMessagesPopup.activateItem(menuitem);
      break;
    }
  }
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "hidden");
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");

  await waitForMessages(thisInbox);
  await addMessagesToServer(thisInbox.server.type);
}
