/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that trying to connect to a non-existent server displays an alert.
 */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

Services.scriptloader.loadSubScript(
  "chrome://mochikit/content/tests/SimpleTest/MockObjects.js",
  this
);

const generator = new MessageGenerator();
let localAccount, localRootFolder;
let imapAccount, imapRootFolder, imapInbox;
let pop3Account, pop3RootFolder, pop3Inbox;
let nntpAccount, nntpRootFolder, nntpFolder;

const allInboxes = [];

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);
let toolbarButton, toolbarContext;
const fileMenu = document.getElementById("menu_File");
const fileMenuGetMessages = document.getElementById("menu_getAllNewMsg");
const fileMenuGetMessagesPopup = fileMenuGetMessages.menupopup;

add_setup(async function () {
  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.port = 10000;
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
  pop3Account.incomingServer.port = 10000;
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
  nntpAccount.incomingServer.port = 10000;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("getmessages.newsgroup", null);
  nntpFolder = nntpRootFolder.getChildNamed("getmessages.newsgroup");
  allInboxes.push(nntpFolder);

  about3Pane.displayFolder(localRootFolder);

  const alertsService = new MockObjectRegisterer(
    "@mozilla.org/alerts-service;1",
    MockAlertsService
  );
  alertsService.register();

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    alertsService.unregister();
  });
});

add_task(async function testConnectionRefused() {
  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox`);
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

    const alert = await TestUtils.waitForCondition(
      () => MockAlertsService._alert,
      "waiting for connection alert to show"
    );
    delete MockAlertsService._alert;

    Assert.equal(alert.imageURL, "chrome://branding/content/icon48.png");
    Assert.stringContains(
      alert.text,
      "localhost",
      "the alert text should include the hostname of the server"
    );
    Assert.stringContains(
      alert.text,
      "the connection was refused",
      "the alert text should state the problem"
    );
  }

  await promiseServerIdle(imapAccount.incomingServer);
  await promiseServerIdle(pop3Account.incomingServer);
  await promiseServerIdle(nntpAccount.incomingServer);
});

class MockAlertsService {
  QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);

  static _alert;

  showPersistentNotification(persistentData, alert, alertListener) {
    info(`showPersistentNotification: ${alert.text}`);
    Assert.ok(false, "unexpected call to showPersistentNotification");
  }

  showAlert(alert, listener) {
    info(`showAlert: ${alert.text}`);
    MockAlertsService._alert = alert;
  }

  showAlertNotification(
    imageUrl,
    title,
    text,
    textClickable,
    cookie,
    alertListener,
    name
  ) {
    info(`showAlertNotification: ${text}`);
    Assert.ok(false, "unexpected call to showAlertNotification");
  }

  closeAlert(name) {
    Assert.ok(false, "unexpected call to closeAlert");
  }
}
