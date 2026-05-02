/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the "Sign in with Thundermail" account setup button.
 *
 * In this test we actually sign in with external.test, because we can't use
 * real services in a test environment.
 */

const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const username = "roc@external.test";
const jwt = {
  name: "Roc E. Mail",
  preferred_username: username,
  some_other_stuff: "stuff",
};
const accessToken = `foo.${ChromeUtils.base64URLEncode(
  new TextEncoder().encode(JSON.stringify(jwt)),
  { pad: false }
)}.baz`;
info(`The access token is "${accessToken}".`);

add_setup(async function () {
  SpecialPowers.pushPrefEnv({
    set: [
      ["mail.accounthub.thundermail.enabled", true],
      ["mail.accounthub.thundermail.hostname", "external.test"],
      [
        "mailnews.auto_config_url",
        "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/",
      ],
      ["mailnews.oauth.useExternalBrowser", true],
    ],
  });
  Services.fog.testResetFOG();

  OAuth2TestUtils.startServer({ username, accessToken });
  await ServerTestUtils.createServers([
    {
      ...ServerTestUtils.serverDefs.imap.oAuth,
      options: {
        username: "roc@external.test",
        password: accessToken,
      },
      hostname: "external.test",
    },
    ServerTestUtils.serverDefs.smtp.oAuth,
  ]);
});

registerCleanupFunction(async () => {
  await Services.logins.removeAllLoginsAsync();
});

add_task(async function () {
  const dialog = await subtest_open_account_hub_dialog();
  const button = dialog.querySelector(".account-hub-thundermail-button");
  const footer = dialog.querySelector("#emailFooter");
  const footerForward = footer.querySelector("#forward");

  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(button),
    "waiting for Thundermail button to be visible"
  );

  // Click the button. Pretend we've gone to our browser and logged in.
  const urlPromise = OAuth2TestUtils.promiseExternalOAuthURL();
  EventUtils.synthesizeMouseAtCenter(button, {}, button.ownerGlobal);
  const url = await urlPromise;
  await OAuth2TestUtils.submitOAuthURL(url, {
    expectedScope: "test_mail",
    username,
    password: "password",
  });

  // Wait for the Thundermail config to be found and displayed, then move on.
  const configFoundStep = dialog.querySelector("email-config-found");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundStep),
    "waiting for Thundermail config to be found"
  );
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  // Close the account hub.
  const successStep = dialog.querySelector("email-added-success");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(successStep),
    "waiting for account added success message"
  );
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  // Okay, we've finished the account set up. Check the login is saved.
  const logins = await Services.logins.searchLoginsAsync({
    origin: "oauth://external.test",
  });
  Assert.equal(
    logins.length,
    1,
    "there should be a saved password for this server"
  );
  Assert.equal(logins[0].origin, "oauth://external.test", "login origin");
  Assert.equal(logins[0].formActionOrigin, null, "login formActionOrigin");
  Assert.equal(logins[0].httpRealm, "test_mail", "login httpRealm");
  Assert.equal(logins[0].username, username, "login username");
  Assert.equal(logins[0].password, "refresh_token", "login password");

  // Check the incoming server config was saved.
  Assert.equal(MailServices.accounts.accounts.length, 3);
  const account = MailServices.accounts.accounts.find(
    a => !["account1", "account2"].includes(a.key)
  );
  const imapServer = account.incomingServer;
  Assert.equal(imapServer.type, "imap");
  Assert.equal(imapServer.hostName, "external.test");
  Assert.equal(imapServer.port, 143);
  Assert.equal(imapServer.authMethod, Ci.nsMsgAuthMethod.OAuth2);
  Assert.equal(imapServer.username, username);

  // Check the outgoing server config was saved.
  Assert.equal(MailServices.outgoingServer.servers.length, 2);
  const smtpServer = MailServices.outgoingServer.servers.find(
    s => s.key != "smtp1"
  );
  Assert.equal(smtpServer.type, "smtp");
  Assert.equal(smtpServer.hostname, "external.test");
  Assert.equal(smtpServer.port, 587);
  Assert.equal(smtpServer.authMethod, Ci.nsMsgAuthMethod.OAuth2);
  Assert.equal(smtpServer.username, username);

  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "external.test",
      reason: "no refresh token",
      result: "succeeded",
      where: "external",
    },
  ]);

  // Clean up.
  MailServices.accounts.removeAccount(account, false);
  MailServices.outgoingServer.deleteServer(smtpServer);
});
