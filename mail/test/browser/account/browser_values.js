/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper operation of the account settings panes
 * when certain special or invalid values are entered into the fields.
 */

"use strict";

var { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/AccountManagerHelpers.sys.mjs"
  );
var { input_value } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/KeyboardHelpers.sys.mjs"
);
var { gMockPromptService } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/PromptHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gPopAccount, gOriginalAccountCount;

add_setup(function () {
  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server
  const popServer = MailServices.accounts
    .createIncomingServer("nobody", "example.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  const identity = MailServices.accounts.createIdentity();
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

registerCleanupFunction(function () {
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
  await open_advanced_settings(subtest_check_default_CC_address);
});

/**
 * Check that if the CC field is empty, enabling CC will automatically
 * prefill the currently default email address.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_default_CC_address(tab) {
  const accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-copies.xhtml",
    tab
  );
  await click_account_tree_row(tab, accountRow);

  const iframe =
    tab.browser.contentWindow.document.getElementById("contentFrame");

  const defaultAddress =
    iframe.contentDocument.getElementById("identity.email").value;
  const ccCheck = iframe.contentDocument.getElementById("identity.doCc");
  const ccAddress = iframe.contentDocument.getElementById("identity.doCcList");
  // The CC checkbox is not enabled and the address value is empty.
  Assert.ok(!ccCheck.checked);
  Assert.equal(ccAddress.value, "");
  // After ticking the CC checkbox the default address should be prefilled.
  EventUtils.synthesizeMouseAtCenter(ccCheck, {}, ccCheck.ownerGlobal);
  Assert.equal(ccAddress.value, defaultAddress);

  const bccCheck = iframe.contentDocument.getElementById("identity.doBcc");
  const bccAddress =
    iframe.contentDocument.getElementById("identity.doBccList");
  // The BCC checkbox is not enabled but we set the address value to something.
  Assert.ok(!bccCheck.checked);
  Assert.equal(bccAddress.value, "");
  const bccUserAddress = "somebody@else.invalid";
  bccAddress.value = bccUserAddress;
  // After ticking the BCC checkbox the current value of the address should not change.
  EventUtils.synthesizeMouseAtCenter(bccCheck, {}, bccCheck.ownerGlobal);
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
  const nntpServer = MailServices.accounts
    .createIncomingServer(null, "example.nntp.invalid", "nntp")
    .QueryInterface(Ci.nsINntpIncomingServer);

  const identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox2@example.invalid";

  const nntpAccount = MailServices.accounts.createAccount();
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
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_name(nntpAccount, newHost, null, tab);
  });

  // And see if the account name is updated to it.
  Assert.equal(nntpAccount.incomingServer.prettyName, newHost);

  // On POP3 there is both user name and host name.
  // Set new host name first.
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_name(gPopAccount, newHost, null, tab);
  });

  // And see if in the account name the host part is updated to it.
  Assert.equal(gPopAccount.incomingServer.prettyName, "nobody@" + newHost);

  // Set new host name first.
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_name(gPopAccount, null, newUser, tab);
  });

  // And see if in the account name the user part is updated.
  Assert.equal(gPopAccount.incomingServer.prettyName, newUser + "@" + newHost);

  newHost = "another.host.invalid";
  newUser = "anotherbody";

  // Set user name and host name at once.
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_name(gPopAccount, newHost, newUser, tab);
  });

  // And see if in the account name the host part is updated to it.
  Assert.equal(gPopAccount.incomingServer.prettyName, newUser + "@" + newHost);

  // Now have an account name where the name does not match the hostname.
  gPopAccount.incomingServer.prettyName = newUser + "@example.invalid";

  newHost = "third.host.invalid";
  // Set the host name again.
  await open_advanced_settings(async function (tab) {
    await subtest_check_account_name(gPopAccount, newHost, null, tab);
  });

  // And the account name should not be touched.
  Assert.equal(
    gPopAccount.incomingServer.prettyName,
    newUser + "@example.invalid"
  );

  MailServices.accounts.removeAccount(nntpAccount);
}).skip(); // Restart is required to apply change to server name or username.

/**
 * Changes the user name and hostname to the supplied values.
 *
 * @param {object} account - The account to change
 * @param {string} newHostname - The hostname value to set
 * @param {string} newUsername - The username value to set
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_account_name(
  account,
  newHostname,
  newUsername,
  tab
) {
  const accountRow = get_account_tree_row(account.key, "am-server.xhtml", tab);
  await click_account_tree_row(tab, accountRow);

  const iframe =
    tab.browser.contentWindow.document.getElementById("contentFrame");

  if (newHostname) {
    const hostname = iframe.contentDocument.getElementById("server.hostName");
    Assert.equal(hostname.value, account.incomingServer.hostName);

    // Now change the server host name.
    hostname.value = newHostname;
  }

  if (newUsername) {
    const username = iframe.contentDocument.getElementById("server.username");
    Assert.equal(username.value, account.incomingServer.username);

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
  const branch = Services.prefs.getBranch(
    "mail.server." + gPopAccount.incomingServer.key + "."
  );
  branch.setCharPref("spamActionTargetAccount", "some random non-existent URI");
  branch.setStringPref(
    "spamActionTargetFolder",
    "some random non-existent URI"
  );
  let moveOnSpam = true;
  branch.setBoolPref("moveOnSpam", moveOnSpam);
  await open_advanced_settings(subtest_check_invalid_junk_target);

  // The pref has no default so its non-existence means it was cleared.
  moveOnSpam = branch.getBoolPref("moveOnSpam", false);
  Assert.ok(!moveOnSpam);
  // The targets should point to the same pop account now.
  const targetAccount = branch.getCharPref("spamActionTargetAccount");
  Assert.equal(targetAccount, gPopAccount.incomingServer.serverURI);
  const targetFolder = branch.getStringPref("spamActionTargetFolder");
  Assert.equal(targetFolder, gPopAccount.incomingServer.serverURI + "/Junk");
});

/**
 * Just show the Junk settings pane and let it fix the values.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_invalid_junk_target(tab) {
  const accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-junk.xhtml",
    tab
  );
  await click_account_tree_row(tab, accountRow);
  tab.browser.contentWindow.onAccept(true);
}

/**
 * Bug 327812.
 * Checks if invalid server hostnames are not accepted.
 */
add_task(async function test_invalid_hostname() {
  const branch = Services.prefs.getBranch(
    "mail.server." + gPopAccount.incomingServer.key + "."
  );
  const origHostname = branch.getCharPref("hostname");

  await open_advanced_settings(async function (tab) {
    await subtest_check_invalid_hostname(tab, false, origHostname);
  });
  await open_advanced_settings(async function (tab) {
    await subtest_check_invalid_hostname(tab, true, origHostname);
  });

  // The new bad hostname should not have been saved.
  const newHostname = branch.getCharPref("hostname");
  Assert.equal(origHostname, newHostname);
});

/**
 * Set the hostname to an invalid value and check if it gets fixed.
 *
 * @param {object} tab - The account manager tab.
 * @param {boolean} exitSettings - Attempt to close the Account settings dialog.
 * @param {string} originalHostname - Original hostname of this server.
 */
async function subtest_check_invalid_hostname(
  tab,
  exitSettings,
  originalHostname
) {
  let accountRow = get_account_tree_row(
    gPopAccount.key,
    "am-server.xhtml",
    tab
  );
  await click_account_tree_row(tab, accountRow);

  let iframe =
    tab.browser.contentWindow.document.getElementById("contentFrame");
  let hostname = iframe.contentDocument.getElementById("server.hostName");
  Assert.equal(hostname.value, originalHostname);

  hostname.value = "some_invalid+host&domain*in>invalid";

  if (!exitSettings) {
    accountRow = get_account_tree_row(gPopAccount.key, "am-junk.xhtml", tab);
    await click_account_tree_row(tab, accountRow);

    // The invalid hostname should be set back to previous value at this point...
    accountRow = get_account_tree_row(gPopAccount.key, "am-server.xhtml", tab);
    await click_account_tree_row(tab, accountRow);

    // ...let's check that:
    iframe = tab.browser.contentWindow.document.getElementById("contentFrame");
    hostname = iframe.contentDocument.getElementById("server.hostName");
    Assert.equal(hostname.value, originalHostname);
  } else {
    // If the hostname is bad, we should get a warning dialog.
    const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
    tab.browser.contentWindow.onAccept(true);
    await dialogPromise;
  }
}

/**
 * Bug 1426328.
 * Check that the AM will trim user added spaces around text values.
 */
const badName = "trailing  space ";
const badEmail = " leading_space@example.com";

add_task(async function test_trailing_spaces() {
  await open_advanced_settings(subtest_check_trailing_spaces);
  Assert.equal(gPopAccount.incomingServer.prettyName, badName.trim());
  Assert.equal(gPopAccount.defaultIdentity.email, badEmail.trim());
});

/**
 * Check that the AM will trim user added spaces around text values
 * when storing them into the account.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_trailing_spaces(tab) {
  const accountRow = get_account_tree_row(gPopAccount.key, null, tab);
  await click_account_tree_row(tab, accountRow);

  const iframe =
    tab.browser.contentWindow.document.getElementById("contentFrame");

  const accountName =
    iframe.contentDocument.getElementById("server.prettyName");
  const defaultAddress =
    iframe.contentDocument.getElementById("identity.email");
  accountName.value = "";
  defaultAddress.value = "";
  input_value(window, badName, accountName);
  input_value(window, badEmail, defaultAddress);

  Assert.equal(
    accountName.value,
    badName,
    "accountName should have the correct value typed in"
  );
  // type="email" inputs are now automatically trimmed
  Assert.equal(
    defaultAddress.value,
    badEmail.trim(),
    "defaultAddress should have the correct value typed in"
  );
}
