/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the richlistbox in the manager for attachment storage
 * services
 */

"use strict";

var elementslib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);
var mozmill = ChromeUtils.import(
  "resource://testing-common/mozmill/mozmill.jsm"
);

var { gMockCloudfileManager } = ChromeUtils.import(
  "resource://testing-common/mozmill/CloudfileHelpers.jsm"
);
var {
  content_tab_e,
  content_tab_eid,
  gMockExtProtSvc,
  gMockExtProtSvcReg,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_pref_tab, open_pref_tab } = ChromeUtils.import(
  "resource://testing-common/mozmill/PrefTabHelpers.jsm"
);
var { wait_for_frame_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var controller = mozmill.getMail3PaneController();
var kTestAccountType = "mock";
var kSettingsWithLink =
  "chrome://mochitests/content/browser/comm/mail/test/browser/cloudfile/html/settings-with-link.xhtml";

add_task(function setupModule(module) {
  gMockCloudfileManager.register(kTestAccountType, {
    managementURL: kSettingsWithLink,
  });

  // Let's set up a few dummy accounts;
  create_dummy_account("someKey1", kTestAccountType, "carl's Account");
  create_dummy_account("someKey2", kTestAccountType, "Amber's Account");
  create_dummy_account("someKey3", kTestAccountType, "alice's Account");
  create_dummy_account("someKey4", kTestAccountType, "Bob's Account");
});

registerCleanupFunction(function teardownModule(module) {
  Services.prefs
    .QueryInterface(Ci.nsIPrefBranch)
    .deleteBranch("mail.cloud_files.accounts");
  gMockCloudfileManager.unregister(kTestAccountType);

  let tabmail = document.getElementById("tabmail");
  if (tabmail.tabModes.preferencesTab.tabs.length == 1) {
    tabmail.closeTab(tabmail.tabModes.preferencesTab.tabs[0]);
  }
});

function create_dummy_account(aKey, aType, aDisplayName) {
  Services.prefs.setCharPref(
    "mail.cloud_files.accounts." + aKey + ".type",
    aType
  );

  Services.prefs.setCharPref(
    "mail.cloud_files.accounts." + aKey + ".displayName",
    aDisplayName
  );
}

function destroy_account(aKey) {
  Services.prefs.clearUserPref("mail.cloud_files.accounts." + aKey);
}

/**
 * Tests that we load the accounts and display them in the
 * account richlistbox in the correct order (by displayName,
 * case-insensitive)
 */
add_task(function test_load_accounts_and_properly_order() {
  let prefTab = open_pref_tab("paneCompose", "compositionAttachmentsCategory");
  mc.sleep();

  let richList = content_tab_e(prefTab, "cloudFileView");
  Assert.equal(4, richList.itemCount, "Should be displaying 4 accounts");

  // Since we're sorting alphabetically by the displayName,
  // case-insensitive, the items should be ordered with the
  // following accountKeys:
  //
  // someKey3, someKey2, someKey4, someKey1
  const kExpected = ["someKey3", "someKey2", "someKey4", "someKey1"];

  for (let [index, expectedKey] of kExpected.entries()) {
    let item = richList.getItemAtIndex(index);
    Assert.equal(expectedKey, item.value, "The account list is out of order");
  }

  close_pref_tab(prefTab);
});

/**
 * Tests that a link in the management pane is loaded in
 * a browser and not in the management pane.
 */
add_task(function test_external_link() {
  gMockExtProtSvcReg.register();

  let prefTab = open_pref_tab("paneCompose", "compositionAttachmentsCategory");
  mc.sleep();
  mc.click(content_tab_eid(prefTab, "cloudFileView"));
  mc.click(content_tab_eid(prefTab, "cloudFileView"), 5, 5);

  let iframe;
  mc.waitFor(() => {
    iframe = content_tab_e(prefTab, "cloudFileSettingsWrapper")
      .firstElementChild;
    return !!iframe;
  });
  wait_for_frame_load(iframe, kSettingsWithLink + "?accountId=someKey3");
  mc.click(new elementslib.ID(iframe.contentDocument, "a"));

  let targetHref = "https://www.example.com/";
  mc.waitFor(
    () => gMockExtProtSvc.urlLoaded(targetHref),
    `Timed out waiting for the link ${targetHref} to be opened in the default browser.`
  );
  close_pref_tab(prefTab);

  gMockExtProtSvcReg.unregister();
});
