/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "test-instrument-setup";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers",
                       "keyboard-helpers" ];

var elib = {};
Cu.import("resource://mozmill/modules/elementslib.js", elib);
Cu.import("resource://gre/modules/Services.jsm");

var user = {
  name: "Roger Sterling",
  email: "roger.sterling@example.com",
  incomingHost: "testin.example.com",
  outgoingHost: "testout.example.com",
};


function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  Services.prefs.setCharPref("mail.wizard.logging.dump", "All");

  // Set the pref to load a local autoconfig file.
  let url = collector.addHttpResource("../account/xml", "autoconfig");
  Services.prefs.setCharPref("mailnews.auto_config_url", url);

  // Force .com MIME-Type to text/xml
  collector.httpd.registerContentType("com", "text/xml");
}

function test_mail_account_setup() {
  awc = wait_for_existing_window("mail:autoconfig");

  // Input user's account information
  awc.e("realname").focus();
  input_value(awc, user.name);
  awc.keypress(null, "VK_TAB", {});
  input_value(awc, user.email);

  // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
  awc.e("next_button").click();

  let config = null;

  // XXX: This should probably use a notification, once we fix bug 561143.
  awc.waitFor(() => awc.window.gEmailConfigWizard._currentConfig != null,
              "Timeout waiting for current config to become non-null",
              8000, 600);
  config = awc.window.gEmailConfigWizard._currentConfig;
  plan_for_window_close(awc);
  awc.e("create_button").click();

  let events = mc.window.mailInstrumentationManager._currentState.events;
  wait_for_window_close();

  // we expect to have accountAdded and smtpServerAdded events.
  if (! (events["accountAdded"].data))
    throw new Error("failed to add an account");
  else if (! (events["smtpServerAdded"].data))
    throw new Error("failed to add an smtp server");
}

// Remove the accounts we added.
function tearDownModule(module) {
  let incomingServer = MailServices.accounts.FindServer("roger.sterling", user.incomingHost, "pop3");
  assert_equals(incomingServer.hostName, user.incomingHost);
  let account = MailServices.accounts.FindAccountForServer(incomingServer)

  let identity = account.defaultIdentity;
  MailServices.accounts.removeIncomingServer(incomingServer, true);
  let outgoingServer = MailServices.smtp.getServerByKey(identity.smtpServerKey);
  assert_equals(outgoingServer.hostname, user.outgoingHost);
  MailServices.smtp.deleteServer(outgoingServer);
  MailServices.accounts.removeAccount(account);

  Services.prefs.clearUserPref("mailnews.auto_config_url");
}
