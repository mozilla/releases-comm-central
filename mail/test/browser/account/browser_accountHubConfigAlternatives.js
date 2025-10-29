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
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      configFoundTemplate.querySelector("#imap") &&
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingUsername").textContent,
    "user",
    "Should show replaced username on incoming config."
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingHost").textContent,
    "test.test",
    "Should show replaced host on incoming config."
  );

  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#pop3 input"),
    {}
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingUsername").textContent,
    "user@test.test",
    "Should show replaced username on incoming config."
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingHost").textContent,
    "atest.test",
    "Should show replaced host on incoming config."
  );

  await subtest_clear_status_bar();

  OAuth2TestUtils.stopServer();
  oauthImap.close();
  oauthSmtp.close();
  OAuth2TestUtils.forgetObjects();
  Services.logins.removeAllLogins();
  await subtest_close_account_hub_dialog(dialog, configFoundTemplate);
});
