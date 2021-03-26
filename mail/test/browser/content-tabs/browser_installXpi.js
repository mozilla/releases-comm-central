/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);

var { open_content_tab_with_url } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-tabs/html/";

var gDocument;
var gNewTab;

add_task(function setupModule(module) {
  gDocument = mc.window.document;
  gNewTab = open_content_tab_with_url(url + "installxpi.html");
});

var teardownModule = function(module) {
  mc.tabmail.closeTab(gNewTab);
};

function waitForNotification(id, buttonToClickSelector, callback) {
  let notificationSelector = `#notification-popup > #${id}-notification`;
  let notification;
  mc.waitFor(() => {
    notification = gDocument.querySelector(notificationSelector);
    return notification && !notification.hidden;
  });
  mc.sleep(500);
  if (callback) {
    callback();
  }
  if (buttonToClickSelector) {
    let button = notification.querySelector(buttonToClickSelector);
    mc.click(button);
  }
  mc.waitFor(() => !gDocument.querySelector(notificationSelector));
}

add_task(async function test_install_corrupt_xpi() {
  // This install with give us a corrupt xpi warning.
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#corruptlink",
    {},
    gNewTab.browser
  );
  waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  waitForNotification(
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
  waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  waitForNotification(
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
  waitForNotification(
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
  waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  waitForNotification(
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
  waitForNotification(
    "addon-install-blocked",
    ".popup-notification-primary-button"
  );
  waitForNotification("addon-progress");
  waitForNotification(
    "addon-webext-permissions",
    ".popup-notification-primary-button",
    () => {
      let permission = gDocument.getElementById(
        "addon-webext-perm-single-entry"
      );
      Assert.ok(!permission.hidden);
    }
  );
  waitForNotification("addon-installed", ".popup-notification-primary-button");

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
