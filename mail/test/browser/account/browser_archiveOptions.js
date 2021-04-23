/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var {
  click_account_tree_row,
  get_account_tree_row,
  open_advanced_settings,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  plan_for_modal_dialog,
  plan_for_window_close,
  wait_for_modal_dialog,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var defaultIdentity;

add_task(function setupModule(module) {
  defaultIdentity = MailServices.accounts.defaultAccount.defaultIdentity;
});

/**
 * Check that the archive options button is enabled or disabled appropriately.
 *
 * @param {Object} tab - The account manager tab.
 * @param {Number} accountKey - Key of the account the check.
 * @param {boolean} isEnabled - True if the button should be enabled, false otherwise.
 */
function subtest_check_archive_options_enabled(tab, accountKey, isEnabled) {
  let accountRow = get_account_tree_row(accountKey, "am-copies.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  let iframe = tab.browser.contentWindow.document.getElementById(
    "contentFrame"
  );
  let button = iframe.contentDocument.getElementById("archiveHierarchyButton");

  Assert.equal(button.disabled, !isEnabled);
}

add_task(async function test_archive_options_enabled() {
  let defaultAccount = MailServices.accounts.defaultAccount;
  // First, create an IMAP server
  let imapServer = MailServices.accounts
    .createIncomingServer("nobody", "example.com", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@example.com";

  let account = MailServices.accounts.createAccount();
  account.incomingServer = imapServer;
  account.addIdentity(identity);

  // Then test that the archive options button is enabled/disabled appropriately

  // Let the default identity archive to our IMAP folder, to ensure that the
  // archive folder's server is used to determine the enabled/disabled state
  // of the "archive options" button, *not* the incoming server for that
  // identity.
  defaultIdentity.archiveFolder = imapServer.rootFolder.URI;

  imapServer.isGMailServer = false;
  await open_advanced_settings(function(tab) {
    subtest_check_archive_options_enabled(tab, account.key, true);
  });
  await open_advanced_settings(function(tab) {
    subtest_check_archive_options_enabled(tab, defaultAccount.key, true);
  });

  imapServer.isGMailServer = true;
  await open_advanced_settings(function(tab) {
    subtest_check_archive_options_enabled(tab, account.key, false);
  });
  await open_advanced_settings(function(tab) {
    subtest_check_archive_options_enabled(tab, defaultAccount.key, false);
  });

  MailServices.accounts.removeAccount(account);
});

function subtest_initial_state(identity) {
  plan_for_modal_dialog("archiveOptions", function(ac) {
    Assert.equal(
      ac.e("archiveGranularity").selectedIndex,
      identity.archiveGranularity
    );
    Assert.equal(
      ac.e("archiveKeepFolderStructure").checked,
      identity.archiveKeepFolderStructure
    );
  });
  mc.window.openDialog(
    "chrome://messenger/content/am-archiveoptions.xhtml",
    "",
    "centerscreen,chrome,modal,titlebar,resizable=yes",
    { identity }
  );
  wait_for_modal_dialog("archiveOptions");
}

add_task(function test_open_archive_options() {
  for (let granularity = 0; granularity < 3; granularity++) {
    defaultIdentity.archiveGranularity = granularity;
    for (let kfs = 0; kfs < 2; kfs++) {
      defaultIdentity.archiveKeepFolderStructure = kfs;
      subtest_initial_state(defaultIdentity);
    }
  }
});

function subtest_save_state(identity, granularity, kfs) {
  plan_for_modal_dialog("archiveOptions", function(ac) {
    ac.e("archiveGranularity").selectedIndex = granularity;
    ac.e("archiveKeepFolderStructure").checked = kfs;
    EventUtils.synthesizeKey("VK_RETURN", {}, ac.window);
    ac.window.document.querySelector("dialog").acceptDialog();
  });
  mc.window.openDialog(
    "chrome://messenger/content/am-archiveoptions.xhtml",
    "",
    "centerscreen,chrome,modal,titlebar,resizable=yes",
    { identity }
  );
  wait_for_modal_dialog("archiveOptions");
}

add_task(function test_save_archive_options() {
  defaultIdentity.archiveGranularity = 0;
  defaultIdentity.archiveKeepFolderStructure = false;
  subtest_save_state(defaultIdentity, 1, true);

  Assert.equal(defaultIdentity.archiveGranularity, 1);
  Assert.equal(defaultIdentity.archiveKeepFolderStructure, true);
});

function subtest_check_archive_enabled(tab, archiveEnabled) {
  defaultIdentity.archiveEnabled = archiveEnabled;

  click_account_tree_row(tab, 2);

  let iframe = tab.browser.contentWindow.document.getElementById(
    "contentFrame"
  );
  let checkbox = iframe.contentDocument.getElementById(
    "identity.archiveEnabled"
  );

  Assert.equal(checkbox.checked, archiveEnabled);
}

add_task(async function test_archive_enabled() {
  await open_advanced_settings(function(amc) {
    subtest_check_archive_enabled(amc, true);
  });

  await open_advanced_settings(function(amc) {
    subtest_check_archive_enabled(amc, false);
  });
});

function subtest_disable_archive(tab) {
  defaultIdentity.archiveEnabled = true;
  click_account_tree_row(tab, 2);

  let iframe = tab.browser.contentWindow.document.getElementById(
    "contentFrame"
  );
  let checkbox = iframe.contentDocument.getElementById(
    "identity.archiveEnabled"
  );

  Assert.ok(checkbox.checked);
  Assert.ok(!checkbox.disabled);
  mc.click(checkbox);
  utils.waitFor(
    () => !checkbox.checked,
    "Archive checkbox didn't toggle to unchecked"
  );

  Assert.ok(!defaultIdentity.archiveEnabled);
}

add_task(async function test_disable_archive() {
  await open_advanced_settings(subtest_disable_archive);
});
