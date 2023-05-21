/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "openAccountProvisioner",
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
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var { content_tab_e, open_content_tab_with_url, wait_for_content_tab_load } =
  ChromeUtils.import("resource://testing-common/mozmill/ContentTabHelpers.jsm");

var mc = fdh.mc;

/**
 * Waits until the Account Manager tree fully loads after first open.
 */
function wait_for_account_tree_load(tab) {
  utils.waitFor(
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
 *
 * @callback tabCallback
 *
 * @param {tabCallback} callback - The callback for the account manager tab that is opened.
 */
async function open_advanced_settings(callback) {
  let tab = open_content_tab_with_url("about:accountsettings");
  wait_for_account_tree_load(tab);
  await callback(tab);
  mc.window.document.getElementById("tabmail").closeTab(tab);
}

async function openAccountSetup() {
  return new Promise(resolve => {
    let tab = open_content_tab_with_url("about:accountsetup");
    wait_for_content_tab_load(tab, "about:accountsetup", 10000);
    resolve(tab);
  });
}

async function openAccountProvisioner() {
  return new Promise(resolve => {
    let tab = open_content_tab_with_url("about:accountprovisioner");
    wait_for_content_tab_load(tab, "about:accountprovisioner", 10000);
    resolve(tab);
  });
}

/**
 * Click a row in the account settings tree.
 *
 * @param {object} tab - The account manager tab controller that opened.
 * @param {number} rowIndex - The row to click.
 */
function click_account_tree_row(tab, rowIndex) {
  utils.waitFor(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for currentAccount to become non-null"
  );

  let tree = content_tab_e(tab, "accounttree");
  tree.selectedIndex = rowIndex;

  utils.waitFor(
    () => tab.browser.contentWindow.pendingAccount == null,
    "Timeout waiting for pendingAccount to become null"
  );

  // Ensure the page is fully loaded (e.g. onInit functions).
  wh.wait_for_frame_load(
    content_tab_e(tab, "contentFrame"),
    tab.browser.contentWindow.pageURL(
      tree.rows[rowIndex].getAttribute("PageTag")
    )
  );
}

/**
 * Returns the index of the row in account tree corresponding to the wanted
 * account and its settings pane.
 *
 * @param {number} accountKey - The key of the account to return.
 *                              If 'null', the SMTP pane is returned.
 * @param {number} paneId - The ID of the account settings pane to select.
 *
 *
 * @returns {number} The row index of the account and pane. If it was not found return -1.
 *                   Do not throw as callers may intentionally just check if a row exists.
 *                   Just dump into the log so that a subsequent throw in
 *                   click_account_tree_row has a useful context.
 */
function get_account_tree_row(accountKey, paneId, tab) {
  let accountTree = content_tab_e(tab, "accounttree");
  let row;
  if (accountKey && paneId) {
    row = accountTree.querySelector(`#${accountKey} [PageTag="${paneId}"]`);
  } else if (accountKey) {
    row = accountTree.querySelector(`#${accountKey}`);
  }
  return accountTree.rows.indexOf(row);
}

/**
 * Remove an account via the account manager UI.
 *
 * @param {object} account - The account to remove.
 * @param {object} tab - The account manager tab that opened.
 * @param {boolean} removeAccount - Remove the account itself.
 * @param {boolean} removeData - Remove the message data of the account.
 */
function remove_account(
  account,
  tab,
  removeAccount = true,
  removeData = false
) {
  let accountRow = get_account_tree_row(account.key, null, tab);
  click_account_tree_row(tab, accountRow);

  account = null;
  // Use the Remove item in the Account actions menu.
  let actionsButton = content_tab_e(tab, "accountActionsButton");
  EventUtils.synthesizeMouseAtCenter(
    actionsButton,
    { clickCount: 1 },
    actionsButton.ownerGlobal
  );
  let actionsDd = content_tab_e(tab, "accountActionsDropdown");
  utils.waitFor(
    () => actionsDd.state == "open" || actionsDd.state == "showing"
  );
  let remove = content_tab_e(tab, "accountActionsDropdownRemove");
  EventUtils.synthesizeMouseAtCenter(
    remove,
    { clickCount: 1 },
    remove.ownerGlobal
  );
  utils.waitFor(() => actionsDd.state == "closed");

  let cdc = wh.wait_for_frame_load(
    tab.browser.contentWindow.gSubDialog._topDialog._frame,
    "chrome://messenger/content/removeAccount.xhtml"
  );

  // Account removal confirmation dialog. Select what to remove.
  if (removeAccount) {
    EventUtils.synthesizeMouseAtCenter(
      cdc.window.document.getElementById("removeAccount"),
      {},
      cdc.window.document.getElementById("removeAccount").ownerGlobal
    );
  }
  if (removeData) {
    EventUtils.synthesizeMouseAtCenter(
      cdc.window.document.getElementById("removeData"),
      {},
      cdc.window.document.getElementById("removeData").ownerGlobal
    );
  }

  cdc.window.document.documentElement.querySelector("dialog").acceptDialog();
  utils.waitFor(
    () =>
      !cdc.window.document.querySelector("dialog").getButton("accept").disabled,
    "Timeout waiting for finish of account removal",
    5000,
    100
  );
  cdc.window.document.documentElement.querySelector("dialog").acceptDialog();
}
