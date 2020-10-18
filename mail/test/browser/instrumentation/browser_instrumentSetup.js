/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var elib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);

var { open_mail_account_setup_wizard } = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { input_value } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);
var {
  plan_for_window_close,
  wait_for_existing_window,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var user = {
  name: "Roger Sterling",
  email: "roger.sterling@example.com",
  incomingHost: "testin.example.com",
  outgoingHost: "testout.example.com",
};
const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

add_task(function setupModule(module) {
  let url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
});

registerCleanupFunction(function teardownModule(module) {
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

add_task(function test_mail_account_setup() {
  open_mail_account_setup_wizard(function(awc) {
    // Input user's account information
    awc.e("realname").focus();
    input_value(awc, user.name);
    EventUtils.synthesizeKey("VK_TAB", {}, awc.window);
    input_value(awc, user.email);

    // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
    awc.e("next_button").click();

    // XXX: This should probably use a notification, once we fix bug 561143.
    awc.waitFor(
      () => awc.window.gEmailConfigWizard._currentConfig != null,
      "Timeout waiting for current config to become non-null",
      8000,
      600
    );
    plan_for_window_close(awc);
    awc.e("create_button").click();

    let events = mc.window.MailInstrumentation._currentState.events;
    wait_for_window_close();

    // we expect to have accountAdded and smtpServerAdded events.
    if (!events.accountAdded.data) {
      throw new Error("failed to add an account");
    } else if (!events.smtpServerAdded.data) {
      throw new Error("failed to add an smtp server");
    }
  });
});

// Remove the accounts we added.
registerCleanupFunction(function teardownModule(module) {
  let incomingServer = MailServices.accounts.FindServer(
    "roger.sterling",
    user.incomingHost,
    "pop3"
  );
  Assert.equal(incomingServer.hostName, user.incomingHost);
  let account = MailServices.accounts.FindAccountForServer(incomingServer);

  let identity = account.defaultIdentity;
  let outgoingServer = MailServices.smtp.getServerByKey(identity.smtpServerKey);
  Assert.equal(outgoingServer.hostname, user.outgoingHost);
  MailServices.smtp.deleteServer(outgoingServer);
  MailServices.accounts.removeAccount(account, true);
});
