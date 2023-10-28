/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { openAccountSetup } = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { input_value, delete_all_existing } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
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

  const url =
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
  const tab = await openAccountSetup();
  const tabDocument = tab.browser.contentWindow.document;
  // Input user's account information
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("realname"),
    {},
    tab.browser.contentWindow
  );

  if (tabDocument.getElementById("realname").value) {
    // If any realname is already filled, clear it out, we have our own.
    delete_all_existing(window, tabDocument.getElementById("realname"));
  }
  input_value(window, user.name);
  EventUtils.synthesizeKey("VK_TAB", {}, window);
  input_value(window, user.email);

  // Click "continue" button.
  const nextButton = tabDocument.getElementById("continueButton");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, tab.browser.contentWindow);

  // Wait for 'edit' button to be enabled.
  const editButton = tabDocument.getElementById("manualConfigButton");
  await BrowserTestUtils.waitForCondition(
    () => !editButton.hidden && !editButton.disabled,
    "Timeout waiting for edit button to become visible and active"
  );

  EventUtils.synthesizeMouseAtCenter(editButton, {}, tab.browser.contentWindow);

  // Click "re-test" button.
  const testButton = tabDocument.getElementById("reTestButton");
  EventUtils.synthesizeMouseAtCenter(testButton, {}, tab.browser.contentWindow);

  await BrowserTestUtils.waitForCondition(
    () => !testButton.disabled,
    "Timeout waiting for re-test button to become active"
  );

  // There used to be a "start over" button (line commented out below). Now just
  // changing the value of the email field does the trick.
  tabDocument.getElementById("realname").focus();
  EventUtils.synthesizeKey("VK_TAB", {}, window);
  tabDocument.getElementById("email").focus();
  input_value(window, user.altEmail);
  EventUtils.synthesizeKey("VK_TAB", {}, window);

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

  document.getElementById("tabmail").closeTab(tab);
});
