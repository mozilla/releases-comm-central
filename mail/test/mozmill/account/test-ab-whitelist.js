/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-keyboard-helpers.js */
/* import-globals-from ../shared-modules/test-pref-window-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-ab-whitelist";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
  "keyboard-helpers",
  "content-tab-helpers",
  "pref-window-helpers",
];

var mozmill = ChromeUtils.import("chrome://mozmill/content/modules/mozmill.jsm");
var controller = ChromeUtils.import("chrome://mozmill/content/modules/controller.jsm");
var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

var gOldWhiteList = null;
var gKeyString = null;

var gAccount = null;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  let server = MailServices.accounts
                           .FindServer("tinderbox", FAKE_SERVER_HOSTNAME, "pop3");
  gAccount = MailServices.accounts.FindAccountForServer(server);
  let serverKey = server.key;

  gKeyString = "mail.server." + serverKey + ".whiteListAbURI";
  gOldWhiteList = Services.prefs.getCharPref(gKeyString);
  Services.prefs.setCharPref(gKeyString, "");
}

function teardownModule(module) {
  Services.prefs.setCharPref(gKeyString, gOldWhiteList);
}

/* First, test that when we initially load the account manager, that
 * we're not whitelisting any address books.  Then, we'll check all
 * address books and save.
 */
function test_check_whitelist_init_and_save() {
  let tab = open_advanced_settings();
  // Ok, the advanced settings window is open.  Let's choose
  // the junkmail settings.
  let accountRow = get_account_tree_row(gAccount.key, "am-junk.xul", tab);
  click_account_tree_row(tab, accountRow);

  let doc = content_tab_e(tab, "contentFrame").contentDocument;

  // At this point, we shouldn't have anything checked, but we should have
  // the two default address books (Personal and Collected) displayed
  let list = doc.getElementById("whiteListAbURI");
  assert_equals(2, list.getRowCount(),
                "There was an unexpected number of address books");

  // Now we'll check both address books
  for (let i = 0; i < list.getRowCount(); i++) {
    let abNode = list.getItemAtIndex(i);
    mc.click(new elib.Elem(abNode.firstChild));
  }

  // And close the dialog
  close_advanced_settings(tab);
}

/* Next, we'll make sure that the address books we checked in
 * subtest_check_whitelist_init_and_save were properly saved.
 * Then, we'll clear the address books and save.
 */
function test_check_whitelist_load_and_clear() {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(gAccount.key, "am-junk.xul", tab);
  click_account_tree_row(tab, accountRow);

  let doc = content_tab_e(tab, "contentFrame").contentDocument;
  let list = doc.getElementById("whiteListAbURI");
  let whiteListURIs = Services.prefs.getCharPref(gKeyString).split(" ");

  for (let i = 0; i < list.getRowCount(); i++) {
    let abNode = list.getItemAtIndex(i);
    assert_equals("true", abNode.firstChild.getAttribute("checked"),
                  "Should have been checked");
    // Also ensure that the address book URI was properly saved in the
    // prefs
    assert_true(whiteListURIs.includes(abNode.getAttribute("value")));
    // Now un-check that address book
    mc.click(new elib.Elem(abNode.firstChild));
  }

  // And close the dialog
  close_advanced_settings(tab);
}

/* Finally, we'll make sure that the address books we cleared
 * were actually cleared.
 */
function test_check_whitelist_load_cleared() {
  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(gAccount.key, "am-junk.xul", tab);
  click_account_tree_row(tab, accountRow);

  let doc = content_tab_e(tab, "contentFrame").contentDocument;
  let list = doc.getElementById("whiteListAbURI");
  let whiteListURIs = "";

  try {
    whiteListURIs = Services.prefs.getCharPref(gKeyString);
    // We should have failed here, because the pref should have been cleared
    // out.
    throw Error("The whitelist preference for this server wasn't properly "
                + "cleared.");
  } catch (e) {
  }

  for (let i = 0; i < list.getRowCount(); i++) {
    let abNode = list.getItemAtIndex(i);
    assert_equals("false", abNode.firstChild.getAttribute("checked"),
                  "Should not have been checked");
    // Also ensure that the address book URI was properly cleared in the
    // prefs
    assert_false(whiteListURIs.includes(abNode.getAttribute("value")));
  }

  // And close the dialog
  close_advanced_settings(tab);
}
