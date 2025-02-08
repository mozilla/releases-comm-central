/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { OSKeyStore } = ChromeUtils.importESModule(
  "resource://gre/modules/OSKeyStore.sys.mjs"
);
const { OSKeyStoreTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/OSKeyStoreTestUtils.sys.mjs"
);

let prefsWindow, prefsDocument, tabmail, popAccount, oauthAccount, token;

add_setup(async function () {
  const imapAccounts = [];
  for (let i = 0; i < 4; ++i) {
    const imapServer = MailServices.accounts.createIncomingServer(
      `imap${i}@foo.invalid`,
      "foo.invalid",
      "imap"
    );
    imapServer.password = "password";
    const imapIdentity = MailServices.accounts.createIdentity();
    imapIdentity.email = `imap${i}@foo.invalid`;
    const imapAccount = MailServices.accounts.createAccount();
    imapAccount.incomingServer = imapServer;
    imapAccount.addIdentity(imapIdentity);
    const imapOutgoing = MailServices.outgoingServer.createServer("smtp");
    imapIdentity.smtpServerKey = imapOutgoing.key;
    imapAccounts.push(imapAccount);
  }

  const popServer = MailServices.accounts.createIncomingServer(
    "pop@foo.invalid",
    "foo.invalid",
    "pop3"
  );
  popServer.password = "password";
  const popIdentity = MailServices.accounts.createIdentity();
  popIdentity.email = "pop@foo.invalid";
  popAccount = MailServices.accounts.createAccount();
  popAccount.incomingServer = popServer;
  popAccount.addIdentity(popIdentity);
  popIdentity.smtpServerKey = ""; // Use default outgoing server.

  const oauthServer = MailServices.accounts.createIncomingServer(
    "oauth@foo.invalid",
    "foo.invalid",
    "imap"
  );
  oauthServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  const oauthIdentity = MailServices.accounts.createIdentity();
  oauthIdentity.email = "oauth@foo.invalid";
  oauthAccount = MailServices.accounts.createAccount();
  oauthAccount.incomingServer = oauthServer;
  oauthAccount.addIdentity(oauthIdentity);
  const oauthOutgoing = MailServices.outgoingServer.createServer("smtp");
  oauthOutgoing.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  oauthIdentity.smtpServerKey = oauthOutgoing.key;

  ({ prefsWindow, prefsDocument } = await openNewPrefsTab("paneQrExport"));
  tabmail = document.getElementById("tabmail");

  const tokendb = Cc["@mozilla.org/security/pk11tokendb;1"].getService(
    Ci.nsIPK11TokenDB
  );
  token = tokendb.getInternalKeyToken();

  registerCleanupFunction(() => {
    for (const imapAccount of imapAccounts) {
      MailServices.accounts.removeAccount(imapAccount, false);
    }
    MailServices.accounts.removeAccount(popAccount, false);
    MailServices.accounts.removeAccount(oauthAccount, false);
    Assert.ok(!token.hasPassword, "there should be no primary password");
  });
});

add_task(async function test_init() {
  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportIntro")),
    "Intro screen should be visible by default"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("qrExportCodes")),
    "QR codes screen should be hidden by default"
  );

  const exportButton = prefsDocument.getElementById("qrExportStart");
  await BrowserTestUtils.waitForMutationCondition(
    exportButton,
    {
      attributes: true,
      attributeFilter: ["disabled"],
    },
    () => !exportButton.disabled
  );

  const availableAccounts = prefsDocument.querySelectorAll(
    "#qrExportAccountsList li"
  );

  Assert.equal(
    availableAccounts.length,
    6,
    "Should show all available accounts"
  );
  Assert.ok(
    prefsDocument.getElementById("qrExportSelectAll").disabled,
    "Select all should initialize to disabled"
  );

  Assert.ok(
    prefsDocument.getElementById("qrExportIncludePasswords").checked,
    "Include passwords should be checked by default"
  );

  const labels = new Set();
  const tooltips = new Set();

  for (const account of availableAccounts) {
    const input = account.querySelector("input");
    Assert.ok(
      input.checked,
      `Input for ${input.value} should default to checked`
    );
    Assert.ok(
      !labels.has(account.textContent),
      `Should have a unique account display name "${account.textContent}"`
    );
    labels.add(account.textContent);
    Assert.ok(
      !tooltips.has(account.title),
      `Should have a unique account tooltip "${account.title}"`
    );
    tooltips.add(account.title);
  }
});

/**
 * Sub test checking the state updates when checking/unchecking accounts.
 *
 * @param {number} selectedAccountCount - Number of accounts to select.
 * @param {boolean} selectAllDisabled  - If the select all button is expected to be disabled.
 * @param {boolean} submitDisabled  - If the submit button is expected to be disabled.
 */
async function subtest_selectionState(
  selectedAccountCount,
  selectAllDisabled,
  submitDisabled
) {
  const availableAccounts = prefsDocument.querySelectorAll(
    "#qrExportAccountsList input"
  );

  info(
    `Selecting ${selectedAccountCount} of ${availableAccounts.length} accounts`
  );
  for (const [index, account] of availableAccounts.entries()) {
    if (account.checked != index < selectedAccountCount) {
      EventUtils.synthesizeMouseAtCenter(account, {}, prefsWindow);
    }
  }

  const exportButton = prefsDocument.getElementById("qrExportStart");
  await BrowserTestUtils.waitForMutationCondition(
    exportButton,
    {
      attributes: true,
      attributeFilter: ["disabled"],
    },
    () => exportButton.disabled == submitDisabled
  );

  Assert.equal(
    prefsDocument.getElementById("qrExportSelectAll").disabled,
    selectAllDisabled,
    "Should have matching select all state"
  );
}

add_task(async function test_selectionUpdate() {
  await subtest_selectionState(0, false, true);
  await subtest_selectionState(1, false, false);
  await subtest_selectionState(Infinity, true, false);
});

add_task(async function test_selectAll() {
  await subtest_selectionState(0, false, true);

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportSelectAll"),
    {},
    prefsWindow
  );

  const selectedAccounts = prefsDocument.querySelectorAll(
    "#qrExportAccountsList input:checked"
  );

  Assert.greater(selectedAccounts.length, 0, "Should have selected accounts");

  const unselectedAccounts = prefsDocument.querySelectorAll(
    "#qrExportAccountsList input:not(:checked)"
  );
  Assert.equal(
    unselectedAccounts.length,
    0,
    "Should have no unselected accounts"
  );

  Assert.ok(
    !prefsDocument.getElementById("qrExportStart").disabled,
    "Should be able to export selected accounts"
  );
  Assert.ok(
    prefsDocument.getElementById("qrExportSelectAll").disabled,
    "Should not be able to select all accounts"
  );
});

add_task(async function test_oauthWarning() {
  const passwordsSection = prefsDocument.getElementById(
    "qrExportPasswordsSection"
  );
  const passwordInput = prefsDocument.getElementById(
    "qrExportIncludePasswords"
  );
  const passwordOauthHint = prefsDocument.getElementById(
    "qrExportOauthWarning"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(passwordsSection),
    "With all accounts selected passwords section should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(passwordOauthHint),
    "With all accounts selected the oauth hint should be visible"
  );
  Assert.ok(
    passwordInput.checked,
    "With all accounts selected passwords input should be checked"
  );
  Assert.ok(
    !passwordInput.disabled,
    "With all accounts selected passwords input should be enabled"
  );

  await subtest_selectionState(0, false, true);

  Assert.ok(
    BrowserTestUtils.isVisible(passwordsSection),
    "With no accounts selected passwords section should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(passwordOauthHint),
    "With no accounts selected the oauth hint should be hidden"
  );
  Assert.ok(
    passwordInput.checked,
    "With no accounts selected passwords input should be checked"
  );
  Assert.ok(
    !passwordInput.disabled,
    "With no accounts selected passwords input should be enabled"
  );

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.querySelector(`input[value="${oauthAccount.key}"]`),
    {},
    prefsWindow
  );

  Assert.ok(
    BrowserTestUtils.isHidden(passwordsSection),
    "With only an oauth account selected passwords section should be hidden"
  );
  Assert.ok(
    !passwordInput.checked,
    "With only an oauth account selected passwords input should be unchecked"
  );
  Assert.ok(
    passwordInput.disabled,
    "With only an oauth account selected passwords input should be disabled"
  );

  await subtest_selectionState(Infinity, true, false);

  Assert.ok(
    BrowserTestUtils.isVisible(passwordsSection),
    "With all accounts selected passwords section should be visible again"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(passwordOauthHint),
    "With all accounts selected the oauth hint should be visible again"
  );
  Assert.ok(
    passwordInput.checked,
    "With all accounts selected passwords input should be checked again"
  );
  Assert.ok(
    !passwordInput.disabled,
    "With all accounts selected passwords input should be enabled again"
  );
});

add_task(async function test_passwordDisplayDisabled() {
  Services.prefs.setBoolPref(
    "pref.privacy.disable_button.view_passwords",
    true
  );
  // Re-open preferences tab to load new pref value "the intended way".
  tabmail.closeOtherTabs(0);
  ({ prefsWindow, prefsDocument } = await openNewPrefsTab("paneQrExport"));

  const passwordInput = prefsDocument.getElementById(
    "qrExportIncludePasswords"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      prefsDocument.getElementById("qrExportPasswordsSection")
    ),
    "With view passwords disabled the passwords section should be hidden"
  );
  Assert.ok(
    !passwordInput.checked,
    "With view passwords disabled the passwords input should be unchecked"
  );
  Assert.ok(
    passwordInput.disabled,
    "With view passwords disabled the passwords input should be disabled"
  );

  Services.prefs.clearUserPref("pref.privacy.disable_button.view_passwords");
  tabmail.closeOtherTabs(0);
  ({ prefsWindow, prefsDocument } = await openNewPrefsTab("paneQrExport"));
});

/**
 * Step the QR code wizard and verify the displayed code changes.
 *
 * @param {"Next"|"Back"} direction
 */
async function stepQRCode(direction) {
  const img = prefsDocument.querySelector("#qrCodeWizard img");
  const currentCode = img.src;

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById(`qrExportCodes${direction}`),
    {},
    prefsWindow
  );

  await BrowserTestUtils.waitForMutationCondition(
    img,
    {
      attributes: true,
      attributeFilter: ["src"],
    },
    () => img.src != currentCode
  );
}

add_task(async function test_stepThroughQrCodes() {
  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportIntro")),
    "Intro screen should be visible"
  );
  // Avoid needing the keystore.
  prefsDocument.getElementById("qrExportIncludePasswords").checked = false;
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportStart"),
    {},
    prefsWindow
  );
  await BrowserTestUtils.waitForMutationCondition(
    prefsDocument.getElementById("qrExportCodes"),
    {
      attributeFilter: ["hidden"],
    },
    () =>
      BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportCodes"))
  );

  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("qrExportIntro")),
    "Intro screen should no longer be visible"
  );

  Assert.equal(
    prefsDocument.getElementById("qrCodeWizard").getTotalSteps(),
    2,
    "Should expect two steps"
  );

  Assert.equal(
    prefsDocument.getElementById("qrExportCodesNext").dataset.l10nId,
    "qr-export-next",
    "Should show next button initially"
  );
  const description = prefsDocument.getElementById("qrExportScanDescription");
  Assert.equal(
    description.dataset.l10nId,
    "qr-export-scan-description",
    "Should show scan description string"
  );
  Assert.deepEqual(
    JSON.parse(description.dataset.l10nArgs),
    { count: 2 },
    "Should have correct step count as string argument"
  );

  await stepQRCode("Next");

  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportCodes")),
    "QR codes screen should still be shown"
  );
  Assert.equal(
    prefsDocument.getElementById("qrExportCodesNext").dataset.l10nId,
    "qr-export-done",
    "Should show done button at end"
  );

  await stepQRCode("Back");

  Assert.equal(
    prefsDocument.getElementById("qrExportCodesNext").dataset.l10nId,
    "qr-export-next",
    "Should switch back to next label"
  );

  // Back to intro
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportCodesBack"),
    {},
    prefsWindow
  );

  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportIntro")),
    "Should be back to intro screen"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("qrExportCodes")),
    "Should no longer show QR codes"
  );
});

/**
 * Set up export form to only have a single account checked and apply a
 * requested value to the passwords checkbox.
 *
 * @param {boolean} includePasswords - If passwords should be included in the
 *   export.
 */
async function selectSingleAccountAndSetIncludePasswords(includePasswords) {
  for (const option of prefsDocument.querySelectorAll(
    "#qrExportAccountsList input"
  )) {
    option.checked = option.value === popAccount.key;
  }
  prefsDocument.getElementById("qrExportIncludePasswords").checked =
    includePasswords;
}

add_task(async function test_completeCycleWithSummary() {
  selectSingleAccountAndSetIncludePasswords(false);

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportStart"),
    {},
    prefsWindow
  );
  await BrowserTestUtils.waitForMutationCondition(
    prefsDocument.getElementById("qrExportCodes"),
    {
      attributeFilter: ["hidden"],
    },
    () =>
      BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportCodes"))
  );

  prefsDocument.getElementById("qrExportCodesNext").scrollIntoView({
    behavior: "instant",
    block: "nearest",
  });
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportCodesNext"),
    {},
    prefsWindow
  );

  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("qrExportCodes")),
    "QR codes screen should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportSummary")),
    "Should show summary"
  );

  const qrCodesItem = prefsDocument.getElementById("qrExportSummaryQrCodes");
  Assert.equal(
    qrCodesItem.dataset.l10nId,
    "qr-export-summary-qr-count",
    "QR code count item should use correct string"
  );
  Assert.deepEqual(
    JSON.parse(qrCodesItem.dataset.l10nArgs),
    { count: 1 },
    "Should set correct QR code count"
  );

  const accountsItem = prefsDocument.getElementById("qrExportSummaryAccounts");
  Assert.equal(
    accountsItem.dataset.l10nId,
    "qr-export-summary-accounts",
    "Accounts item label should use correct string"
  );
  Assert.deepEqual(
    JSON.parse(accountsItem.dataset.l10nArgs),
    { count: 1 },
    "Should set correct account count"
  );

  const accountsList = prefsDocument.getElementById(
    "qrExportSummaryAccountList"
  );
  Assert.equal(
    accountsList.childElementCount,
    1,
    "Should have one account item in list"
  );
  Assert.equal(
    accountsList.children[0].textContent,
    popAccount.incomingServer.prettyName,
    "Should have pop account label in item"
  );
  Assert.equal(
    accountsList.children[0].title,
    popAccount.incomingServer.prettyName,
    "Should have pop account tooltip in item"
  );

  const passwordsItem = prefsDocument.getElementById(
    "qrExportSummaryPasswords"
  );
  Assert.equal(
    passwordsItem.dataset.l10nId,
    "qr-export-summary-passwords-excluded",
    "Should show passwords excluded string"
  );

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportRestart"),
    {},
    prefsWindow
  );

  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportIntro")),
    "Should be back on intro screen"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("qrExportSummary")),
    "Should no longer show summary"
  );
});

add_task(async function test_summaryWithPasswords() {
  selectSingleAccountAndSetIncludePasswords(true);

  const promptPromise = expectPasswordPrompt("", "accept");
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportStart"),
    {},
    prefsWindow
  );
  await promptPromise;
  await BrowserTestUtils.waitForMutationCondition(
    prefsDocument.getElementById("qrExportCodes"),
    {
      attributeFilter: ["hidden"],
    },
    () =>
      BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportCodes"))
  );

  prefsDocument.getElementById("qrExportCodesNext").scrollIntoView({
    behavior: "instant",
    block: "nearest",
  });
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportCodesNext"),
    {},
    prefsWindow
  );

  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportSummary")),
    "Should show summary"
  );

  const passwordsItem = prefsDocument.getElementById(
    "qrExportSummaryPasswords"
  );
  Assert.equal(
    passwordsItem.dataset.l10nId,
    "qr-export-summary-passwords-included",
    "Should show passwords included string"
  );

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportRestart"),
    {},
    prefsWindow
  );
}).skip(!OSKeyStoreTestUtils.canTestOSKeyStoreLogin());

add_task(async function test_withPrimaryPassword() {
  selectSingleAccountAndSetIncludePasswords(true);
  setPrimaryPassword("", "qrtest");

  const promptPromise = expectPasswordPrompt("qrtest", "accept");
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportStart"),
    {},
    prefsWindow
  );
  await promptPromise;
  await BrowserTestUtils.waitForMutationCondition(
    prefsDocument.getElementById("qrExportCodes"),
    {
      attributeFilter: ["hidden"],
    },
    () =>
      BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportCodes"))
  );
  prefsDocument.getElementById("qrExportCodesNext").scrollIntoView({
    behavior: "instant",
    block: "nearest",
  });
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportCodesNext"),
    {},
    prefsWindow
  );

  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportSummary")),
    "Should show summary"
  );

  const passwordsItem = prefsDocument.getElementById(
    "qrExportSummaryPasswords"
  );
  Assert.equal(
    passwordsItem.dataset.l10nId,
    "qr-export-summary-passwords-included",
    "Should show passwords included string"
  );

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportRestart"),
    {},
    prefsWindow
  );

  setPrimaryPassword("qrtest", "");
});

add_task(async function test_primaryPasswordRefused() {
  selectSingleAccountAndSetIncludePasswords(true);
  setPrimaryPassword("", "qrtest");

  const promptPromise = expectPasswordPrompt("qrtest", "cancel");
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportStart"),
    {},
    prefsWindow
  );
  await promptPromise;

  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportStart")),
    "Should remain at start"
  );
  setPrimaryPassword("qrtest", "");
});

add_task(async function test_osAuthRefused() {
  selectSingleAccountAndSetIncludePasswords(true);

  const promptPromise = expectPasswordPrompt("", "cancel");
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("qrExportStart"),
    {},
    prefsWindow
  );
  await promptPromise;

  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportStart")),
    "Should remain at start"
  );
}).skip(
  !OSKeyStoreTestUtils.canTestOSKeyStoreLogin() || !OSKeyStore.canReauth()
);

/**
 * Handle the prompt to include passwords in the QR code.
 *
 * @param {string} primaryPassword - Primary password if enabled.
 * @param {"accept"|"cancel"} action - Action to take in the password prompt.
 */
async function expectPasswordPrompt(primaryPassword, action) {
  if (OSKeyStore.canReauth() && !primaryPassword) {
    return OSKeyStoreTestUtils.waitForOSKeyStoreLogin(action === "accept");
  }
  // Not showing a confirmation prompt unless we are asking for a primary
  // password or OS auth.
  if (!primaryPassword) {
    return Promise.resolve();
  }
  // If there's a primary password set, we should be asked for it.
  return BrowserTestUtils.promiseAlertDialog(undefined, undefined, {
    callback(win) {
      const doc = win.document;
      const passwordInput = doc.getElementById("password1Textbox");
      Assert.ok(
        BrowserTestUtils.isVisible(passwordInput),
        "password input should be visible"
      );
      Assert.equal(
        doc.activeElement,
        passwordInput,
        "password input should have focus"
      );
      if (action === "accept") {
        EventUtils.sendString(primaryPassword, win);
      }
      doc.querySelector("dialog").getButton(action).click();
    },
  });
}

/**
 * Change the primary password.
 *
 * @param {string} oldPassword - Old password, empty string if not set.
 * @param {string} newPassword - New password, empty string to remove password.
 */
async function setPrimaryPassword(oldPassword = "", newPassword = "") {
  Assert.equal(
    Boolean(oldPassword),
    token.hasPassword,
    "Should provide old password if there is already a password"
  );
  if (oldPassword) {
    Assert.ok(
      token.checkPassword(oldPassword),
      "Old password should be correct"
    );
  }
  if (!oldPassword) {
    token.initPassword(newPassword);
  } else {
    token.changePassword(oldPassword, newPassword);
  }

  Assert.equal(
    token.hasPassword,
    Boolean(newPassword),
    "Should set password if one was provided"
  );
  if (newPassword) {
    Assert.ok(
      token.checkPassword(newPassword),
      "Password should be set to new password"
    );
  }
}
