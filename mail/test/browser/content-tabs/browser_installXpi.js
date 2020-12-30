/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);
var elib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);

var { content_tab_eid, open_content_tab_with_url } = ChromeUtils.import(
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
  gNewTab = open_content_tab_with_url(
    url + "installxpi.html",
    "specialTabs.siteClickHandler(event, new RegExp('^" + url + "'));"
  );
});

var teardownModule = function(module) {
  mc.tabmail.closeTab(gNewTab);
};

function waitForNotification(id, buttonToClickSelector, callback) {
  let path = `
    /id("messengerWindow")/{"class":"body"}/id("mainPopupSet")/id("notification-popup")/id("${id}-notification")
  `.trim();
  let notification = new elib.Lookup(gDocument, path);
  mc.waitForElement(notification);
  mc.waitFor(() => !gDocument.querySelector(`#${id}-notification`).hidden);
  // Give the UI some time to settle.
  mc.sleep(500);
  if (callback) {
    callback();
  }
  if (buttonToClickSelector) {
    let button = gDocument.querySelector(
      `#${id}-notification ${buttonToClickSelector}`
    );
    mc.click(new elib.Elem(button));
  }
  mc.waitForElementNotPresent(notification, 15000);
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
      let intro = new elib.ID(gDocument, "addon-webext-perm-intro");
      Assert.ok(intro.getNode().getAttribute("hidden") != "true");
      let permissionList = new elib.ID(gDocument, "addon-webext-perm-list");
      Assert.ok(permissionList.getNode().getAttribute("hidden") != "true");
      Assert.equal(permissionList.getNode().childElementCount, 1);
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
