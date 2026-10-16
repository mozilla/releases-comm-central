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
const { detection } = ChromeUtils.importESModule(
  "resource:///modules/calendar/utils/calProviderDetectionUtils.sys.mjs"
);

const PREF_NAME = "mailnews.auto_config_url";
const MANUAL_CONFIG_PREF = "mail.accounthub.manualconfig.enabled";
const originalDetect = detection.detect;

add_setup(async function () {
  // Set the pref to load a local autoconfig file and disable the manual
  // configuration shortcut for these tests.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_NAME, url],
      [MANUAL_CONFIG_PREF, false],
    ],
  });
  registerCleanupFunction(() => {
    detection.detect = originalDetect;
  });
});

add_task(async function test_account_oauth_imap_account() {
  await subtest_oauth_imap_account("user@test.test", "test_mail", [
    "ics",
    "caldav",
  ]);
});

add_task(async function test_account_oauth_imap_account_caldav_scope() {
  // The scope must be checked at the incoming server, not the email domain.
  await subtest_oauth_imap_account(
    "user@oauth-hosted.test",
    "test_mail test_calendar",
    ["ics"]
  );
});

/**
 * Creates an OAuth2 IMAP account and checks which calendar providers are
 * skipped during calendar detection.
 *
 * @param {string} email - The email address of the account, at a domain whose
 *   autoconfig points at the test.test servers.
 * @param {string} grantedScope - The scopes to grant in the OAuth2 prompt.
 * @param {string[]} expectedSkippedTypes - The calendar provider types that
 *   should be skipped.
 */
async function subtest_oauth_imap_account(
  email,
  grantedScope,
  expectedSkippedTypes
) {
  Services.fog.testResetFOG();
  let skippedTypes;
  detection.detect = async (
    username,
    password,
    location,
    savePassword,
    preDetectFilters
  ) => {
    skippedTypes = preDetectFilters.flatMap(filter =>
      filter([], location, username)
    );
    return new Map();
  };

  const [oauthImap, oauthSmtp] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.oAuth,
    ServerTestUtils.serverDefs.smtp.oAuth,
  ]);
  await OAuth2TestUtils.startServer();
  const emailUser = {
    name: "John Doe",
    email,
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
        grantedScope,
      },
    ],
    OAuth2TestUtils.submitOAuthLogin
  );
  Assert.ok(
    dialog.querySelector("account-hub-email.busy"),
    "Should be loading"
  );

  await BrowserTestUtils.waitForMutationCondition(
    configFoundTemplate,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isHidden(configFoundTemplate)
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

  // Creating an account with no address books and calendars should lead to
  // the success view.
  const successStep = dialog.querySelector("email-added-success");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", successStep);
  Assert.ok(
    dialog.querySelector("account-hub-email:not(.busy)"),
    "Should no longer be loading"
  );

  const events = Glean.mail.accountHubFinished.testGetValue();
  Assert.equal(events.length, 1, "Should have recorded account_hub_finished");
  Assert.equal(
    events[0]?.extra.account_type,
    "imap",
    "should have recorded account_type"
  );
  Assert.equal(
    events[0]?.extra.address_books,
    0,
    "should have recorded no address_books"
  );
  Assert.equal(
    events[0]?.extra.calendars,
    0,
    "should have recorded no calendars"
  );

  Assert.deepEqual(
    skippedTypes,
    expectedSkippedTypes,
    "calendar detection should skip the expected provider types"
  );
  detection.detect = originalDetect;

  await subtest_clear_status_bar();
  MailServices.accounts.removeAccount(imapAccount);
  MailServices.outgoingServer.deleteServer(
    MailServices.outgoingServer.servers.find(s => s.key != "smtp1")
  );

  OAuth2TestUtils.stopServer();
  oauthImap.close();
  oauthSmtp.close();
  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();
  await subtest_close_account_hub_dialog(dialog, successStep);
}

add_task(async function test_account_oauth_cancel_prompt_window() {
  const [oauthImap, oauthSmtp] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.oAuth,
    ServerTestUtils.serverDefs.smtp.oAuth,
  ]);
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

  Assert.ok(
    BrowserTestUtils.isVisible(footer.querySelector("#back")),
    "Back button should be visible"
  );

  await SimpleTest.promiseFocus(oAuthWindow.getBrowser());
  EventUtils.synthesizeKey("KEY_Escape", {}, oAuthWindow);

  await TestUtils.waitForCondition(
    () => !dialog.querySelector("account-hub-email.busy"),
    "Should stop loading"
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

  // The back button should be visible still.
  Assert.ok(
    BrowserTestUtils.isVisible(footer.querySelector("#back")),
    "Back button should be visible"
  );

  await subtest_clear_status_bar();

  OAuth2TestUtils.stopServer();
  oauthImap.close();
  oauthSmtp.close();
  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();
  await subtest_close_account_hub_dialog(dialog, configFoundTemplate);
});

add_task(async function test_account_oauth_cancel_button() {
  const [oauthImap, oauthSmtp] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.oAuth,
    ServerTestUtils.serverDefs.smtp.oAuth,
  ]);
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

  // The back button should be visible to allow cancelling the config
  // verification.
  Assert.ok(
    BrowserTestUtils.isVisible(footer.querySelector("#back")),
    "Back button should be visible"
  );

  // Click cancel button.
  EventUtils.synthesizeMouseAtCenter(footer.querySelector("#back"), {});

  await BrowserTestUtils.windowClosed(oAuthWindow);
  await TestUtils.waitForCondition(
    () => !dialog.querySelector("account-hub-email.busy"),
    "Should stop loading"
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

  // The back button should be visible still.
  Assert.ok(
    BrowserTestUtils.isVisible(footer.querySelector("#back")),
    "Back button should be visible"
  );

  await subtest_clear_status_bar();

  OAuth2TestUtils.stopServer();
  oauthImap.close();
  oauthSmtp.close();
  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();
  await subtest_close_account_hub_dialog(dialog, configFoundTemplate);
});
