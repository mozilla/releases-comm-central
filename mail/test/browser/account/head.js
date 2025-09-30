/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// From browser/components/preferences/tests/head.js

const { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const account_hub_start_templates = {
  MAIL: "email-auto-form",
  ADDRESS_BOOK: "address-book-option-select",
};

const IMAPServer = {
  open(username = "john.doe@imap.test") {
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

      handler.kUsername = username;
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
  open(username = "john.doe@imap.test") {
    const { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.importESModule(
      "resource://testing-common/mailnews/Smtpd.sys.mjs"
    );

    this.daemon = new SmtpDaemon();
    this.server = new nsMailServer(daemon => {
      const handler = new SMTP_RFC2821_handler(daemon);
      handler.kUsername = username;
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

function is_element_visible(aElement, aMsg) {
  isnot(aElement, null, "Element should not be null, when checking visibility");
  ok(!BrowserTestUtils.isHidden(aElement), aMsg);
}

function openAndLoadSubDialog(
  aURL,
  aFeatures = null,
  aParams = null,
  aClosingCallback = null
) {
  const promise = promiseLoadSubDialog(aURL);
  content.gSubDialog.open(
    aURL,
    { features: aFeatures, closingCallback: aClosingCallback },
    aParams
  );
  return promise;
}

function promiseLoadSubDialog(aURL) {
  if (Services.env.get("MOZ_HEADLESS")) {
    throw new Error("promiseLoadSubDialog doesn't work in headless mode!");
  }

  return new Promise(resolve => {
    content.gSubDialog._dialogStack.addEventListener(
      "dialogopen",
      function dialogopen(aEvent) {
        if (
          aEvent.detail.dialog._frame.contentWindow.location == "about:blank"
        ) {
          return;
        }
        content.gSubDialog._dialogStack.removeEventListener(
          "dialogopen",
          dialogopen
        );

        is(
          aEvent.detail.dialog._frame.contentWindow.location.toString(),
          aURL,
          "Check the proper URL is loaded"
        );

        // Check visibility
        is_element_visible(aEvent.detail.dialog._overlay, "Overlay is visible");

        // Check that stylesheets were injected
        const expectedStyleSheetURLs =
          aEvent.detail.dialog._injectedStyleSheets.slice(0);
        for (const styleSheet of aEvent.detail.dialog._frame.contentDocument
          .styleSheets) {
          const i = expectedStyleSheetURLs.indexOf(styleSheet.href);
          if (i >= 0) {
            info("found " + styleSheet.href);
            expectedStyleSheetURLs.splice(i, 1);
          }
        }
        is(
          expectedStyleSheetURLs.length,
          0,
          "All expectedStyleSheetURLs should have been found"
        );

        // Wait for the next event tick to make sure the remaining part of the
        // testcase runs after the dialog gets ready for input.
        executeSoon(() => resolve(aEvent.detail.dialog._frame.contentWindow));
      }
    );
  });
}

/**
 * Subtest to open the account dialog, and returns the dialog for further
 * testing.
 *
 * @param {string} [type="MAIL"] - The type of account hub step that should be
 *  loaded.
 * @returns {Promise<HTMLDialogElement>}
 */
async function subtest_open_account_hub_dialog(type = "MAIL") {
  await window.openAccountHub(type);
  return subtest_wait_for_account_hub_dialog(type);
}

/**
 * Wait for the account hub dialog to be fully opened.
 *
 * @param {string} [type="MAIL"] - The type of account hub step that should be
 *  loaded.
 * @returns {Promise<HTMLDialogElement>}
 */
async function subtest_wait_for_account_hub_dialog(type = "MAIL") {
  await BrowserTestUtils.waitForMutationCondition(
    document.body,
    {
      childList: true,
      subtree: true,
    },
    () => document.querySelector("account-hub-container")
  );
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
      attributeFilter: ["open"],
    },
    () => dialog.open
  );
  Assert.ok(dialog.open, "Dialog should be open");

  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      childList: true,
    },
    () => !!dialog.querySelector(account_hub_start_templates[type])
  );

  Assert.ok(
    dialog.querySelector(account_hub_start_templates[type]),
    `The ${account_hub_start_templates[type]} element should be available`
  );
  await BrowserTestUtils.waitForMutationCondition(
    dialog.querySelector(account_hub_start_templates[type]),
    {
      attributeFilter: ["hidden"],
    },
    () =>
      BrowserTestUtils.isVisible(
        dialog.querySelector(account_hub_start_templates[type])
      )
  );

  return dialog;
}
/**
 * Subtest to close the account hub dialog.
 *
 * @param {Promise<HTMLDialogElement>} dialog - The account hub dialog.
 * @param {HTMLElement} currentStep - Current account hub step HTML template.
 */
async function subtest_close_account_hub_dialog(dialog, currentStep) {
  const closeButton = currentStep.shadowRoot
    .querySelector("account-hub-header")
    .shadowRoot.querySelector("#closeButton");
  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(closeButton, {});
  await closeEvent;
}

/**
 * Subtest fill in the fields of the first step of the account hub email setup.
 *
 * @param {Promise<HTMLDialogElement>} dialog - The account hub dialog.
 * @param {object?} emailUser - An object containing a dummy user's email data.
 */
async function subtest_fill_initial_config_fields(dialog, emailUser = null) {
  emailUser = emailUser || {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  };

  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");
  const footerForward = dialog.querySelector("#emailFooter #forward");

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

  const configFoundTemplate = dialog.querySelector("email-config-found");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundTemplate),
    "The config found template should be in view"
  );
}

/**
 * Subtest that waits for the status bar to clear and the meteros to stop
 * spinning.
 */
async function subtest_clear_status_bar() {
  const status = window.MsgStatusFeedback;
  try {
    await TestUtils.waitForCondition(
      () =>
        !status._startTimeoutID &&
        !status._meteorsSpinning &&
        !status._stopTimeoutID,
      "waiting for meteors to stop spinning"
    );
  } catch (ex) {
    // If the meteors don't stop spinning within 5 seconds, something has got
    // confused somewhere and they'll probably keep spinning forever.
    // Reset and hope we can continue without more problems.
    Assert.ok(!status._startTimeoutID, "meteors should not have a start timer");
    Assert.ok(!status._meteorsSpinning, "meteors should not be spinning");
    Assert.ok(!status._stopTimeoutID, "meteors should not have a stop timer");
    if (status._startTimeoutID) {
      clearTimeout(status._startTimeoutID);
      status._startTimeoutID = null;
    }
    if (status._stopTimeoutID) {
      clearTimeout(status._stopTimeoutID);
      status._stopTimeoutID = null;
    }
    status._stopMeteors();
  }

  Assert.ok(
    BrowserTestUtils.isHidden(status._progressBar),
    "progress bar should not be visible"
  );
  Assert.ok(
    status._progressBar.hasAttribute("value"),
    "progress bar should not be in the indeterminate state"
  );
  if (BrowserTestUtils.isVisible(status._progressBar)) {
    // Somehow the progress bar is still visible and probably in the
    // indeterminate state, meaning vsync timers are still active. Reset it.
    status._stopMeteors();
  }

  Assert.equal(
    status._startRequests,
    0,
    "status bar should not have any start requests"
  );
  Assert.equal(
    status._activeProcesses.length,
    0,
    "status bar should not have any active processes"
  );
  status._startRequests = 0;
  status._activeProcesses.length = 0;
}

/**
 * Subtest to check that the account hub email found config step has the
 * correct data.
 *
 * @param {HTMLElement} template - The account hub step HTML template.
 * @param {string} configType - The config server type.
 */
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
    template.l10n.getAttributes(template.querySelector("#incomingSocketType"))
      .id,
    "account-setup-result-ssl",
    `${configType}: Incoming socketType should be as expected`
  );

  Assert.equal(
    template.l10n.getAttributes(template.querySelector("#outgoingSocketType"))
      .id,
    "account-setup-result-ssl",
    `${configType}: Outgoing socketType should be as expected`
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

/**
 * Subtest to check that the account hub email found config step has the
 * correct data.
 *
 * @param {Tab} tab - The tab containing the account settings.
 * @param {object} user - The user data meant for the added email account.
 * @param {string} type - The config's server type.
 */
async function subtest_verify_account_hub_account(tab, user, type) {
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
    removeAccountInternal(tab, account);
  }
}

/**
 * Remove an account in the Account Manager, but not via the UI.
 *
 * @param {Tab} tab - The tab containing the account settings.
 * @param {nsIMsgAccount} account - The added email account.
 */
function removeAccountInternal(tab, account) {
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
