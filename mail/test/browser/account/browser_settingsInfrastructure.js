/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper operation of the account settings panes infrastructure
 * in the Account manager. E.g. if the values of elements are properly stored when
 * panes are switched.
 *
 * New checks can be added to it as needed.
 */

"use strict";

var {
  click_account_tree_row,
  get_account_tree_row,
  open_advanced_settings,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { FAKE_SERVER_HOSTNAME } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var gPopAccount, gImapAccount, gOriginalAccountCount;

add_task(function setupModule(module) {
  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server
  let popServer = MailServices.accounts
    .createIncomingServer("nobody", "pop.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@pop.invalid";

  gPopAccount = MailServices.accounts.createAccount();
  gPopAccount.incomingServer = popServer;
  gPopAccount.addIdentity(identity);

  // Create an IMAP server
  let imapServer = MailServices.accounts
    .createIncomingServer("nobody", "imap.invalid", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);

  identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@imap.invalid";

  gImapAccount = MailServices.accounts.createAccount();
  gImapAccount.incomingServer = imapServer;
  gImapAccount.addIdentity(identity);

  // Now there should be one more account.
  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount + 2
  );
});

registerCleanupFunction(function teardownModule(module) {
  // Remove our test accounts to leave the profile clean.
  MailServices.accounts.removeAccount(gPopAccount);
  MailServices.accounts.removeAccount(gImapAccount);

  // There should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, gOriginalAccountCount);
});

/**
 * Bug 525024.
 * Check that the options in the server pane are properly preserved across
 * pane switches.
 */
add_task(async function test_account_dot_IDs() {
  await open_advanced_settings(function(tab) {
    subtest_check_account_dot_IDs(tab);
  });
});

/**
 * Check that the options in the server pane are stored even if the id
 * of the element contains multiple dots (not used in standard TB yet
 * but extensions may want it).
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_account_dot_IDs(tab) {
  let accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-server.xhtml",
    tab
  );
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;
  // Check whether a standard element with "server.loginAtStartUp" stores its
  // value properly.
  let loginCheck = iframe.getElementById("server.loginAtStartUp");
  Assert.ok(!loginCheck.checked);
  mc.check(loginCheck, true);

  accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  accountRow = get_account_tree_row(gPopAccount.key, "am-server.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  // Re-assign iframe.contentDocument because it was lost when changing panes
  // (uses loadURI to load a new document).
  iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // Check by element properties.
  loginCheck = iframe.getElementById("server.loginAtStartUp");
  Assert.ok(loginCheck.checked);

  // Check for correct value in the accountValues array, that will be saved into prefs.
  let rawCheckValue = tab.browser.contentWindow.getAccountValue(
    gPopAccount,
    tab.browser.contentWindow.getValueArrayFor(gPopAccount),
    "server",
    "loginAtStartUp",
    null,
    false
  );

  Assert.ok(rawCheckValue);

  // The "server.login.At.StartUp" value does not exist yet, so the value should be 'null'.
  rawCheckValue = tab.browser.contentWindow.getAccountValue(
    gPopAccount,
    tab.browser.contentWindow.getValueArrayFor(gPopAccount),
    "server",
    "login.At.StartUp",
    null,
    false
  );
  Assert.equal(rawCheckValue, null);

  // Change the ID so that "server.login.At.StartUp" exists now.
  loginCheck.id = "server.login.At.StartUp";

  accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  accountRow = get_account_tree_row(gPopAccount.key, "am-server.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  // Check for correct value in the accountValues array, that will be saved into prefs.
  // We can't check by element property here, because the am-server.xhtml pane was
  // reloaded and the element now has the original ID of "server.loginAtStartUp".
  rawCheckValue = tab.browser.contentWindow.getAccountValue(
    gPopAccount,
    tab.browser.contentWindow.getValueArrayFor(gPopAccount),
    "server",
    "login.At.StartUp",
    null,
    false
  );

  Assert.ok(rawCheckValue);
}

/**
 * Test for bug 807101.
 * Check if form controls are properly disabled when their attached prefs are locked.
 */
add_task(async function test_account_locked_prefs() {
  await open_advanced_settings(function(tab) {
    subtest_check_locked_prefs_addressing(tab);
  });

  await open_advanced_settings(function(tab) {
    subtest_check_locked_prefs_server(tab);
  });
});

/**
 * Check that the LDAP server selection elements (radio group) are properly
 * disabled when their attached pref (prefstring attribute) is locked.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_locked_prefs_addressing(tab) {
  let accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-addressing.xhtml",
    tab
  );
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // By default, 'use global LDAP server preferences' is set, not the
  // 'different LDAP server'.
  let useLDAPdirectory = iframe.getElementById("directories");
  Assert.ok(!useLDAPdirectory.selected);

  // So the server selector is disabled.
  let LDAPdirectory = iframe.getElementById("identity.directoryServer");
  Assert.ok(LDAPdirectory.disabled);

  // And the Edit button too.
  let LDAPeditButton = iframe.getElementById("editButton");
  Assert.ok(LDAPeditButton.disabled);

  // Now toggle the 'different LDAP server' on. The server selector
  // and edit button should enable.
  mc.radio(useLDAPdirectory);
  Assert.ok(!LDAPdirectory.disabled);
  Assert.ok(!LDAPeditButton.disabled);

  // Lock the pref for the server selector.
  let prefstring = LDAPdirectory.getAttribute("prefstring");
  let controlPref = prefstring.replace(
    "%identitykey%",
    gPopAccount.defaultIdentity.key
  );
  Services.prefs.getDefaultBranch("").setBoolPref(controlPref, "xxx");
  Services.prefs.lockPref(controlPref);

  // Refresh the pane by switching to another one.
  accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-addressing.xhtml",
    tab
  );
  click_account_tree_row(tab, accountRow);

  // Re-assign iframe.contentDocument because it was lost when changing panes
  // (uses loadURI to load a new document).
  iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // We are now back and the 'different LDAP server' should still be selected
  // (the setting was saved).
  useLDAPdirectory = iframe.getElementById("directories");
  Assert.ok(useLDAPdirectory.selected);

  // But now the server selector should be disabled due to locked pref.
  LDAPdirectory = iframe.getElementById("identity.directoryServer");
  Assert.ok(LDAPdirectory.disabled);

  // The edit button still enabled (does not depend on the same pref lock)
  LDAPeditButton = iframe.getElementById("editButton");
  Assert.ok(!LDAPeditButton.disabled);

  // Unlock the pref to clean up.
  Services.prefs.unlockPref(controlPref);
  Services.prefs.getDefaultBranch("").deleteBranch(controlPref);
}

/**
 * Check that the POP3 'keep on server' settings elements (2-level
 * checkboxes + textbox) are properly disabled when their attached pref
 * (prefstring attribute) is locked.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_locked_prefs_server(tab) {
  let accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-server.xhtml",
    tab
  );
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // Top level leaveOnServer checkbox, disabled by default.
  let leaveOnServer = iframe.getElementById("pop3.leaveMessagesOnServer");
  Assert.ok(!leaveOnServer.disabled);
  Assert.ok(!leaveOnServer.checked);

  // Second level deleteByAge checkbox, disabled by default.
  let deleteByAge = iframe.getElementById("pop3.deleteByAgeFromServer");
  Assert.ok(deleteByAge.disabled);
  Assert.ok(!deleteByAge.checked);

  // Third level daysToLeave textbox, disabled by default.
  let daysToLeave = iframe.getElementById("pop3.numDaysToLeaveOnServer");
  Assert.ok(daysToLeave.disabled);

  // When leaveOnServer is checked, only deleteByAge will get enabled.
  mc.check(leaveOnServer, true);
  Assert.ok(leaveOnServer.checked);
  Assert.ok(!deleteByAge.disabled);
  Assert.ok(daysToLeave.disabled);

  // When deleteByAge is checked, daysToLeave will get enabled.
  mc.check(deleteByAge, true);
  Assert.ok(deleteByAge.checked);
  Assert.ok(!daysToLeave.disabled);

  // Lock the pref deleteByAge checkbox (middle of the element hierarchy).
  let prefstring = deleteByAge.getAttribute("prefstring");
  let controlPref = prefstring.replace(
    "%serverkey%",
    gPopAccount.incomingServer.key
  );
  Services.prefs.getDefaultBranch("").setBoolPref(controlPref, true);
  Services.prefs.lockPref(controlPref);

  // Refresh the pane by switching to another one.
  accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  accountRow = get_account_tree_row(gPopAccount.key, "am-server.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  // Re-assign iframe.contentDocument because it was lost when changing panes
  // (uses loadURI to load a new document).
  iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // Now leaveOnServer was preserved as checked.
  leaveOnServer = iframe.getElementById("pop3.leaveMessagesOnServer");
  Assert.ok(!leaveOnServer.disabled);
  Assert.ok(leaveOnServer.checked);

  // Now deleteByAge was preserved as checked but is locked/disabled.
  deleteByAge = iframe.getElementById("pop3.deleteByAgeFromServer");
  Assert.ok(deleteByAge.disabled);
  Assert.ok(deleteByAge.checked);

  // Because deleteByAge is checked, daysToLeave should be enabled.
  daysToLeave = iframe.getElementById("pop3.numDaysToLeaveOnServer");
  Assert.ok(!daysToLeave.disabled);

  // When leaveOnserver is unchecked, both of deleteByAge and daysToLeave
  // should get disabled.
  mc.check(leaveOnServer, false);
  Assert.ok(!leaveOnServer.disabled);
  Assert.ok(!leaveOnServer.checked);

  Assert.ok(deleteByAge.disabled);
  Assert.ok(deleteByAge.checked);
  Assert.ok(daysToLeave.disabled);

  // Unlock the pref to clean up.
  Services.prefs.unlockPref(controlPref);
  Services.prefs.getDefaultBranch("").deleteBranch(controlPref);
}

/**
 * Bug 530142.
 * Check that that if one field is set to a value, switching directly to another
 * account pane showing the same field really loads the value from the new account,
 * even when empty. This is tested on the Reply-To field.
 */
add_task(async function test_replyTo_leak() {
  await open_advanced_settings(function(tab) {
    subtest_check_replyTo_leak(tab);
  });
});

/**
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_replyTo_leak(tab) {
  let accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // The Reply-To field should be empty.
  let replyAddress = iframe.getElementById("identity.replyTo");
  Assert.equal(replyAddress.value, "");

  // Now we set a value into it and switch to another account, the main pane.
  replyAddress.value = "somewhere@else.com";

  // This test expects the following POP account to exist by default
  // in the test profile with port number 110 and no security.
  let firstServer = MailServices.accounts.FindServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  let firstAccount = MailServices.accounts.FindAccountForServer(firstServer);

  accountRow = get_account_tree_row(firstAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  // the Reply-To field should be empty as this account does not have it set.
  replyAddress = iframe.getElementById("identity.replyTo");
  Assert.equal(replyAddress.value, "");
}

/**
 * Test for bug 804091.
 * Check if onchange handlers are properly executed when panes are switched.
 */
add_task(async function test_account_onchange_handler() {
  await open_advanced_settings(function(tab) {
    subtest_check_onchange_handler(tab);
  });
});

/**
 * Check if onchange handlers are properly executed when panes are switched.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_onchange_handler(tab) {
  let accountRow = get_account_tree_row(
    gImapAccount.key,
    "am-offline.xhtml",
    tab
  );
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  let autoSync = iframe.getElementById("autosyncValue");
  // 30 is the default value so check if we are in clean state.
  Assert.equal(autoSync.value, 30);

  let autoSyncInterval = iframe.getElementById("autosyncInterval");
  // 1 is the default value and means the 30 is in days.
  Assert.equal(autoSyncInterval.value, 1);

  // Now type in 35 (days).
  mc.radio(iframe.getElementById("useAutosync.ByAge"));
  autoSync.select();
  mc.type(autoSync, "35");

  // Immediately switch to another pane and back.
  accountRow = get_account_tree_row(gImapAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  accountRow = get_account_tree_row(gImapAccount.key, "am-offline.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  iframe = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // The pane optimized the entered value a bit. So now we should find 5.
  autoSync = iframe.getElementById("autosyncValue");
  Assert.equal(autoSync.value, 5);

  // And the unit is 7 days = week.
  autoSyncInterval = iframe.getElementById("autosyncInterval");
  Assert.equal(autoSyncInterval.value, 7);
}
