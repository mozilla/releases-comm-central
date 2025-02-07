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

// TODO: Defer this for when the account hub replaces the account setup tab.
// add_task(async function test_account_hub_opening_at_startup() {});

add_task(async function test_account_hub_opening() {
  // TODO: Use an actual button once it's implemented in the UI.
  // Open the dialog.
  await window.openAccountHub();

  const hub = document.querySelector("account-hub-container");
  await BrowserTestUtils.waitForMutationCondition(
    hub,
    { childList: true },
    () => !!hub.shadowRoot.querySelector(".account-hub-dialog")
  );

  const dialog = hub.shadowRoot.querySelector(".account-hub-dialog");
  Assert.ok(dialog, "The dialog element should be created");
  Assert.ok(dialog.open, "Dialog should be open");

  let closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeKey("KEY_Escape", {});
  await closeEvent;
  Assert.ok(
    !dialog.open,
    "The dialog element should close when pressing Escape"
  );

  // Open the dialog again.
  await window.openAccountHub();
  await BrowserTestUtils.waitForMutationCondition(
    hub,
    { childList: true },
    () => !!hub.shadowRoot.querySelector(".account-hub-dialog")
  );
  Assert.ok(dialog.open, "The dialog element should be opened again");

  closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {}
  );
  await closeEvent;
  Assert.ok(
    !dialog.open,
    "The dialog element should close when clicking on the close button"
  );
});

add_task(async function test_account_email_step() {
  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog();

  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footerForward = dialog
    .querySelector("#emailFooter")
    .querySelector("#forward");

  // Ensure fields are empty.
  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  nameInput.value = "";
  emailInput.value = "";

  // Check if the input icons are hidden.
  const icons = emailTemplate.querySelectorAll("img");

  for (const icon of icons) {
    Assert.ok(BrowserTestUtils.isHidden(icon), `${icon.src} should be hidden`);
  }

  Assert.ok(
    footerForward.disabled,
    "Account Hub footer forward button should be disabled"
  );

  // Type a full name into the name input element and check for success.
  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === "Test User"
  );
  EventUtils.sendString("Test User", window);
  await inputEvent;

  // Move to email input to trigger animation icon.
  EventUtils.synthesizeMouseAtCenter(emailInput, {});

  const nameSuccessIcon = Array.from(icons).find(img =>
    img.classList.contains("icon-success")
  );
  Assert.ok(
    BrowserTestUtils.isVisible(nameSuccessIcon),
    "Name success icon should be visible"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(emailTemplate.querySelector("#nameErrorMessage")),
    "Name error message should be hidden"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      emailTemplate.querySelector("#emailErrorMessage")
    ),
    "Email error message should be hidden"
  );

  EventUtils.synthesizeMouseAtCenter(nameInput, { clickCount: 3 });
  // Delete text and move back to name input to reveal error icon.
  const clearInputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => !event.target.value
  );
  EventUtils.synthesizeKey("KEY_Backspace", {});
  await clearInputEvent;

  Assert.ok(
    BrowserTestUtils.isHidden(nameSuccessIcon),
    "Name success icon should be hidden"
  );

  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  const nameDangerIcon = Array.from(icons).find(img =>
    img.classList.contains("icon-danger")
  );
  Assert.ok(
    BrowserTestUtils.isVisible(nameDangerIcon),
    "Name danger icon should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      emailTemplate.querySelector("#nameErrorMessage")
    ),
    "Name error message should be visible"
  );

  // Hit the enter key when in the name form input, and the email danger
  // icon should show.
  EventUtils.synthesizeKey("KEY_Enter", {});
  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon should be visible"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
      emailTemplate.querySelector("#emailErrorMessage")
    ),
    "Email error message should be visible"
  );

  // Fill name and incorrect email input, error email icon should be still
  // be showing.
  EventUtils.synthesizeMouseAtCenter(nameInput, {});
  inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === "Test User"
  );
  EventUtils.sendString("Test User", window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(emailInput, {});
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === "testUser@"
  );
  EventUtils.sendString("testUser@", window);
  await inputEvent;
  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon should be visible"
  );

  // Fill in correct email input, see email success icon and continue should
  // be enabled.
  EventUtils.synthesizeMouseAtCenter(emailInput, {});
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === "testUser@testing.com"
  );
  // Ensure we move to the end of the input.
  EventUtils.synthesizeKey("KEY_End", {});
  EventUtils.sendString("testing.com", window);
  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  Assert.ok(
    BrowserTestUtils.isHidden(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailSuccess")),
    "Email success icon should be visible"
  );

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  await subtest_close_account_hub_dialog(dialog);
});

add_task(async function test_account_email_config_found() {
  const dialog = await subtest_open_account_hub_dialog();
  await subtest_fill_initial_config_fields(dialog);
  const configFoundTemplate = dialog.querySelector("email-config-found");

  const footerBack = dialog
    .querySelector("#emailFooter")
    .querySelector("#back");
  // Press the back button and show the initial email template again.
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(dialog.querySelector("email-auto-form")),
    "The initial email template should be in view"
  );

  // Press the enter button after selecting the email input to show the config
  // found template.
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("email-auto-form").querySelector("#email"),
    {}
  );
  EventUtils.synthesizeKey("KEY_Enter", {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundTemplate),
    "The email config found template should be in view"
  );

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#pop3")),
    "POP3 config option should be visible"
  );

  // This config should not include exchange.
  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate.querySelector("#exchange")),
    "Exchange config option should be hidden"
  );

  // POP3 should be the recommended configuration.
  Assert.ok(
    BrowserTestUtils.isVisible(
      configFoundTemplate.querySelector("#pop3").querySelector(".recommended")
    ),
    "POP3 should be the recommended config option"
  );

  // POP3 should be the selected config.
  Assert.ok(
    configFoundTemplate.querySelector("#pop3").classList.contains("selected"),
    "POP3 should be the selected config option"
  );

  // The config details should show the POP3 details.
  subtest_config_results(configFoundTemplate, "pop");

  // Select the IMAP config and check the details match.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#imap"),
    {}
  );

  Assert.ok(
    configFoundTemplate.querySelector("#imap").classList.contains("selected"),
    "IMAP should be the selected config option"
  );

  // The config details should show the IMAP details.
  subtest_config_results(configFoundTemplate, "imap");

  // Edit configuration button should lead to incoming config template.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {}
  );

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate),
    "The config found template should be hidden"
  );

  await subtest_close_account_hub_dialog(dialog);
});

add_task(async function test_account_enter_password_imap_account() {
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

  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate),
    "The config found template should be hidden."
  );
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(dialog.querySelector("email-password-form")),
    "The email password form should be visible."
  );

  // Updating rememberSignons pref should enable and check remember password.
  const rememberSignonsPref = Services.prefs.getBoolPref(
    "signon.rememberSignons"
  );
  Services.prefs.setBoolPref("signon.rememberSignons", true);

  const emailPasswordTemplate = dialog.querySelector("email-password-form");
  const rememberPasswordInput =
    emailPasswordTemplate.querySelector("#rememberPassword");
  // The new preference for rememberSignons is set to true, so the
  // remember password checkbox should be checked and enabled.
  Assert.ok(
    !rememberPasswordInput.disabled,
    "The remember password input should be disabled."
  );
  Assert.ok(
    rememberPasswordInput.checked,
    "The remember password input should be unchecked."
  );

  // Reverting rememberSignons pref should disable and uncheck remember
  // password.
  Services.prefs.setBoolPref("signon.rememberSignons", rememberSignonsPref);

  Assert.ok(
    rememberPasswordInput.disabled,
    "The remember password input should be disabled."
  );
  Assert.ok(
    !rememberPasswordInput.checked,
    "The remember password input should be unchecked."
  );

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(
        emailPasswordTemplate.querySelector("#password")
      ),
    "The password form input should be visible."
  );
  const passwordInput = emailPasswordTemplate.querySelector("#password");

  EventUtils.synthesizeMouseAtCenter(passwordInput, {});

  // Entering the incorrect password should show an error notification.
  let inputEvent = BrowserTestUtils.waitForEvent(
    passwordInput,
    "input",
    true,
    event => event.target.value === "abc"
  );
  EventUtils.sendString("abc", window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const header =
    emailPasswordTemplate.shadowRoot.querySelector("account-hub-header");
  await TestUtils.waitForCondition(
    () =>
      header.shadowRoot
        .querySelector("#emailFormNotification")
        .classList.contains("error"),
    "The notification should be present."
  );

  EventUtils.synthesizeMouseAtCenter(passwordInput, {});
  // Entering the correct password should hide current subview.
  inputEvent = BrowserTestUtils.waitForEvent(
    passwordInput,
    "input",
    true,
    event => event.target.value === "abc12345"
  );
  EventUtils.sendString("12345", window);
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
    "The imap account should be created."
  );

  Assert.ok(imapAccount, "IMAP account should be created");

  await subtest_clear_status_bar();
  MailServices.accounts.removeAccount(imapAccount);
  Services.logins.removeAllLogins();

  IMAPServer.close();
  SMTPServer.close();
  await subtest_close_account_hub_dialog(dialog);
});
