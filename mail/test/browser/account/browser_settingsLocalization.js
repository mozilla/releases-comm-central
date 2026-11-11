/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { click_account_tree_row, get_account_tree_row, openAccountSettings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );
const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

let accountsTab;
let feedAccount;
let otherFeedAccount;

add_setup(async function () {
  feedAccount = FeedUtils.createRssAccount("First Feeds");
  otherFeedAccount = FeedUtils.createRssAccount("Other Feeds");
  registerCleanupFunction(() => {
    if (accountsTab) {
      document.getElementById("tabmail").closeTab(accountsTab);
    }
    MailServices.accounts.removeAccount(feedAccount);
    MailServices.accounts.removeAccount(otherFeedAccount);
  });
  accountsTab = await openAccountSettings();
});

/**
 * Selects an account pane and waits for the account values to be restored.
 *
 * @param {nsIMsgAccount} account - The account to select.
 * @param {?string} paneId - The pane to select, or null for the main pane.
 * @returns {Promise<Document>} The initialized pane document.
 */
async function selectPane(account, paneId) {
  const row = get_account_tree_row(account.key, paneId, accountsTab);
  Assert.greaterOrEqual(
    row,
    0,
    "The account settings pane should have a tree row"
  );
  await click_account_tree_row(accountsTab, row);
  await TestUtils.waitForCondition(
    () => accountsTab.browser.contentWindow.currentAccount == account,
    "The pane should finish restoring the selected account"
  );
  const doc =
    accountsTab.browser.contentDocument.getElementById(
      "contentFrame"
    ).contentDocument;
  await doc.l10n.ready;
  return doc;
}

/**
 * Checks an element's Fluent ID and its translated text or attributes.
 *
 * @param {Document} doc - The settings document.
 * @param {string} selector - The element selector.
 * @param {string} id - The expected Fluent message ID.
 * @param {string[]} [attributes] - The translated attributes to check.
 */
async function assertLocalizedElement(doc, selector, id, attributes = []) {
  const element = doc.querySelector(selector);
  Assert.ok(element, `${id} should have a target element`);
  Assert.equal(
    doc.l10n.getAttributes(element).id,
    id,
    `${id} should be assigned to its target element`
  );
  const [message] = await doc.l10n.formatMessages([{ id }]);
  await doc.l10n.translateElements([element]);
  if (attributes.length) {
    for (const name of attributes) {
      const expected = message.attributes.find(attr => attr.name == name).value;
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

add_task(async function test_localizesTabTitle() {
  const doc = accountsTab.browser.contentDocument;
  await doc.l10n.ready;

  Assert.equal(
    doc.l10n.getAttributes(doc.querySelector("title")).id,
    "account-manager-document-title",
    "The Accounts tab title should use the Accounts ID"
  );
});

add_task(async function test_appliesLocalization() {
  const doc = await selectPane(
    MailServices.accounts.getAccount("account2"),
    "am-server.xhtml"
  );
  await assertLocalizedElement(
    doc,
    '[control="server.hostname"]',
    "account-settings-server-name",
    ["value", "accesskey"]
  );
  await assertLocalizedElement(
    doc,
    '[id="server.downloadOnBiff"]',
    "account-settings-automatically-download-new-messages",
    ["label", "accesskey"]
  );
  await assertLocalizedElement(
    doc,
    '[id="server.socketType"] option[value="0"]',
    "account-settings-connection-security-none",
    ["label"]
  );
  await assertLocalizedElement(
    doc,
    "#browseForLocalFolder",
    "account-settings-browse-local-directory",
    ["label", "accesskey", "filepickertitle"]
  );
  await assertLocalizedElement(
    doc,
    "fieldset:has(#browseForLocalFolder) legend",
    "account-settings-message-storage"
  );

  const localDoc = await selectPane(
    MailServices.accounts.getAccount("account1"),
    null
  );
  await assertLocalizedElement(
    localDoc,
    '[control="server.prettyName"]',
    "account-settings-account-name",
    ["value", "accesskey"]
  );
});

/**
 * Checks the RSS heading and document title after translating the pane again.
 *
 * @param {Document} doc - The RSS settings document.
 * @param {string} accountName - The name to show, or an empty string for no name.
 */
async function assertRssTitle(doc, accountName) {
  const heading = doc.querySelector("#am-newsblog-title .dialogheader-title");
  const title = doc.querySelector("title");
  Assert.ok(heading, "The RSS settings pane should have a heading");
  Assert.ok(title, "The RSS settings pane should have a document title");

  const args = accountName ? { accountName } : null;
  const headingId = accountName
    ? "account-settings-title-with-name"
    : "account-settings-title";
  const titleId = accountName
    ? "account-settings-document-title-with-name"
    : "account-settings-document-title";
  Assert.deepEqual(
    doc.l10n.getAttributes(heading),
    { id: headingId, args },
    "The heading should use the current account name and Fluent message"
  );
  Assert.deepEqual(
    doc.l10n.getAttributes(title),
    { id: titleId, args },
    "The document title should use the current account name and Fluent message"
  );

  const [headingMessage, titleMessage] = await doc.l10n.formatMessages([
    { id: headingId, args },
    { id: titleId, args },
  ]);
  await doc.l10n.translateFragment(doc.documentElement);
  Assert.equal(
    heading.value,
    headingMessage.attributes.find(attr => attr.name == "value").value,
    "The heading should retain the current account name after retranslation"
  );
  Assert.equal(
    heading.textContent,
    "",
    "The heading should have no stale text alongside its value attribute"
  );
  Assert.equal(
    doc.title,
    titleMessage.value,
    "The document title should retain the current account name after retranslation"
  );
}

add_task(async function test_rssTitleLifecycle() {
  const doc = await selectPane(feedAccount, null);
  await assertRssTitle(doc, "First Feeds");
  await assertLocalizedElement(
    doc,
    '[control="server.localPath"]',
    "account-settings-local-directory",
    ["value"]
  );
  await assertLocalizedElement(
    doc,
    "fieldset:has(#doBiff) legend",
    "account-settings-rss-server-settings"
  );

  const nameInput = doc.getElementById("server.prettyName");
  accountsTab.browser.focus();
  for (const name of ["Renamed Feeds", "", "Restored Feeds"]) {
    const alert = name ? null : BrowserTestUtils.promiseAlertDialog("accept");
    await SimpleTest.promiseFocus(doc.defaultView);
    EventUtils.synthesizeMouseAtCenter(nameInput, {}, doc.defaultView);
    EventUtils.synthesizeKey("a", { accelKey: true }, doc.defaultView);
    EventUtils.synthesizeKey("KEY_Backspace", {}, doc.defaultView);
    EventUtils.sendString(name, doc.defaultView);
    Assert.equal(
      nameInput.value,
      name,
      "The input should contain the edited name"
    );
    doc.getElementById("serverColor").focus();
    if (alert) {
      await alert;
    }
    await assertRssTitle(doc, name);
  }

  const otherDoc = await selectPane(otherFeedAccount, null);
  Assert.equal(otherDoc, doc, "Switching feed accounts should reuse the pane");
  await assertRssTitle(otherDoc, "Other Feeds");

  const restoredDoc = await selectPane(feedAccount, null);
  Assert.equal(
    restoredDoc,
    doc,
    "Returning to the first account should reuse the pane"
  );
  await assertRssTitle(restoredDoc, "Restored Feeds");
});
