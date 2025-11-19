/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests sending mail with OAuth2 authentication, including the dialog
 * windows that uses.
 */

const { OAuth2Module } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Module.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

let oAuth2Server;
let smtpServer, smtpOutgoingServer, smtpIdentity;
let ewsServer, ewsOutgoingServer, ewsIdentity;

add_setup(async function () {
  [smtpServer, ewsServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.smtp.oAuth,
    ServerTestUtils.serverDefs.ews.oAuth,
  ]);

  let smtpAccount;
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } = createSMTPAccount());
  smtpOutgoingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  let ewsAccount;
  ({ ewsAccount, ewsIdentity, ewsOutgoingServer } = createEWSAccount());
  ewsOutgoingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  oAuth2Server = await OAuth2TestUtils.startServer();

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.accounts.removeAccount(ewsAccount, false);
  });
});

/**
 * Tests sending a message when there is no access token and no refresh token.
 */
async function subtestNoTokens(identity, outgoingServer, server) {
  info(`sending a message to ${outgoingServer.type} server with no tokens`);
  Services.fog.testResetFOG();
  const { composeWindow, subject } = await newComposeWindow(identity);

  const oAuthPromise = handleOAuthDialog();
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await oAuthPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  info("checking results");
  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "test.test",
      reason: "no refresh token",
      result: "succeeded",
    },
  ]);
  checkSavedToken();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
}

add_task(async function testNoTokensSMTP() {
  await subtestNoTokens(smtpIdentity, smtpOutgoingServer, smtpServer);
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testNoTokensEWS() {
  await subtestNoTokens(ewsIdentity, ewsOutgoingServer, ewsServer);
});

/**
 * Tests that with a saved refresh token, but no access token, a new access token is requested.
 */
async function subtestNoAccessToken(identity, outgoingServer, server) {
  await addLoginInfo(
    "oauth://test.test",
    "user",
    "refresh_token",
    "test_mail test_addressbook test_calendar"
  );

  info(
    `sending a message to ${outgoingServer.type} server with a refresh token but no access token`
  );
  const { composeWindow, subject } = await newComposeWindow(identity);

  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );

  await BrowserTestUtils.domWindowClosed(composeWindow);

  info("checking results");
  checkSavedToken();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
}

add_task(async function testNoAccessTokenSMTP() {
  await subtestNoAccessToken(smtpIdentity, smtpOutgoingServer, smtpServer);
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testNoAccessTokenEWS() {
  await subtestNoAccessToken(ewsIdentity, ewsOutgoingServer, ewsServer);
});

/**
 * Tests that with an expired access token, a new access token is requested.
 */
async function subtestExpiredAccessToken(identity, outgoingServer, server) {
  await addLoginInfo(
    "oauth://test.test",
    "user",
    "refresh_token",
    "test_mail test_addressbook test_calendar"
  );

  info("poisoning the cache with an expired access token");
  oAuth2Server.accessToken = "expired_access_token";
  oAuth2Server.expiry = -3600;

  const expiredModule = new OAuth2Module();
  expiredModule.initFromOutgoing(outgoingServer);
  await expiredModule._oauth.connect(false, false);

  oAuth2Server.accessToken = "access_token";
  oAuth2Server.expiry = null;

  info(
    `sending a message to ${outgoingServer.type} server with an expired access token`
  );
  Services.fog.testResetFOG();
  const { composeWindow, subject } = await newComposeWindow(identity);

  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );

  await BrowserTestUtils.domWindowClosed(composeWindow);

  info("checking results");
  OAuth2TestUtils.checkTelemetry([]);
  checkSavedToken();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
}

add_task(async function testExpiredAccessTokenSMTP() {
  await subtestExpiredAccessToken(smtpIdentity, smtpOutgoingServer, smtpServer);
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testExpiredAccessTokenEWS() {
  await subtestExpiredAccessToken(ewsIdentity, ewsOutgoingServer, ewsServer);
});

/**
 * Tests with a bad access token. This simulates an authentication server
 * giving a token that the mail server is not expecting. Very little can be
 * done here, so we notify the user and give up.
 */
async function subtestBadAccessToken(identity, outgoingServer) {
  await addLoginInfo(
    "oauth://test.test",
    "user",
    "refresh_token",
    "test_mail test_addressbook test_calendar"
  );

  info("poisoning the cache with a bad access token");
  oAuth2Server.accessToken = "bad_access_token";

  const expiredModule = new OAuth2Module();
  expiredModule.initFromOutgoing(outgoingServer);
  await expiredModule._oauth.connect(false, false);
  Assert.equal(expiredModule._oauth.accessToken, "bad_access_token");

  OAuth2TestUtils.revokeToken("bad_access_token");

  info(
    `sending a message to ${outgoingServer.type} server with a bad access token`
  );
  Services.fog.testResetFOG();
  const { composeWindow } = await newComposeWindow(identity);

  const promptPromise = BrowserTestUtils.promiseAlertDialog("cancel");
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

  info("checking results");
  OAuth2TestUtils.checkTelemetry([]);

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
  oAuth2Server.accessToken = "access_token";
}

add_task(async function testBadAccessTokenSMTP() {
  await subtestBadAccessToken(smtpIdentity, smtpOutgoingServer, smtpServer);
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testBadAccessTokenEWS() {
  await subtestBadAccessToken(ewsIdentity, ewsOutgoingServer);
}).skip(); // Uses a system notification instead of a prompt.

/**
 * Tests again with a bad access token, but this time the authentication
 * server gives a valid token. Clicking "Retry" at the prompt should result in
 * the message being sent with no further interaction.
 */
async function subtestRevokedAccessToken1(identity, outgoingServer, server) {
  await addLoginInfo(
    "oauth://test.test",
    "user",
    "refresh_token",
    "test_mail test_addressbook test_calendar"
  );

  info("poisoning the cache with a bad access token");
  oAuth2Server.accessToken = "revoked_access_token_1";

  const expiredModule = new OAuth2Module();
  expiredModule.initFromOutgoing(outgoingServer);
  await expiredModule._oauth.connect(false, false);
  Assert.equal(expiredModule._oauth.accessToken, "revoked_access_token_1");

  OAuth2TestUtils.revokeToken("revoked_access_token_1");
  oAuth2Server.accessToken = "access_token";

  info(
    `sending a message to ${outgoingServer.type} server with a revoked access token`
  );
  Services.fog.testResetFOG();
  const { composeWindow, subject } = await newComposeWindow(identity);

  // The "accept" button is labelled "Retry".
  const promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  info("checking results");
  OAuth2TestUtils.checkTelemetry([]);
  checkSavedToken();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
}

add_task(async function testRevokedAccessToken1SMTP() {
  await subtestRevokedAccessToken1(
    smtpIdentity,
    smtpOutgoingServer,
    smtpServer
  );
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testRevokedAccessToken1EWS() {
  await subtestRevokedAccessToken1(ewsIdentity, ewsOutgoingServer);
}).skip(); // Uses a system notification instead of a prompt.

/**
 * Tests again with a bad access token, but this time the authentication
 * server gives a valid token. Clicking "Enter New Password" at the prompt
 * should bring up the OAuth2 authentication window and replace the refresh
 * token.
 */
async function subtestRevokedAccessToken2(identity, outgoingServer, server) {
  await addLoginInfo(
    "oauth://test.test",
    "user",
    "refresh_token",
    "test_mail test_addressbook test_calendar"
  );

  info("poisoning the cache with a bad access token");
  oAuth2Server.accessToken = "revoked_access_token_2";
  oAuth2Server.rotateTokens = true;

  const expiredModule = new OAuth2Module();
  expiredModule.initFromOutgoing(outgoingServer);
  await expiredModule._oauth.connect(false, false);
  Assert.equal(expiredModule._oauth.accessToken, "revoked_access_token_2");

  OAuth2TestUtils.revokeToken("revoked_access_token_2");
  oAuth2Server.accessToken = "access_token";

  info(
    `sending a message to ${outgoingServer.type} server with a revoked access token`
  );
  Services.fog.testResetFOG();
  const { composeWindow, subject } = await newComposeWindow(identity);

  // The "extra1" button is labelled "Enter New Password".
  const promptPromise = BrowserTestUtils.promiseAlertDialog("extra1").then(() =>
    handleOAuthDialog()
  );
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await promptPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  info("checking results");
  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "test.test",
      reason: "no refresh token",
      result: "succeeded",
    },
  ]);
  checkSavedToken("refresh_token_1");

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
  oAuth2Server.refreshToken = "refresh_token";
  oAuth2Server.rotateTokens = false;
}

add_task(async function testRevokedAccessToken2SMTP() {
  await subtestRevokedAccessToken2(
    smtpIdentity,
    smtpOutgoingServer,
    smtpServer
  );
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testRevokedAccessToken2EWS() {
  await subtestRevokedAccessToken2(ewsIdentity, ewsOutgoingServer);
}).skip(); // Uses a system notification instead of a prompt.

/**
 * Tests that with a bad saved refresh token, new tokens are requested.
 */
async function subtestBadRefreshToken(identity, outgoingServer, server) {
  await addLoginInfo(
    "oauth://test.test",
    "user",
    "old_refresh_token",
    "test_mail test_addressbook test_calendar"
  );

  info(
    `sending a message to ${outgoingServer.type} server with a bad refresh token`
  );
  Services.fog.testResetFOG();
  const { composeWindow, subject } = await newComposeWindow(identity);

  const oAuthPromise = handleOAuthDialog();
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await oAuthPromise;

  await BrowserTestUtils.domWindowClosed(composeWindow);

  info("checking results");
  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "test.test",
      reason: "invalid grant",
      result: "succeeded",
    },
  ]);
  checkSavedToken();

  Assert.stringContains(
    server.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
}

add_task(async function testBadRefreshTokenSMTP() {
  await subtestBadRefreshToken(smtpIdentity, smtpOutgoingServer, smtpServer);
  smtpOutgoingServer.closeCachedConnections();
});

add_task(async function testBadRefreshTokenEWS() {
  await subtestBadRefreshToken(ewsIdentity, ewsOutgoingServer, ewsServer);
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

function checkSavedToken(expectedToken = "refresh_token") {
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
  Assert.equal(logins[0].password, expectedToken, "login token");
  Assert.equal(logins[0].usernameField, "", "login usernameField");
  Assert.equal(logins[0].passwordField, "", "login passwordField");
}
