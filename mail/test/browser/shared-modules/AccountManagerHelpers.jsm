/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "openAccountSetup",
  "openAccountSettings",
  "open_advanced_settings",
  "click_account_tree_row",
  "get_account_tree_row",
  "remove_account",
  "wait_for_account_tree_load",
];

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var fdh = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var wh = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var {
  content_tab_e,
  open_content_tab_with_url,
  wait_for_content_tab_load,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);

var mc = fdh.mc;

/**
 * Waits until the Account Manager tree fully loads after first open.
 */
function wait_for_account_tree_load(tab) {
  mc.waitFor(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for currentAccount to become non-null"
  );
}

async function openAccountSettings() {
  return new Promise(resolve => {
    let tab = open_content_tab_with_url("about:accountsettings");
    wait_for_account_tree_load(tab);
    resolve(tab);
  });
}

/**
 * Opens the Account Manager.
 * @callback tabCallback
 *
 * @param {tabCallback} callback - The callback for the account manager tab that is opened.
 */
async function open_advanced_settings(callback) {
  let tab = open_content_tab_with_url("about:accountsettings");
  wait_for_account_tree_load(tab);
  await callback(tab);
  mc.tabmail.closeTab(tab);
}

async function openAccountSetup() {
  return new Promise(resolve => {
    let tab = open_content_tab_with_url("about:accountsetup");
    wait_for_content_tab_load(tab, "about:accountsetup", 10000);
    resolve(tab);
  });
}

/**
 * Click a row in the account settings tree.
 *
 * @param {Object} tab - The account manager tab controller that opened.
 * @param {Number} rowIndex - The row to click.
 */
function click_account_tree_row(tab, rowIndex) {
  utils.waitFor(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for currentAccount to become non-null"
  );

  let tree = content_tab_e(tab, "accounttree");

  fdh.click_tree_row(tree, rowIndex, mc);

  utils.waitFor(
    () => tab.browser.contentWindow.pendingAccount == null,
    "Timeout waiting for pendingAccount to become null"
  );

  // Ensure the page is fully loaded (e.g. onInit functions).
  wh.wait_for_frame_load(
    content_tab_e(tab, "contentFrame"),
    tab.browser.contentWindow.pageURL(
      tree.view.getItemAtIndex(rowIndex).getAttribute("PageTag")
    )
  );
}

/**
 * Returns the index of the row in account tree corresponding to the wanted
 * account and its settings pane.
 *
 * @param {Number} accountKey - The key of the account to return.
 *                              If 'null', the SMTP pane is returned.
 * @param {Number} paneId - The ID of the account settings pane to select.
 *
 *
 * @returns {Number} The row index of the account and pane. If it was not found return -1.
 *                   Do not throw as callers may intentionally just check if a row exists.
 *                   Just dump into the log so that a subsequent throw in
 *                   click_account_tree_row has a useful context.
 */
function get_account_tree_row(accountKey, paneId, tab) {
  let rowIndex = 0;
  let accountTreeNode = content_tab_e(tab, "account-tree-children");

  for (let i = 0; i < accountTreeNode.children.length; i++) {
    if ("_account" in accountTreeNode.children[i]) {
      let accountHead = accountTreeNode.children[i];
      if (accountKey == accountHead._account.key) {
        // If this is the wanted account, find the wanted settings pane.
        let accountBlock = accountHead.querySelectorAll("[PageTag]");
        // A null paneId means the main pane.
        if (!paneId) {
          return rowIndex;
        }

        // Otherwise find the pane in the children.
        for (let j = 0; j < accountBlock.length; j++) {
          if (accountBlock[j].getAttribute("PageTag") == paneId) {
            return rowIndex + j + 1;
          }
        }

        // The pane was not found.
        dump(
          "The treerow for pane " +
            paneId +
            " of account " +
            accountKey +
            " was not found!\n"
        );
        return -1;
      }
      // If this is not the wanted account, skip all of its settings panes.
      rowIndex += accountHead.querySelectorAll("[PageTag]").length;
    } else if (accountKey == null) {
      // A row without _account should be the SMTP server.
      return rowIndex;
    }
    rowIndex++;
  }

  // The account was not found.
  dump("The treerow for account " + accountKey + " was not found!\n");
  return -1;
}

/**
 * Remove an account via the account manager UI.
 *
 * @param {Object} account - The account to remove.
 * @param {Object} tab - The account manager tab that opened.
 * @param {boolean} removeAccount - Remove the account itself.
 * @param {boolean} removeData - Remove the message data of the account.
 */
function remove_account(
  account,
  tab,
  removeAccount = true,
  removeData = false
) {
  let accountRow = get_account_tree_row(account.key, "am-server.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  account = null;
  // Use the Remove item in the Account actions menu.
  mc.click(content_tab_e(tab, "accountActionsButton"));
  mc.click(content_tab_e(tab, "accountActionsDropdownRemove"));

  let cdc = wh.wait_for_frame_load(
    tab.browser.contentWindow.gSubDialog._topDialog._frame,
    "chrome://messenger/content/removeAccount.xhtml"
  );

  // Account removal confirmation dialog. Select what to remove.
  if (removeAccount) {
    cdc.click(cdc.window.document.getElementById("removeAccount"));
  }
  if (removeData) {
    cdc.click(cdc.window.document.getElementById("removeData"));
  }

  cdc.window.document.documentElement.querySelector("dialog").acceptDialog();
  cdc.waitFor(
    () =>
      !cdc.window.document.querySelector("dialog").getButton("accept").disabled,
    "Timeout waiting for finish of account removal",
    5000,
    100
  );
  cdc.window.document.documentElement.querySelector("dialog").acceptDialog();
}
