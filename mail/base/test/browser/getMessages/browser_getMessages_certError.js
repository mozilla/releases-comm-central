/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// It seems wrong to split this into separate files to avoid a timeout,
// because the majority of this file is shared code that is called
// multiple times for various scenarios.
requestLongerTimeout(2);

/**
 * Tests that fetching mail from a server with an invalid certificate shows a
 * notification, that clicking the notification opens the certificate error
 * dialog if appropriate, and that using the dialog to add an exception works
 * correctly, allowing mail to be fetched.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServers, getCertificate, serverDefs } = ServerTestUtils;

let viewCertificateChecked = false;
let openSettingsChecked = false;

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);

const generator = new MessageGenerator();
let localAccount, localRootFolder;

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);

add_setup(async function () {
  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  MockAlertsService.init();

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(localAccount, false);
    certOverrideService.clearAllOverrides();
    MockAlertsService.cleanup();
  });
});

add_task(async function testDomainMismatch() {
  await subtest(
    "tls",
    "mitm.test.test",
    "not valid for",
    "The certificate belongs to a different site",
    "SSL_ERROR_BAD_CERT_DOMAIN",
    "valid"
  );
});

add_task(async function testExpired() {
  const formatter = new Intl.DateTimeFormat();
  await subtest(
    "expiredTLS",
    "expired.test.test",
    `expired on ${formatter.format(new Date(Date.UTC(2010, 0, 6)))}`,
    "The certificate is not currently valid",
    "SEC_ERROR_EXPIRED_CERTIFICATE",
    "expired"
  );
});

add_task(async function testNotYetValid() {
  const formatter = new Intl.DateTimeFormat();
  await subtest(
    "notYetValidTLS",
    "notyetvalid.test.test",
    `not be valid until ${formatter.format(new Date(Date.UTC(2090, 0, 5)))}`,
    "The certificate is not currently valid",
    "MOZILLA_PKIX_ERROR_NOT_YET_VALID_CERTIFICATE",
    "notyetvalid"
  );
});

add_task(async function testSelfSigned() {
  await subtest(
    "selfSignedTLS",
    "selfsigned.test.test",
    "does not come from a trusted source",
    "The certificate is not trusted",
    "MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT",
    "selfsigned"
  );
});

async function subtest(
  serverDef,
  hostname,
  expectedAlertText,
  expectedDialogText,
  expectedErrorCategory,
  expectedCert
) {
  const [imapServer, pop3Server, ewsServer] =
    await ServerTestUtils.createServers([
      ServerTestUtils.serverDefs.imap[serverDef],
      ServerTestUtils.serverDefs.pop3[serverDef],
      ServerTestUtils.serverDefs.ews[serverDef],
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

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    hostname,
    "ews"
  );
  ewsAccount.incomingServer.port = 443;
  ewsAccount.incomingServer.password = "password";
  ewsAccount.incomingServer.setStringValue(
    "ews_url",
    `https://${hostname}/EWS/Exchange.asmx`
  );
  ewsAccount.incomingServer.prettyName = "EWS Account";
  ewsAccount.incomingServer.socketType = Ci.nsMsgSocketType.SSL;

  const ewsRootFolder = ewsAccount.incomingServer.rootFolder;
  await subsubtest(
    ewsRootFolder,
    async () => {
      ewsAccount.incomingServer.performExpand(null);
    },
    expectedAlertText,
    expectedDialogText,
    expectedErrorCategory,
    expectedCert
  );
  const ewsInbox = ewsRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);

  // TODO: Add NNTP to this test. The certificate exception dialog for NNTP is
  // completely broken – bug 1192098.

  for (const inbox of [imapInbox, pop3Inbox, ewsInbox]) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  pop3Server.addMessages(generator.makeMessages({}));
  ewsServer.addMessages("inbox", generator.makeMessages({}));

  for (const inbox of [imapInbox, pop3Inbox, ewsInbox]) {
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
      expectedDialogText,
      expectedErrorCategory,
      expectedCert
    );
  }

  await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  ewsServer.addMessages("inbox", generator.makeMessages({}));

  for (const inbox of [imapInbox, ewsInbox]) {
    await subsubtest(
      inbox,
      function () {
        about3Pane.displayFolder(localRootFolder);
        about3Pane.displayFolder(inbox);
      },
      expectedAlertText,
      expectedDialogText,
      expectedErrorCategory,
      expectedCert
    );
  }

  MailServices.accounts.removeAccount(imapAccount, false);
  MailServices.accounts.removeAccount(pop3Account, false);
  MailServices.accounts.removeAccount(ewsAccount, false);
}

async function subsubtest(
  folder,
  testCallback,
  expectedAlertText,
  expectedDialogText,
  expectedErrorCategory,
  expectedCert
) {
  Services.fog.testResetFOG();
  const server = folder.server;
  info(`getting messages for ${server.type}`);

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://pippki/content/exceptionDialog.xhtml",
    {
      async callback(win) {
        const location = win.document.getElementById("locationTextBox").value;
        if (server.port == 443) {
          Assert.equal(
            location,
            server.hostName,
            "the exception dialog should show the hostname of the server"
          );
        } else {
          Assert.equal(
            location,
            `${server.hostName}:${server.port}`,
            "the exception dialog should show the hostname and port of the server"
          );
        }
        const text = win.document.getElementById(
          "statusLongDescription"
        ).textContent;
        Assert.stringContains(
          text,
          expectedDialogText,
          "the exception dialog should state the problem"
        );

        if (!viewCertificateChecked) {
          const viewButton = win.document.getElementById("viewCertButton");
          const tabPromise = BrowserTestUtils.waitForEvent(
            tabmail.tabContainer,
            "TabOpen"
          );
          viewButton.click();
          const {
            detail: { tabInfo },
          } = await tabPromise;
          await BrowserTestUtils.browserLoaded(tabInfo.browser, false, url =>
            url.startsWith("about:certificate?cert=")
          );
          tabmail.closeTab(tabInfo);

          // This does the same thing every time.
          viewCertificateChecked = true;
        }

        EventUtils.synthesizeMouseAtCenter(
          win.document.querySelector("dialog").getButton("extra1"),
          {},
          win
        );
      },
    }
  );

  // Run the callback and wait for a notification.

  await testCallback();

  const alert = await TestUtils.waitForCondition(
    () => MockAlertsService.alert,
    "waiting for connection alert to show"
  );

  Assert.equal(
    alert.imageURL,
    AppConstants.platform == "macosx"
      ? ""
      : "chrome://branding/content/icon48.png"
  );
  Assert.stringContains(
    alert.text,
    server.hostName,
    "the alert text should include the hostname of the server"
  );
  Assert.stringContains(
    alert.text,
    expectedAlertText,
    "the alert text should state the problem"
  );

  // Check that the server's row in the folder tree has a warning icon.

  const folderRow = about3Pane.folderPane.getRowForFolder(
    folder.rootFolder,
    "all"
  );
  Assert.ok(
    folderRow.classList.contains("tls-error"),
    "folder row should have the tls-error class"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(folderRow.statusIcon),
    "warning icon should be visible"
  );
  await about3Pane.document.l10n.translateFragment(folderRow);
  Assert.stringContains(
    folderRow.statusIcon.title,
    expectedAlertText,
    "warning icon's tooltip should state the problem"
  );

  if (!openSettingsChecked) {
    // Click on the warning icon, and wait for the Account Settings tab to open and load.
    const tabPromise = BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabOpen"
    );
    folderRow.statusIcon.click();
    const {
      detail: { tabInfo },
    } = await tabPromise;
    await BrowserTestUtils.browserLoaded(
      tabInfo.browser,
      false,
      "about:accountsettings"
    );
    await TestUtils.waitForTick();

    // Check the right page in the tab is shown.
    const accountTree =
      tabInfo.browser.contentDocument.getElementById("accounttree");
    const accountKey = MailServices.accounts.findAccountForServer(server).key;
    Assert.equal(
      accountTree.selectedRow.id,
      `${accountKey}/am-server.xhtml`,
      "server settings tab should be open"
    );
    tabmail.closeTab(tabInfo);

    // This does the same thing every time.
    openSettingsChecked = true;
  }

  // There could be multiple alerts for the same problem. These are swallowed
  // while the first alert is open, but we should wait a while for them.
  await promiseServerIdle(server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Click on the notification to bring up the exception dialog.

  MockAlertsService.listener.observe(null, "alertclickcallback", alert.cookie);
  MockAlertsService.listener.observe(null, "alertfinished", alert.cookie);
  MockAlertsService.reset();

  await dialogPromise;
  await TestUtils.waitForTick(); // Ensure Telemetry callback runs.
  await SimpleTest.promiseFocus(window);

  // Check the certificate exception was created.

  const isTemporary = {};
  Assert.ok(
    certOverrideService.hasMatchingOverride(
      server.hostName,
      server.port,
      {},
      await getCertificate(expectedCert),
      isTemporary
    ),
    `certificate exception should exist for ${server.hostName}:${server.port}`
  );
  // The checkbox in the dialog was checked, so this exception is permanent.
  Assert.ok(!isTemporary.value, "certificate exception should be permanent");

  const telemetryEvents = Glean.mail.certificateExceptionAdded.testGetValue();
  Assert.equal(telemetryEvents.length, 1);
  Assert.deepEqual(telemetryEvents[0].extra, {
    error_category: expectedErrorCategory,
    protocol: server.type,
    port: server.port,
    ui: "certificate-error-notification",
  });

  // Now that we have an exception, connect to the server again.

  if (folder.isServer) {
    // If folder is the root folder (EWS), we don't have an inbox yet, so
    // this is an additional operation to fetch it. Do that now.
    server.performExpand(null);
    await TestUtils.waitForCondition(
      () => folder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox),
      "waiting for folders to sync"
    );
  } else {
    // Force update of inbox.
    folder.getNewMessages(null, null);
    await TestUtils.waitForCondition(
      () => folder.getNumUnread(false) - folder.numPendingUnread == 10,
      `waiting for new ${server.type} messages to be received`
    );
    folder.markAllMessagesRead(window.msgWindow);
  }

  // Check that the folder tree row no longer has a warning icon.

  Assert.ok(
    !folderRow.classList.contains("tls-error"),
    "folder row should not have the tls-error class"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(folderRow.statusIcon),
    "warning icon should be hidden"
  );

  await promiseServerIdle(server);
  server.closeCachedConnections();
  certOverrideService.clearAllOverrides();
}
