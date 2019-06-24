/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper operation of the account tree in the Account manager.
 */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-pref-window-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-account-tree";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
  "content-tab-helpers",
  "pref-window-helpers",
];

var gPopAccount, gOriginalAccountCount;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

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
  assert_equals(MailServices.accounts.allServers.length, gOriginalAccountCount + 1);
}

function teardownModule(module) {
  // Remove our test account to leave the profile clean.
  MailServices.accounts.removeAccount(gPopAccount);
  // There should be only the original accounts left.
  assert_equals(MailServices.accounts.allServers.length, gOriginalAccountCount);
}

/**
 * Test for bug 536248.
 * Check if the account manager dialog remembers the open state of accounts.
 */
function test_account_open_state() {
  subtest_check_account_open_state(true);

  subtest_check_account_open_state(false);
  // After this test all the accounts must be "open".
}

/**
 * Check if the open state of accounts is in the wished state.
 *
 * @param aWishedState  The open state in which the account row should be found (bool).
 */
function subtest_check_account_open_state(aWishedState) {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  // See if the account row is in the wished open state.
  let accountTree = content_tab_e(tab, "accounttree");
  assert_equals(accountRow, accountTree.view.selection.currentIndex);
  assert_equals(accountTree.view.isContainerOpen(accountRow), aWishedState);

  accountTree.view.toggleOpenState(accountRow);
  assert_equals(accountTree.view.isContainerOpen(accountRow), !aWishedState);

  // Whatever the open state of the account was, selecting one of its subpanes
  // must open it.
  tab.browser.contentWindow.selectServer(gPopAccount.incomingServer, "am-junk.xul");
  wait_for_account_tree_selection(tab);
  assert_true(accountTree.view.isContainerOpen(accountRow));

  // Set the proper state again for continuation of the test.
  accountTree.view.getItemAtIndex(accountRow).setAttribute("open", !aWishedState);
  assert_equals(accountTree.view.isContainerOpen(accountRow), !aWishedState);
  close_advanced_settings(tab);
}

/**
 * Bug 740617.
 * Check if the default account is styled in bold and another account is not.
 */
function test_default_account_highlight() {
  let tab = open_advanced_settings();
  // Select the default account.
  let accountRow = get_account_tree_row(MailServices.accounts.defaultAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  let accountTree = content_tab_e(tab, "accounttree");
  assert_equals(accountRow, accountTree.view.selection.currentIndex);
  let cell = accountTree.view.getItemAtIndex(accountRow).firstChild.firstChild;
  assert_equals(cell.tagName, "treecell");

  // We can't read the computed style of the tree cell directly, so at least see
  // if the isDefaultServer-true property is set on it. Hopefully the proper style
  // is attached to this property.
  let propArray = accountTree.view
    .getCellProperties(accountRow, accountTree.columns.getColumnAt(0)).split(" ");
  assert_true(propArray.includes("isDefaultServer-true"));

  // Now select another account that is not default.
  accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  // There should isDefaultServer-true on its tree cell.
  propArray = accountTree.view
    .getCellProperties(accountRow, accountTree.columns.getColumnAt(0)).split(" ");
  assert_false(propArray.includes("isDefaultServer-true"));
  close_advanced_settings(tab);
}

/**
 * Bug 58713.
 * Check if after deleting an account the next one is selected.
 *
 * This test should always be the last one as it removes our specially
 * created gPopAccount.
 */
function test_selection_after_account_deletion() {
  let tab = open_advanced_settings();
  let accountList = [];
  let accountTreeNode = content_tab_e(tab, "account-tree-children");
  // Build the list of accounts in the account tree (order is important).
  for (let i = 0; i < accountTreeNode.childNodes.length; i++) {
    if ("_account" in accountTreeNode.childNodes[i]) {
      let curAccount = accountTreeNode.childNodes[i]._account;
      if (!accountList.includes(curAccount))
        accountList.push(curAccount);
    }
  }

  // Get position of the current account in the account list.
  let accountIndex = accountList.indexOf(gPopAccount);

  // Remove our account.
  remove_account(gPopAccount, tab);
  // Now there should be only the original accounts left.
  assert_equals(MailServices.accounts.allServers.length, gOriginalAccountCount);

  // See if the currently selected account is the one next in the account list.
  let accountTree = content_tab_e(tab, "accounttree");
  let accountRow = accountTree.view.selection.currentIndex;
  wait_for_account_tree_selection(tab, accountRow);
  assert_equals(accountTree.view.getItemAtIndex(accountRow)._account,
                accountList[accountIndex + 1]);

  close_advanced_settings(tab);
}
