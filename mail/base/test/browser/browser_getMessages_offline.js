/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that fetching mail while offline prompts the user to go online and,
 * if the user agrees, that we go online and fetch the mail.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const generator = new MessageGenerator();
let localAccount, localRootFolder;
let imapServer, imapAccount, imapRootFolder, imapInbox;
let pop3Server, pop3Account, pop3RootFolder, pop3Inbox;
let nntpServer, nntpAccount, nntpRootFolder, nntpFolder;

const allInboxes = [];

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);

add_setup(async function () {
  // This test sometimes fails trying to send messages when going online.
  // It's nothing to do with what we're testing, so just avoid that code.
  Services.prefs.setIntPref("offline.send.unsent_messages", 2);

  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  [imapServer, pop3Server, nntpServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.plain,
    ServerTestUtils.serverDefs.pop3.plain,
    ServerTestUtils.serverDefs.nntp.plain,
  ]);
  nntpServer.addGroup("getmessages.offline");

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.password = "password";
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapInbox = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(imapInbox);

  pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "pop3"
  );
  pop3Account.incomingServer.prettyName = "POP3 Account";
  pop3Account.incomingServer.port = pop3Server.port;
  pop3Account.incomingServer.password = "password";
  pop3RootFolder = pop3Account.incomingServer.rootFolder;
  pop3Inbox = pop3RootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(pop3Inbox);

  nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "nntp"
  );
  nntpAccount.incomingServer.prettyName = "NNTP Account";
  nntpAccount.incomingServer.port = nntpServer.port;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("getmessages.offline", null);
  nntpFolder = nntpRootFolder.getChildNamed("getmessages.offline");
  allInboxes.push(nntpFolder);

  about3Pane.displayFolder(localRootFolder);

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    Services.prefs.clearUserPref("offline.send.unsent_messages");
  });
});

add_task(async function testOffline() {
  await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  pop3Server.addMessages(generator.makeMessages({}));
  await nntpServer.addMessages(
    "getmessages.offline",
    generator.makeMessages({})
  );

  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  for (const inbox of allInboxes) {
    Services.io.offline = true;

    info(`getting messages for ${inbox.server.type} inbox`);

    const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");

    EventUtils.synthesizeMouseAtCenter(
      getMessagesButton,
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "shown");
    getMessagesContext.activateItem(
      getMessagesContext.querySelector(
        `[data-server-key="${inbox.server.key}"]`
      )
    );
    await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "hidden");

    await dialogPromise;
    Assert.ok(!Services.io.offline, "should have gone online");

    await TestUtils.waitForCondition(
      () => inbox.getNumUnread(false) - inbox.numPendingUnread == 10,
      `waiting for new ${inbox.server.type} messages to be received`
    );
    inbox.markAllMessagesRead(window.msgWindow);
  }

  await promiseServerIdle(imapAccount.incomingServer);
  await promiseServerIdle(pop3Account.incomingServer);
  await promiseServerIdle(nntpAccount.incomingServer);
});
