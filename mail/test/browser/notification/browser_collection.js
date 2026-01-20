/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests new mail notifications for automatic (e.g. periodic check) and manual
 * (e.g. clicking the Get Messages button) collection of new mail, and filters
 * that move messages between folders.
 */

/* eslint-disable @microsoft/sdl/no-insecure-url */

const { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const generator = new MessageGenerator();
let imapServer, pop3Server, ewsServer;
let imapIncomingServer, pop3IncomingServer, ewsIncomingServer;

add_setup(async function () {
  [imapServer, pop3Server, ewsServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.plain,
    ServerTestUtils.serverDefs.pop3.plain,
    ServerTestUtils.serverDefs.ews.plain,
  ]);
  imapServer.daemon.createMailbox("INBOX/greenFilter", { subscribed: true });
  imapServer.daemon.createMailbox("INBOX/blueFilter", { subscribed: true });
  imapServer.daemon.createMailbox("INBOX/redFilter", { subscribed: true });
  ewsServer.appendRemoteFolder(new RemoteFolder("greenFilter", "inbox"));
  ewsServer.appendRemoteFolder(new RemoteFolder("blueFilter", "inbox"));
  ewsServer.appendRemoteFolder(new RemoteFolder("redFilter", "inbox"));

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = imapIncomingServer =
    MailServices.accounts.createIncomingServer("user", "test.test", "imap");
  imapIncomingServer.prettyName = "IMAP Account";
  imapIncomingServer.password = "password";
  imapIncomingServer.autoSyncOfflineStores = false;

  const pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = pop3IncomingServer =
    MailServices.accounts.createIncomingServer("user", "test.test", "pop3");
  pop3IncomingServer.prettyName = "POP3 Account";
  pop3IncomingServer.password = "password";
  pop3IncomingServer.downloadOnBiff = true;
  const pop3Inbox = pop3IncomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  pop3Inbox.QueryInterface(Ci.nsIMsgLocalMailFolder);
  pop3Inbox.createLocalSubfolder("redFilter");
  pop3Inbox.createLocalSubfolder("greenFilter");
  pop3Inbox.createLocalSubfolder("blueFilter");

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = ewsIncomingServer =
    MailServices.accounts.createIncomingServer("user", "test.test", "ews");
  ewsIncomingServer.setStringValue(
    "ews_url",
    "http://test.test/EWS/Exchange.asmx"
  );
  ewsIncomingServer.prettyName = "EWS Account";
  ewsIncomingServer.password = "password";

  MockAlertsService.init();

  registerCleanupFunction(async function () {
    await TestUtils.waitForCondition(
      () => imapIncomingServer.allConnectionsIdle,
      "waiting for IMAP connection to become idle"
    );
    MailServices.accounts.removeAccount(imapAccount, false);
    await TestUtils.waitForCondition(
      () => !pop3IncomingServer.wrappedJSObject.runningClient,
      "waiting for POP3 connection to become idle"
    );
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(ewsAccount, false);
    Services.logins.removeAllLogins();
    MockAlertsService.cleanup();
  });
});

/**
 * Test automatic update for an IMAP server.
 */
add_task(async function testBiffUpdateIMAP() {
  await subtest(imapIncomingServer, inbox =>
    inbox.server.performBiff(window.msgWindow)
  );
  await TestUtils.waitForCondition(
    () => imapIncomingServer.allConnectionsIdle,
    "waiting for IMAP connection to become idle"
  );
});

/**
 * Test manual update for an IMAP server.
 */
add_task(async function testUserUpdateIMAP() {
  await subtest(imapIncomingServer, inbox => window.GetFolderMessages([inbox]));
  await TestUtils.waitForCondition(
    () => imapIncomingServer.allConnectionsIdle,
    "waiting for IMAP connection to become idle"
  );
}).skip(); // No notification on messages that don't match filters. Bug 1983740.

/**
 * Test automatic update for a POP3 server.
 */
add_task(async function testBiffUpdatePOP3() {
  await subtest(pop3IncomingServer, inbox =>
    inbox.server.performBiff(window.msgWindow)
  );
  await TestUtils.waitForCondition(
    () => !pop3IncomingServer.wrappedJSObject.runningClient,
    "waiting for POP3 connection to become idle"
  );
});

/**
 * Test manual update for a POP3 server.
 */
add_task(async function testUserUpdatePOP3() {
  await subtest(pop3IncomingServer, inbox => window.GetFolderMessages([inbox]));
  await TestUtils.waitForCondition(
    () => !pop3IncomingServer.wrappedJSObject.runningClient,
    "waiting for POP3 connection to become idle"
  );
});

/**
 * Test automatic update for an EWS server.
 */
add_task(async function testBiffUpdateEWS() {
  await subtest(ewsIncomingServer, inbox =>
    inbox.server.performBiff(window.msgWindow)
  );
}).skip(); // See 1985881

/**
 * Test manual update for an EWS server.
 */
add_task(async function testUserUpdateEWS() {
  await subtest(ewsIncomingServer, inbox =>
    inbox.server.performBiff(window.msgWindow)
  );
}).skip(); // See 1985881

/**
 * Create a filter that moves mail from `sender` to `folder`.
 *
 * @param {string} sender
 * @param {nsIMsgFolder} folder
 */
function createFilter(sender, folder) {
  const filterList = folder.server.getFilterList(null);
  if (filterList.getFilterNamed(sender)) {
    // Filter already exists, skip.
    return;
  }

  const filter = filterList.createFilter(sender);
  filter.enabled = true;

  const searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Sender;
  searchTerm.op = Ci.nsMsgSearchOp.Is;

  searchTerm.value = {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgSearchValue"]),
    attrib: Ci.nsMsgSearchAttrib.Sender,
    str: sender,
  };

  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MoveToFolder;
  action.targetFolderUri = folder.URI;

  filter.appendTerm(searchTerm);
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);
}

/**
 * Add a message defined by `messageDef` on the server of `inbox`.
 *
 * @param {nsIMsgFolder} inbox
 * @param {MakeMessageOptions} messageDef - see MessageGenerator.
 */
async function addMessage(inbox, messageDef) {
  const message = generator.makeMessage(messageDef);
  if (inbox.server.type == "imap") {
    await imapServer.addMessages(inbox, [message], false);
  } else if (inbox.server.type == "pop3") {
    await pop3Server.addMessages([message]);
  } else if (inbox.server.type == "ews") {
    await ewsServer.addMessages("inbox", [message]);
  }
}

/**
 * Run the test for a given configuration.
 *
 * @param {nsIMsgIncomingServer} incomingServer
 * @param {Function} getMessagesCallback - A callback function which triggers
 *   the collection of mail. The inbox of `incomingServer` is passed to this.
 */
async function subtest(incomingServer, getMessagesCallback) {
  // Find all the folders and ensure they have no unread messages to begin with.
  // Also set up the filters.

  incomingServer.performExpand(null);
  const inbox = await TestUtils.waitForCondition(
    () =>
      incomingServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox),
    "waiting for inbox to exist"
  );
  Assert.equal(
    inbox.getNumUnread(false),
    0,
    "inbox should have 0 unread messages at the start"
  );

  await TestUtils.waitForCondition(
    () => inbox.numSubFolders == 3,
    "waiting for all folders to appear"
  );
  for (const colour of ["green", "blue", "red"]) {
    const folder = inbox.getChildNamed(`${colour}Filter`);
    Assert.ok(folder, `folder ${colour}Filter should exist`);
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${colour}Filter should have 0 unread messages at the start`
    );
    createFilter(`${colour}@test.invalid`, folder);
  }

  const trash = await TestUtils.waitForCondition(
    () => inbox.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash),
    "waiting for trash folder to exist"
  );
  Assert.equal(
    trash.getNumUnread(false),
    0,
    "trash should have 0 unread messages at the start"
  );
  createFilter("spammer@test.invalid", trash);

  // Add a message that does not match any filters.

  await addMessage(inbox, { from: ["friend", "friend@test.invalid"] });
  getMessagesCallback(inbox);
  await promiseAlert("friend", "INBOX#");
  Assert.equal(inbox.getNumUnread(false), 1, "inbox should have 1 message");

  // Add a message that should be deleted.

  await addMessage(inbox, { from: ["spammer", "spammer@test.invalid"] });
  getMessagesCallback(inbox);
  await promiseNoAlert();
  Assert.equal(
    trash.getNumUnread(false),
    1,
    "trash should have 1 unread message"
  );
  Assert.equal(
    inbox.getNumUnread(false),
    1,
    "inbox should still have 1 unread message"
  );

  // Add messages that should be moved to other folders.

  for (const colour of ["red", "green", "blue", "green", "red"]) {
    const folder = inbox.getChildNamed(`${colour}Filter`);
    const before = folder.getNumUnread(false);
    await addMessage(inbox, { from: [colour, `${colour}@test.invalid`] });
    getMessagesCallback(inbox);
    await promiseAlert(colour, `INBOX/${colour}Filter#`);
    Assert.equal(
      folder.getNumUnread(false),
      before + 1,
      `${colour}Filter should have 1 more message than before`
    );
    Assert.equal(
      inbox.getNumUnread(false),
      1,
      "inbox should still have 1 unread message"
    );
  }

  // Add another message that should be deleted.

  await addMessage(inbox, { from: ["spammer", "spammer@test.invalid"] });
  getMessagesCallback(inbox);
  await promiseNoAlert();
  Assert.equal(
    trash.getNumUnread(false),
    2,
    "trash should have 2 unread messages"
  );

  // Add another message that does not match any filters.

  await addMessage(inbox, { from: ["friend", "friend@test.invalid"] });
  getMessagesCallback(inbox);
  await promiseAlert("friend", "INBOX#");

  // Check all folders have the right number of unread messages, then clear
  // all the unread messages. After returning from this function, ensure that
  // all operations are complete and the server is idle.

  Assert.equal(
    inbox.getNumUnread(false),
    2,
    "inbox should have 2 unread messages at the end"
  );
  Assert.equal(
    inbox.getChildNamed("redFilter").getNumUnread(false),
    2,
    "redFilter should have 2 unread messages at the end"
  );
  Assert.equal(
    inbox.getChildNamed("greenFilter").getNumUnread(false),
    2,
    "greenFilter should have 2 unread messages at the end"
  );
  Assert.equal(
    inbox.getChildNamed("blueFilter").getNumUnread(false),
    1,
    "blueFilter should have 1 unread message at the end"
  );
  Assert.equal(
    trash.getNumUnread(false),
    2,
    "trash should have 2 unread messages at the end"
  );

  inbox.markAllMessagesRead(window.msgWindow);
  inbox.getChildNamed("redFilter").markAllMessagesRead(window.msgWindow);
  inbox.getChildNamed("greenFilter").markAllMessagesRead(window.msgWindow);
  inbox.getChildNamed("blueFilter").markAllMessagesRead(window.msgWindow);
  trash.markAllMessagesRead(window.msgWindow);
}

/**
 * Waits for a call to the alerts service, and tests it is as expected.
 *
 * @param {string} expectedSender - The name of the expected message's author.
 * @param {string} expectedCookie - Part of the expected message's URI, to
 *   check it is the right message.
 */
async function promiseAlert(expectedSender, expectedCookie) {
  const alert = await TestUtils.waitForCondition(
    () => MockAlertsService.alert,
    `waiting for a notification about ${expectedCookie}`
  );
  Assert.stringContains(
    alert.text,
    `from "${expectedSender}"`,
    `notification should be about a message from ${expectedSender}`
  );
  Assert.stringContains(
    alert.cookie.toLowerCase(),
    expectedCookie.toLowerCase(),
    `notification should be about ${expectedCookie}`
  );

  MockAlertsService.listener.observe(null, "alertfinished", alert.cookie);
  MockAlertsService.reset();
}

/**
 * Waits 500ms and reports a failure if the alerts service is called.
 */
async function promiseNoAlert() {
  // There should be no notification here. Wait a bit to be sure.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  Assert.ok(!MockAlertsService.alert, "there should be no notification");
}
