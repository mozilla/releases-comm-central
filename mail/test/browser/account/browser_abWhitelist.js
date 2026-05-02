/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );
var { FAKE_SERVER_HOSTNAME } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var gKeyString = null;
var gAccount = null;

add_setup(function () {
  const server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  gAccount = MailServices.accounts.findAccountForServer(server);

  gKeyString = "mail.server." + server.key + ".whiteListAbURI";
  registerCleanupFunction(function () {
    Services.prefs.clearUserPref(gKeyString);
  });
});

/**
 * First, test that when we initially load the account manager, that
 * we're not allowing any address books.  Then, we'll check all
 * address books and save.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_allowlist_init_and_save(tab) {
  // Ok, the advanced settings window is open.  Let's choose
  // the junkmail settings.
  const accountRow = get_account_tree_row(gAccount.key, "am-junk.xhtml", tab);
  await click_account_tree_row(tab, accountRow);

  const doc =
    tab.browser.contentWindow.document.getElementById(
      "contentFrame"
    ).contentDocument;

  // At this point, we shouldn't have anything checked, but we should have
  // the two default address books (Personal and Collected) displayed
  const list = doc.getElementById("whiteListAbURI");
  Assert.equal(
    2,
    list.getRowCount(),
    "There was an unexpected number of address books"
  );

  // Now we'll check both address books
  for (let i = 0; i < list.getRowCount(); i++) {
    const abNode = list.getItemAtIndex(i);
    EventUtils.synthesizeMouseAtCenter(
      abNode.firstElementChild,
      { clickCount: 1 },
      abNode.firstElementChild.ownerGlobal
    );
    await TestUtils.waitForTick();
  }
}

/**
 * Next, we'll make sure that the address books we checked in
 * subtest_check_allowlist_init_and_save were properly saved.
 * Then, we'll clear the address books and save.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_allowlist_load_and_clear(tab) {
  const accountRow = get_account_tree_row(gAccount.key, "am-junk.xhtml", tab);
  await click_account_tree_row(tab, accountRow);

  const doc =
    tab.browser.contentWindow.document.getElementById(
      "contentFrame"
    ).contentDocument;

  const list = doc.getElementById("whiteListAbURI");
  const allowListURIs = Services.prefs
    .getCharPref(gKeyString, "")
    .split(" ")
    .filter(Boolean);

  Assert.greater(
    allowListURIs.length,
    0,
    `${gKeyString} pref should have uris`
  );

  for (let i = 0; i < list.getRowCount(); i++) {
    const abNode = list.getItemAtIndex(i);
    Assert.equal(
      true,
      abNode.firstElementChild.checked,
      `list item ${i} should have been checked`
    );
    // Also ensure that the address book URI was properly saved in the
    // prefs
    Assert.ok(allowListURIs.includes(abNode.getAttribute("value")));
    // Now un-check that address book
    EventUtils.synthesizeMouseAtCenter(
      abNode.firstElementChild,
      { clickCount: 1 },
      abNode.firstElementChild.ownerGlobal
    );
    await TestUtils.waitForTick();
  }
}

/**
 * Finally, we'll make sure that the address books we cleared
 * were actually cleared.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_check_allowlist_load_cleared(tab) {
  const accountRow = get_account_tree_row(gAccount.key, "am-junk.xhtml", tab);
  await click_account_tree_row(tab, accountRow);

  const doc =
    tab.browser.contentWindow.document.getElementById(
      "contentFrame"
    ).contentDocument;

  const list = doc.getElementById("whiteListAbURI");
  let allowListURIs = "";

  try {
    allowListURIs = Services.prefs.getCharPref(gKeyString);
    // We should have failed here, because the pref should have been cleared
    // out.
    throw Error(
      "The allowlist preference for this server wasn't properly cleared."
    );
  } catch (e) {}

  for (let i = 0; i < list.getRowCount(); i++) {
    const abNode = list.getItemAtIndex(i);
    Assert.equal(
      false,
      abNode.firstElementChild.checked,
      `list item ${i} should NOT have been checked`
    );
    // Also ensure that the address book URI was properly cleared in the
    // prefs
    Assert.ok(!allowListURIs.includes(abNode.getAttribute("value")));
  }
}

add_task(async function test_address_book_allowlist() {
  await open_advanced_settings(subtest_check_allowlist_init_and_save);
  await open_advanced_settings(subtest_check_allowlist_load_and_clear);
  await open_advanced_settings(subtest_check_allowlist_load_cleared);
});
