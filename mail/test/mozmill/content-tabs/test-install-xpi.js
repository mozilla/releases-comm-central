/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var MODULE_NAME = 'test-install-xpi';

var RELATIVE_ROOT = '../shared-modules';
var MODULE_REQUIRES = ['window-helpers', 'folder-display-helpers',
                       'content-tab-helpers'];

var controller = {};
ChromeUtils.import("chrome://mozmill/content/modules/controller.js", controller);
var elib = {};
ChromeUtils.import("chrome://mozmill/content/modules/elementslib.js", elib);
var mozmill = {};
ChromeUtils.import("chrome://mozmill/content/modules/mozmill.js", mozmill);
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

// RELATIVE_ROOT messes with the collector, so we have to bring the path back
// so we get the right path for the resources.
var url = collector.addHttpResource('../content-tabs/html', 'content-tabs');

var gDocument;
var gNewTab;

var setupModule = function (module) {
  let wh = collector.getModule('window-helpers');
  wh.installInto(module);
  let fdh = collector.getModule('folder-display-helpers');
  fdh.installInto(module);
  let cth = collector.getModule('content-tab-helpers');
  cth.installInto(module);

  gDocument = mc.window.document;
  gNewTab = open_content_tab_with_url(url + "installxpi.html",
      "specialTabs.siteClickHandler(event, new RegExp('^" + url + "'));");
};

var teardownModule = function(module) {
  mc.tabmail.closeTab(gNewTab);
};

function waitForNotification(id, buttonToClick, callback) {
  let path = `
    /id("messengerWindow")/id("mainPopupSet")/id("notification-popup")/id("${id}-notification")
  `.trim();
  let notification = new elib.Lookup(gDocument, path);
  let button = new elib.Lookup(gDocument, `${path}/anon({"anonid":"${buttonToClick}"})`);

  mc.waitForElement(notification);
  // Give the UI some time to settle.
  mc.sleep(500);
  if (callback) {
    callback();
  }
  mc.click(button);
  mc.waitForElementNotPresent(notification);
}

function test_install_corrupt_xpi() {
  // This install with give us a corrupt xpi warning.
  mc.click(content_tab_eid(gNewTab, "corruptlink"));
  waitForNotification("addon-install-blocked", "button");
  waitForNotification("addon-install-failed", "button");
}

function test_install_xpi_offer() {
  mc.click(content_tab_eid(gNewTab, "installlink"));
  waitForNotification("addon-install-blocked", "button");
  waitForNotification("addon-install-confirmation", "secondarybutton");
}

function test_xpinstall_disabled() {
  Services.prefs.setBoolPref("xpinstall.enabled", false);

  // Try installation again - this time we'll get an install has been disabled message.
  mc.click(content_tab_eid(gNewTab, "installlink"));
  waitForNotification("xpinstall-disabled", "secondarybutton");

  Services.prefs.clearUserPref("xpinstall.enabled");
}

function test_xpinstall_actually_install() {
  mc.click(content_tab_eid(gNewTab, "installlink"));
  waitForNotification("addon-install-blocked", "button");
  waitForNotification("addon-install-confirmation", "button");
  waitForNotification("addon-installed", "button");
}

function test_xpinstall_webext_actually_install() {
  mc.click(content_tab_eid(gNewTab, "installwebextlink"));
  waitForNotification("addon-install-blocked", "button");
  waitForNotification("addon-webext-permissions", "button", () => {
    let intro = new elib.ID(gDocument, "addon-webext-perm-intro");
    mc.assertNotDOMProperty(intro, "hidden", "true");
    let permissionList = new elib.ID(gDocument, "addon-webext-perm-list");
    mc.assertNotDOMProperty(permissionList, "hidden", "true");
    mc.assert(() => permissionList.getNode().childElementCount == 1);
  });
  waitForNotification("addon-installed", "button");
}
