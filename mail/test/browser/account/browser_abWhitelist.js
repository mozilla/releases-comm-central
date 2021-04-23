/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var {
  click_account_tree_row,
  get_account_tree_row,
  open_advanced_settings,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { FAKE_SERVER_HOSTNAME } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gOldWhiteList = null;
var gKeyString = null;

var gAccount = null;

add_task(function setupModule(module) {
  let server = MailServices.accounts.FindServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  gAccount = MailServices.accounts.FindAccountForServer(server);
  let serverKey = server.key;

  gKeyString = "mail.server." + serverKey + ".whiteListAbURI";
  gOldWhiteList = Services.prefs.getCharPref(gKeyString);
  Services.prefs.setCharPref(gKeyString, "");
});

registerCleanupFunction(function teardownModule(module) {
  Services.prefs.setCharPref(gKeyString, gOldWhiteList);
});

/**
 * First, test that when we initially load the account manager, that
 * we're not whitelisting any address books.  Then, we'll check all
 * address books and save.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_whitelist_init_and_save(tab) {
  // Ok, the advanced settings window is open.  Let's choose
  // the junkmail settings.
  let accountRow = get_account_tree_row(gAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  let doc = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;

  // At this point, we shouldn't have anything checked, but we should have
  // the two default address books (Personal and Collected) displayed
  let list = doc.getElementById("whiteListAbURI");
  Assert.equal(
    2,
    list.getRowCount(),
    "There was an unexpected number of address books"
  );

  // Now we'll check both address books
  for (let i = 0; i < list.getRowCount(); i++) {
    let abNode = list.getItemAtIndex(i);
    mc.click(abNode.firstElementChild);
  }
}

/**
 * Next, we'll make sure that the address books we checked in
 * subtest_check_whitelist_init_and_save were properly saved.
 * Then, we'll clear the address books and save.
 *
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_whitelist_load_and_clear(tab) {
  let accountRow = get_account_tree_row(gAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  let doc = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;
  let list = doc.getElementById("whiteListAbURI");
  let whiteListURIs = Services.prefs.getCharPref(gKeyString).split(" ");

  for (let i = 0; i < list.getRowCount(); i++) {
    let abNode = list.getItemAtIndex(i);
    Assert.equal(
      true,
      abNode.firstElementChild.checked,
      "Should have been checked"
    );
    // Also ensure that the address book URI was properly saved in the
    // prefs
    Assert.ok(whiteListURIs.includes(abNode.getAttribute("value")));
    // Now un-check that address book
    mc.click(abNode.firstElementChild);
  }
}

/**
 * Finally, we'll make sure that the address books we cleared
 * were actually cleared.
 * @param {Object} tab - The account manager tab.
 */
function subtest_check_whitelist_load_cleared(tab) {
  let accountRow = get_account_tree_row(gAccount.key, "am-junk.xhtml", tab);
  click_account_tree_row(tab, accountRow);

  let doc = tab.browser.contentWindow.document.getElementById("contentFrame")
    .contentDocument;
  let list = doc.getElementById("whiteListAbURI");
  let whiteListURIs = "";

  try {
    whiteListURIs = Services.prefs.getCharPref(gKeyString);
    // We should have failed here, because the pref should have been cleared
    // out.
    throw Error(
      "The whitelist preference for this server wasn't properly cleared."
    );
  } catch (e) {}

  for (let i = 0; i < list.getRowCount(); i++) {
    let abNode = list.getItemAtIndex(i);
    Assert.equal(
      false,
      abNode.firstElementChild.checked,
      "Should not have been checked"
    );
    // Also ensure that the address book URI was properly cleared in the
    // prefs
    Assert.ok(!whiteListURIs.includes(abNode.getAttribute("value")));
  }
}

add_task(async function test_address_book_whitelist() {
  await open_advanced_settings(subtest_check_whitelist_init_and_save);
  await open_advanced_settings(subtest_check_whitelist_load_and_clear);
  await open_advanced_settings(subtest_check_whitelist_load_cleared);
});
