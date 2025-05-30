/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let abAccountsSubview;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubAddressBookAccountSelect.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  abAccountsSubview = tab.browser.contentWindow.document.querySelector(
    "address-book-account-select"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  // Test setting a state with 1 account with 1 already synced address book.
  const state = [
    {
      account: { incomingServer: {}, defaultIdentity: {} },
      addressBooks: [{}],
      existingAddressBookCount: 1,
    },
  ];
  state[0].account.incomingServer.username = "test@test.com";
  state[0].account.defaultIdentity.fullName = "Test User";
  abAccountsSubview.setState(state);

  // The account option should be disabled and should show the correct data
  // text.
  let accountButton = abAccountsSubview.querySelector(
    'button[value="test@test.com"]'
  );
  Assert.ok(accountButton.disabled, "The account option should be disabled");

  subtest_testStateData(state[0], accountButton);

  // Update state values to have 1 ready to sync address book and new info.
  state[0].existingAddressBookCount = 0;
  state[0].account.incomingServer.username = "test@example.com";
  state[0].account.defaultIdentity.fullName = "Example User";
  abAccountsSubview.setState(state);

  // There should still only be on account button with the new state.
  Assert.equal(
    abAccountsSubview.querySelectorAll("button").length,
    1,
    "There should only be one account button"
  );

  accountButton = abAccountsSubview.querySelector(
    'button[value="test@example.com"]'
  );
  Assert.ok(!accountButton.disabled, "The account option should be enabled");

  subtest_testStateData(state[0], accountButton);
});

/**
 * Subtest to test the content of an account option button.
 *
 * @param {object} state - Object containing account information
 * @param {HTMLElement} button - Account option button
 */
function subtest_testStateData(state, button) {
  Assert.equal(
    button.value,
    state.account.incomingServer.username,
    "Button value should be the account email"
  );
  Assert.equal(
    button.querySelector("span.account-title").textContent,
    state.account.defaultIdentity.fullName,
    "Button title text should be the account full name"
  );
  Assert.equal(
    button.querySelector("span.account-data").textContent,
    state.account.incomingServer.username,
    "Button data text should be the account email"
  );

  const counter = button.querySelector(".account-address-book-count");
  Assert.equal(
    abAccountsSubview.l10n.getAttributes(counter).args.synced,
    state.existingAddressBookCount,
    "Synced address books count update"
  );
  Assert.equal(
    abAccountsSubview.l10n.getAttributes(counter).args.available,
    state.addressBooks.length - state.existingAddressBookCount,
    "Available address books count should update"
  );
  Assert.equal(
    abAccountsSubview.l10n.getAttributes(counter).args.total,
    state.addressBooks.length,
    "Total address books count should update"
  );
}
