/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper operation of the account settings panes
 * when certain special or invalid values are entered into the fields.
 */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-keyboard-helpers.js */
/* import-globals-from ../shared-modules/test-pref-window-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-account-values";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
  "keyboard-helpers",
  "content-tab-helpers",
  "pref-window-helpers",
];

var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

var gPopAccount, gOriginalAccountCount;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server
  let popServer = MailServices.accounts
    .createIncomingServer("nobody", "example.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@example.invalid";

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
 * Bug 208628.
 * Check that if the CC field is empty, enabling CC will automatically
 * prefill the currently default email address.
 */
function test_default_CC_address() {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(gPopAccount.key, "am-copies.xul", tab);
  click_account_tree_row(tab, accountRow);

  let iframe = content_tab_e(tab, "contentFrame");

  let defaultAddress = iframe.contentDocument.getElementById("identity.email").value;
  let ccCheck = iframe.contentDocument.getElementById("identity.doCc");
  let ccAddress = iframe.contentDocument.getElementById("identity.doCcList");
  // The CC checkbox is not enabled and the address value is empty.
  assert_false(ccCheck.checked);
  assert_equals(ccAddress.value, "");
  // After ticking the CC checkbox the default address should be prefilled.
  mc.check(new elib.Elem(ccCheck), true);
  assert_equals(ccAddress.value, defaultAddress);

  let bccCheck = iframe.contentDocument.getElementById("identity.doBcc");
  let bccAddress = iframe.contentDocument.getElementById("identity.doBccList");
  // The BCC checkbox is not enabled but we set the address value to something.
  assert_false(bccCheck.checked);
  assert_equals(bccAddress.value, "");
  let bccUserAddress = "somebody@else.invalid";
  bccAddress.value = bccUserAddress;
  // After ticking the BCC checkbox the current value of the address should not change.
  mc.check(new elib.Elem(bccCheck), true);
  assert_equals(bccAddress.value, bccUserAddress);
  close_advanced_settings(tab);
}

/**
 * Bug 720199.
 * Check if the account name automatically changes when the user changes
 * the username or hostname.
 */
function test_account_name() {
  // We already have a POP account ready.
  // Create also a NNTP server.
  let nntpServer = MailServices.accounts
    .createIncomingServer(null, "example.nntp.invalid", "nntp")
    .QueryInterface(Ci.nsINntpIncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox2@example.invalid";

  let nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = nntpServer;
  nntpAccount.addIdentity(identity);

  assert_equals(gPopAccount.incomingServer.prettyName, "nobody on example.invalid");
  assert_equals(nntpAccount.incomingServer.prettyName, "example.nntp.invalid");

  // The automatic account name update works only if the name is
  // in the form of user@host.
  gPopAccount.incomingServer.prettyName = "nobody@example.invalid";

  let newHost = "some.host.invalid";
  let newUser = "somebody";

  // On NNTP there is no user name so just set new hostname.
  subtest_check_account_name(nntpAccount, newHost, null);

  // And see if the account name is updated to it.
  assert_equals(nntpAccount.incomingServer.prettyName, newHost);

  // On POP3 there is both user name and host name.
  // Set new host name first.
  subtest_check_account_name(gPopAccount, newHost, null);

  // And see if in the account name the host part is updated to it.
  assert_equals(gPopAccount.incomingServer.prettyName, "nobody@" + newHost);

  // Set new host name first.
  subtest_check_account_name(gPopAccount, null, newUser);

  // And see if in the account name the user part is updated.
  assert_equals(gPopAccount.incomingServer.prettyName, newUser + "@" + newHost);

  newHost = "another.host.invalid";
  newUser = "anotherbody";

  // Set user name and host name at once.
  subtest_check_account_name(gPopAccount, newHost, newUser);

  // And see if in the account name the host part is updated to it.
  assert_equals(gPopAccount.incomingServer.prettyName, newUser + "@" + newHost);

  // Now have an account name where the name does not match the hostname.
  gPopAccount.incomingServer.prettyName = newUser + "@example.invalid";

  newHost = "third.host.invalid";
  // Set the host name again.
  subtest_check_account_name(gPopAccount, newHost, null);

  // And the account name should not be touched.
  assert_equals(gPopAccount.incomingServer.prettyName, newUser + "@example.invalid");

  MailServices.accounts.removeAccount(nntpAccount);
}

/**
 * Changes the user name and hostname to the supplied values.
 *
 * @param aAccount      the account to change
 * @param aNewHostname  the hostname value to set
 * @param aNewUsername  the username value to set
 */
function subtest_check_account_name(aAccount, aNewHostname, aNewUsername) {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(aAccount.key, "am-server.xul", tab);
  click_account_tree_row(tab, accountRow);

  let iframe = content_tab_e(tab, "contentFrame");

  if (aNewHostname) {
    let hostname = iframe.contentDocument.getElementById("server.realHostName");
    assert_equals(hostname.value, aAccount.incomingServer.realHostName);

    // Now change the server host name.
    hostname.value = aNewHostname;
  }

  if (aNewUsername) {
    let username = iframe.contentDocument.getElementById("server.realUsername");
    assert_equals(username.value, aAccount.incomingServer.realUsername);

    // Now change the server user name.
    username.value = aNewUsername;
  }

  if (aNewUsername) {
    // If username has changed, we get a confirmation dialog.
    plan_for_modal_dialog("commonDialog", function(cdc) {
      // Just dismiss it.
      cdc.window.document.documentElement.acceptDialog();
    });
  }
  // We really need to save the new values.
  close_advanced_settings(tab);

  if (aNewUsername)
    wait_for_modal_dialog("commonDialog");
}

/**
 * Bug 536768.
 * Check if invalid junk target settings (folders) are fixed to sane values.
 */
function test_invalid_junk_target() {
  // Set the junk target prefs to invalid values.
  let branch = Services.prefs.getBranch("mail.server." + gPopAccount.incomingServer.key + ".");
  branch.setCharPref("spamActionTargetAccount", "some random non-existent URI");
  branch.setCharPref("spamActionTargetFolder", "some random non-existent URI");
  let moveOnSpam = true;
  branch.setBoolPref("moveOnSpam", moveOnSpam);
  subtest_check_invalid_junk_target();

  // The pref has no default so its non-existence means it was cleared.
  moveOnSpam = branch.getBoolPref("moveOnSpam", false);
  assert_false(moveOnSpam);
  // The targets should point to the same pop account now.
  let targetAccount = branch.getCharPref("spamActionTargetAccount");
  assert_equals(targetAccount, gPopAccount.incomingServer.serverURI);
  let targetFolder = branch.getCharPref("spamActionTargetFolder");
  assert_equals(targetFolder, gPopAccount.incomingServer.serverURI + "/Junk");
}

/**
 * Just show the Junk settings pane and let it fix the values.
 */
function subtest_check_invalid_junk_target() {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xul", tab);
  click_account_tree_row(tab, accountRow);

  // We need to save the new fixed values.
  close_advanced_settings(tab);
}

/**
 * Bug 327812.
 * Checks if invalid server hostnames are not accepted.
 */
test_invalid_hostname.__force_skip__ = true; // disabled temporarily, bug 1096006
function test_invalid_hostname() {
  let branch = Services.prefs.getBranch("mail.server." + gPopAccount.incomingServer.key + ".");
  let origHostname = branch.getCharPref("realhostname");

  subtest_check_invalid_hostname(false, origHostname);
  subtest_check_invalid_hostname(true, origHostname);

  // The new bad hostname should not have been saved.
  let newHostname = branch.getCharPref("realhostname");
  assert_equals(origHostname, newHostname);
}

/**
 * Set the hostname to an invalid value and check if it gets fixed.
 *
 * @param aExitSettings      Attempt to close the Account settings dialog.
 * @param aOriginalHostname  Original hostname of this server.
 */
function subtest_check_invalid_hostname(aExitSettings, aOriginalHostname) {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(gPopAccount.key, "am-server.xul", tab);
  click_account_tree_row(tab, accountRow);

  let iframe = content_tab_e(tab, "contentFrame");
  let hostname = iframe.contentDocument.getElementById("server.realHostName");
  assert_equals(hostname.value, aOriginalHostname);

  delete_all_existing(mc, new elib.Elem(hostname));
  input_value(mc, "some_invalid+host&domain*in>invalid", new elib.Elem(hostname));

  // As the hostname is bad, we should get a warning dialog.
  plan_for_modal_dialog("commonDialog", function(cdc) {
    // Just dismiss it.
    cdc.window.document.documentElement.acceptDialog();
  });

  if (!aExitSettings) {
    let newAccountRow = get_account_tree_row(gPopAccount.key, "am-junk.xul", tab);
    click_account_tree_row(tab, newAccountRow, false);
    wait_for_modal_dialog("commonDialog");
    // The load of am-junk was prevented and we are back on the same pane.
    mc.waitFor(() => tab.browser.contentWindow.pendingAccount == null,
               "Timeout waiting for pendingAccount to become null");

    let tree = content_tab_e(tab, "accounttree");
    wait_for_frame_load(content_tab_e(tab, "contentFrame"),
      tab.browser.contentWindow.pageURL(tree.view.getItemAtIndex(accountRow)
                               .getAttribute("PageTag")));
    assert_equals(tab.browser.contentWindow.currentPageId, "am-server.xul");
    iframe = content_tab_e(tab, "contentFrame");
    // Revert the changes to be able to close AM without warning.
    hostname = iframe.contentDocument.getElementById("server.realHostName");
    delete_all_existing(mc, new elib.Elem(hostname));
    input_value(mc, aOriginalHostname, new elib.Elem(hostname));
    close_advanced_settings(tab);
  } else {
    // Close the tab to save the changes.
    // The bad hostname should be automatically reverted.
    close_advanced_settings(tab);
    wait_for_modal_dialog("commonDialog");
  }
}

/**
 * Bug 1426328.
 * Check that the AM will trim user added spaces around text values.
 */
const badName = "trailing  space ";
const badEmail = " leading_space@example.com";

function test_trailing_spaces() {
  subtest_check_trailing_spaces();
  assert_equals(gPopAccount.incomingServer.prettyName, badName.trim());
  assert_equals(gPopAccount.defaultIdentity.email, badEmail.trim());
}

/**
 * Check that the AM will trim user added spaces around text values
 * when storing them into the account.
 */
function subtest_check_trailing_spaces() {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  let iframe = content_tab_e(tab, "contentFrame");

  let accountName = iframe.contentDocument.getElementById("server.prettyName");
  let defaultAddress = iframe.contentDocument.getElementById("identity.email");
  delete_all_existing(mc, new elib.Elem(accountName));
  delete_all_existing(mc, new elib.Elem(defaultAddress));
  input_value(mc, badName, new elib.Elem(accountName));
  input_value(mc, badEmail, new elib.Elem(defaultAddress));

  assert_equals(accountName.value, badName);
  assert_equals(defaultAddress.value, badEmail);

  // We really need to save the new values.
  close_advanced_settings(tab);
}
