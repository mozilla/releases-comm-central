/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the richlistbox in the manager for attachment storage
 * services
 */

"use strict";

var MODULE_NAME = 'test-cloudfile-manager';

var RELATIVE_ROOT = '../shared-modules';
var MODULE_REQUIRES = ["folder-display-helpers",
                       "pref-window-helpers",
                       "content-tab-helpers",
                       "cloudfile-helpers",
                       "window-helpers"];

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

var kTestAccountType = "mock";
var kRootURL = collector.addHttpResource("../cloudfile/html", "");
var kSettingsWithLink = kRootURL + "settings-with-link.xhtml";

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  gMockCloudfileManager.register(kTestAccountType, {
    managementURL: kSettingsWithLink,
  });

  // Let's set up a few dummy accounts;
  create_dummy_account("someKey1", kTestAccountType,
                       "carl's Account");
  create_dummy_account("someKey2", kTestAccountType,
                       "Amber's Account");
  create_dummy_account("someKey3", kTestAccountType,
                       "alice's Account");
  create_dummy_account("someKey4", kTestAccountType,
                       "Bob's Account");
}

function teardownModule(module) {
  Services.prefs.QueryInterface(Ci.nsIPrefBranch)
          .deleteBranch("mail.cloud_files.accounts");
  gMockCloudfileManager.unregister(kTestAccountType);
}

function create_dummy_account(aKey, aType, aDisplayName) {
  Services.prefs.setCharPref("mail.cloud_files.accounts." + aKey + ".type",
                             aType);

  Services.prefs.setCharPref("mail.cloud_files.accounts." + aKey + ".displayName",
                             aDisplayName);
}

function destroy_account(aKey) {
  Services.prefs.clearUserPref("mail.cloud_files.accounts." + aKey);
}

/**
 * Tests that we load the accounts and display them in the
 * account richlistbox in the correct order (by displayName,
 * case-insensitive)
 */
function test_load_accounts_and_properly_order() {
  let prefTab = open_pref_tab("paneApplications");
  let tabbox = content_tab_e(prefTab, "attachmentPrefs");
  tabbox.selectedIndex = 1;

  let richList = content_tab_e(prefTab, "cloudFileView");
  assert_equals(4, richList.itemCount,
                "Should be displaying 4 accounts");

  // Since we're sorting alphabetically by the displayName,
  // case-insensitive, the items should be ordered with the
  // following accountKeys:
  //
  // someKey3, someKey2, someKey4, someKey1
  const kExpected = ["someKey3", "someKey2", "someKey4",
                     "someKey1"];

  for (let [index, expectedKey] of kExpected.entries()) {
    let item = richList.getItemAtIndex(index);
    assert_equals(expectedKey, item.value,
                  "The account list is out of order");
  }

  close_pref_tab(prefTab);
}

/**
 * Tests that a link in the management pane is loaded in
 * a browser and not in the management pane.
 */
function test_external_link() {
  gMockExtProtSvcReg.register();

  let prefTab = open_pref_tab("paneApplications");
  let tabbox = content_tab_e(prefTab, "attachmentPrefs");
  tabbox.selectedIndex = 1;

  let iframe = content_tab_e(prefTab, "cloudFileSettingsWrapper").firstElementChild;
  wait_for_frame_load(iframe, kSettingsWithLink);
  mc.click(new elementslib.ID(iframe.contentDocument, "a"));

  let targetHref = "https://www.example.com/";
  mc.waitFor(
    () => gMockExtProtSvc.urlLoaded(targetHref),
    `Timed out waiting for the link ${targetHref} to be opened in the default browser.`
  );
  close_pref_tab(prefTab);

  gMockExtProtSvcReg.unregister();
}
test_external_link.__force_skip__ = true; // Bug 1524450
