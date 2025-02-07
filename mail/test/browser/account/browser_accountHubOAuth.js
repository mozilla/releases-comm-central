/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

add_setup(function () {
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
});

registerCleanupFunction(function () {
  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

add_task(async function test_account_oauth_imap_account() {
  const oauthImap = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.imap.oAuth
  );
  const oauthSmtp = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.smtp.oAuth
  );
  await OAuth2TestUtils.startServer();
  const emailUser = {
    name: "John Doe",
    email: "user@test.test",
  };

  const dialog = await subtest_open_account_hub_dialog();
  await subtest_fill_initial_config_fields(dialog, emailUser);
  const footer = dialog.querySelector("account-hub-footer");
  const footerForward = footer.querySelector("#forward");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      configFoundTemplate.querySelector("#imap") &&
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  const oAuthWindowPromise = OAuth2TestUtils.promiseOAuthWindow();
  // Continue button should trigger oAuth popup.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const oAuthWindow = await oAuthWindowPromise;
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [
      {
        expectedHint: "user",
        username: "user",
        password: "password",
        // Skip caldav/carddav discovery by not granting the scopes
        grantedScope: "test_mail",
      },
    ],
    OAuth2TestUtils.submitOAuthLogin
  );
  Assert.ok(
    dialog.querySelector("account-hub-email.busy"),
    "Should be loading"
  );

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(configFoundTemplate),
    "The config found subview should be hidden."
  );

  const imapAccount = MailServices.accounts.accounts.find(
    account => account.defaultIdentity.email === emailUser.email
  );

  Assert.ok(imapAccount, "IMAP account should be created");
  Assert.equal(
    imapAccount.incomingServer.authMethod,
    Ci.nsMsgAuthMethod.OAuth2,
    "Should use OAuth as auth method"
  );
  Assert.ok(
    dialog.querySelector("account-hub-email:not(.busy)"),
    "Should no longer be loading"
  );

  await subtest_clear_status_bar();
  MailServices.accounts.removeAccount(imapAccount);

  OAuth2TestUtils.stopServer();
  oauthImap.close();
  oauthSmtp.close();
  OAuth2TestUtils.forgetObjects();
  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog);
});

add_task(async function test_account_oauth_cancel() {
  const oauthImap = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.imap.oAuth
  );
  const oauthSmtp = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.smtp.oAuth
  );
  await OAuth2TestUtils.startServer();
  const emailUser = {
    name: "John Doe",
    email: "user@test.test",
  };

  const dialog = await subtest_open_account_hub_dialog();
  await subtest_fill_initial_config_fields(dialog, emailUser);
  const footer = dialog.querySelector("account-hub-footer");
  const footerForward = footer.querySelector("#forward");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      configFoundTemplate.querySelector("#imap") &&
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  const oAuthWindowPromise = OAuth2TestUtils.promiseOAuthWindow();
  // Continue button should trigger oAuth popup.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const oAuthWindow = await oAuthWindowPromise;
  await SimpleTest.promiseFocus(oAuthWindow.getBrowser());
  EventUtils.synthesizeKey("KEY_Escape", {}, oAuthWindow);

  await TestUtils.waitForCondition(
    () => !dialog.querySelector("account-hub-email.busy"),
    "Should stop loading."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(configFoundTemplate),
    "Should still be on config template"
  );
  Assert.ok(
    MailServices.accounts.accounts.every(
      account => account.defaultIdentity?.email !== emailUser.email
    ),
    "Should have no email account for the address"
  );
  Assert.ok(!footerForward.disabled, "Forward button should still be enabled");

  await subtest_clear_status_bar();

  OAuth2TestUtils.stopServer();
  oauthImap.close();
  oauthSmtp.close();
  OAuth2TestUtils.forgetObjects();
  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog);
});
