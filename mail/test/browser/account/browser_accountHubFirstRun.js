/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

add_setup(async () => {
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NAME, url]],
  });
});

registerCleanupFunction(function () {
  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

add_task(async function test_application_init_with_first_run_account_hub() {
  Assert.ok(
    window.gSpacesToolbar.isLoaded,
    "Spaces toolbar should be initialized"
  );
  Assert.ok(
    window.SessionStoreManager._restored,
    "Should have restored the session"
  );
});

add_task(async function test_account_hub_first_run() {
  const dialog = await subtest_open_account_hub_dialog();

  Assert.ok(
    dialog.classList.contains("account-hub-first-run"),
    "Should have the first run class"
  );
  Assert.ok(
    window.AccountHubController.isFirstRun,
    "Should have first run correctly set"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["mail.provider.suppress_dialog_on_startup", true]],
  });

  Assert.ok(
    dialog.classList.contains("account-hub-first-run"),
    "Should still have have the first run class after update before reopening"
  );
  Assert.equal(
    window.AccountHubController.isFirstRun,
    true,
    "Should still have first run true after update before reopening"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_account_hub_header_branding() {
  IMAPServer.open();
  SMTPServer.open();
  const emailUser = {
    name: "John Doe",
    email: "john.doe@imap.test",
    password: "abc12345",
    incomingHost: "testin.imap.test",
    outgoingHost: "testout.imap.test",
  };

  const dialog = await subtest_open_account_hub_dialog();

  const header = dialog
    .querySelector("email-auto-form")
    .shadowRoot.querySelector("account-hub-header");

  Assert.equal(
    header.shadowRoot
      .querySelector(".branding-header-name")
      .getAttribute("data-l10n-id"),
    "account-hub-welcome",
    "Should show correct welcome message on firstRun"
  );
  Assert.equal(
    header.shadowRoot
      .querySelector(".branding-header-title")
      .getAttribute("data-l10n-id"),
    "account-hub-welcome-brand",
    "Should show correct welcome branding title on firstRun"
  );
  Assert.ok(
    header.shadowRoot
      .querySelector(".branding-header-name")
      .hasAttribute("aria-hidden"),
    "Should not expose name to screen reader"
  );
  Assert.ok(
    header.shadowRoot
      .querySelector(".branding-header-title")
      .hasAttribute("aria-hidden"),
    "Should not expose title to screen reader"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
      header.shadowRoot.querySelector(".account-hub-welcome-text")
    ),
    "Should show a11y friendly welcome text"
  );

  await subtest_fill_initial_config_fields(dialog, emailUser);
  const footer = dialog.querySelector("account-hub-footer");
  const footerForward = footer.querySelector("#forward");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  // Continue button should lead to password template.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(dialog.querySelector("email-password-form")),
    "The email password form should be visible."
  );

  const emailPasswordTemplate = dialog.querySelector("email-password-form");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(
        emailPasswordTemplate.querySelector("#password")
      ),
    "The password form input should be visible."
  );
  const passwordInput = emailPasswordTemplate.querySelector("#password");

  EventUtils.synthesizeMouseAtCenter(passwordInput, {});
  // Entering the correct password should hide current subview.
  const inputEvent = BrowserTestUtils.waitForEvent(
    passwordInput,
    "input",
    true,
    event => event.target.value === "abc12345"
  );
  EventUtils.sendString("abc12345", window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(emailPasswordTemplate),
    "The email password subview should be hidden."
  );

  let imapAccount;

  await TestUtils.waitForCondition(
    () =>
      (imapAccount = MailServices.accounts.accounts.find(
        account => account.identities[0]?.email === emailUser.email
      )),
    "The user account should be created."
  );

  // Creating an account with no address books and calendars should lead to
  // the success view.
  const successStep = dialog.querySelector("email-added-success");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", successStep);

  await subtest_close_account_hub_dialog(dialog, successStep);

  await subtest_open_account_hub_dialog();

  Assert.equal(
    header.shadowRoot
      .querySelector(".branding-header-name")
      .getAttribute("data-l10n-id"),
    "account-hub-brand",
    "Should show default branding header text"
  );
  Assert.equal(
    header.shadowRoot
      .querySelector(".branding-header-title")
      .getAttribute("data-l10n-id"),
    "account-hub-title",
    "Should show default branding title text"
  );
  Assert.ok(
    !header.shadowRoot
      .querySelector(".branding-header-name")
      .hasAttribute("aria-hidden"),
    "Should not expose name to screen reader"
  );
  Assert.ok(
    !header.shadowRoot
      .querySelector(".branding-header-title")
      .hasAttribute("aria-hidden"),
    "Should not expose title to screen reader"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      header.shadowRoot.querySelector(".account-hub-welcome-text")
    ),
    "Should show a11y friendly welcome text"
  );

  MailServices.accounts.removeAccount(imapAccount);
  await Services.logins.removeAllLoginsAsync();

  MailServices.accounts.removeAccount(
    MailServices.accounts.findAccountForServer(
      MailServices.accounts.localFoldersServer
    )
  );
  MailServices.outgoingServer.deleteServer(
    MailServices.outgoingServer.servers[0]
  );

  IMAPServer.close();
  SMTPServer.close();

  await SpecialPowers.popPrefEnv();

  const closeButton = header.shadowRoot.querySelector("#closeButton");
  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(closeButton, {});
  await closeEvent;

  await subtest_clear_status_bar();
});
