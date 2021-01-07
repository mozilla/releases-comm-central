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
var { input_value, delete_all_existing } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var user = {
  name: "test",
  email: "test@momo.invalid",
  altEmail: "test2@momo.invalid",
};

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

add_task(function setupModule(module) {
  Services.prefs.setCharPref("mail.setup.loglevel", "All");

  let url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
});

registerCleanupFunction(function teardownModule(module) {
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
  Services.prefs.clearUserPref("mail.setup.loglevel");
});

add_task(function test_re_test_config() {
  // Opening multiple windows in the same run seems to require letting the stack
  // unwind before opening the next one, so do that here.
  mc.sleep(0);
  open_mail_account_setup_wizard(function(awc) {
    dump("xxxmagnus opened!\n");
    // Input user's account information
    awc.click(awc.eid("realname"));
    if (awc.e("realname").value) {
      // If any realname is already filled, clear it out, we have our own.
      delete_all_existing(awc, awc.eid("realname"));
    }
    input_value(awc, user.name);
    EventUtils.synthesizeKey("VK_TAB", {}, awc.window);
    input_value(awc, user.email);

    // Click "continue" button
    awc.e("next_button").click();

    // Wait for 'edit' button to be enabled
    awc.waitFor(
      function() {
        return !this.disabled && !this.hidden;
      },
      "Timeout waiting for edit button to be enabled",
      8000,
      600,
      awc.e("create_button")
    );

    awc.e("manual-edit_button").click();

    // Click "re-test" button
    awc.e("half-manual-test_button").click();

    awc.waitFor(
      function() {
        return !this.disabled;
      },
      "Timeout waiting for re-test button to be enabled",
      20000,
      600,
      awc.e("half-manual-test_button")
    );

    // There used to be a "start over" button (line commented out below). Now just
    // changing the value of the email field does the trick.
    awc.e("realname").focus();
    EventUtils.synthesizeKey("VK_TAB", {}, awc.window);
    awc.e("email").focus();
    input_value(awc, user.altEmail);
    EventUtils.synthesizeKey("VK_TAB", {}, awc.window);

    // Wait for the "continue" button to be back, which means we're back to the
    // original state.
    awc.waitFor(
      function() {
        return !this.hidden;
      },
      "Timeout waiting for continue button to be visible",
      20000,
      600,
      awc.e("next_button")
    );

    awc.e("next_button").click();

    // Previously, we'd switched to the manual editing state. Now we've started
    // over, we should make sure the information is presented back in its original
    // "automatic" mode.
    Assert.ok(
      awc.e("manual-edit_area").hidden,
      "We're not back to the original state!"
    );

    close_window(awc);
  });
});
