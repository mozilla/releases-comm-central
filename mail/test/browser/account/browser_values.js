/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper operation of the account settings panes
 * when certain special or invalid values are entered into the fields.
 */

"use strict";

var {
  click_account_tree_row,
  get_account_tree_row,
  open_advanced_settings,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { input_value } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);
var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var gPopAccount, gOriginalAccountCount;

add_task(function setupModule(module) {
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
  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount + 1
  );
});

registerCleanupFunction(function teardownModule(module) {
  // Remove our test account to leave the profile clean.
  MailServices.accounts.removeAccount(gPopAccount);
  // There should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, gOriginalAccountCount);
});

/**
 * Bug 208628.
 * Check that if the CC field is empty, enabling CC will automatically
 * prefill the currently default email address.
 */
add_task(async function test_default_CC_address() {
  await open_advanced_settings(function(tab) {
    subtest_check_default_CC_address(tab);
  });
});

/**
 * Check that if the CC field is empty, enabling CC will automatically
 * prefill the currently default email address.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_default_CC_address(tab) {
  let accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-copies.xhtml",
    tab
  );
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById(
    "contentFrame"
  );

  let defaultAddress = iframe.contentDocument.getElementById("identity.email")
    .value;
  let ccCheck = iframe.contentDocument.getElementById("identity.doCc");
  let ccAddress = iframe.contentDocument.getElementById("identity.doCcList");
  // The CC checkbox is not enabled and the address value is empty.
  Assert.ok(!ccCheck.checked);
  Assert.equal(ccAddress.value, "");
  // After ticking the CC checkbox the default address should be prefilled.
  mc.check(ccCheck, true);
  Assert.equal(ccAddress.value, defaultAddress);

  let bccCheck = iframe.contentDocument.getElementById("identity.doBcc");
  let bccAddress = iframe.contentDocument.getElementById("identity.doBccList");
  // The BCC checkbox is not enabled but we set the address value to something.
  Assert.ok(!bccCheck.checked);
  Assert.equal(bccAddress.value, "");
  let bccUserAddress = "somebody@else.invalid";
  bccAddress.value = bccUserAddress;
  // After ticking the BCC checkbox the current value of the address should not change.
  mc.check(bccCheck, true);
  Assert.equal(bccAddress.value, bccUserAddress);
}

/**
 * Bug 720199.
 * Check if the account name automatically changes when the user changes
 * the username or hostname.
 */
add_task(async function test_account_name() {
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

  Assert.equal(
    gPopAccount.incomingServer.prettyName,
    "nobody on example.invalid"
  );
  Assert.equal(nntpAccount.incomingServer.prettyName, "example.nntp.invalid");

  // The automatic account name update works only if the name is
  // in the form of user@host.
  gPopAccount.incomingServer.prettyName = "nobody@example.invalid";

  let newHost = "some.host.invalid";
  let newUser = "somebody";

  // On NNTP there is no user name so just set new hostname.
  await open_advanced_settings(function(tab) {
    subtest_check_account_name(nntpAccount, newHost, null, tab);
  });

  // And see if the account name is updated to it.
  Assert.equal(nntpAccount.incomingServer.prettyName, newHost);

  // On POP3 there is both user name and host name.
  // Set new host name first.
  await open_advanced_settings(function(tab) {
    subtest_check_account_name(gPopAccount, newHost, null, tab);
  });

  // And see if in the account name the host part is updated to it.
  Assert.equal(gPopAccount.incomingServer.prettyName, "nobody@" + newHost);

  // Set new host name first.
  await open_advanced_settings(function(tab) {
    subtest_check_account_name(gPopAccount, null, newUser, tab);
  });

  // And see if in the account name the user part is updated.
  Assert.equal(gPopAccount.incomingServer.prettyName, newUser + "@" + newHost);

  newHost = "another.host.invalid";
  newUser = "anotherbody";

  // Set user name and host name at once.
  await open_advanced_settings(function(tab) {
    subtest_check_account_name(gPopAccount, newHost, newUser, tab);
  });

  // And see if in the account name the host part is updated to it.
  Assert.equal(gPopAccount.incomingServer.prettyName, newUser + "@" + newHost);

  // Now have an account name where the name does not match the hostname.
  gPopAccount.incomingServer.prettyName = newUser + "@example.invalid";

  newHost = "third.host.invalid";
  // Set the host name again.
  await open_advanced_settings(function(tab) {
    subtest_check_account_name(gPopAccount, newHost, null, tab);
  });

  // And the account name should not be touched.
  Assert.equal(
    gPopAccount.incomingServer.prettyName,
    newUser + "@example.invalid"
  );

  MailServices.accounts.removeAccount(nntpAccount);
});

/**
 * Changes the user name and hostname to the supplied values.
 *
 * @param {Object} account - The account to change
 * @param {string} newHostname - The hostname value to set
 * @param {string} newUsername - The username value to set
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_account_name(account, newHostname, newUsername, tab) {
  let accountRow = get_account_tree_row(account.key, "am-server.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById(
    "contentFrame"
  );

  if (newHostname) {
    let hostname = iframe.contentDocument.getElementById("server.realHostName");
    Assert.equal(hostname.value, account.incomingServer.realHostName);

    // Now change the server host name.
    hostname.value = newHostname;
  }

  if (newUsername) {
    let username = iframe.contentDocument.getElementById("server.realUsername");
    Assert.equal(username.value, account.incomingServer.realUsername);

    // Now change the server user name.
    username.value = newUsername;
  }

  if (newUsername) {
    gMockPromptService.register();
  }

  tab.browser.contentWindow.onAccept(true);
  if (newUsername) {
    Assert.equal("alert", gMockPromptService.promptState.method);
    gMockPromptService.unregister();
  }
}

/**
 * Bug 536768.
 * Check if invalid junk target settings (folders) are fixed to sane values.
 */
add_task(async function test_invalid_junk_target() {
  // Set the junk target prefs to invalid values.
  let branch = Services.prefs.getBranch(
    "mail.server." + gPopAccount.incomingServer.key + "."
  );
  branch.setCharPref("spamActionTargetAccount", "some random non-existent URI");
  branch.setCharPref("spamActionTargetFolder", "some random non-existent URI");
  let moveOnSpam = true;
  branch.setBoolPref("moveOnSpam", moveOnSpam);
  await open_advanced_settings(function(tab) {
    subtest_check_invalid_junk_target(tab);
  });

  // The pref has no default so its non-existence means it was cleared.
  moveOnSpam = branch.getBoolPref("moveOnSpam", false);
  Assert.ok(!moveOnSpam);
  // The targets should point to the same pop account now.
  let targetAccount = branch.getCharPref("spamActionTargetAccount");
  Assert.equal(targetAccount, gPopAccount.incomingServer.serverURI);
  let targetFolder = branch.getCharPref("spamActionTargetFolder");
  Assert.equal(targetFolder, gPopAccount.incomingServer.serverURI + "/Junk");
});

/**
 * Just show the Junk settings pane and let it fix the values.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_invalid_junk_target(tab) {
  let accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);
  tab.browser.contentWindow.onAccept(true);
}

/**
 * Bug 327812.
 * Checks if invalid server hostnames are not accepted.
 */
add_task(async function test_invalid_hostname() {
  let branch = Services.prefs.getBranch(
    "mail.server." + gPopAccount.incomingServer.key + "."
  );
  let origHostname = branch.getCharPref("realhostname");

  await open_advanced_settings(function(tab) {
    subtest_check_invalid_hostname(tab, false, origHostname);
  });
  await open_advanced_settings(function(tab) {
    subtest_check_invalid_hostname(tab, true, origHostname);
  });

  // The new bad hostname should not have been saved.
  let newHostname = branch.getCharPref("realhostname");
  Assert.equal(origHostname, newHostname);
});

/**
 * Set the hostname to an invalid value and check if it gets fixed.
 *
 * @param {Object} tab - The account manager tab.
 * @param {boolean} exitSettings - Attempt to close the Account settings dialog.
 * @param {string} originalHostname - Original hostname of this server.
 */
function subtest_check_invalid_hostname(tab, exitSettings, originalHostname) {
  let accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-server.xhtml",
    tab
  );
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById(
    "contentFrame"
  );
  let hostname = iframe.contentDocument.getElementById("server.realHostName");
  Assert.equal(hostname.value, originalHostname);

  hostname.value = "some_invalid+host&domain*in>invalid";

  if (!exitSettings) {
    accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xhtml", tab);
    click_account_tree_row(tab, accountRow);

    // The invalid hostname should be set back to previous value at this point...
    accountRow = get_account_tree_row(gPopAccount.key, "am-server.xhtml", tab);
    click_account_tree_row(tab, accountRow);

    // ...let's check that:
    iframe = tab.browser.contentWindow.document.getElementById("contentFrame");
    hostname = iframe.contentDocument.getElementById("server.realHostName");
    Assert.equal(hostname.value, originalHostname);
  } else {
    // If the hostname is bad, we should get a warning dialog.
    plan_for_modal_dialog("commonDialogWindow", function(cdc) {
      // Just dismiss it.
      cdc.window.document.documentElement
        .querySelector("dialog")
        .acceptDialog();
    });
    tab.browser.contentWindow.onAccept(true);
    wait_for_modal_dialog("commonDialogWindow");
  }
}

/**
 * Bug 1426328.
 * Check that the AM will trim user added spaces around text values.
 */
const badName = "trailing  space ";
const badEmail = " leading_space@example.com";

add_task(async function test_trailing_spaces() {
  await open_advanced_settings(function(tab) {
    subtest_check_trailing_spaces(tab);
  });
  Assert.equal(gPopAccount.incomingServer.prettyName, badName.trim());
  Assert.equal(gPopAccount.defaultIdentity.email, badEmail.trim());
});

/**
 * Check that the AM will trim user added spaces around text values
 * when storing them into the account.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_trailing_spaces(tab) {
  let accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById(
    "contentFrame"
  );

  let accountName = iframe.contentDocument.getElementById("server.prettyName");
  let defaultAddress = iframe.contentDocument.getElementById("identity.email");
  accountName.value = "";
  defaultAddress.value = "";
  input_value(mc, badName, accountName);
  input_value(mc, badEmail, defaultAddress);

  Assert.equal(accountName.value, badName);
  Assert.equal(defaultAddress.value, badEmail);
}
