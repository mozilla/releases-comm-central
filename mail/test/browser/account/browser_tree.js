/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper operation of the account tree in the Account manager.
 */

"use strict";

var {
  click_account_tree_row,
  get_account_tree_row,
  open_advanced_settings,
  remove_account,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var { content_tab_e } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);

var gPopAccount, gOriginalAccountCount;

add_task(function setupModule(module) {
  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server
  let popServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  let identity = MailServices.accounts.createIdentity();
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

registerCleanupFunction(function teardownModule(module) {
  if (gPopAccount) {
    // Remove our test account to leave the profile clean.
    MailServices.accounts.removeAccount(gPopAccount);
    gPopAccount = null;
  }
  // There should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, gOriginalAccountCount);
});

/**
 * Test for bug 536248.
 * Check if the account manager dialog remembers the open state of accounts.
 */
add_task(async function test_account_open_state() {
  await open_advanced_settings(function(tab) {
    subtest_check_account_open_state(tab, true);
  });
  await open_advanced_settings(function(tab) {
    subtest_check_account_open_state(tab, false);
  });
  // After this test all the accounts must be "open".
});

/**
 * Check if the open state of accounts is in the wished state.
 *
 * @param {Object} tab - The account manager tab.
 * @param {boolean} wishedState - The open state in which the account row should be found.
 */
function subtest_check_account_open_state(tab, wishedState) {
  let accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  // See if the account row is in the wished open state.
  let accountTree = content_tab_e(tab, "accounttree");
  Assert.equal(accountRow, accountTree.view.selection.currentIndex);
  Assert.equal(accountTree.view.isContainerOpen(accountRow), wishedState);

  accountTree.view.toggleOpenState(accountRow);
  Assert.equal(accountTree.view.isContainerOpen(accountRow), !wishedState);

  // Whatever the open state of the account was, selecting one of its subpanes
  // must open it.
  tab.browser.contentWindow.selectServer(
    gPopAccount.incomingServer,
    "am-junk.xhtml"
  );
  Assert.ok(accountTree.view.isContainerOpen(accountRow));

  // Set the proper state again for continuation of the test.
  accountTree.view
    .getItemAtIndex(accountRow)
    .setAttribute("open", !wishedState);
  Assert.equal(accountTree.view.isContainerOpen(accountRow), !wishedState);
}

/**
 * Bug 740617.
 * Check if the default account is styled in bold.
 */
add_task(async function test_default_account_highlight() {
  await open_advanced_settings(function(tab) {
    subtest_check_default_account_highlight(tab);
  });
});

/**
 * Check if the default account is styled in bold and another account is not.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_default_account_highlight(tab) {
  // Select the default account.
  let accountRow = get_account_tree_row(
    MailServices.accounts.defaultAccount.key,
    null,
    tab
  );
  click_account_tree_row(tab, accountRow);

  let accountTree = content_tab_e(tab, "accounttree");
  Assert.equal(accountRow, accountTree.view.selection.currentIndex);
  let cell = accountTree.view.getItemAtIndex(accountRow).firstElementChild
    .firstElementChild;
  Assert.equal(cell.tagName, "treecell");

  // We can't read the computed style of the tree cell directly, so at least see
  // if the isDefaultServer-true property is set on it. Hopefully the proper style
  // is attached to this property.
  let propArray = accountTree.view
    .getCellProperties(accountRow, accountTree.columns.getColumnAt(0))
    .split(" ");
  Assert.ok(propArray.includes("isDefaultServer-true"));

  // Now select another account that is not default.
  accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  // There should isDefaultServer-true on its tree cell.
  propArray = accountTree.view
    .getCellProperties(accountRow, accountTree.columns.getColumnAt(0))
    .split(" ");
  Assert.ok(!propArray.includes("isDefaultServer-true"));
}
/**
 * Bug 58713.
 * Check if after deleting an account the next one is selected.
 *
 * This test should always be the last one as it removes our specially
 * created gPopAccount.
 */
add_task(async function test_selection_after_account_deletion() {
  await open_advanced_settings(function(tab) {
    subtest_check_selection_after_account_deletion(tab);
  });
});

/**
 * Check if after deleting an account the next one is selected.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_selection_after_account_deletion(tab) {
  let accountList = [];
  let accountTreeNode = content_tab_e(tab, "account-tree-children");
  // Build the list of accounts in the account tree (order is important).
  for (let i = 0; i < accountTreeNode.children.length; i++) {
    if ("_account" in accountTreeNode.children[i]) {
      let curAccount = accountTreeNode.children[i]._account;
      if (!accountList.includes(curAccount)) {
        accountList.push(curAccount);
      }
    }
  }

  // Get position of the current account in the account list.
  let accountIndex = accountList.indexOf(gPopAccount);

  // Remove our account.
  remove_account(gPopAccount, tab);
  gPopAccount = null;
  // Now there should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, gOriginalAccountCount);

  // See if the currently selected account is the one next in the account list.
  let accountTree = content_tab_e(tab, "accounttree");
  let accountRow = accountTree.view.selection.currentIndex;
  Assert.equal(
    accountTree.view.getItemAtIndex(accountRow)._account,
    accountList[accountIndex + 1]
  );
}
