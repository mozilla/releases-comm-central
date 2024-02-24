/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that getting new messages for a deferred POP3 account works.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServer, serverDefs } = ServerTestUtils;

const generator = new MessageGenerator();
let localAccount, localRootFolder, localInbox;
let pop3Server, pop3Account;

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);

add_setup(async function () {
  // Don't use createLocalMailAccount here, it clashes with earlier tests.
  localAccount = MailServices.accounts.createAccount();
  localAccount.incomingServer = MailServices.accounts.createIncomingServer(
    localAccount.key,
    "localhost",
    "none"
  );
  localRootFolder = localAccount.incomingServer.rootFolder;
  localInbox = localRootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("Inbox");

  pop3Server = await createServer(serverDefs.pop3.plain);

  pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts
    .createIncomingServer("user", "test.test", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);
  pop3Account.incomingServer.prettyName = "POP3 Account";
  pop3Account.incomingServer.port = 110;
  pop3Account.incomingServer.password = "password";

  pop3Account.incomingServer.deferredToAccount = localAccount.key;
  pop3Account.incomingServer.deferGetNewMail = true;

  about3Pane.displayFolder(localRootFolder);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
  });
});

add_task(async function testDeferredAccount() {
  pop3Server.addMessages(generator.makeMessages({}));

  Assert.equal(
    localInbox.getNumUnread(false),
    0,
    `${localInbox.server.type} inbox should start with no messages`
  );

  info(`getting messages for ${localInbox.server.type} inbox`);

  EventUtils.synthesizeMouseAtCenter(
    getMessagesButton,
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "shown");
  getMessagesContext.activateItem(
    getMessagesContext.querySelector(
      `[data-server-key="${pop3Account.incomingServer.key}"]`
    )
  );
  await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "hidden");

  await TestUtils.waitForCondition(
    () => localInbox.getNumUnread(false) - localInbox.numPendingUnread == 10,
    `waiting for new messages to be received in local inbox`
  );
  localInbox.markAllMessagesRead(window.msgWindow);

  await promiseServerIdle(pop3Account.incomingServer);
});
