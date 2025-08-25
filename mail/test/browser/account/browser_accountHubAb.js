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

  await subtest_close_account_hub_dialog(dialog, optionSelectTemplate);

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

  await subtest_close_account_hub_dialog(dialog, optionSelectTemplate);
});

add_task(async function test_address_book_option_selection() {
  // Add an account so the sync option is not disabled.
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
  await subtest_switchSubviews(
    optionSelectTemplate,
    "#syncExistingAccounts",
    dialog.querySelector("address-book-account-select"),
    backButton
  );

  // Click the remote account option to show the remote account form subview.
  await subtest_switchSubviews(
    optionSelectTemplate,
    "#addRemoteAddressBook",
    dialog.querySelector("address-book-remote-account-form"),
    backButton
  );

  // Click the local account option to show the local account form subview.
  await subtest_switchSubviews(
    optionSelectTemplate,
    "#newLocalAddressBook",
    dialog.querySelector("address-book-local-form"),
    backButton
  );

  // Click the LDAP account option to show the LDAP account form subview.
  await subtest_switchSubviews(
    optionSelectTemplate,
    "#newLdapAddressBook",
    dialog.querySelector("address-book-ldap-account-form"),
    backButton
  );

  optionSelectTemplate.querySelector("#syncExistingAccounts").scrollIntoView({
    behavior: "instant",
  });
  await subtest_close_account_hub_dialog(dialog, optionSelectTemplate);
  Services.logins.removeAllLogins();
  MailServices.accounts.removeAccount(abAccount);
  IMAPServer.close();
});

add_task(async function test_address_book_sync_account() {
  // Add an account so the sync option is not disabled.
  IMAPServer.open();
  const abAccount = await loginToAddressBookAccount();

  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  const optionSelectTemplate = dialog.querySelector(
    "address-book-option-select"
  );

  const tabmail = document.getElementById("tabmail");

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

  // Click forward to add the address book and automatically close the dialog.
  const addressBookDirectoryPromise = TestUtils.topicObserved(
    "addrbook-directory-synced"
  );
  const dialogClosePromise = BrowserTestUtils.waitForEvent(dialog, "close");
  const addressBookTabOpen = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen",
    false,
    event => event.detail.tabInfo.mode.type == "addressBookTab"
  );
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#addressBookFooter #forward"),
    {}
  );

  info("Opening address book tab...");
  const {
    detail: { tabInfo: addressBookTab },
  } = await addressBookTabOpen;

  info("Waiting for address book to be ready...");
  await BrowserTestUtils.waitForEvent(
    addressBookTab.browser,
    "about-addressbook-ready",
    true
  );

  info("Waiting for account hub to close...");
  await dialogClosePromise;

  // Check existence of address book and calendar.
  const [addressBookDirectory] = await addressBookDirectoryPromise;
  Assert.equal(addressBookDirectory.dirName, "You found me!");
  Assert.equal(
    addressBookDirectory.dirType,
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  Assert.equal(
    addressBookDirectory.getStringValue("carddav.url", ""),
    "https://example.org/browser/comm/mail/components/addrbook/test/browser/data/addressbook.sjs"
  );

  const addressBookDocument = addressBookTab.browser.contentDocument;
  const booksList = addressBookDocument.getElementById("books");

  const index = booksList.getIndexForUID(addressBookDirectory.UID);
  Assert.equal(
    booksList.selectedIndex,
    index,
    "The new address book should be selected"
  );
  Assert.equal(
    addressBookDocument.activeElement.id,
    "searchInput",
    "Search input should have focus"
  );

  tabmail.closeOtherTabs(0);

  // Remove the address book.
  MailServices.ab.deleteAddressBook(addressBookDirectory.URI);

  Services.logins.removeAllLogins();
  MailServices.accounts.removeAccount(abAccount);
  IMAPServer.close();
});

add_task(async function test_address_book_remote_account() {
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  const remoteAccountFormSubview = dialog.querySelector(
    "#addressBookRemoteAccountFormSubview"
  );

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("address-book-option-select #addRemoteAddressBook"),
    {},
    window
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    remoteAccountFormSubview
  );
  Assert.ok(
    BrowserTestUtils.isVisible(remoteAccountFormSubview),
    "Remote account form subview should be visible"
  );

  EventUtils.sendString("testeroni");
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  EventUtils.sendString("https://example.com");

  await BrowserTestUtils.waitForAttributeRemoval(
    "disabled",
    dialog.querySelector("#addressBookFooter #forward")
  );

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#addressBookFooter #back"),
    {},
    window
  );
  await BrowserTestUtils.waitForMutationCondition(
    remoteAccountFormSubview,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isHidden(remoteAccountFormSubview)
  );

  await dialog.querySelector("account-hub-address-book").reset();

  Assert.equal(
    remoteAccountFormSubview.querySelector("#username").value,
    "",
    "Should clear username"
  );
  Assert.equal(
    remoteAccountFormSubview.querySelector("#davServer").value,
    "",
    "Should clear server"
  );

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("#addressBookOptionSelectSubview")
  );
});

add_task(async function test_localAddressBookCreation() {
  const accountHub = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  let optionSelect;

  await TestUtils.waitForCondition(() => {
    optionSelect = accountHub.querySelector("address-book-option-select");
    return optionSelect?.hasConnected;
  }, "Address book option select should be connected");

  const localAddressBookButton = optionSelect.querySelector(
    "#newLocalAddressBook"
  );

  EventUtils.synthesizeMouseAtCenter(localAddressBookButton, {});

  const localForm = accountHub.querySelector("address-book-local-form form");
  await TestUtils.waitForCondition(() => {
    return localForm.getBoundingClientRect().width;
  }, "New local address book subview should be visible");

  const input = localForm.querySelector("input");
  EventUtils.synthesizeMouseAtCenter(input, {});
  input.focus();

  EventUtils.sendString("test");

  const addressBookDirectoryPromise = TestUtils.topicObserved(
    "addrbook-directory-created"
  );

  const closeEvent = BrowserTestUtils.waitForEvent(accountHub, "close");

  const tabmail = document.getElementById("tabmail");

  EventUtils.synthesizeMouseAtCenter(
    accountHub.querySelector("#addressBookFooter #forward"),
    {}
  );

  const readyEvent = BrowserTestUtils.waitForEvent(
    tabmail.currentTabInfo.browser,
    "about-addressbook-ready",
    true
  );
  // Check existence of address book.
  const [addressBookDirectory] = await addressBookDirectoryPromise;
  Assert.equal(
    addressBookDirectory.dirName,
    "test",
    "Address book should be created"
  );

  await closeEvent;
  const booksList = await BrowserTestUtils.waitForCondition(() => {
    return tabmail.currentTabInfo.browser.contentWindow.document.getElementById(
      "books"
    );
  });

  await readyEvent;

  Assert.equal(
    tabmail.currentTabInfo.mode.type,
    "addressBookTab",
    "Should have navigated to address book"
  );

  const index = booksList.getIndexForUID(addressBookDirectory.UID);
  Assert.equal(
    booksList.selectedIndex,
    index,
    "Correct address book should be selected"
  );
  Assert.equal(
    tabmail.currentTabInfo.browser.contentDocument.activeElement.id,
    "searchInput",
    "Search input should have focus"
  );

  tabmail.closeOtherTabs(0);

  MailServices.ab.deleteAddressBook(addressBookDirectory.URI);
});

/**
 * Tests visibility of option select template and the selected address book
 * template, and again when the back button is pressed.
 *
 * @param {HTMLElement} optionSelectTemplate - Option select subview.
 * @param {string} buttonSelector - Selector for the button to click to show the
 *  subview.
 * @param {HTMLElement} newSubview - Selected subview.
 * @param {HTMLElement} backButton - Dialog footer button.
 */
async function subtest_switchSubviews(
  optionSelectTemplate,
  buttonSelector,
  newSubview,
  backButton
) {
  const button = optionSelectTemplate.querySelector(buttonSelector);
  button.scrollIntoView({
    block: "nearest",
    behavior: "instant",
  });
  await TestUtils.waitForTick();
  EventUtils.synthesizeMouseAtCenter(button, {});
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
  const emailLoginInfo = Cc[
    "@mozilla.org/login-manager/loginInfo;1"
  ].createInstance(Ci.nsILoginInfo);
  emailLoginInfo.init(
    "imap://imap.test",
    null,
    "imap://imap.test",
    "john.doe@imap.test",
    "abc12345",
    "",
    ""
  );
  await Services.logins.addLoginAsync(emailLoginInfo);

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
