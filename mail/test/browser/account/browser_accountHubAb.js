/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);
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
  if (name == "_carddavs._tcp.localhost") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
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
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
});

registerCleanupFunction(function () {
  DNS.srv = _srv;
  DNS.txt = _txt;
  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

add_task(async function test_address_book_option_select_account_with_ab() {
  IMAPServer.open();
  const abAccount = await loginToAddressBookAccount();

  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");

  const optionSelectTemplate = dialog.querySelector(
    "address-book-option-select"
  );

  await BrowserTestUtils.waitForMutationCondition(
    optionSelectTemplate,
    { childList: true },
    () => !!optionSelectTemplate.querySelector("#syncExistingAccounts")
  );

  await TestUtils.waitForCondition(
    () =>
      optionSelectTemplate.l10n.getAttributes(
        optionSelectTemplate.querySelector("#syncExistingAccountsData")
      ).id === "account-hub-address-book-sync-option-data",
    "The option select subview should have applied the address book count"
  );

  // The sync accounts option should be enabled as there are is one account
  // with an available address book.
  Assert.ok(
    !optionSelectTemplate.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be enabled"
  );

  subtest_close_account_hub_dialog(dialog, optionSelectTemplate);

  Services.logins.removeAllLogins();
  MailServices.accounts.removeAccount(abAccount);
  IMAPServer.close();
});

add_task(async function test_address_book_option_select_no_accounts() {
  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");

  const optionSelectTemplate = dialog.querySelector(
    "address-book-option-select"
  );

  await BrowserTestUtils.waitForMutationCondition(
    optionSelectTemplate,
    { childList: true },
    () => !!optionSelectTemplate.querySelector("#syncExistingAccounts")
  );

  // The sync accounts option should be disabled as there are no accounts.
  Assert.ok(
    optionSelectTemplate.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be disabled"
  );

  subtest_close_account_hub_dialog(dialog, optionSelectTemplate);
});

add_task(async function test_address_book_option_selection() {
  // Add an account so the sync option is not diabled.
  IMAPServer.open();
  const abAccount = await loginToAddressBookAccount();

  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  const backButton = dialog.querySelector("#addressBookFooter #back");

  const optionSelectTemplate = dialog.querySelector(
    "address-book-option-select"
  );

  await BrowserTestUtils.waitForMutationCondition(
    optionSelectTemplate,
    { childList: true },
    () => !!optionSelectTemplate.querySelector("#syncExistingAccounts")
  );

  await TestUtils.waitForCondition(
    () =>
      optionSelectTemplate.l10n.getAttributes(
        optionSelectTemplate.querySelector("#syncExistingAccountsData")
      ).id === "account-hub-address-book-sync-option-data",
    "The option select subview should have applied the address book count"
  );

  // Click the sync accounts option to show the account option subview.
  EventUtils.synthesizeMouseAtCenter(
    optionSelectTemplate.querySelector("#syncExistingAccounts"),
    {}
  );
  await subtest_switchSubviews(
    optionSelectTemplate,
    dialog.querySelector("address-book-account-select"),
    backButton
  );

  // Click the remote account option to show the remote account form subview.
  EventUtils.synthesizeMouseAtCenter(
    optionSelectTemplate.querySelector("#addRemoteAddressBook"),
    {}
  );
  await subtest_switchSubviews(
    optionSelectTemplate,
    dialog.querySelector("address-book-remote-account-form"),
    backButton
  );

  // Click the local account option to show the local account form subview.
  EventUtils.synthesizeMouseAtCenter(
    optionSelectTemplate.querySelector("#newLocalAddressBook"),
    {}
  );
  await subtest_switchSubviews(
    optionSelectTemplate,
    dialog.querySelector("address-book-local-form"),
    backButton
  );

  // Click the LDAP account option to show the LDAP account form subview.
  EventUtils.synthesizeMouseAtCenter(
    optionSelectTemplate.querySelector("#newLdapAddressBook"),
    {}
  );
  await subtest_switchSubviews(
    optionSelectTemplate,
    dialog.querySelector("address-book-ldap-account-form"),
    backButton
  );

  subtest_close_account_hub_dialog(dialog, optionSelectTemplate);
  Services.logins.removeAllLogins();
  MailServices.accounts.removeAccount(abAccount);
  IMAPServer.close();
});

add_task(async function test_address_book_sync_account() {
  // Add an account so the sync option is not diabled.
  IMAPServer.open();
  const abAccount = await loginToAddressBookAccount();

  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  const optionSelectTemplate = dialog.querySelector(
    "address-book-option-select"
  );

  await BrowserTestUtils.waitForMutationCondition(
    optionSelectTemplate,
    { childList: true },
    () => !!optionSelectTemplate.querySelector("#syncExistingAccounts")
  );
  await TestUtils.waitForCondition(
    () =>
      optionSelectTemplate.l10n.getAttributes(
        optionSelectTemplate.querySelector("#syncExistingAccountsData")
      ).id === "account-hub-address-book-sync-option-data",
    "The option select subview should have applied the address book count"
  );

  // Click the sync accounts option to show the account option subview.
  let subviewHiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    optionSelectTemplate
  );
  EventUtils.synthesizeMouseAtCenter(
    optionSelectTemplate.querySelector("#syncExistingAccounts"),
    {}
  );
  await subviewHiddenPromise;
  const accountSelectTemplate = dialog.querySelector(
    "address-book-account-select"
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    accountSelectTemplate
  );
  Assert.ok(
    BrowserTestUtils.isHidden(optionSelectTemplate),
    "The option select subview should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(accountSelectTemplate),
    "The account select subview should be visible"
  );

  // Test that button values have been updated correctly.
  const accountButton = accountSelectTemplate.querySelector("button");
  Assert.equal(
    accountButton.value,
    "john.doe@imap.test",
    "Button value should be the account email"
  );
  Assert.equal(
    accountButton.querySelector("span.account-title").textContent,
    "John Doe",
    "Button title text should be the account full name"
  );
  Assert.equal(
    accountButton.querySelector("span.account-data").textContent,
    "john.doe@imap.test",
    "Button data text should be the account email"
  );

  const counter = accountButton.querySelector(".account-address-book-count");
  Assert.equal(
    accountSelectTemplate.l10n.getAttributes(counter).args.synced,
    0,
    "Synced address books count should be 0"
  );
  Assert.equal(
    accountSelectTemplate.l10n.getAttributes(counter).args.available,
    1,
    "Available address books count should be 1"
  );
  Assert.equal(
    accountSelectTemplate.l10n.getAttributes(counter).args.total,
    1,
    "Total address books count should be 1"
  );

  // Click the account button to open the sync address books template.
  subviewHiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    accountSelectTemplate
  );
  EventUtils.synthesizeMouseAtCenter(accountButton, {});
  await subviewHiddenPromise;
  const syncAddressBooksTemplate = dialog.querySelector("address-book-sync");
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    syncAddressBooksTemplate
  );
  Assert.ok(
    BrowserTestUtils.isHidden(accountSelectTemplate),
    "The option select subview should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(syncAddressBooksTemplate),
    "The account select subview should be visible"
  );

  // The address book input should be checked and enabled
  const addressBookInput = syncAddressBooksTemplate.querySelector("input");
  Assert.ok(
    !addressBookInput.disabled,
    "Address book option should be enabled"
  );
  Assert.ok(addressBookInput.checked, "Address book option should be checked");

  subtest_close_account_hub_dialog(dialog, syncAddressBooksTemplate);
  Services.logins.removeAllLogins();
  MailServices.accounts.removeAccount(abAccount);
  IMAPServer.close();
});

/**
 * Tests visibility of option select template and the selected address book
 * template, and again when the back button is pressed.
 *
 * @param {HTMLElement} optionSelectTemplate - Option select subview.
 * @param {HTMLElement} newSubview - Selected subview.
 * @param {HTMLElement} backButton - Dialog footer button.
 */
async function subtest_switchSubviews(
  optionSelectTemplate,
  newSubview,
  backButton
) {
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(optionSelectTemplate),
    "The option-select subview should be hidden."
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(newSubview),
    `The ${newSubview.tagName} subview should be visible.`
  );
  EventUtils.synthesizeMouseAtCenter(backButton, {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(newSubview),
    `The ${newSubview.tagName} subview should be visible.`
  );

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(optionSelectTemplate),
    "The option select subview should be visible."
  );
}

/**
 * Creates and logs in to an account that has an available address book.
 *
 * @returns {nsIMsgAccount}
 */
async function loginToAddressBookAccount() {
  const abAccount = MailServices.accounts.createAccount();
  abAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "john.doe@imap.test",
    "imap.test",
    "imap"
  );

  const identity = MailServices.accounts.createIdentity();
  identity.email = "john.doe@imap.test";
  identity.fullName = "John Doe";
  abAccount.addIdentity(identity);

  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "https://example.org",
    null,
    "https://example.org",
    "john.doe@imap.test",
    "abc12345",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  return abAccount;
}
