/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var MODULE_NAME = "account-manager-helpers";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers",
                       "pref-window-helpers", "content-tab-helpers"];

var utils = ChromeUtils.import("chrome://mozmill/content/modules/utils.jsm");
var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

var wh, fdh, pwh, cth, mc;

function setupModule() {
  fdh = collector.getModule("folder-display-helpers");
  mc = fdh.mc;
  wh = collector.getModule("window-helpers");
  pwh = collector.getModule("pref-window-helpers");
  cth = collector.getModule("content-tab-helpers");
}

function installInto(module) {
  setupModule();

  // Now copy helper functions
  module.open_advanced_settings = open_advanced_settings;
  module.open_advanced_settings_from_account_wizard =
    open_advanced_settings_from_account_wizard;
  module.close_advanced_settings = close_advanced_settings;
  module.open_mail_account_setup_wizard = open_mail_account_setup_wizard;
  module.click_account_tree_row = click_account_tree_row;
  module.get_account_tree_row = get_account_tree_row;
  module.wait_for_account_tree_load = wait_for_account_tree_load;
  module.wait_for_account_tree_selection = wait_for_account_tree_selection;
  module.remove_account = remove_account;
}

/**
 * Waits until the Account Manager tree fully loads after first open.
 */
function wait_for_account_tree_load(tab) {
  mc.waitFor(() => tab.browser.contentWindow.currentAccount != null,
              "Timeout waiting for currentAccount to become non-null");
  var tree = cth.content_tab_e(tab, "account-tree-children");
  mc.waitFor(() => tree.hasAttribute("tree-loaded"),
              "Timeout waiting for account tree build");
}

/**
 * Ensure the page is fully loaded (e.g. onInit functions).
 */
function wait_for_account_tree_selection(tab, index = -1) {
  utils.waitFor(() => tab.browser.contentWindow.pendingAccount == null,
                "Timeout waiting for pendingAccount to become null");

  var tree = cth.content_tab_e(tab, "accounttree");
  if (index < 0)
    index = tree.view.selection.currentIndex;
  wh.wait_for_frame_load(cth.content_tab_e(tab, "contentFrame"),
    tab.browser.contentWindow.pageURL(tree.view.getItemAtIndex(index)
                             .getAttribute("PageTag")));
}

/**
 * Opens the Account Manager pane in pre Preferences tab.
 */
function open_advanced_settings() {
  var tab = pwh.open_pref_tab("paneAccount");
  wait_for_account_tree_load(tab);
  return tab;
}

/**
 * Opens the Account Manager from the mail account setup wizard.
 *
 * @param aController Controller of the Account Wizard window.
 */
function open_advanced_settings_from_account_wizard(aController) {
  aController.e("manual-edit_button").click();
  aController.e("advanced-setup_button").click();
  var tabmail = mc.e("tabmail");
  tabmail.selectTabByMode("preferencesTab");
  var tab;
  mc.waitFor(
    () => (tab = tabmail.getTabInfoForCurrentOrFirstModeInstance(
           tabmail.tabModes.preferencesTab)) != null,
             "Couldn't find the Preferences tab with the Account manager");
  wait_for_account_tree_load(tab);
  return tab;
}

function close_advanced_settings(tab) {
  pwh.close_pref_tab(tab);
}

/**
 * Use File > New > Mail Account to open the Mail Account Setup Wizard.
 *
 * @param aCallback  Function to run once the dialog is open. The function
 *                   gets the new window controller passed as first argument.
 */
function open_mail_account_setup_wizard(aCallback) {
  wh.plan_for_modal_dialog("mail:autoconfig", aCallback);
  mc.click(new elib.Elem(mc.menus.menu_File.menu_New.newMailAccountMenuItem));
  return wh.wait_for_modal_dialog("mail:autoconfig", 30000);
}

/**
 * Click a row in the account settings tree
 *
 * @param tab       the account settings tab
 * @param rowIndex  the row to click
 * @param wait      whether to wait for finishing the load
 */
function click_account_tree_row(tab, rowIndex, wait = true) {
  utils.waitFor(() => tab.browser.contentWindow.getCurrentAccount() != null,
                "Timeout waiting for currentAccount to become non-null");

  let tree = cth.content_tab_e(tab, "accounttree");

  fdh.click_tree_row(tree, rowIndex, mc);

  if (!wait)
    return;

  wait_for_account_tree_selection(tab, rowIndex);
}

/**
 * Returns the index of the row in account tree corresponding to the wanted
 * account and its settings pane.
 *
 * @param aAccountKey  The key of the account to return.
 *                     If 'null', the SMTP pane is returned.
 * @param aPaneId      The ID of the account settings pane to select.
 * @param tab          the account settings tab
 *
 * @return  The row index of the account and pane. If it was not found return -1.
 *          Do not throw as callers may intentionally just check if a row exists.
 *          Just dump into the log so that a subsequent throw in
 *          click_account_tree_row has a useful context.
 */
function get_account_tree_row(aAccountKey, aPaneId, tab) {
  let rowIndex = 0;
  let accountTreeNode = cth.content_tab_e(tab, "account-tree-children");

  for (let i = 0; i < accountTreeNode.childNodes.length; i++) {
    if ("_account" in accountTreeNode.childNodes[i]) {
      let accountHead = accountTreeNode.childNodes[i];
      if (aAccountKey == accountHead._account.key) {
        // If this is the wanted account, find the wanted settings pane.
        let accountBlock = accountHead.querySelectorAll("[PageTag]");
        // A null aPaneId means the main pane.
        if (!aPaneId)
          return rowIndex;

        // Otherwise find the pane in the children.
        for (let j = 0; j < accountBlock.length; j++) {
          if (accountBlock[j].getAttribute("PageTag") == aPaneId)
            return rowIndex + j + 1;
        }

        // The pane was not found.
        dump("The treerow for pane " + aPaneId + " of account " + aAccountKey + " was not found!\n");
        return -1;
      }
      // If this is not the wanted account, skip all of its settings panes.
      rowIndex += accountHead.querySelectorAll("[PageTag]").length;
    } else if (aAccountKey == null) {
      // A row without _account should be the SMTP server.
      return rowIndex;
    }
    rowIndex++;
  }

  // The account was not found.
  dump("The treerow for account " + aAccountKey + " was not found!\n");
  return -1;
}

/**
 * Remove an account via the account manager UI.
 *
 * @param aAccount        The account to remove.
 * @param tab             The account settings tab.
 * @param aRemoveAccount  Remove the account itself.
 * @param aRemoveData     Remove the message data of the account.
 */
function remove_account(aAccount, tab, aRemoveAccount = true, aRemoveData = false) {
  let accountRow = get_account_tree_row(aAccount.key, "am-server.xul", tab);
  click_account_tree_row(tab, accountRow);

  wh.plan_for_modal_dialog("removeAccountDialog", function(cdc) {
    // Account removal confirmation dialog. Select what to remove.
    if (aRemoveAccount)
      cdc.click(new elib.Elem(cdc.window.document.getElementById("removeAccount")));
    if (aRemoveData)
      cdc.click(new elib.Elem(cdc.window.document.getElementById("removeData")));

    cdc.window.document.documentElement.acceptDialog();
    cdc.waitFor(() => !cdc.window.document.documentElement.getButton("accept").disabled,
                "Timeout waiting for finish of account removal",
                5000, 100);
    cdc.window.document.documentElement.acceptDialog();
  });

  let treeBuilt = false;
  cth.content_tab_e(tab, "account-tree-children")
     .addEventListener("account-tree-built", () => { treeBuilt = true; },
                       {once: true});

  aAccount = null;
  // Use the Remove item in the Account actions menu.
  mc.click(cth.content_tab_eid(tab, "accountActionsButton"));
  mc.click_menus_in_sequence(cth.content_tab_e(tab, "accountActionsDropdown"),
                                      [ {id: "accountActionsDropdownRemove"} ]);
  wh.wait_for_modal_dialog("removeAccountDialog");
  mc.waitFor(() => treeBuilt, "Timeout waiting for account tree rebuild");
  wait_for_account_tree_selection(tab);
}
