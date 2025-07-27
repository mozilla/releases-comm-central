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
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServers, getCertificate, serverDefs } = ServerTestUtils;

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
    "notyetvalid"
  );
});

add_task(async function testSelfSigned() {
  await subtest(
    "selfSignedTLS",
    "selfsigned.test.test",
    "does not come from a trusted source",
    "The certificate is not trusted",
    "selfsigned"
  );
});

async function subtest(
  serverDef,
  hostname,
  expectedAlertText,
  expectedDialogText,
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
  const ewsRootFolder = ewsAccount.incomingServer.rootFolder;
  await subsubtest(
    ewsRootFolder,
    async () => {
      ewsAccount.incomingServer.performExpand(null);
    },
    expectedAlertText,
    expectedDialogText,
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
  expectedCert
) {
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

        EventUtils.synthesizeMouseAtCenter(
          win.document.querySelector("dialog").getButton("extra1"),
          {},
          win
        );
      },
    }
  );

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

  // There could be multiple alerts for the same problem. These are swallowed
  // while the first alert is open, but we should wait a while for them.
  await promiseServerIdle(server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  let updatePromise;
  if (expectedCert) {
    updatePromise = new Promise(resolve => {
      const folderListener = {
        onFolderEvent(aEventFolder, aEvent) {
          if (aEvent == "FolderLoaded" && folder.URI == aEventFolder.URI) {
            MailServices.mailSession.RemoveFolderListener(folderListener);
            resolve();
          }
        },
      };
      MailServices.mailSession.AddFolderListener(
        folderListener,
        Ci.nsIFolderListener.event
      );
    });
  }

  MockAlertsService.listener.observe(null, "alertclickcallback", alert.cookie);
  MockAlertsService.listener.observe(null, "alertfinished", alert.cookie);
  MockAlertsService.reset();

  await dialogPromise;
  await SimpleTest.promiseFocus(window);

  if (expectedCert) {
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
      folder.updateFolder(null);
      folder.getNewMessages(null, null);
      await updatePromise;

      await TestUtils.waitForCondition(
        () => folder.getNumUnread(false) - folder.numPendingUnread == 10,
        `waiting for new ${server.type} messages to be received`
      );
      folder.markAllMessagesRead(window.msgWindow);
    }
  }

  await promiseServerIdle(server);
  server.closeCachedConnections();
  certOverrideService.clearAllOverrides();
}
