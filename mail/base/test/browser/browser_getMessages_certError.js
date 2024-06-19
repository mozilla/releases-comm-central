/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that fetching mail from a server with an invalid certificate shows a
 * notification, that clicking the notification opens the certificate error
 * dialog if appropriate, and that using the dialog to add an exception works
 * correctly, allowing mail to be fetched.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServers, getCertificate, serverDefs } = ServerTestUtils;

Services.scriptloader.loadSubScript(
  "chrome://mochikit/content/tests/SimpleTest/MockObjects.js",
  this
);

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);

const generator = new MessageGenerator();
let localAccount, localRootFolder;

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);

add_setup(async function () {
  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  const alertsService = new MockObjectRegisterer(
    "@mozilla.org/alerts-service;1",
    MockAlertsService
  );
  alertsService.register();

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(localAccount, false);
    certOverrideService.clearAllOverrides();
  });
});

add_task(async function testDomainMismatch() {
  await subtest("tls", "mitm.test.test", "not valid for");
});

add_task(async function testExpired() {
  const formatter = new Intl.DateTimeFormat();
  await subtest(
    "expiredTLS",
    "expired.test.test",
    `expired on ${formatter.format(new Date(Date.UTC(2010, 0, 6)))}`,
    "expired"
  );
});

add_task(async function testNotYetValid() {
  const formatter = new Intl.DateTimeFormat();
  await subtest(
    "notYetValidTLS",
    "notyetvalid.test.test",
    `not be valid until ${formatter.format(new Date(Date.UTC(2090, 0, 5)))}`,
    "notyetvalid"
  );
});

add_task(async function testSelfSigned() {
  await subtest(
    "selfSignedTLS",
    "selfsigned.test.test",
    "does not come from a trusted source",
    "selfsigned"
  );
});

async function subtest(serverDef, hostname, expectedAlertText, expectedCert) {
  const [imapServer, pop3Server] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap[serverDef],
    ServerTestUtils.serverDefs.pop3[serverDef],
  ]);

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    hostname,
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  imapAccount.incomingServer.port = 993;
  imapAccount.incomingServer.password = "password";
  const imapRootFolder = imapAccount.incomingServer.rootFolder;
  const imapInbox = imapRootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );

  const pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    hostname,
    "pop3"
  );
  pop3Account.incomingServer.prettyName = "POP3 Account";
  pop3Account.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  pop3Account.incomingServer.port = 995;
  pop3Account.incomingServer.password = "password";
  const pop3RootFolder = pop3Account.incomingServer.rootFolder;
  const pop3Inbox = pop3RootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );

  // TODO: Add NNTP to this test. The certificate exception dialog for NNTP is
  // completely broken – bug 1192098.

  for (const inbox of [imapInbox, pop3Inbox]) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  pop3Server.addMessages(generator.makeMessages({}));

  for (const inbox of [imapInbox, pop3Inbox]) {
    await subsubtest(
      inbox,
      async function () {
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
      },
      expectedAlertText,
      expectedCert
    );
  }

  await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);

  for (const inbox of [imapInbox]) {
    await subsubtest(
      inbox,
      function () {
        about3Pane.displayFolder(localRootFolder);
        about3Pane.displayFolder(inbox);
      },
      expectedAlertText,
      expectedCert
    );
  }

  MailServices.accounts.removeAccount(imapAccount, false);
  MailServices.accounts.removeAccount(pop3Account, false);
}

async function subsubtest(
  inbox,
  testCallback,
  expectedAlertText,
  expectedCert
) {
  info(`getting messages for ${inbox.server.type} inbox`);

  await testCallback();

  let dialogPromise;
  if (expectedCert) {
    dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
      "extra1",
      "chrome://pippki/content/exceptionDialog.xhtml"
    );
  } else {
    dialogPromise = Promise.resolve();
  }

  const alert = await TestUtils.waitForCondition(
    () => MockAlertsService._alert,
    "waiting for connection alert to show"
  );

  Assert.equal(alert.imageURL, "chrome://branding/content/icon48.png");
  Assert.stringContains(
    alert.text,
    inbox.server.hostName,
    "the alert text should include the hostname of the server"
  );
  Assert.stringContains(
    alert.text,
    expectedAlertText,
    "the alert text should state the problem"
  );

  // There could be multiple alerts for the same problem. These are swallowed
  // while the first alert is open, but we should wait a while for them.
  await promiseServerIdle(inbox.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  MockAlertsService._listener.observe(null, "alertclickcallback", alert.cookie);
  MockAlertsService._listener.observe(null, "alertfinished", alert.cookie);
  delete MockAlertsService._alert;
  delete MockAlertsService._listener;

  await dialogPromise;
  await SimpleTest.promiseFocus(window);

  if (expectedCert) {
    // Check the certificate exception was created.
    const isTemporary = {};
    Assert.ok(
      certOverrideService.hasMatchingOverride(
        inbox.server.hostName,
        inbox.server.port,
        {},
        await getCertificate(expectedCert),
        isTemporary
      ),
      `certificate exception should exist for ${inbox.server.hostName}:${inbox.server.port}`
    );
    // The checkbox in the dialog was checked, so this exception is permanent.
    Assert.ok(!isTemporary.value, "certificate exception should be permanent");

    // This should be unnecessary.
    await testCallback();

    await TestUtils.waitForCondition(
      () => inbox.getNumUnread(false) - inbox.numPendingUnread == 10,
      `waiting for new ${inbox.server.type} messages to be received`
    );
    inbox.markAllMessagesRead(window.msgWindow);
  }

  await promiseServerIdle(inbox.server);
  inbox.server.closeCachedConnections();
  certOverrideService.clearAllOverrides();
}

class MockAlertsService {
  QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);

  static _alert;

  showPersistentNotification(persistentData, alert) {
    info(`showPersistentNotification: ${alert.text}`);
    Assert.ok(false, "unexpected call to showPersistentNotification");
  }

  showAlert(alert, listener) {
    info(`showAlert: ${alert.text}`);
    Assert.ok(
      !MockAlertsService._alert,
      "showAlert should not be called while an alert is showing"
    );
    MockAlertsService._alert = alert;
    MockAlertsService._listener = listener;
  }

  showAlertNotification(imageUrl, title, text) {
    info(`showAlertNotification: ${text}`);
    Assert.ok(false, "unexpected call to showAlertNotification");
  }

  closeAlert() {
    Assert.ok(false, "unexpected call to closeAlert");
  }
}
