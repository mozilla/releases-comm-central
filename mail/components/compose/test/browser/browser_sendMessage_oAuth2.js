/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { OAuth2Module } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Module.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

let oAuth2Server, smtpServer;
let outgoingServer, identity;

add_setup(async function () {
  smtpServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.smtp.oAuth
  );

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("sendMessage oAuth2", null);

  outgoingServer = MailServices.outgoingServer.createServer("smtp");
  outgoingServer.QueryInterface(Ci.nsISmtpServer);
  outgoingServer.hostname = "test.test";
  outgoingServer.port = 587;
  outgoingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  outgoingServer.username = "user";

  identity = MailServices.accounts.createIdentity();
  identity.fullName = "test";
  identity.email = "test@test.test";
  identity.smtpServerKey = outgoingServer.key;
  identity.fccFolder = rootFolder.getChildNamed("sendMessage oAuth2").URI;

  account.addIdentity(identity);

  oAuth2Server = await OAuth2TestUtils.startServer();

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Tests sending a message when there is no access token and no refresh token.
 */
add_task(async function testNoTokens() {
  const { composeWindow, subject } = await newComposeWindow();

  const oAuthPromise = handleOAuthDialog();
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await oAuthPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  checkSavedPassword();
  Services.logins.removeAllLogins();

  outgoingServer.closeCachedConnections();
  OAuth2TestUtils.forgetObjects();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
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
    "test_mail test_addressbook test_calendar",
    "user",
    "refresh_token",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  const { composeWindow, subject } = await newComposeWindow();

  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );

  await BrowserTestUtils.domWindowClosed(composeWindow);

  checkSavedPassword();
  Services.logins.removeAllLogins();

  outgoingServer.closeCachedConnections();
  OAuth2TestUtils.forgetObjects();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

/**
 * Tests that with an expired access token, a new access token is requested.
 */
add_task(async function testExpiredAccessToken() {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "oauth://test.test",
    null,
    "test_mail test_addressbook test_calendar",
    "user",
    "refresh_token",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  info("poisoning the cache with an expired access token");
  oAuth2Server.accessToken = "expired_access_token";
  oAuth2Server.expiry = -3600;

  const expiredModule = new OAuth2Module();
  expiredModule.initFromOutgoing(outgoingServer);
  await expiredModule._oauth.connect(false, false);

  oAuth2Server.accessToken = "access_token";
  oAuth2Server.expiry = null;

  const { composeWindow, subject } = await newComposeWindow();

  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );

  await BrowserTestUtils.domWindowClosed(composeWindow);

  checkSavedPassword();
  Services.logins.removeAllLogins();

  outgoingServer.closeCachedConnections();
  OAuth2TestUtils.forgetObjects();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

/**
 * Tests that with a bad access token. This simulates an authentication server
 * giving a token that the mail server is not expecting. Very little can be
 * done here, so we notify the user and give up.
 */
add_task(async function testBadAccessToken() {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "oauth://test.test",
    null,
    "test_mail test_addressbook test_calendar",
    "user",
    "refresh_token",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);
  oAuth2Server.accessToken = "bad_access_token";

  info("poisoning the cache with a bad access token");

  const expiredModule = new OAuth2Module();
  expiredModule.initFromOutgoing(outgoingServer);
  await expiredModule._oauth.connect(false, false);

  const { composeWindow } = await newComposeWindow();

  const promptPromise = BrowserTestUtils.promiseAlertDialogOpen("cancel");
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  // FIXME: The user is informed that sending failed, and asked if they want
  // to retry, cancel, or enter a new password. Both retrying and entering a
  // new password immediately send the same access token to the server, which
  // isn't going to work.
  await promptPromise;
  // FIXME: At this point, an alert appears and tells the user that sending
  // failed, which is true but redundant. I think the alert is meant to
  // happen before the exception dialog but this got broken somewhere.
  await BrowserTestUtils.promiseAlertDialog("accept");

  // Try to solve strange focus issues.
  composeWindow.document.getElementById("toAddrInput").focus();
  await SimpleTest.promiseFocus(composeWindow);

  await BrowserTestUtils.closeWindow(composeWindow);

  outgoingServer.closeCachedConnections();
  OAuth2TestUtils.forgetObjects();

  Services.logins.removeAllLogins();
  oAuth2Server.accessToken = "access_token";
});

/**
 * Tests that with a bad saved refresh token, new tokens are requested.
 */
add_task(async function testBadRefreshToken() {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "oauth://test.test",
    null,
    "test_mail test_addressbook test_calendar",
    "user",
    "old_refresh_token",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  const { composeWindow, subject } = await newComposeWindow();

  const oAuthPromise = handleOAuthDialog();
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await oAuthPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  checkSavedPassword();
  Services.logins.removeAllLogins();

  outgoingServer.closeCachedConnections();
  OAuth2TestUtils.forgetObjects();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

async function handleOAuthDialog() {
  const oAuthWindow = await OAuth2TestUtils.promiseOAuthWindow();
  info("oauth2 window shown");
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [{ expectedHint: "user", username: "user", password: "password" }],
    OAuth2TestUtils.submitOAuthLogin
  );
}

function checkSavedPassword() {
  const logins = Services.logins.findLogins("oauth://test.test", "", "");
  Assert.equal(
    logins.length,
    1,
    "there should be a saved password for this server"
  );
  Assert.equal(logins[0].origin, "oauth://test.test", "login origin");
  Assert.equal(logins[0].formActionOrigin, null, "login formActionOrigin");
  Assert.equal(
    logins[0].httpRealm,
    "test_mail test_addressbook test_calendar",
    "login httpRealm"
  );
  Assert.equal(logins[0].username, "user", "login username");
  Assert.equal(logins[0].password, "refresh_token", "login password");
  Assert.equal(logins[0].usernameField, "", "login usernameField");
  Assert.equal(logins[0].passwordField, "", "login passwordField");
}
