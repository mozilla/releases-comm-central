/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that fetching mail from a server with an invalid certificate shows
 * the certificate error dialog, and that using the dialog to add an exception
 * works correctly, allowing mail to be fetched.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServers, getCertificate, serverDefs } = ServerTestUtils;

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);

const generator = new MessageGenerator();
let expiredCert;
let localAccount, localRootFolder;
let imapServer, imapAccount, imapRootFolder, imapInbox;
let pop3Server, pop3Account, pop3RootFolder, pop3Inbox;

const allInboxes = [];

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);

add_setup(async function () {
  expiredCert = await getCertificate("expired");

  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  [imapServer, pop3Server] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.expiredTLS,
    ServerTestUtils.serverDefs.pop3.expiredTLS,
  ]);

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "expired.test.test",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  imapAccount.incomingServer.port = 993;
  imapAccount.incomingServer.password = "password";
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapInbox = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(imapInbox);

  pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "expired.test.test",
    "pop3"
  );
  pop3Account.incomingServer.prettyName = "POP3 Account";
  pop3Account.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  pop3Account.incomingServer.port = 995;
  pop3Account.incomingServer.password = "password";
  pop3RootFolder = pop3Account.incomingServer.rootFolder;
  pop3Inbox = pop3RootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(pop3Inbox);

  // TODO: Add NNTP to this test. The certificate exception dialog for NNTP is
  // completely broken – bug 1192098.

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    certOverrideService.clearAllOverrides();
  });
});

add_task(async function testCertError() {
  await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  pop3Server.addMessages(generator.makeMessages({}));

  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox`);

    const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
      "extra1",
      "chrome://pippki/content/exceptionDialog.xhtml"
    );

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

    // Check the certificate exception was created.
    const isTemporary = {};
    Assert.ok(
      certOverrideService.hasMatchingOverride(
        "expired.test.test",
        inbox.server.port,
        {},
        expiredCert,
        isTemporary
      ),
      `certificate exception should exist for expired.test.test:${inbox.server.port}`
    );
    // The checkbox in the dialog was checked, so this exception is permanent.
    Assert.ok(!isTemporary.value, "certificate exception should be permanent");

    // This should be unnecessary.
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

    await TestUtils.waitForCondition(
      () => inbox.getNumUnread(false) - inbox.numPendingUnread == 10,
      `waiting for new ${inbox.server.type} messages to be received`
    );
    inbox.markAllMessagesRead(window.msgWindow);

    await promiseServerIdle(inbox.server);
  }
});
