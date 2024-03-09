/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper operation of the account ordering functionality in the Account manager.
 */

"use strict";

var { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/AccountManagerHelpers.sys.mjs"
  );

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gPopAccount, gOriginalAccountCount;

add_setup(function () {
  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server
  const popServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  const identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@foo.invalid";

  gPopAccount = MailServices.accounts.createAccount();
  gPopAccount.incomingServer = popServer;
  gPopAccount.addIdentity(identity);

  // Now there should be one more account.
  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount + 1
  );
});

registerCleanupFunction(function () {
  if (gPopAccount) {
    // Remove our test account to leave the profile clean.
    MailServices.accounts.removeAccount(gPopAccount);
    gPopAccount = null;
  }
  // There should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, gOriginalAccountCount);
});

add_task(async function test_account_open_state() {
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_order(tab);
  });
});

/**
 * Check the order of the accounts.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_account_order(tab) {
  const accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  await click_account_tree_row(tab, accountRow);

  const prevAccountList = MailServices.accounts.accounts.map(
    account => account.key
  );

  // Moving the account up to reorder.
  EventUtils.synthesizeKey("VK_UP", { altKey: true });
  await new Promise(resolve => setTimeout(resolve));
  let curAccountList = MailServices.accounts.accounts.map(
    account => account.key
  );
  Assert.notEqual(curAccountList.join(), prevAccountList.join());

  // Moving the account down, back to the starting position.
  EventUtils.synthesizeKey("VK_DOWN", { altKey: true });
  await new Promise(resolve => setTimeout(resolve));
  curAccountList = MailServices.accounts.accounts.map(account => account.key);
  Assert.equal(curAccountList.join(), prevAccountList.join());
}
