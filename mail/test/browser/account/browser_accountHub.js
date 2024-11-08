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

      handler.kUsername = "john.doe@momo.invalid";
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
      handler.kUsername = "john.doe@momo.invalid";
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
  IMAPServer.open();
  SMTPServer.open();
});

registerCleanupFunction(function () {
  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
  IMAPServer.close();
  SMTPServer.close();
});

// TODO: Defer this for when the account hub replaces the account setup tab.
// add_task(async function test_account_hub_opening_at_startup() {});

add_task(async function test_account_hub_opening() {
  // TODO: Use an actual button once it's implemented in the UI.
  // Open the dialog.
  await window.openAccountHub();

  const hub = document.querySelector("account-hub-container");
  await TestUtils.waitForCondition(
    () => hub.modal,
    "The dialog element was created"
  );

  const dialog = hub.shadowRoot.querySelector(".account-hub-dialog");
  Assert.ok(dialog.open, "The dialog element was opened");

  EventUtils.synthesizeKey("VK_ESCAPE", {});
  await TestUtils.waitForCondition(
    () => !dialog.open,
    "The dialog element was closed"
  );

  // Open the dialog again.
  await window.openAccountHub();
  Assert.ok(dialog.open, "The dialog element was opened");

  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {}
  );
  await TestUtils.waitForCondition(
    () => !dialog.open,
    "The dialog element was closed"
  );
});

add_task(async function test_account_email_step() {
  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog();
  const emailFormPromise = BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      subtree: true,
      childList: true,
    },
    () => dialog.querySelector("email-auto-form")
  );
  await emailFormPromise;

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(dialog.querySelector("email-auto-form")),
    "The initial email template is in view."
  );

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
    Assert.ok(BrowserTestUtils.isHidden(icon), `${icon.src} is hidden.`);
  }

  Assert.ok(
    footerForward.disabled,
    "Account Hub footer forward button is disabled."
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
    "Name success icon is visible."
  );

  EventUtils.synthesizeMouseAtCenter(nameInput, {});
  // Delete text and move back to name input to reveal error icon.
  const clearInputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === ""
  );
  nameInput.value = "a";
  EventUtils.synthesizeKey("KEY_Backspace", {});
  await clearInputEvent;

  Assert.ok(
    BrowserTestUtils.isHidden(nameSuccessIcon),
    "Name success icon is hidden."
  );

  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  const nameDangerIcon = Array.from(icons).find(img =>
    img.classList.contains("icon-danger")
  );
  Assert.ok(
    BrowserTestUtils.isVisible(nameDangerIcon),
    "Name danger icon is visible."
  );

  // Hit the enter key when in the name form input, and the email danger
  // icon should show.
  EventUtils.synthesizeKey("KEY_Enter", {});
  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon is visible."
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
    "Email danger icon is visible."
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
  EventUtils.sendString("testing.com", window);
  EventUtils.synthesizeMouseAtCenter(nameInput, {});

  Assert.ok(
    BrowserTestUtils.isHidden(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon is hidden."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailSuccess")),
    "Email success icon is visible."
  );

  Assert.ok(!footerForward.disabled, "Continue button is enabled.");

  await subtest_close_account_hub_dialog(dialog);
});

add_task(async function test_account_email_config_found() {
  const dialog = await subtest_open_account_hub_dialog();

  await subtest_fill_initial_config_fields(dialog);

  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundTemplate),
    "The email config found template is in view."
  );

  const footerBack = dialog
    .querySelector("#emailFooter")
    .querySelector("#back");
  // Press the back button and show the initial email template again.
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(dialog.querySelector("email-auto-form")),
    "The initial email template is in view."
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
    "The email config found template is in view."
  );

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option is visible"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#pop3")),
    "POP3 config option is visible"
  );

  // This config should not include exchange.
  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate.querySelector("#exchange")),
    "Exchange config option is hidden"
  );

  // POP3 should be the recommended configuration.
  Assert.ok(
    BrowserTestUtils.isVisible(
      configFoundTemplate.querySelector("#pop3").querySelector(".recommended")
    ),
    "POP3 is the recommended config option."
  );

  // POP3 should be the selected config.
  Assert.ok(
    configFoundTemplate.querySelector("#pop3").classList.contains("selected"),
    "POP3 is the selected config option."
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
    "SMTP is the selected config option."
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
    "The incoming config template is in view."
  );

  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate),
    "The config found template is hidden."
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
    "The IMAP config option is visible"
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
    "The incoming config template is in view."
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

  // The tab should have changed to the account settings tab.
  await BrowserTestUtils.waitForCondition(
    () => tabmail.selectedTab != oldTab,
    "Timeout waiting for the currently active tab to change"
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

  const configFoundTemplate = dialog.querySelector("#emailConfigFoundSubview");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option is visible"
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
    "The incoming config template is in view."
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

  // Click continue and wait for outgoing config template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  const outgoingConfigTemplate = dialog.querySelector(
    "#emailOutgoingConfigSubview"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(outgoingConfigTemplate),
    "The outgoing config template is in view."
  );

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

  // The tab should have changed to the account settings tab.
  await BrowserTestUtils.waitForCondition(
    () => tabmail.selectedTab != oldTab,
    "Timeout waiting for the currently active tab to change"
  );

  await subtest_verify_account(tabmail.selectedTab, emailUser, "pop");

  tabmail.closeTab(tabmail.currentTabInfo);

  // Confirm that the folder pane is visible.
  Assert.ok(BrowserTestUtils.isVisible(tabmail.currentAbout3Pane.folderTree));
});

/**
 * Subtest to open the account dialog, and returns the dialog for further
 * testing.
 *
 * @returns {HTMLElement}
 **/
async function subtest_open_account_hub_dialog() {
  await window.openAccountHub();
  const hub = document.querySelector("account-hub-container");
  await BrowserTestUtils.waitForMutationCondition(
    hub,
    { modal: true, subtree: true, childList: true },
    () => hub.shadowRoot.querySelector(".account-hub-dialog"),
    "The dialog element was created"
  );

  const dialog = hub.shadowRoot.querySelector(".account-hub-dialog");
  const emailFormPromise = BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      subtree: true,
      childList: true,
    },
    () => dialog.querySelector("email-auto-form")
  );
  await emailFormPromise;

  return dialog;
}

async function subtest_close_account_hub_dialog(dialog) {
  const hub = document.querySelector("account-hub-container");
  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {}
  );

  await BrowserTestUtils.waitForEvent(dialog, "close");
}

async function subtest_fill_initial_config_fields(dialog) {
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(dialog.querySelector("email-auto-form")),
    "The initial email template is in view."
  );

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

  Assert.ok(!footerForward.disabled, "Continue button is enabled.");

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
}

function subtest_config_results(template, configType) {
  const type = configType === "pop" ? "pop3" : configType;

  Assert.equal(
    template.querySelector("#incomingType").textContent,
    type,
    `Incoming type is expected type.`
  );

  Assert.equal(
    template.querySelector("#outgoingType").textContent,
    "smtp",
    `${configType}: Outgoing type is expected type.`
  );

  Assert.equal(
    template.querySelector("#incomingHost").textContent,
    `${configType}.mail.momo.invalid`,
    `${configType}: Incoming host is ${configType}.mail.momo.invalid.`
  );

  Assert.equal(
    template.querySelector("#outgoingHost").textContent,
    "smtp.mail.momo.invalid",
    `${configType}: Outgoing host is expected host.`
  );

  Assert.equal(
    template.l10n.getAttributes(template.querySelector("#incomingAuth")).id,
    "account-setup-result-ssl",
    `${configType}: Incoming auth is expected auth.`
  );

  Assert.equal(
    template.l10n.getAttributes(template.querySelector("#outgoingAuth")).id,
    "account-setup-result-ssl",
    `${configType}: Outgoing auth is expected auth.`
  );

  Assert.equal(
    template.querySelector("#incomingUsername").textContent,
    "john.doe",
    `${configType}: Incoming username is expected username.`
  );

  Assert.equal(
    template.querySelector("#outgoingUsername").textContent,
    "john.doe",
    `${configType}: Outgoing username is expected username.`
  );
}

async function subtest_verify_account(tab, user, type) {
  await BrowserTestUtils.waitForCondition(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for current account to become non-null"
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
      expected: type + "." + user.incomingHost,
    },
    "outgoing server hostname": {
      // And this is lowercase
      actual: outgoing.serverURI.host,
      expected: "smtp." + user.outgoingHost,
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
        `Configured ${detail} is ${config[detail].actual}. It should be ${config[detail].expected}.`
      );
    }
  } finally {
    remove_account_internal(tab, account, outgoing);
  }
}

/**
 * Remove an account in the Account Manager, but not via the UI.
 *
 * @param {Tab} tab
 * @param {nsIMsgAccount} account
 * @param {nsIMsgOutgoingServer} outgoing
 */
function remove_account_internal(tab, account, outgoing) {
  const win = tab.browser.contentWindow;

  // Remove the account and incoming server
  const serverId = account.incomingServer.serverURI;
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
