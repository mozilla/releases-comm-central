/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );
var { close_popup } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { content_tab_e } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);

var imapAccount, nntpAccount, originalAccountCount;

add_setup(function () {
  // There may be pre-existing accounts from other tests.
  originalAccountCount = MailServices.accounts.allServers.length;
  // There already should be a Local Folders account created.
  // It is needed for this test.
  Assert.ok(MailServices.accounts.localFoldersServer);

  // Create an IMAP server
  const imapServer = MailServices.accounts
    .createIncomingServer("nobody", "example.com", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@example.com";

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.incomingServer = imapServer;
  imapAccount.addIdentity(identity);

  // Create a NNTP server
  const nntpServer = MailServices.accounts
    .createIncomingServer(null, "example.nntp.invalid", "nntp")
    .QueryInterface(Ci.nsINntpIncomingServer);

  identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox2@example.com";

  nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = nntpServer;
  nntpAccount.addIdentity(identity);
  // Now there should be 2 more accounts.
  Assert.equal(
    MailServices.accounts.allServers.length,
    originalAccountCount + 2
  );
});

registerCleanupFunction(function () {
  // Remove our test accounts to leave the profile clean.
  MailServices.accounts.removeAccount(nntpAccount);
  MailServices.accounts.removeAccount(imapAccount);
  // There should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, originalAccountCount);
});

/**
 * Check that the account actions for the account are enabled or disabled appropriately.
 *
 * @param {object} tab - The account manager tab.
 * @param {number} accountKey - The key of the account to select.
 * @param {boolean} isSetAsDefaultEnabled - True if the menuitem should be enabled, false otherwise.
 *                                           "none" if the button doesn't exist.
 * @param {boolean} isAddAccountEnabled - True if the menuitems (Add Mail Account+Add Other Account)
 *                                         should be enabled, false otherwise.
 */
async function subtest_check_account_actions(
  tab,
  accountKey,
  isSetAsDefaultEnabled,
  isAddAccountEnabled
) {
  const accountRow = get_account_tree_row(accountKey, null, tab);
  await click_account_tree_row(tab, accountRow);

  // click the New Account Button to bring up the popup with menuitems to test
  const button = content_tab_e(tab, "accountTreeCreateAccount");
  EventUtils.synthesizeMouseAtCenter(
    button,
    { clickCount: 1 },
    button.ownerGlobal
  );
  await BrowserTestUtils.waitForPopupEvent(
    content_tab_e(tab, "accountAddPopup"),
    "shown"
  );

  const actionAddMailAccount = content_tab_e(
    tab,
    "accountActionsAddMailAccount"
  );
  Assert.notEqual(actionAddMailAccount, undefined);
  Assert.equal(
    !actionAddMailAccount.getAttribute("disabled"),
    isAddAccountEnabled
  );

  const actionAddOtherAccount = content_tab_e(
    tab,
    "accountActionsAddOtherAccount"
  );
  Assert.notEqual(actionAddOtherAccount, undefined);
  Assert.equal(
    !actionAddOtherAccount.getAttribute("disabled"),
    isAddAccountEnabled
  );
  await close_popup(window, content_tab_e(tab, "accountAddPopup"));

  if (isSetAsDefaultEnabled == "none") {
    // The button doesn't exist.
    return;
  }

  const actionSetDefault = content_tab_e(
    tab,
    "contentFrame"
  ).contentDocument.getElementById("defaultAccount");
  Assert.notEqual(actionSetDefault, undefined);
  Assert.equal(
    !actionSetDefault.getAttribute("disabled"),
    isSetAsDefaultEnabled
  );
}

add_task(async function test_account_actions() {
  // IMAP account: can be default.
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_actions(tab, imapAccount.key, true, true);
  });

  // NNTP (News) account: can't be default.
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_actions(tab, nntpAccount.key, false, true);
  });

  // Local Folders account: can't be default.
  var localFoldersAccount = MailServices.accounts.findAccountForServer(
    MailServices.accounts.localFoldersServer
  );
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_actions(
      tab,
      localFoldersAccount.key,
      "none",
      true
    );
  });
  // SMTP server row: can't be default.
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_actions(tab, "smtp", "none", true);
  });

  // on the IMAP account, disable Delete Account menu item
  let disableItemPref = "mail.disable_button.delete_account";

  // Set the pref on the default branch, otherwise .getBoolPref on it throws.
  Services.prefs.getDefaultBranch("").setBoolPref(disableItemPref, true);
  Services.prefs.lockPref(disableItemPref);

  await open_advanced_settings(async function (tab) {
    await subtest_check_account_actions(tab, imapAccount.key, true, true);
  });

  Services.prefs.unlockPref(disableItemPref);
  Services.prefs.getDefaultBranch("").deleteBranch(disableItemPref);

  // on the IMAP account, disable Set as Default menu item
  disableItemPref = "mail.disable_button.set_default_account";

  Services.prefs.getDefaultBranch("").setBoolPref(disableItemPref, true);
  Services.prefs.lockPref(disableItemPref);

  await open_advanced_settings(async function (tab) {
    await subtest_check_account_actions(tab, imapAccount.key, false, true);
  });

  Services.prefs.unlockPref(disableItemPref);
  Services.prefs.getDefaultBranch("").deleteBranch(disableItemPref);

  // on the IMAP account, disable Add new Account menu items
  disableItemPref = "mail.disable_new_account_addition";

  Services.prefs.getDefaultBranch("").setBoolPref(disableItemPref, true);
  Services.prefs.lockPref(disableItemPref);

  await open_advanced_settings(async function (tab) {
    await subtest_check_account_actions(tab, imapAccount.key, true, false);
  });

  Services.prefs.unlockPref(disableItemPref);
  Services.prefs.getDefaultBranch("").deleteBranch(disableItemPref);
});
