/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let prefsWindow, prefsDocument, tabmail;

add_setup(async function () {
  const imapServer = MailServices.accounts.createIncomingServer(
    "imap@foo.invalid",
    "foo.invalid",
    "imap"
  );
  imapServer.password = "password";
  const imapIdentity = MailServices.accounts.createIdentity();
  imapIdentity.email = "imap@foo.invalid";
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.incomingServer = imapServer;
  imapAccount.addIdentity(imapIdentity);
  const imapOutgoing = MailServices.outgoingServer.createServer("smtp");
  imapIdentity.smtpServerKey = imapOutgoing.key;

  const popServer = MailServices.accounts.createIncomingServer(
    "pop@foo.invalid",
    "foo.invalid",
    "pop3"
  );
  popServer.password = "password";
  const popIdentity = MailServices.accounts.createIdentity();
  popIdentity.email = "pop@foo.invalid";
  const popAccount = MailServices.accounts.createAccount();
  popAccount.incomingServer = popServer;
  popAccount.addIdentity(popIdentity);
  const popOutgoing = MailServices.outgoingServer.createServer("smtp");
  popIdentity.smtpServerKey = popOutgoing.key;

  ({ prefsWindow, prefsDocument } = await openNewPrefsTab("paneQrExport"));
  tabmail = document.getElementById("tabmail");

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(popAccount, false);
  });
});

add_task(async function test_init() {
  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportIntro")),
    "Intro screen should be visible by default"
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
    2,
    "Should show two available accounts"
  );
  Assert.ok(
    prefsDocument.getElementById("qrExportSelectAll").disabled,
    "Select all should initialize to disabled"
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
