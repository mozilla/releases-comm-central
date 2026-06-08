/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubFormHelperText.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_userInvalidErrorMessagesSupersedeHelperText() {
  const form = browser.contentWindow.document.getElementById("helperTextForm");
  const input =
    browser.contentWindow.document.getElementById("userInvalidInput");
  const helper =
    browser.contentWindow.document.getElementById("userInvalidHelper");
  const error =
    browser.contentWindow.document.getElementById("userInvalidError");

  Assert.ok(
    BrowserTestUtils.isVisible(helper),
    "Helper text should be visible on load"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(error),
    "Error text should be hidden on load"
  );

  await SimpleTest.promiseFocus(browser.contentWindow);
  input.focus();
  EventUtils.sendString("a", browser.contentWindow);
  EventUtils.synthesizeKey("KEY_Backspace", {}, browser.contentWindow);
  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);
  form.reportValidity();

  Assert.ok(
    BrowserTestUtils.isHidden(helper),
    "Helper text should be hidden with input error"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(error),
    "Error text should be visible with input error"
  );

  input.focus();
  EventUtils.sendString("a", browser.contentWindow);
  form.reportValidity();

  Assert.ok(
    BrowserTestUtils.isVisible(helper),
    "Helper text should be visible after clearing :user-invalid form input error: "
  );
  Assert.ok(
    BrowserTestUtils.isHidden(error),
    "Error text should be hidden after clearing :user-invalid form input error"
  );
});

add_task(async function test_manualInvalidErrorMessagesSupersedeHelperText() {
  const input = browser.contentWindow.document.getElementById("manualInput");
  const helper = browser.contentWindow.document.getElementById("manualHelper");
  const error = browser.contentWindow.document.getElementById("manualError");

  Assert.ok(
    BrowserTestUtils.isVisible(helper),
    "Helper text should be visible on load"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(error),
    "Error text should be hidden on load"
  );

  input.value = "";

  Assert.ok(
    BrowserTestUtils.isHidden(helper),
    "Helper text should be hidden on form input error"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(error),
    "Error text should be visible on form input error"
  );

  input.value = "mail.example.com";

  Assert.ok(
    BrowserTestUtils.isVisible(helper),
    "Helper text should be visible after clearing form input error"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(error),
    "Error text should be hidden after clearing form input error"
  );
});

add_task(function test_warningErrorMessagesSupersedeHelperText() {
  const helper = browser.contentWindow.document.getElementById("warningHelper");
  const error = browser.contentWindow.document.getElementById("warningError");

  Assert.ok(
    BrowserTestUtils.isHidden(helper),
    "Helper text should be hidden when warning error text is visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(error),
    "Warning error text should be visible"
  );
});
