/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let abOptionsSubview;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubAddressBookOptionSelect.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  abOptionsSubview = tab.browser.contentWindow.document.querySelector(
    "address-book-option-select"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  // The sync accounts option should show a fetching animation.
  Assert.ok(
    abOptionsSubview
      .querySelector("#syncExistingAccounts")
      .classList.contains("fetching"),
    "The sync accounts option button should have the fetching class"
  );

  // Test setting a state with no accounts.
  let state = [];
  abOptionsSubview.setState(state);

  // The sync accounts option shouldn't be showing a fetching animation.
  Assert.ok(
    !abOptionsSubview
      .querySelector("#syncExistingAccounts")
      .classList.contains("fetching"),
    "The sync accounts option button should not have the fetching class"
  );

  // The sync address books option should be disabled and should show the
  // correct data text.
  Assert.ok(
    abOptionsSubview.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be disabled"
  );
  Assert.equal(
    abOptionsSubview.l10n.getAttributes(
      abOptionsSubview.querySelector("#syncExistingAccountsData")
    ).args.addressBooks,
    0,
    "Address books count should be 0"
  );
  Assert.equal(
    abOptionsSubview.l10n.getAttributes(
      abOptionsSubview.querySelector("#syncExistingAccountsData")
    ).args.accounts,
    0,
    "Accounts count should be 0"
  );

  // Test setting a state with 1 account with 1 already synced address book.
  state = [
    {
      account: {},
      addressBooks: [{}],
      existingAddressBookCount: 1,
    },
  ];
  abOptionsSubview.setState(state);

  // The sync address books option should be disabled and should show the
  // correct data text.
  Assert.ok(
    abOptionsSubview.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be disabled"
  );
  Assert.equal(
    abOptionsSubview.l10n.getAttributes(
      abOptionsSubview.querySelector("#syncExistingAccountsData")
    ).args.addressBooks,
    0,
    "Address books count should be 0"
  );
  Assert.equal(
    abOptionsSubview.l10n.getAttributes(
      abOptionsSubview.querySelector("#syncExistingAccountsData")
    ).args.accounts,
    1,
    "Accounts count should be 1"
  );

  // Test setting a state with 2 accounts with 1 account with a synced address
  // book and 1 account without a synced address book.
  state = [
    {
      account: {},
      addressBooks: [{}],
      existingAddressBookCount: 1,
    },
    {
      account: {},
      addressBooks: [{}],
      existingAddressBookCount: 0,
    },
  ];
  abOptionsSubview.setState(state);

  // The sync address books option should be disabled and should show the
  // correct data text.
  Assert.ok(
    !abOptionsSubview.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be enabled"
  );
  Assert.equal(
    abOptionsSubview.l10n.getAttributes(
      abOptionsSubview.querySelector("#syncExistingAccountsData")
    ).args.addressBooks,
    1,
    "Address books count should be 1"
  );
  Assert.equal(
    abOptionsSubview.l10n.getAttributes(
      abOptionsSubview.querySelector("#syncExistingAccountsData")
    ).args.accounts,
    2,
    "Accounts count should be 2"
  );
});

add_task(function test_resetState() {
  abOptionsSubview.resetState();

  Assert.equal(
    abOptionsSubview.l10n.getAttributes(
      abOptionsSubview.querySelector("#syncExistingAccountsData")
    ).id,
    "address-book-sync-existing-description",
    "Address books sync account option description should be reset"
  );

  Assert.ok(
    abOptionsSubview.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be disabled"
  );
});
