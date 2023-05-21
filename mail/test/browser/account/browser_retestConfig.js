/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { openAccountSetup } = ChromeUtils.import(
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

var user = {
  name: "test",
  email: "test@momo.invalid",
  altEmail: "test2@momo.invalid",
};

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

add_setup(function () {
  Services.prefs.setCharPref("mail.setup.loglevel", "All");

  let url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
});

registerCleanupFunction(function () {
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
  Services.prefs.clearUserPref("mail.setup.loglevel");
});

add_task(async function test_re_test_config() {
  // Opening multiple windows in the same run seems to require letting the stack
  // unwind before opening the next one, so do that here.
  let tab = await openAccountSetup();
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

  // Click "continue" button.
  let nextButton = tabDocument.getElementById("continueButton");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, tab.browser.contentWindow);

  // Wait for 'edit' button to be enabled.
  let editButton = tabDocument.getElementById("manualConfigButton");
  await BrowserTestUtils.waitForCondition(
    () => !editButton.hidden && !editButton.disabled,
    "Timeout waiting for edit button to become visible and active"
  );

  EventUtils.synthesizeMouseAtCenter(editButton, {}, tab.browser.contentWindow);

  // Click "re-test" button.
  let testButton = tabDocument.getElementById("reTestButton");
  EventUtils.synthesizeMouseAtCenter(testButton, {}, tab.browser.contentWindow);

  await BrowserTestUtils.waitForCondition(
    () => !testButton.disabled,
    "Timeout waiting for re-test button to become active"
  );

  // There used to be a "start over" button (line commented out below). Now just
  // changing the value of the email field does the trick.
  tabDocument.getElementById("realname").focus();
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);
  tabDocument.getElementById("email").focus();
  input_value(mc, user.altEmail);
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);

  // Wait for the "continue" button to be back, which means we're back to the
  // original state.
  await BrowserTestUtils.waitForCondition(
    () => !nextButton.hidden,
    "Timeout waiting for continue button to become visible"
  );

  EventUtils.synthesizeMouseAtCenter(nextButton, {}, tab.browser.contentWindow);

  // Previously, we'd switched to the manual editing state. Now we've started
  // over, we should make sure the information is presented back in its original
  // "automatic" mode.
  Assert.ok(
    tabDocument.getElementById("manualConfigArea").hidden,
    "We're not back to the original state!"
  );

  mc.window.document.getElementById("tabmail").closeTab(tab);
});
