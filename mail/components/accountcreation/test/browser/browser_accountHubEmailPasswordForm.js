/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let subview;
let password;
let rememberPassword;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailPasswordForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "email-password-form"
  );
  password = subview.querySelector("#password");
  rememberPassword = subview.querySelector("#rememberPassword");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  subview.setState();
  Assert.equal(
    password,
    subview.ownerDocument.activeElement,
    "Password input should be focused"
  );
  Assert.equal(password.value, "", "Password input value should be empty");

  // With the remember password pref not set, the remember password input
  // should be disabled and unchecked.
  Assert.ok(rememberPassword.disabled, "Remember password should be disabled");
  Assert.ok(!rememberPassword.checked, "Remember password should be unchecked");
});

add_task(async function test_captureState() {
  subview.setState();
  const validUpdatedInput = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => password.value === "test"
  );
  EventUtils.sendString("test", subview.ownerGlobal);
  const validUpdatedEvent = await validUpdatedInput;

  Assert.ok(
    validUpdatedEvent.detail.completed,
    "Event should indicate the form is complete"
  );

  // Because the remember password pref isn't set with this test, the
  // rememberPassword property should be set to false.
  Assert.deepEqual(
    subview.captureState(),
    {
      password: "test",
      rememberPassword: false,
    },
    "Should get the entered data in the captured state"
  );
});

add_task(async function test_captureStateWithRememberPasswordPref() {
  const previousRememberSignonsValue = Services.prefs.getBoolPref(
    "signon.rememberSignons",
    false
  );
  Services.prefs.setBoolPref("signon.rememberSignons", true);
  subview.setState();
  Assert.ok(!rememberPassword.disabled, "Remember password should be enabled");
  Assert.ok(rememberPassword.checked, "Remember password should be checked");

  const validUpdatedInput = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => password.value === "test"
  );
  EventUtils.sendString("test", subview.ownerGlobal);
  const validUpdatedEvent = await validUpdatedInput;

  Assert.ok(
    validUpdatedEvent.detail.completed,
    "Event should indicate the form is complete"
  );

  Assert.deepEqual(
    subview.captureState(),
    {
      password: "test",
      rememberPassword: true,
    },
    "Should get the entered data in the captured state"
  );
  Services.prefs.setBoolPref(
    "signon.rememberSignons",
    previousRememberSignonsValue
  );
});
