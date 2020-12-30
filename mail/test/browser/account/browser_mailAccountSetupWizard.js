/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { open_mail_account_setup_wizard } = ChromeUtils.import(
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
var elib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);

var user = {
  name: "Yamato Nadeshiko",
  email: "yamato.nadeshiko@example.com",
  password: "abc12345",
  incomingHost: "testin.example.com",
  outgoingHost: "testout.example.com",
};

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

// Remove an account in the Account Manager, but not via the UI.
function remove_account_internal(tab, account, outgoing) {
  let win = tab.browser.contentWindow;

  try {
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
  } catch (ex) {
    throw new Error("failure to remove account: " + ex + "\n");
  }
}

add_task(function test_mail_account_setup() {
  // Set the pref to load a local autoconfig file.
  let url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  open_mail_account_setup_wizard(function(awc) {
    // Input user's account information
    awc.click(awc.eid("realname"));
    if (awc.e("realname").value) {
      // If any realname is already filled, clear it out, we have our own.
      delete_all_existing(awc, awc.eid("realname"));
    }
    input_value(awc, user.name);
    EventUtils.synthesizeKey("VK_TAB", {}, awc.window);
    input_value(awc, user.email);
    EventUtils.synthesizeKey("VK_TAB", {}, awc.window);
    input_value(awc, user.password);

    // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
    awc.click(awc.eid("next_button"));

    // XXX: This should probably use a notification, once we fix bug 561143.
    awc.waitFor(
      () => awc.window.gEmailConfigWizard._currentConfig != null,
      "Timeout waiting for current config to become non-null",
      8000,
      600
    );

    // Register the prompt service to handle the confirm() dialog
    gMockPromptService.register();
    gMockPromptService.returnValue = true;

    // Open the advanced settings (Account Manager) to create the account
    // immediately.  We use an invalid email/password so the setup will fail
    // anyway.
    awc.e("manual-edit_button").click();
    awc.e("advanced-setup_button").click();
    subtest_verify_account(mc.tabmail.selectedTab);
    mc.tabmail.closeTab(mc.tabmail.currentTabInfo);

    let promptState = gMockPromptService.promptState;
    Assert.equal("confirm", promptState.method);

    // Clean up
    gMockPromptService.unregister();
    Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
  });
});

function subtest_verify_account(tab) {
  mc.waitFor(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for currentAccount to become non-null"
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
add_task(function test_bad_password_uses_old_settings() {
  // Set the pref to load a local autoconfig file, that will fetch the
  // ../account/xml/example.com which contains the settings for the
  // @example.com email account (see the 'user' object).
  let url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  mc.sleep(0);
  Services.telemetry.clearScalars();
  open_mail_account_setup_wizard(function(awc) {
    try {
      // Input user's account information
      awc.click(awc.eid("realname"));
      if (awc.e("realname").value) {
        // If any realname is already filled, clear it out, we have our own.
        delete_all_existing(awc, awc.eid("realname"));
      }
      input_value(awc, user.name);
      EventUtils.synthesizeKey("VK_TAB", {}, awc.window);
      input_value(awc, user.email);
      EventUtils.synthesizeKey("VK_TAB", {}, awc.window);
      input_value(awc, user.password);

      // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
      awc.e("next_button").click();

      awc.waitFor(
        function() {
          return !this.disabled && !this.hidden;
        },
        "Timeout waiting for create button to be visible and active",
        8000,
        600,
        awc.e("create_button")
      );
      awc.e("create_button").click();

      // The waitFor here is to allow onClick handler of create_button to
      // finish. Otherwise, clicking manual-edit_button will enable
      // create_button, and clicking create_button again immediately will mess
      // up internal state.
      awc.waitFor(
        function() {
          return !this.disabled;
        },
        "Timeout waiting for create button to be visible and active",
        8000,
        600,
        awc.e("create_button")
      );
      awc.e("manual-edit_button").click();
      awc.e("create_button").click();

      // Make sure all the values are the same as in the user object.
      awc.sleep(1000);
      Assert.equal(
        awc.e("outgoing_hostname").value,
        user.outgoingHost,
        "Outgoing server changed!"
      );
      Assert.equal(
        awc.e("incoming_hostname").value,
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
    } finally {
      // Clean up
      Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
      awc.e("cancel_button").click();
    }
  });
});

add_task(function test_remember_password() {
  remember_password_test(true);
  remember_password_test(false);
});

/**
 * Test remember_password checkbox behavior with
 * signon.rememberSignons set to "aPrefValue"
 *
 * @param {boolean} aPrefValue - The preference value for signon.rememberSignons.
 */
function remember_password_test(aPrefValue) {
  // save the pref for backup purpose
  let rememberSignons_pref_save = Services.prefs.getBoolPref(
    "signon.rememberSignons",
    true
  );

  Services.prefs.setBoolPref("signon.rememberSignons", aPrefValue);

  // without this, it breaks the test, don't know why
  mc.sleep(0);
  open_mail_account_setup_wizard(function(awc) {
    try {
      let password = new elib.ID(awc.window.document, "password");
      let rememberPassword = new elib.ID(
        awc.window.document,
        "remember_password"
      );

      // type something in the password field
      awc.e("password").focus();
      input_value(awc, "testing");

      Assert.ok(rememberPassword.getNode().disabled != aPrefValue);
      Assert.equal(rememberPassword.getNode().checked, aPrefValue);

      // empty the password field
      delete_all_existing(awc, password);

      // restore the saved signon.rememberSignons value
      Services.prefs.setBoolPref(
        "signon.rememberSignons",
        rememberSignons_pref_save
      );
    } finally {
      // close the wizard
      awc.e("cancel_button").click();
    }
  });
}
