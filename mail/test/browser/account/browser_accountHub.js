/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

let emailUser;
const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

const IMAPServer = {
  open() {
    const {
      ImapDaemon,
      ImapMessage,
      IMAP_RFC2195_extension,
      IMAP_RFC3501_handler,
      mixinExtension,
    } = ChromeUtils.importESModule(
      "resource://testing-common/mailnews/Imapd.sys.mjs"
    );

    IMAPServer.ImapMessage = ImapMessage;

    this.daemon = new ImapDaemon();
    this.server = new nsMailServer(daemon => {
      const handler = new IMAP_RFC3501_handler(daemon);
      mixinExtension(handler, IMAP_RFC2195_extension);

      handler.kUsername = "john.doe@imap.test";
      handler.kPassword = "abc12345";
      handler.kAuthRequired = true;
      handler.kAuthSchemes = ["PLAIN"];
      return handler;
    }, this.daemon);
    this.server.start(1993);
    info(`IMAP server started on port ${this.server.port}`);

    registerCleanupFunction(() => this.close());
  },
  close() {
    this.server.stop();
  },
  get port() {
    return this.server.port;
  },
};

const SMTPServer = {
  open() {
    const { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.importESModule(
      "resource://testing-common/mailnews/Smtpd.sys.mjs"
    );

    this.daemon = new SmtpDaemon();
    this.server = new nsMailServer(daemon => {
      const handler = new SMTP_RFC2821_handler(daemon);
      handler.kUsername = "john.doe@imap.test";
      handler.kPassword = "abc12345";
      handler.kAuthRequired = true;
      handler.kAuthSchemes = ["PLAIN"];
      return handler;
    }, this.daemon);
    this.server.start(1587);
    info(`SMTP server started on port ${this.server.port}`);

    registerCleanupFunction(() => this.close());
  },
  close() {
    this.server.stop();
  },
  get port() {
    return this.server.port;
  },
};

const _srv = DNS.srv;
const _txt = DNS.txt;
DNS.srv = function (name) {
  if (["_caldavs._tcp.localhost", "_carddavs._tcp.localhost"].includes(name)) {
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  }
  if (["_caldavs._tcp.imap.test", "_carddavs._tcp.imap.test"].includes(name)) {
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  }
  throw new Error(`Unexpected DNS SRV lookup: ${name}`);
};
DNS.txt = function (name) {
  if (name == "_caldavs._tcp.localhost") {
    return [
      { strings: ["path=/browser/comm/calendar/test/browser/data/dns.sjs"] },
    ];
  }
  if (name == "_carddavs._tcp.localhost") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
    ];
  }
  if (name == "_caldavs._tcp.imap.test") {
    return [
      { strings: ["path=/browser/comm/calendar/test/browser/data/dns.sjs"] },
    ];
  }
  if (name == "_carddavs._tcp.imap.test") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
    ];
  }
  throw new Error(`Unexpected DNS TXT lookup: ${name}`);
};

add_setup(function () {
  emailUser = {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  };

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

  // Hit the enter key when in the name form input, and the email danger
  // icon should show.
  EventUtils.synthesizeKey("KEY_Enter", {});
  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon should be visible"
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

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundTemplate),
    "The email config found template should be in view"
  );

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

add_task(async function test_account_email_advanced_setup_incoming() {
  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  const dialog = await subtest_open_account_hub_dialog();

  await subtest_fill_initial_config_fields(dialog);

  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

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

  // Update the port number and click advanced config to confirm that the
  // account being created takes the updated incoming field.
  const incomingPort = incomingConfigTemplate.querySelector("#incomingPort");
  EventUtils.synthesizeMouseAtCenter(incomingPort, {});
  incomingPort.value = "";
  const inputEvent = BrowserTestUtils.waitForEvent(
    incomingPort,
    "input",
    false,
    event => event.target.value === "123"
  );
  EventUtils.sendString("123", window);
  emailUser.incomingPort = 123;
  await inputEvent;

  const advancedConfigButton = incomingConfigTemplate.querySelector(
    "#advancedConfigurationIncoming"
  );
  EventUtils.synthesizeMouseAtCenter(advancedConfigButton, {});

  const tabmail = document.getElementById("tabmail");
  const oldTab = tabmail.selectedTab;

  await BrowserTestUtils.promiseAlertDialog("accept");

  // The dialog should automatically close after clicking advanced config
  await BrowserTestUtils.waitForEvent(dialog, "close");

  await BrowserTestUtils.waitForCondition(
    () => tabmail.selectedTab != oldTab,
    "The tab should change to the account settings tab"
  );

  await subtest_verify_account(tabmail.selectedTab, emailUser, "pop");

  tabmail.closeTab(tabmail.currentTabInfo);

  // Confirm that the folder pane is visible.
  Assert.ok(BrowserTestUtils.isVisible(tabmail.currentAbout3Pane.folderTree));
});

add_task(async function test_account_email_advanced_setup_outgoing() {
  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  const dialog = await subtest_open_account_hub_dialog();

  await subtest_fill_initial_config_fields(dialog);
  const footerForward = dialog
    .querySelector("account-hub-footer")
    .querySelector("#forward");

  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

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

  // Update the port numbers for both incoming and outgoing and click
  // advanced config to confirm that the account being created takes the
  // updated incoming and outgoing fields.
  const incomingPort = incomingConfigTemplate.querySelector("#incomingPort");
  EventUtils.synthesizeMouseAtCenter(incomingPort, {});
  incomingPort.value = "";
  let inputEvent = BrowserTestUtils.waitForEvent(
    incomingPort,
    "input",
    false,
    event => event.target.value === "123"
  );
  EventUtils.sendString("123", window);
  await inputEvent;
  emailUser.incomingPort = 123;

  const outgoingConfigTemplate = dialog.querySelector(
    "#emailOutgoingConfigSubview"
  );
  const isOutgoingVisible = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing config template should be in view"
  );
  // Click continue and wait for outgoing config template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await isOutgoingVisible;

  const outgoingPort = outgoingConfigTemplate.querySelector("#outgoingPort");
  EventUtils.synthesizeMouseAtCenter(outgoingPort, {});
  outgoingPort.value = "";
  inputEvent = BrowserTestUtils.waitForEvent(
    outgoingPort,
    "input",
    false,
    event => event.target.value === "321"
  );
  EventUtils.sendString("321", window);
  emailUser.outgoingPort = 321;
  await inputEvent;

  const advancedConfigButton = outgoingConfigTemplate.querySelector(
    "#advancedConfigurationOutgoing"
  );
  EventUtils.synthesizeMouseAtCenter(advancedConfigButton, {});

  const tabmail = document.getElementById("tabmail");
  const oldTab = tabmail.selectedTab;

  await BrowserTestUtils.promiseAlertDialog("accept");

  // The dialog should automatically close after clicking advanced config
  await BrowserTestUtils.waitForEvent(dialog, "close");

  await BrowserTestUtils.waitForCondition(
    () => tabmail.selectedTab != oldTab,
    "The tab should change to the account settings tab"
  );

  await subtest_verify_account(tabmail.selectedTab, emailUser, "pop");

  tabmail.closeTab(tabmail.currentTabInfo);

  // Confirm that the folder pane is visible.
  Assert.ok(BrowserTestUtils.isVisible(tabmail.currentAbout3Pane.folderTree));
});

add_task(async function test_account_email_manual_form() {
  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  const dialog = await subtest_open_account_hub_dialog();

  await subtest_fill_initial_config_fields(dialog);
  const footer = dialog.querySelector("account-hub-footer");
  const footerForward = footer.querySelector("#forward");
  const footerBack = footer.querySelector("#back");
  const footerCustom = footer.querySelector("#custom");

  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundTemplate),
    "The email config found template should be in view"
  );

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  // Edit configuration button should lead to incoming config template.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#editConfiguration"),
    {},
    window
  );

  const incomingConfigTemplate = dialog.querySelector(
    "#emailIncomingConfigSubview"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  let outgoingConfigTemplate = dialog.querySelector(
    "#emailOutgoingConfigSubview"
  );
  let isOutgoingVisible = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing config template should be in view"
  );
  // Continuing from incoming with a found config should keep the continue
  // button on the outgoing config page enabled.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await isOutgoingVisible;
  Assert.ok(!footerForward.disabled, "Continue button is enabled");

  // Go back and update the incoming hostname to have an invalid character,
  // which should disable the continue button.
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(incomingConfigTemplate),
    "The incoming config template should be in view"
  );

  const incomingHostname =
    incomingConfigTemplate.querySelector("#incomingHostname");
  EventUtils.synthesizeMouseAtCenter(incomingHostname, {});
  const inputEvent = BrowserTestUtils.waitForEvent(
    incomingHostname,
    "input",
    false,
    event => event.target.value === `pop.${emailUser.incomingHost}-`
  );
  // Ensure we move to the end of the input.
  EventUtils.synthesizeKey("KEY_End", {});
  EventUtils.sendString("-", window);
  await inputEvent;

  Assert.ok(footerForward.disabled, "Continue button should be disabled");

  // Delete the invalid character should renable the continue button.
  const deleteEvent = BrowserTestUtils.waitForEvent(
    incomingHostname,
    "input",
    false,
    event => event.target.value === `pop.${emailUser.incomingHost}`
  );
  EventUtils.synthesizeKey("KEY_Backspace", {}, window);
  await deleteEvent;

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  outgoingConfigTemplate = dialog.querySelector("#emailOutgoingConfigSubview");
  isOutgoingVisible = TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing config template should be in view"
  );
  // Continuing on to outgoing should reveal a disbaled continue button and an
  // enabled test button.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await isOutgoingVisible;

  Assert.ok(footerForward.disabled, "Continue button should be disabled");
  Assert.ok(!footerCustom.disabled, "Test button should be enabled");

  await subtest_close_account_hub_dialog(dialog);
});

add_task(async function test_account_enter_password_imap_account() {
  IMAPServer.open();
  SMTPServer.open();
  emailUser = {
    name: "John Doe",
    email: "john.doe@imap.test",
    password: "abc12345",
    incomingHost: "testin.imap.test",
    outgoingHost: "testout.imap.test",
  };

  const dialog = await subtest_open_account_hub_dialog();
  await subtest_fill_initial_config_fields(dialog);
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

  const imapAccount = MailServices.accounts.accounts.find(
    account => account.identities[0].email === emailUser.email
  );

  Assert.ok(imapAccount, "IMAP account should be created");

  MailServices.accounts.removeAccount(imapAccount);
  Services.logins.removeAllLogins();

  IMAPServer.close();
  SMTPServer.close();
  await subtest_close_account_hub_dialog(dialog);
});

/**
 * Subtest to open the account dialog, and returns the dialog for further
 * testing.
 *
 * @returns {Promise<HTMLElement>}
 **/
async function subtest_open_account_hub_dialog() {
  await window.openAccountHub();

  const hub = document.querySelector("account-hub-container");
  await BrowserTestUtils.waitForMutationCondition(
    hub,
    { childList: true },
    () => !!hub.shadowRoot.querySelector(".account-hub-dialog")
  );

  const dialog = hub.shadowRoot.querySelector(".account-hub-dialog");
  Assert.ok(dialog, "The dialog element should be created");

  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      childList: true,
    },
    () => !!dialog.querySelector("email-auto-form")
  );

  const emailForm = dialog.querySelector("email-auto-form");
  Assert.ok(emailForm, "The email element should be available");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(emailForm),
    "The initial email template should be in view"
  );

  return dialog;
}

async function subtest_close_account_hub_dialog(dialog) {
  const hub = document.querySelector("account-hub-container");
  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {}
  );
  await closeEvent;
}

async function subtest_fill_initial_config_fields(dialog) {
  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footerForward = dialog
    .querySelector("#emailFooter")
    .querySelector("#forward");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  EventUtils.synthesizeMouseAtCenter(nameInput, {});
  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === emailUser.name
  );
  EventUtils.sendString(emailUser.name, window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(emailInput, {});
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === emailUser.email
  );
  EventUtils.sendString(emailUser.email, window);
  await inputEvent;

  Assert.ok(!footerForward.disabled, "Continue button should be enabled");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
}

function subtest_config_results(template, configType) {
  const type = configType === "pop" ? "pop3" : configType;

  Assert.equal(
    template.querySelector("#incomingType").textContent,
    type,
    "Incoming type should be expected type"
  );

  Assert.equal(
    template.querySelector("#outgoingType").textContent,
    "smtp",
    `${configType}: Outgoing type should be expected type`
  );

  Assert.equal(
    template.querySelector("#incomingHost").textContent,
    `${configType}.mail.momo.invalid`,
    `${configType}: Incoming host should be ${configType}.mail.momo.invalid`
  );

  Assert.equal(
    template.querySelector("#outgoingHost").textContent,
    "smtp.mail.momo.invalid",
    `${configType}: Outgoing host should be expected host`
  );

  Assert.equal(
    template.l10n.getAttributes(template.querySelector("#incomingAuth")).id,
    "account-setup-result-ssl",
    `${configType}: Incoming auth should be expected auth`
  );

  Assert.equal(
    template.l10n.getAttributes(template.querySelector("#outgoingAuth")).id,
    "account-setup-result-ssl",
    `${configType}: Outgoing auth should be expected auth`
  );

  Assert.equal(
    template.querySelector("#incomingUsername").textContent,
    "john.doe",
    `${configType}: Incoming username should be expected username`
  );

  Assert.equal(
    template.querySelector("#outgoingUsername").textContent,
    "john.doe",
    `${configType}: Outgoing username should be expected username`
  );
}

async function subtest_verify_account(tab, user, type) {
  await BrowserTestUtils.waitForCondition(
    () => !!tab.browser.contentWindow.currentAccount,
    "The new account should have been created"
  );

  const account = tab.browser.contentWindow.currentAccount;
  const identity = account.defaultIdentity;
  const incoming = account.incomingServer;
  const outgoing = MailServices.outgoingServer.getServerByKey(
    identity.smtpServerKey
  );

  const config = {
    "incoming server username": {
      actual: incoming.username,
      expected: user.email.split("@")[0],
    },
    "outgoing server username": {
      actual: outgoing.username,
      expected: user.email.split("@")[0],
    },
    "incoming server hostname": {
      // Note: N in the hostName is uppercase
      actual: incoming.hostName,
      expected: `${type}.${user.incomingHost}`,
    },
    "outgoing server hostname": {
      // And this is lowercase
      actual: outgoing.serverURI.host,
      expected: `smtp.${user.outgoingHost}`,
    },
    "user real name": { actual: identity.fullName, expected: user.name },
    "user email address": { actual: identity.email, expected: user.email },
    "incoming port": {
      actual: incoming.port,
      expected: user.incomingPort,
    },
    "outgoing port": {
      actual: outgoing.port,
      expected: user.outgoingPort,
    },
  };

  try {
    for (const detail in config) {
      Assert.equal(
        config[detail].actual,
        config[detail].expected,
        `Configured ${detail} is ${config[detail].actual}. It should be ${config[detail].expected}`
      );
    }
  } finally {
    remove_account_internal(tab, account);
  }
}

/**
 * Remove an account in the Account Manager, but not via the UI.
 *
 * @param {Tab} tab
 * @param {nsIMsgAccount} account
 */
function remove_account_internal(tab, account) {
  const identity = account.defaultIdentity;
  const incoming = account.incomingServer;
  const outgoing = MailServices.outgoingServer.getServerByKey(
    identity.smtpServerKey
  );
  const win = tab.browser.contentWindow;

  // Remove the account and incoming server
  const serverId = incoming.serverURI;
  MailServices.accounts.removeAccount(account);
  account = null;
  if (serverId in win.accountArray) {
    delete win.accountArray[serverId];
  }
  win.selectServer(null, null);

  // Remove the outgoing server
  const smtpKey = outgoing.key;
  MailServices.outgoingServer.deleteServer(outgoing);
  win.replaceWithDefaultSmtpServer(smtpKey);
}
