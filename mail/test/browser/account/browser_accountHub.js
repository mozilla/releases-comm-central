/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);

const emailUser = {
  name: "John Doe",
  email: "john.doe@momo.invalid",
  password: "abc12345",
  incomingHost: "mail.momo.invalid",
  outgoingHost: "mail.momo.invalid",
};

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

// TODO: Defer this for when the account hub replaces the account setup tab.
// add_task(async function test_account_hub_opening_at_startup() {});

add_task(async function test_account_hub_opening() {
  IMAPServer.open();
  SMTPServer.open();
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

  EventUtils.synthesizeKey("VK_ESCAPE", {}, window);
  await TestUtils.waitForCondition(
    () => !dialog.open,
    "The dialog element was closed"
  );

  // Open the dialog again.
  await window.openAccountHub();
  Assert.ok(dialog.open, "The dialog element was opened");

  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {},
    window
  );
  await TestUtils.waitForCondition(
    () => !dialog.open,
    "The dialog element was closed"
  );
});

add_task(async function test_account_email_step() {
  // Open the dialog.
  await window.openAccountHub();
  const hub = document.querySelector("account-hub-container");
  await BrowserTestUtils.waitForMutationCondition(
    hub,
    { modal: true, subtree: true, childList: true },
    () => hub.shadowRoot.querySelector(".account-hub-dialog"),
    "The dialog element was created"
  );

  const dialog = hub.shadowRoot.querySelector(".account-hub-dialog");
  const emailFormPrmise = BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      subtree: true,
      childList: true,
    },
    () => dialog.querySelector("email-auto-form")
  );
  await emailFormPrmise;
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
  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);

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
  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);

  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === "Test User"
  );
  EventUtils.sendString("Test User", window);
  await inputEvent;

  // Move to email input to trigger animation icon.
  EventUtils.synthesizeMouseAtCenter(emailInput, {}, window);

  const nameSuccessIcon = Array.from(icons).find(img =>
    img.classList.contains("icon-success")
  );
  Assert.ok(
    BrowserTestUtils.isVisible(nameSuccessIcon),
    "Name success icon is visible."
  );

  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);
  // Delete text and move back to name input to reveal error icon.
  const clearInputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === ""
  );
  nameInput.value = "a";
  EventUtils.synthesizeKey("KEY_Backspace", {}, window);
  await clearInputEvent;

  Assert.ok(
    BrowserTestUtils.isHidden(nameSuccessIcon),
    "Name success icon is hidden."
  );

  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);

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
  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);
  inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === "Test User"
  );
  EventUtils.sendString("Test User", window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(emailInput, {}, window);
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === "testUser@"
  );
  EventUtils.sendString("testUser@", window);
  await inputEvent;
  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);

  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon is visible."
  );

  // Fill in correct email input, see email success icon and continue should
  // be enabled.
  EventUtils.synthesizeMouseAtCenter(emailInput, {}, window);
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === "testUser@testing.com"
  );
  EventUtils.sendString("testing.com", window);
  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);

  Assert.ok(
    BrowserTestUtils.isHidden(emailTemplate.querySelector("#emailWarning")),
    "Email danger icon is hidden."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(emailTemplate.querySelector("#emailSuccess")),
    "Email success icon is visible."
  );

  Assert.ok(!footerForward.disabled, "Continue button is enabled.");

  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {},
    window
  );

  await BrowserTestUtils.waitForEvent(dialog, "close");
  IMAPServer.close();
  SMTPServer.close();
});

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

add_task(async function test_account_email_config_found() {
  IMAPServer.open();
  SMTPServer.open();
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  // Fill in email auto form and click continue, waiting for config found
  // view to be shown.
  await window.openAccountHub();
  const hub = document.querySelector("account-hub-container");
  await BrowserTestUtils.waitForMutationCondition(
    hub,
    { modal: true, subtree: true, childList: true },
    () => hub.shadowRoot.querySelector(".account-hub-dialog"),
    "The dialog element was created"
  );

  const dialog = hub.shadowRoot.querySelector(".account-hub-dialog");

  const emailFormPrmise = BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      subtree: true,
      childList: true,
    },
    () => dialog.querySelector("email-auto-form")
  );
  await emailFormPrmise;
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(dialog.querySelector("email-auto-form")),
    "The initial email template is in view."
  );

  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footer = dialog.querySelector("#emailFooter");
  const footerForward = footer.querySelector("#forward");
  const footerBack = footer.querySelector("#back");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  EventUtils.synthesizeMouseAtCenter(nameInput, {}, window);
  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === emailUser.name
  );
  EventUtils.sendString(emailUser.name, window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(emailInput, {}, window);
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === emailUser.email
  );
  EventUtils.sendString(emailUser.email, window);
  await inputEvent;

  Assert.ok(!footerForward.disabled, "Continue button is enabled.");

  // Hit enter and wait for config found template to be in view.
  EventUtils.synthesizeKey("KEY_Enter", {});
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundTemplate),
    "The email config found template is in view."
  );

  // Press the back button and show the initial email template again.
  EventUtils.synthesizeMouseAtCenter(footerBack, {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(dialog.querySelector("email-auto-form")),
    "The initial email template is in view."
  );

  // Press the continue button to show the config found template.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
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
  testConfigResults(configFoundTemplate, "pop");

  // Select the IMAP config and check the details match.
  EventUtils.synthesizeMouseAtCenter(
    configFoundTemplate.querySelector("#imap"),
    {},
    window
  );

  Assert.ok(
    configFoundTemplate.querySelector("#imap").classList.contains("selected"),
    "SMTP is the selected config option."
  );

  // The config details should show the IMAP details.
  testConfigResults(configFoundTemplate, "imap");

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
    "The incoming config template is in view."
  );

  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate),
    "The config found template is hidden."
  );

  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {},
    window
  );

  await BrowserTestUtils.waitForEvent(dialog, "close");

  // // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
  IMAPServer.close();
  SMTPServer.close();
});

function testConfigResults(template, configType) {
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
