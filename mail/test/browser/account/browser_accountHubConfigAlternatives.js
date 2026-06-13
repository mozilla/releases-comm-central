/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

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

  for (const selector of [
    "#incomingUsername",
    "#incomingSocketType",
    "#incomingAuthenticationType",
    "#outgoingUsername",
    "#outgoingSocketType",
    "#outgoingAuthenticationType",
  ]) {
    Assert.ok(
      BrowserTestUtils.isHidden(configFoundTemplate.querySelector(selector)),
      `${selector} should be hidden when shared details shown`
    );
  }

  Assert.ok(
    BrowserTestUtils.isVisible(
      configFoundTemplate.querySelector(".config-common")
    ),
    "Shared config details should be visible when incoming and outgoing details match"
  );
  Assert.equal(
    configFoundTemplate.querySelector("#sharedUsername").textContent,
    "user",
    "Should show replaced username in shared config details."
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingHost").textContent,
    "test.test",
    "Should show replaced host on incoming config."
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingPort").textContent,
    "143",
    "Should show expected port on IMAP config."
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#sharedSocketType")
    ).id,
    "account-hub-result-no-encryption",
    "Should show expected socket type on IMAP config."
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#sharedAuthenticationType")
    ).id,
    "account-hub-result-auth-oauth2",
    "Should show expected authentication type on IMAP config."
  );

  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#pop3 input"),
    {}
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      configFoundTemplate.querySelector(".config-common")
    ),
    "Shared config details should be hidden when any shared detail differs"
  );
  for (const selector of [
    "#incomingUsername",
    "#incomingSocketType",
    "#incomingAuthenticationType",
    "#outgoingUsername",
    "#outgoingSocketType",
    "#outgoingAuthenticationType",
  ]) {
    Assert.ok(
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector(selector)),
      `${selector} should be visible when shared configs hidden`
    );
  }
  Assert.equal(
    configFoundTemplate.querySelector("#incomingHost").textContent,
    "atest.test",
    "POP3 incoming host should be displayed"
  );
  Assert.equal(
    configFoundTemplate.querySelector("#outgoingUsername").textContent,
    "user",
    "POP3 outgoing username should be displayed"
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingUsername").textContent,
    "user@test.test",
    "Should show replaced username on incoming config."
  );
  Assert.equal(
    configFoundTemplate.querySelector("#outgoingUsername").textContent,
    "user",
    "Outgoing username should be shown"
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingHost").textContent,
    "atest.test",
    "Should show replaced host on incoming config."
  );

  Assert.equal(
    configFoundTemplate.querySelector("#incomingPort").textContent,
    "143",
    "Should show expected port on POP3 config."
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#incomingSocketType")
    ).id,
    "account-hub-result-starttls",
    "Should show expected incoming socket type on POP3 config."
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#incomingAuthenticationType")
    ).id,
    "account-hub-result-auth-password",
    "Should show expected incoming authentication type on POP3 config."
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#outgoingSocketType")
    ).id,
    "account-hub-result-no-encryption",
    "Should show expected outgoing socket type on POP3 config."
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#outgoingAuthenticationType")
    ).id,
    "account-hub-result-auth-oauth2",
    "Should show expected outgoing authentication type on POP3 config."
  );

  await subtest_clear_status_bar();

  await Services.logins.removeAllLoginsAsync();
  await subtest_close_account_hub_dialog(dialog, configFoundTemplate);
});
