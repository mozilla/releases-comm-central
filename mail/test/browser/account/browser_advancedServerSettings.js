/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { click_account_tree_row, get_account_tree_row, openAccountSettings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );

let accountsTab;
let imapAccount;

add_setup(async function () {
  imapAccount = MailServices.accounts.createAccount();
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "imap-l10n.invalid",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Localization";
  const identity = MailServices.accounts.createIdentity();
  identity.email = "imap-l10n@example.invalid";
  imapAccount.addIdentity(identity);
  registerCleanupFunction(() => {
    if (accountsTab) {
      document.getElementById("tabmail").closeTab(accountsTab);
    }
    imapAccount.incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(imapAccount);
  });
  accountsTab = await openAccountSettings();
});

/**
 * Opens the advanced settings subdialog from the selected account's server pane.
 *
 * @param {nsIMsgAccount} account - The account whose settings to show.
 * @param {string} buttonId - The advanced settings button ID.
 * @returns {Promise<Document>} The initialized subdialog document.
 */
async function openAdvancedSettings(account, buttonId) {
  const row = get_account_tree_row(account.key, "am-server.xhtml", accountsTab);
  await click_account_tree_row(accountsTab, row);
  const managerDoc = accountsTab.browser.contentDocument;
  const paneDoc = managerDoc.getElementById("contentFrame").contentDocument;
  const opened = BrowserTestUtils.waitForEvent(
    managerDoc.getElementById("dialogStack"),
    "dialogopen"
  );
  const button = paneDoc.getElementById(buttonId);
  button.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(button, {}, paneDoc.defaultView);
  await opened;

  const doc =
    accountsTab.browser.contentWindow.gSubDialog._topDialog._frame
      .contentDocument;
  await doc.l10n.ready;
  return doc;
}

/**
 * Checks the assigned Fluent IDs and rendered text or attributes in a dialog.
 *
 * @param {Document} doc - The advanced settings document.
 * @param {Array<[string, string, string[]]>} entries - Selectors, message IDs,
 *   and translated attribute names. An empty attribute list checks text content.
 */
async function checkLocalization(doc, entries) {
  const messages = await doc.l10n.formatMessages(
    entries.map(([, id]) => ({ id }))
  );
  for (const [index, [selector, id, attributes]] of entries.entries()) {
    const element = doc.querySelector(selector);
    Assert.ok(element, `${id} should have a target element`);
    Assert.equal(
      doc.l10n.getAttributes(element).id,
      id,
      `${id} should be assigned to its target element`
    );
    Assert.ok(
      BrowserTestUtils.isVisible(element),
      `${id} should be visible for this protocol`
    );
    const message = messages[index];
    if (attributes.length) {
      for (const name of attributes) {
        const expected = message.attributes.find(
          attr => attr.name == name
        ).value;
        Assert.ok(expected, `${id}.${name} should have a translated value`);
        Assert.equal(
          element.getAttribute(name),
          expected,
          `${id} should apply its translated ${name} attribute`
        );
      }
    } else {
      Assert.ok(message.value, `${id} should have translated text`);
      Assert.equal(
        element.textContent,
        message.value,
        `${id} should display its translated text`
      );
    }
  }
  Assert.equal(
    doc.l10n.getAttributes(doc.querySelector("title")).id,
    "account-settings-advanced-server-title",
    "The advanced dialog should use its localized title"
  );
  const title = await doc.l10n.formatValue(
    "account-settings-advanced-server-title"
  );
  Assert.equal(
    doc.title,
    title,
    "The advanced dialog title should be localized"
  );
}

/**
 * Cancels the advanced settings dialog and waits for it to close.
 *
 * @param {Document} doc - The advanced settings document.
 */
async function closeAdvancedSettings(doc) {
  const closed = BrowserTestUtils.waitForEvent(
    accountsTab.browser.contentDocument.getElementById("dialogStack"),
    "dialogclose"
  );
  doc.querySelector("dialog").cancelDialog();
  await closed;
}

add_task(async function test_imapLocalization() {
  const doc = await openAdvancedSettings(
    imapAccount,
    "server.imapAdvancedButton"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(doc.getElementById("pop3Panel")),
    "The POP settings should be hidden for IMAP"
  );
  await checkLocalization(doc, [
    [
      "#serverDirectoryLabel",
      "account-settings-imap-server-directory",
      ["value", "accesskey"],
    ],
    [
      "#usingSubscription",
      "account-settings-imap-show-subscribed-folders",
      ["label", "accesskey"],
    ],
    [
      "#dualUseFolders",
      "account-settings-imap-dual-use-folders",
      ["label", "accesskey"],
    ],
    [
      "#maximumConnectionsNumberLabel",
      "account-settings-imap-maximum-connections",
      ["value", "accesskey"],
    ],
    [
      "#imapPanel > description",
      "account-settings-imap-namespace-description",
      [],
    ],
    [
      "#personalNamespaceLabel",
      "account-settings-imap-personal-namespace",
      ["value", "accesskey"],
    ],
    [
      "#publicNamespaceLabel",
      "account-settings-imap-public-namespace",
      ["value", "accesskey"],
    ],
    [
      "#otherUsersNamespaceLabel",
      "account-settings-imap-other-users-namespace",
      ["value", "accesskey"],
    ],
    [
      "#overrideNamespaces",
      "account-settings-imap-override-namespaces",
      ["label", "accesskey"],
    ],
  ]);

  const directory = doc.getElementById("serverDirectory");
  directory.value = "Custom Directory";
  const usingSubscription = doc.getElementById("usingSubscription");
  usingSubscription.checked = !usingSubscription.checked;
  const expectedChecked = usingSubscription.checked;
  await doc.l10n.translateFragment(doc.documentElement);
  Assert.equal(
    directory.value,
    "Custom Directory",
    "Retranslation should preserve the edited server directory"
  );
  Assert.equal(
    usingSubscription.checked,
    expectedChecked,
    "Retranslation should preserve the subscription setting"
  );
  await closeAdvancedSettings(doc);
});

add_task(async function test_popLocalization() {
  const doc = await openAdvancedSettings(
    MailServices.accounts.getAccount("account2"),
    "server.popAdvancedButton"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(doc.getElementById("imapPanel")),
    "The IMAP settings should be hidden for POP"
  );
  await checkLocalization(doc, [
    [
      '#pop3Panel > label[control="folderStorage"]',
      "account-settings-pop-inbox-description",
      [],
    ],
    [
      "#deferToCurrentAccount",
      "account-settings-pop-inbox-current-account",
      ["label", "accesskey"],
    ],
    [
      "#deferToOtherAccount",
      "account-settings-pop-inbox-other-account",
      ["label", "accesskey"],
    ],
    [
      "#deferGetNewMail",
      "account-settings-pop-include-server",
      ["label", "accesskey"],
    ],
  ]);
  Assert.equal(
    doc.getElementById("folderStorage").value,
    "currentAccount",
    "The account should initially keep its own inbox"
  );
  Assert.ok(
    doc.getElementById("deferredServerFolderPicker").disabled,
    "The other account picker should initially be disabled"
  );
  await closeAdvancedSettings(doc);
});
