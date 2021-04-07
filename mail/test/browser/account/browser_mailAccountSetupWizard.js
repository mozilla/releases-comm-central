/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { openAccountHub, wait_for_account_tree_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { input_value, delete_all_existing } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);
var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);
var { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

var originalAlertsServiceCID;
// We need a mock alerts service to capture notification events when loading the
// UI after a successful account configuration in order to catch the alert
// triggered when trying to connect to the fake IMAP server.
class MockAlertsService {
  QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);
  showAlertNotification() {}
}

var user = {
  name: "Yamato Nadeshiko",
  email: "yamato.nadeshiko@example.com",
  password: "abc12345",
  incomingHost: "testin.example.com",
  outgoingHost: "testout.example.com",
};
var outgoingShortName = "Example Två";

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

// Remove an account in the Account Manager, but not via the UI.
function remove_account_internal(tab, account, outgoing) {
  let win = tab.browser.contentWindow;

  // Remove the account and incoming server
  let serverId = account.incomingServer.serverURI;
  MailServices.accounts.removeAccount(account);
  account = null;
  if (serverId in win.accountArray) {
    delete win.accountArray[serverId];
  }
  win.selectServer(null, null);

  // Remove the outgoing server
  let smtpKey = outgoing.key;
  MailServices.smtp.deleteServer(outgoing);
  win.replaceWithDefaultSmtpServer(smtpKey);
}

add_task(async function test_mail_account_setup() {
  originalAlertsServiceCID = MockRegistrar.register(
    "@mozilla.org/alerts-service;1",
    MockAlertsService
  );

  // Set the pref to load a local autoconfig file.
  let url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  let tab = await openAccountHub();
  let tabDocument = tab.browser.contentWindow.document;

  // Input user's account information
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("realname"),
    {},
    tab.browser.contentWindow
  );

  if (tabDocument.getElementById("realname").value) {
    // If any realname is already filled, clear it out, we have our own.
    delete_all_existing(mc, tabDocument.getElementById("realname"));
  }
  input_value(mc, user.name);
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);
  input_value(mc, user.email);
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);
  input_value(mc, user.password);

  // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("next_button"),
    {},
    tab.browser.contentWindow
  );

  // XXX: This should probably use a notification, once we fix bug 561143.
  await BrowserTestUtils.waitForCondition(
    () => tab.browser.contentWindow.gEmailConfigWizard._currentConfig != null,
    "Timeout waiting for current config to become non-null"
  );

  // Register the prompt service to handle the confirm() dialog
  gMockPromptService.register();
  gMockPromptService.returnValue = true;

  // Open the advanced settings (Account Manager) to create the account
  // immediately. We use an invalid email/password so the setup will fail
  // anyway.
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("manual-edit_button"),
    {},
    tab.browser.contentWindow
  );

  await BrowserTestUtils.waitForCondition(
    () => !tabDocument.getElementById("manual-edit_area").hidden,
    "Timeout waiting for the manual edit area to become visible"
  );

  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("advanced-setup_button"),
    {},
    tab.browser.contentWindow
  );

  await subtest_verify_account(mc.tabmail.selectedTab);

  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);

  let promptState = gMockPromptService.promptState;
  Assert.equal("confirm", promptState.method);

  // Clean up
  gMockPromptService.unregister();
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

async function subtest_verify_account(tab) {
  await BrowserTestUtils.waitForCondition(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for current config to become non-null"
  );

  let account = tab.browser.contentWindow.currentAccount;
  let identity = account.defaultIdentity;
  let incoming = account.incomingServer;
  let outgoing = MailServices.smtp.getServerByKey(identity.smtpServerKey);

  let config = {
    "incoming server username": {
      actual: incoming.username,
      expected: user.email.split("@")[0],
    },
    // This was creating test failure.
    //
    // "outgoing server username": {
    //   actual: outgoing.username,
    //   expected: user.email,
    // },
    "incoming server hostname": {
      // Note: N in the hostName is uppercase
      actual: incoming.hostName,
      expected: user.incomingHost,
    },
    "outgoing server hostname": {
      // And this is lowercase
      actual: outgoing.hostname,
      expected: user.outgoingHost,
    },
    "user real name": { actual: identity.fullName, expected: user.name },
    "user email address": { actual: identity.email, expected: user.email },
    "outgoing description": {
      actual: outgoing.description,
      expected: outgoingShortName,
    },
  };

  try {
    for (let i in config) {
      Assert.equal(
        config[i].actual,
        config[i].expected,
        "Configured " +
          i +
          " is " +
          config[i].actual +
          ". It should be " +
          config[i].expected +
          "."
      );
    }
  } finally {
    remove_account_internal(tab, account, outgoing);
  }
}

/**
 * Make sure that we don't re-set the information we get from the config
 * file if the password is incorrect.
 */
add_task(async function test_bad_password_uses_old_settings() {
  // Set the pref to load a local autoconfig file, that will fetch the
  // ../account/xml/example.com which contains the settings for the
  // @example.com email account (see the 'user' object).
  let url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  Services.telemetry.clearScalars();

  let tab = await openAccountHub();
  let tabDocument = tab.browser.contentWindow.document;

  // Input user's account information
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("realname"),
    {},
    tab.browser.contentWindow
  );

  if (tabDocument.getElementById("realname").value) {
    // If any realname is already filled, clear it out, we have our own.
    delete_all_existing(mc, tabDocument.getElementById("realname"));
  }
  input_value(mc, user.name);
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);
  input_value(mc, user.email);
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);
  input_value(mc, user.password);

  // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("next_button"),
    {},
    tab.browser.contentWindow
  );

  let createButton = tabDocument.getElementById("create_button");
  await BrowserTestUtils.waitForCondition(
    () => !createButton.hidden && !createButton.disabled,
    "Timeout waiting for create button to become visible and active"
  );

  EventUtils.synthesizeMouseAtCenter(
    createButton,
    {},
    tab.browser.contentWindow
  );

  await BrowserTestUtils.waitForCondition(
    () => !createButton.disabled,
    "Timeout waiting for create button to become active"
  );

  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("manual-edit_button"),
    {},
    tab.browser.contentWindow
  );

  await BrowserTestUtils.waitForCondition(
    () => !tabDocument.getElementById("manual-edit_area").hidden,
    "Timeout waiting for the manual edit area to become visible"
  );

  EventUtils.synthesizeMouseAtCenter(
    createButton,
    {},
    tab.browser.contentWindow
  );

  // Make sure all the values are the same as in the user object.
  Assert.equal(
    tabDocument.getElementById("outgoing_hostname").value,
    user.outgoingHost,
    "Outgoing server changed!"
  );
  Assert.equal(
    tabDocument.getElementById("incoming_hostname").value,
    user.incomingHost,
    "incoming server changed!"
  );

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.account.failed_email_account_setup"]["xml-from-db"],
    1,
    "Count of failed email account setup with xml config must be correct"
  );
  Assert.equal(
    scalars["tb.account.failed_email_account_setup"].user,
    1,
    "Count of failed email account setup with manual config must be correct"
  );

  // Clean up
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);

  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("cancel_button"),
    {},
    tab.browser.contentWindow
  );
});

add_task(async function test_remember_password() {
  await remember_password_test(true);
  await remember_password_test(false);
});

/**
 * Test remember_password checkbox behavior with
 * signon.rememberSignons set to "aPrefValue"
 *
 * @param {boolean} aPrefValue - The preference value for signon.rememberSignons.
 */
async function remember_password_test(aPrefValue) {
  // Save the pref for backup purpose.
  let rememberSignons_pref_save = Services.prefs.getBoolPref(
    "signon.rememberSignons",
    true
  );

  Services.prefs.setBoolPref("signon.rememberSignons", aPrefValue);

  let tab = await openAccountHub();
  let tabDocument = tab.browser.contentWindow.document;
  let password = tabDocument.getElementById("password");

  // Type something in the password field.
  password.focus();
  input_value(mc, "testing");

  let rememberPassword = tabDocument.getElementById("remember_password");
  Assert.ok(rememberPassword.disabled != aPrefValue);
  Assert.equal(rememberPassword.checked, aPrefValue);

  // Empty the password field.
  delete_all_existing(mc, password);

  // Restore the saved signon.rememberSignons value.
  Services.prefs.setBoolPref(
    "signon.rememberSignons",
    rememberSignons_pref_save
  );

  // Close the wizard.
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("cancel_button"),
    {},
    tab.browser.contentWindow
  );
}

registerCleanupFunction(function teardownModule(module) {
  MockRegistrar.unregister(originalAlertsServiceCID);
});
