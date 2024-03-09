/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { open_content_tab_with_url } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ContentTabHelpers.sys.mjs"
);

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-tabs/html/";

var gDocument;
var gNewTab;

add_setup(async function () {
  gDocument = document;
  gNewTab = await open_content_tab_with_url(url + "installxpi.html");
});

registerCleanupFunction(function () {
  document.getElementById("tabmail").closeTab(gNewTab);
});

async function waitForNotification(id, buttonToClickSelector, callback) {
  const notificationSelector = `#notification-popup > #${id}-notification`;
  let notification;
  await TestUtils.waitForCondition(() => {
    notification = gDocument.querySelector(notificationSelector);
    return notification && !notification.hidden;
  });
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  if (callback) {
    callback();
  }
  if (buttonToClickSelector) {
    const button = notification.querySelector(buttonToClickSelector);
    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, window);
  }
  await TestUtils.waitForCondition(
    () => !gDocument.querySelector(notificationSelector)
  );
}

add_task(async function test_install_corrupt_xpi() {
  // This install with give us a corrupt xpi warning.
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#corruptlink",
    {},
    gNewTab.browser
  );
  await waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  await waitForNotification(
    "addon-install-failed",
    ".popup-notification-primary-button"
  );
});

add_task(async function test_install_xpi_offer() {
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#installlink",
    {},
    gNewTab.browser
  );
  await waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  await waitForNotification(
    "addon-install-failed",
    ".popup-notification-primary-button"
  );
});

add_task(async function test_xpinstall_disabled() {
  Services.prefs.setBoolPref("xpinstall.enabled", false);

  // Try installation again - this time we'll get an install has been disabled message.
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#installlink",
    {},
    gNewTab.browser
  );
  await waitForNotification(
    "xpinstall-disabled",
    ".popup-notification-secondary-button"
  );

  Services.prefs.clearUserPref("xpinstall.enabled");
});

add_task(async function test_xpinstall_actually_install() {
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#installlink",
    {},
    gNewTab.browser
  );
  await waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  await waitForNotification(
    "addon-install-failed",
    ".popup-notification-primary-button"
  );
});

add_task(async function test_xpinstall_webext_actually_install() {
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#installwebextlink",
    {},
    gNewTab.browser
  );
  await waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  await waitForNotification("addon-progress");
  await waitForNotification(
    "addon-webext-permissions",
    ".popup-notification-primary-button",
    () => {
      const permission = gDocument.getElementById(
        "addon-webext-perm-single-entry"
      );
      Assert.ok(!permission.hidden);
    }
  );
  await waitForNotification(
    "addon-installed",
    ".popup-notification-primary-button"
  );

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
