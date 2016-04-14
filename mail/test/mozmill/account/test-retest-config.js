/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "test-retest-config";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers", "keyboard-helpers"];

var elib = {};
Components.utils.import("resource://mozmill/modules/elementslib.js", elib);
Components.utils.import("resource://gre/modules/Services.jsm");

var user = {
  name: "test",
  email: "test@momo.invalid",
  altEmail: "test2@momo.invalid"
};

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
  Services.prefs.setCharPref("mail.wizard.logging.dump", "All");

  let url = collector.addHttpResource("../account/xml", "accountconfig");
  Services.prefs.setCharPref("mailnews.auto_config_url", url);
  collector.httpd.registerContentType("invalid", "text/xml");
}

function tearDownModule(module) {
  Services.prefs.clearUserPref("mailnews.auto_config_url");
  Services.prefs.clearUserPref("mail.wizard.logging.dump");
}

// Select File > New > Mail Account to open the Mail Account Setup Wizard
function open_mail_account_setup_wizard(k) {
  plan_for_modal_dialog("mail:autoconfig", k);
  mc.click(new elib.Elem(mc.menus.menu_File.menu_New.newMailAccountMenuItem));
  return wait_for_modal_dialog("mail:autoconfig", 30000);
}

function test_re_test_config() {
  // Opening multiple windows in the same run seems to require letting the stack
  // unwind before opening the next one, so do that here.
  mc.sleep(0);
  open_mail_account_setup_wizard(function (awc) {
    // Input user's account information
    awc.e("realname").focus();
    input_value(awc, user.name);
    awc.keypress(null, "VK_TAB", {});
    input_value(awc, user.email);

    // Click "continue" button
    awc.e("next_button").click();

    // Wait for 'edit' button to be enabled
    awc.waitFor(function() { return this.disabled == false && this.hidden == false; },
                "Timeout waiting for edit button to be enabled",
                8000, 600, awc.e("create_button"));

    awc.e("manual-edit_button").click();

    // Click "re-test" button
    awc.e("half-manual-test_button").click();

    awc.waitFor(function () { return this.disabled == false; },
                "Timeout waiting for re-test button to be enabled",
                20000, 600, awc.e("half-manual-test_button"));

    // There used to be a "start over" button (line commented out below). Now just
    // changing the value of the email field does the trick.
    awc.e("realname").focus();
    awc.keypress(null, "VK_TAB", {});
    input_value(awc, user.altEmail);
    awc.keypress(null, "VK_TAB", {});

    // Wait for the "continue" button to be back, which means we're back to the
    // original state.
    awc.waitFor(function() { return this.hidden == false; },
                "Timeout waiting for continue button to be visible",
                20000, 600, awc.e("next_button"));

    awc.e("next_button").click();

    // Previously, we'd switched to the manual editing state. Now we've started
    // over, we should make sure the information is presented back in its original
    // "automatic" mode.
    assert_true(!awc.e("manual-edit_button").hidden,
      "We're not back to the original state!");
    assert_true(awc.e("advanced-setup_button").hidden,
      "We're not back to the original state!");

    close_window(awc);
  });
}

