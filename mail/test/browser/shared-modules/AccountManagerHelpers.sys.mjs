/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  content_tab_e,
  open_content_tab_with_url,
  promise_content_tab_load,
} from "resource://testing-common/mail/ContentTabHelpers.sys.mjs";

import * as fdh from "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs";
import * as wh from "resource://testing-common/mail/WindowHelpers.sys.mjs";

import * as EventUtils from "resource://testing-common/mail/EventUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

var mc = fdh.mc;

/**
 * Waits until the Account Manager tree fully loads after first open.
 */
export async function promise_account_tree_load(tab) {
  await TestUtils.waitForCondition(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for currentAccount to become non-null"
  );
}

export async function openAccountSettings() {
  const tab = await open_content_tab_with_url("about:accountsettings");
  await promise_account_tree_load(tab);
  return tab;
}

/**
 * Opens the Account Manager.
 *
 * @callback tabCallback
 *
 * @param {tabCallback} callback - The callback for the account manager tab that is opened.
 */
export async function open_advanced_settings(callback) {
  const tab = await open_content_tab_with_url("about:accountsettings");
  await promise_account_tree_load(tab);
  await callback(tab);
  mc.document.getElementById("tabmail").closeTab(tab);
}

export async function openAccountSetup() {
  const tab = await open_content_tab_with_url("about:accountsetup");
  await promise_content_tab_load(tab, "about:accountsetup", 10000);
  return tab;
}

export async function openAccountProvisioner() {
  const tab = await open_content_tab_with_url("about:accountprovisioner");
  await promise_content_tab_load(tab, "about:accountprovisioner", 10000);
  return tab;
}

/**
 * Click a row in the account settings tree.
 *
 * @param {TabInfo} tab - The account manager tab that opened.
 * @param {number} rowIndex - The row to click.
 */
export async function click_account_tree_row(tab, rowIndex) {
  await TestUtils.waitForCondition(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for currentAccount to become non-null"
  );

  const tree = content_tab_e(tab, "accounttree");
  tree.selectedIndex = rowIndex;

  await TestUtils.waitForCondition(
    () => tab.browser.contentWindow.pendingAccount == null,
    "Timeout waiting for pendingAccount to become null"
  );

  // Ensure the page is fully loaded (e.g. onInit functions).
  await wh.wait_for_frame_load(
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
export function get_account_tree_row(accountKey, paneId, tab) {
  const accountTree = content_tab_e(tab, "accounttree");
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
export async function remove_account(
  account,
  tab,
  removeAccount = true,
  removeData = false
) {
  const accountRow = get_account_tree_row(account.key, null, tab);
  await click_account_tree_row(tab, accountRow);

  account = null;
  // Use the Remove item in the Account actions menu.
  const actionsButton = content_tab_e(tab, "accountActionsButton");
  EventUtils.synthesizeMouseAtCenter(
    actionsButton,
    { clickCount: 1 },
    actionsButton.ownerGlobal
  );
  const actionsDd = content_tab_e(tab, "accountActionsDropdown");
  await TestUtils.waitForCondition(
    () => actionsDd.state == "open" || actionsDd.state == "showing"
  );
  const remove = content_tab_e(tab, "accountActionsDropdownRemove");
  EventUtils.synthesizeMouseAtCenter(
    remove,
    { clickCount: 1 },
    remove.ownerGlobal
  );
  await TestUtils.waitForCondition(() => actionsDd.state == "closed");

  const cdc = await wh.wait_for_frame_load(
    tab.browser.contentWindow.gSubDialog._topDialog._frame,
    "chrome://messenger/content/removeAccount.xhtml"
  );

  // Account removal confirmation dialog. Select what to remove.
  if (removeAccount) {
    EventUtils.synthesizeMouseAtCenter(
      cdc.document.getElementById("removeAccount"),
      {},
      cdc.document.getElementById("removeAccount").ownerGlobal
    );
  }
  if (removeData) {
    EventUtils.synthesizeMouseAtCenter(
      cdc.document.getElementById("removeData"),
      {},
      cdc.document.getElementById("removeData").ownerGlobal
    );
  }

  cdc.document.documentElement.querySelector("dialog").acceptDialog();
  await TestUtils.waitForCondition(
    () => !cdc.document.querySelector("dialog").getButton("accept").disabled,
    "Timeout waiting for finish of account removal",
    5000,
    100
  );
  cdc.document.documentElement.querySelector("dialog").acceptDialog();
}
