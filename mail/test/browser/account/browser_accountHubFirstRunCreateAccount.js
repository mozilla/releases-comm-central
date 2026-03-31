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

add_task(async function test_account_hub_complete_first_run() {
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

  EventUtils.synthesizeKey("KEY_Escape", {});

  // Wait to make sure the dialog has not closed.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  Assert.ok(
    dialog.open,
    "The dialog element should not close when pressing Escape"
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

  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate),
    "The config found template should be hidden."
  );
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(dialog.querySelector("email-password-form")),
    "The email password form should be visible."
  );
  const emailPasswordTemplate = dialog.querySelector("email-password-form");
  const rememberPasswordInput =
    emailPasswordTemplate.querySelector("#rememberPassword");

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

  // The back button should be hidden now, as we shouldn't be able to cancel
  // account creation.
  Assert.ok(
    BrowserTestUtils.isHidden(footer.querySelector("#back")),
    "Back button should be hidden."
  );

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(emailPasswordTemplate),
    "The email password subview should be hidden."
  );

  const imapAccount = await TestUtils.waitForCondition(
    () =>
      MailServices.accounts.accounts.find(
        account => account.identities[0]?.email === emailUser.email
      ),
    "The user account should be created."
  );

  Assert.ok(imapAccount, "IMAP account should be created");

  Assert.equal(
    imapAccount.incomingServer.type,
    "imap",
    "The new account created should be an IMAP account"
  );

  // Creating an account with no address books and calendars should lead to
  // the success view.
  const successStep = dialog.querySelector("email-added-success");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", successStep);
  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await closeEvent;

  Assert.ok(
    window.gSpacesToolbar.isLoaded,
    "Spaces toolbar should be initialized"
  );
  Assert.equal(
    window.msgWindow.domWindow,
    window,
    "Should assign domWindow to msgWindow"
  );
  Assert.ok(
    window.SessionStoreManager._restored,
    "Should have restored the session"
  );

  await subtest_clear_status_bar();
  MailServices.accounts.removeAccount(imapAccount);
  MailServices.accounts.removeAccount(
    MailServices.accounts.findAccountForServer(
      MailServices.accounts.localFoldersServer
    )
  );

  IMAPServer.close();
  SMTPServer.close();
});
