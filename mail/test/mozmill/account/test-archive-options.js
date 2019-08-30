/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-archive-options";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
];

var mozmill = ChromeUtils.import(
  "chrome://mozmill/content/modules/mozmill.jsm"
);
var controller = ChromeUtils.import(
  "chrome://mozmill/content/modules/controller.jsm"
);
var elib = ChromeUtils.import(
  "chrome://mozmill/content/modules/elementslib.jsm"
);

var defaultIdentity;

function setupModule(module) {
  let wh = collector.getModule("window-helpers");
  wh.installInto(module);
  let fdh = collector.getModule("folder-display-helpers");
  fdh.installInto(module);
  let amh = collector.getModule("account-manager-helpers");
  amh.installInto(module);

  defaultIdentity = MailServices.accounts.defaultAccount.defaultIdentity;
}

/**
 * Check that the archive options button is enabled or disabled appropriately.
 *
 * @param amc          the account options controller
 * @param aAccountKey  key of the account the check
 * @param isEnabled    true if the button should be enabled, false otherwise
 */
function subtest_check_archive_options_enabled(amc, aAccountKey, isEnabled) {
  let accountRow = get_account_tree_row(aAccountKey, "am-copies.xul", amc);
  click_account_tree_row(amc, accountRow);

  let iframe = amc.window.document.getElementById("contentFrame");
  let button = iframe.contentDocument.getElementById("archiveHierarchyButton");

  assert_equals(button.disabled, !isEnabled);
}

function test_archive_options_enabled() {
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
  open_advanced_settings(function(amc) {
    subtest_check_archive_options_enabled(amc, account.key, true);
  });
  open_advanced_settings(function(amc) {
    subtest_check_archive_options_enabled(amc, defaultAccount.key, true);
  });

  imapServer.isGMailServer = true;
  open_advanced_settings(function(amc) {
    subtest_check_archive_options_enabled(amc, account.key, false);
  });
  open_advanced_settings(function(amc) {
    subtest_check_archive_options_enabled(amc, defaultAccount.key, false);
  });

  MailServices.accounts.removeAccount(account);
}

function subtest_initial_state(identity) {
  plan_for_modal_dialog("archive-options", function(ac) {
    assert_equals(
      ac.e("archiveGranularity").selectedIndex,
      identity.archiveGranularity
    );
    assert_equals(
      ac.e("archiveKeepFolderStructure").checked,
      identity.archiveKeepFolderStructure
    );
  });
  mc.window.openDialog(
    "chrome://messenger/content/am-archiveoptions.xul",
    "",
    "centerscreen,chrome,modal,titlebar,resizable=yes",
    identity
  );
  wait_for_modal_dialog("archive-options");
}

function test_open_archive_options() {
  for (let granularity = 0; granularity < 3; granularity++) {
    defaultIdentity.archiveGranularity = granularity;
    for (let kfs = 0; kfs < 2; kfs++) {
      defaultIdentity.archiveKeepFolderStructure = kfs;
      subtest_initial_state(defaultIdentity);
    }
  }
}

function subtest_save_state(identity, granularity, kfs) {
  plan_for_modal_dialog("archive-options", function(ac) {
    ac.e("archiveGranularity").selectedIndex = granularity;
    ac.e("archiveKeepFolderStructure").checked = kfs;
    ac.keypress(null, "VK_RETURN", {});
  });
  mc.window.openDialog(
    "chrome://messenger/content/am-archiveoptions.xul",
    "",
    "centerscreen,chrome,modal,titlebar,resizable=yes",
    identity
  );
  wait_for_modal_dialog("archive-options");
}

function test_save_archive_options() {
  defaultIdentity.archiveGranularity = 0;
  defaultIdentity.archiveKeepFolderStructure = false;
  subtest_save_state(defaultIdentity, 1, true);

  assert_equals(defaultIdentity.archiveGranularity, 1);
  assert_equals(defaultIdentity.archiveKeepFolderStructure, true);
}

function subtest_check_archive_enabled(amc, archiveEnabled) {
  defaultIdentity.archiveEnabled = archiveEnabled;

  click_account_tree_row(amc, 2);

  let iframe = amc.window.document.getElementById("contentFrame");
  let checkbox = iframe.contentDocument.getElementById(
    "identity.archiveEnabled"
  );

  assert_equals(checkbox.checked, archiveEnabled);
}

function test_archive_enabled() {
  open_advanced_settings(function(amc) {
    subtest_check_archive_enabled(amc, true);
  });

  open_advanced_settings(function(amc) {
    subtest_check_archive_enabled(amc, false);
  });
}

function subtest_disable_archive(amc) {
  defaultIdentity.archiveEnabled = true;
  click_account_tree_row(amc, 2);

  let iframe = amc.window.document.getElementById("contentFrame");
  let checkbox = iframe.contentDocument.getElementById(
    "identity.archiveEnabled"
  );

  assert_true(checkbox.checked);
  assert_false(checkbox.disabled);
  amc.click(new elib.Elem(checkbox));
  utils.waitFor(
    () => !checkbox.checked,
    "Archive checkbox didn't toggle to unchecked"
  );
  plan_for_window_close(amc);
  amc.window.document.getElementById("accountManager").acceptDialog();
  wait_for_window_close();

  assert_false(defaultIdentity.archiveEnabled);
}

function test_disable_archive() {
  open_advanced_settings(subtest_disable_archive);
}
// Disable test on Windows since for some yet unknown reason clicking the checkbox
// doesn't have the desired result. See bug 1461173 for details.
test_disable_archive.EXCLUDED_PLATFORMS = ["winnt"];
