/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */
/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-pref-window-helpers.js */

var MODULE_NAME = "test-archive-options";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
  "content-tab-helpers",
  "pref-window-helpers",
];

var mozmill = ChromeUtils.import("chrome://mozmill/content/modules/mozmill.jsm");
var controller = ChromeUtils.import("chrome://mozmill/content/modules/controller.jsm");
var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

var defaultIdentity;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  defaultIdentity = MailServices.accounts.defaultAccount.defaultIdentity;
}

/**
 * Check that the archive options button is enabled or disabled appropriately.
 *
 * @param aAccountKey  key of the account the check
 * @param isEnabled    true if the button should be enabled, false otherwise
 */
function subtest_check_archive_options_enabled(aAccountKey, isEnabled) {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(aAccountKey, "am-copies.xul", tab);
  click_account_tree_row(tab, accountRow);

  let iframe = content_tab_e(tab, "contentFrame");
  let button = iframe.contentDocument.getElementById("archiveHierarchyButton");

  assert_equals(button.disabled, !isEnabled);
  close_advanced_settings(tab);
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
  subtest_check_archive_options_enabled(account.key, true);
  subtest_check_archive_options_enabled(defaultAccount.key, true);

  imapServer.isGMailServer = true;
  subtest_check_archive_options_enabled(account.key, false);
  subtest_check_archive_options_enabled(defaultAccount.key, false);

  MailServices.accounts.removeAccount(account);
}

function subtest_initial_state(identity) {
  plan_for_modal_dialog("archive-options", function(ac) {
    assert_equals(ac.e("archiveGranularity").selectedIndex,
                  identity.archiveGranularity);
    assert_equals(ac.e("archiveKeepFolderStructure").checked,
                  identity.archiveKeepFolderStructure);
  });
  mc.window.openDialog("chrome://messenger/content/am-archiveoptions.xul",
                       "", "centerscreen,chrome,modal,titlebar,resizable=yes",
                       identity);
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
  mc.window.openDialog("chrome://messenger/content/am-archiveoptions.xul",
                       "", "centerscreen,chrome,modal,titlebar,resizable=yes",
                       identity);
  wait_for_modal_dialog("archive-options");
}

function test_save_archive_options() {
  defaultIdentity.archiveGranularity = 0;
  defaultIdentity.archiveKeepFolderStructure = false;
  subtest_save_state(defaultIdentity, 1, true);

  assert_equals(defaultIdentity.archiveGranularity, 1);
  assert_equals(defaultIdentity.archiveKeepFolderStructure, true);
}

function subtest_check_archive_enabled(archiveEnabled) {
  let tab = open_advanced_settings();
  defaultIdentity.archiveEnabled = archiveEnabled;

  click_account_tree_row(tab, 2);

  let iframe = content_tab_e(tab, "contentFrame");
  let checkbox = iframe.contentDocument.getElementById("identity.archiveEnabled");
  assert_equals(checkbox.checked, archiveEnabled);
  close_advanced_settings(tab);
}

test_archive_enabled.__force_skip__ = true; // disabled temporarily, bug 1096006
function test_archive_enabled() {
  subtest_check_archive_enabled(true);

  subtest_check_archive_enabled(false);
}

test_disable_archive.__force_skip__ = true; // disabled temporarily, bug 1096006
function test_disable_archive() {
  let tab = open_advanced_settings();
  defaultIdentity.archiveEnabled = true;
  click_account_tree_row(tab, 2);

  let iframe = content_tab_e(tab, "contentFrame");
  let checkbox = iframe.contentDocument.getElementById("identity.archiveEnabled");

  assert_true(checkbox.checked);
  assert_false(checkbox.disabled);
  mc.click(new elib.Elem(checkbox));
  utils.waitFor(() => !checkbox.checked, "Archive checkbox didn't toggle to unchecked");
  plan_for_window_close(mc);
  mc.window.document.getElementById("accountManager").acceptDialog();
  wait_for_window_close();

  assert_false(defaultIdentity.archiveEnabled);
  close_advanced_settings(tab);
}

// Disable test on Windows since for some yet unknown reason clicking the checkbox
// doesn't have the desired result. See bug 1461173 for details.
// test_disable_archive.EXCLUDED_PLATFORMS = ["winnt"];
