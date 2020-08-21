/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has an empty (no entries, not zero-length) history book.
 * Migration should not fail as seen in bug 1590021.
 */

add_task(async function() {
  // Copy address book to be migrated into the profile.

  copyABFile("data/empty.mab", "history.mab");

  // Do the migration.

  await MailMigrator._migrateAddressBooks();

  // Check new files have been created, and old ones renamed.

  checkFileExists("abook.sqlite", false);
  checkFileExists("abook.mab", false);
  checkFileExists("abook.mab.bak", false);
  checkFileExists("history.sqlite", true);
  checkFileExists("history.mab", false);
  checkFileExists("history.mab.bak", true);

  // Check that the default preferences are untouched.

  equal(
    Services.prefs.getIntPref("ldap_2.servers.pab.dirType"),
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  equal(
    Services.prefs.getStringPref("ldap_2.servers.pab.filename"),
    "abook.sqlite"
  );
  equal(
    Services.prefs.getIntPref("ldap_2.servers.history.dirType"),
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  equal(
    Services.prefs.getStringPref("ldap_2.servers.history.filename"),
    "history.sqlite"
  );

  // Check the new address books.

  let directories = [...MailServices.ab.directories];
  equal(directories.length, 2);
  equal(directories[0].dirType, Ci.nsIAbManager.JS_DIRECTORY_TYPE);
  equal(directories[1].dirType, Ci.nsIAbManager.JS_DIRECTORY_TYPE);

  let [, historyBook] = directories;

  // Check we have all the right cards.

  let testCards = [...historyBook.childCards];
  equal(testCards.length, 0);
});
