/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests fetching mail with OAuth2 authentication, including the dialog
 * windows that uses.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const generator = new MessageGenerator();
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
  Services.prefs.setStringPref("mailnews.oauth.loglevel", "Debug");
  Services.prefs.setBoolPref("signon.rememberSignons", true);

  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  [imapServer, pop3Server] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.oAuth,
    ServerTestUtils.serverDefs.pop3.oAuth,
  ]);

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.port = 143;
  imapAccount.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  Services.prefs.getStringPref(
    "mail.server." + imapAccount.incomingServer.key + ".oauth2.issuer",
    "mochi.test"
  );
  Services.prefs.getStringPref(
    "mail.server." + imapAccount.incomingServer.key + ".oauth2.scope",
    "test_scope"
  );
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
  pop3Account.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  Services.prefs.getStringPref(
    "mail.server." + pop3Account.incomingServer.key + ".oauth2.issuer",
    "mochi.test"
  );
  Services.prefs.getStringPref(
    "mail.server." + pop3Account.incomingServer.key + ".oauth2.scope",
    "test_scope"
  );
  pop3RootFolder = pop3Account.incomingServer.rootFolder;
  pop3Inbox = pop3RootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(pop3Inbox);

  await OAuth2TestUtils.startServer(this);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);

    Services.logins.removeAllLogins();
    Services.prefs.clearUserPref("mailnews.oauth.loglevel");
    Services.prefs.clearUserPref("signon.rememberSignons");
  });
});

async function addMessagesToServer(type) {
  if (type == "imap") {
    await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  } else if (type == "pop3") {
    await pop3Server.addMessages(generator.makeMessages({}));
  }
}

async function fetchMessages(inbox) {
  EventUtils.synthesizeMouseAtCenter(
    getMessagesButton,
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "shown");
  getMessagesContext.activateItem(
    getMessagesContext.querySelector(`[data-server-key="${inbox.server.key}"]`)
  );
  await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "hidden");
}

async function waitForMessages(inbox) {
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 10 && inbox.numPendingUnread == 0,
    `waiting for new ${inbox.server.type} messages to be received`
  );
  await promiseServerIdle(inbox.server);
  info(`${inbox.server.type} messages received`);

  inbox.markAllMessagesRead(window.msgWindow);
  await promiseServerIdle(inbox.server);
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 0 && inbox.numPendingUnread == 0,
    `waiting for ${inbox.server.type} messages to be marked read`
  );
  info(`${inbox.server.type} messages marked as read`);
}

async function handleOAuthDialog() {
  const oAuthWindow = await OAuth2TestUtils.promiseOAuthWindow();
  info("oauth2 window shown");
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [{ expectedHint: "user", username: "user", password: "password" }],
    OAuth2TestUtils.submitOAuthLogin
  );
}

function checkSavedPassword(inbox) {
  const logins = Services.logins.findLogins("oauth://test.test", "", "");
  Assert.equal(
    logins.length,
    1,
    "there should be a saved password for this server"
  );
  Assert.equal(logins[0].origin, "oauth://test.test", "login origin");
  Assert.equal(logins[0].formActionOrigin, null, "login formActionOrigin");
  Assert.equal(logins[0].httpRealm, "test_scope", "login httpRealm");
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "refresh_token", "login password");
  Assert.equal(logins[0].usernameField, "", "login usernameField");
  Assert.equal(logins[0].passwordField, "", "login passwordField");
}

/**
 * Tests getting messages when there is no access token and no refresh token.
 */
add_task(async function testNoTokens() {
  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox with no tokens`);
    await addMessagesToServer(inbox.server.type);

    const oAuthPromise = handleOAuthDialog();
    await fetchMessages(inbox);
    await oAuthPromise;
    await waitForMessages(inbox);

    // TODO: check this does NOT hit the oauth server
    await addMessagesToServer(inbox.server.type);
    await fetchMessages(inbox);
    await waitForMessages(inbox);

    checkSavedPassword(inbox);
    Services.logins.removeAllLogins();

    await promiseServerIdle(inbox.server);
    inbox.server.closeCachedConnections();
    OAuth2TestUtils.forgetObjects();
  }
});

/**
 * Tests that with a saved refresh token, but no access token, a new access token is requested.
 */
add_task(async function testNoAccessToken() {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "oauth://test.test",
    null,
    "test_scope",
    "user",
    "refresh_token",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  for (const inbox of allInboxes) {
    info(
      `getting messages for ${inbox.server.type} inbox with a refresh token but no access token`
    );
    await addMessagesToServer(inbox.server.type);

    await fetchMessages(inbox);
    await waitForMessages(inbox);

    checkSavedPassword(inbox);
    await promiseServerIdle(inbox.server);
    inbox.server.closeCachedConnections();

    OAuth2TestUtils.forgetObjects();
  }

  Services.logins.removeAllLogins();
});

/**
 * Tests that with a bad saved refresh token, new tokens are requested.
 */
add_task(async function testBadRefreshToken() {
  for (const inbox of allInboxes) {
    const loginInfo = Cc[
      "@mozilla.org/login-manager/loginInfo;1"
    ].createInstance(Ci.nsILoginInfo);
    loginInfo.init(
      "oauth://test.test",
      null,
      "test_scope",
      "user",
      "old_refresh_token",
      "",
      ""
    );
    await Services.logins.addLoginAsync(loginInfo);

    info(
      `getting messages for ${inbox.server.type} inbox with a bad refresh token`
    );
    await addMessagesToServer(inbox.server.type);

    const oAuthPromise = handleOAuthDialog();
    await fetchMessages(inbox);
    await oAuthPromise;
    await waitForMessages(inbox);

    checkSavedPassword(inbox);
    await promiseServerIdle(inbox.server);
    inbox.server.closeCachedConnections();

    OAuth2TestUtils.forgetObjects();
    Services.logins.removeAllLogins();
  }
});
