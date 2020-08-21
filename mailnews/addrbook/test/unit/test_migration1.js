/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has only the two default address books to migrate, and
 * neither have any mailing lists.
 */
add_task(async function() {
  // Copy address books to be migrated into the profile.

  copyABFile("data/cardForEmail.mab", "abook.mab");
  copyABFile("data/collect.mab", "history.mab");

  // Do the migration.

  await MailMigrator._migrateAddressBooks();

  // Check new files have been created, and old ones renamed.

  checkFileExists("abook.sqlite", true);
  checkFileExists("abook.mab", false);
  checkFileExists("abook.mab.bak", true);
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

  let [personalBook, historyBook] = directories;

  // For this directory, just check we have all the right cards.

  let personalCards = [...personalBook.childCards];
  equal(personalCards.length, 4);
  Assert.deepEqual(personalCards.map(card => card.displayName).sort(), [
    "DisplayName1",
    "Empty Email",
    "Jane Doe",
    "John Doe",
  ]);

  let personalLists = [...personalBook.childNodes];
  equal(personalLists.length, 0);

  // More detailed check.

  let historyCards = [...historyBook.childCards];
  equal(historyCards.length, 1);
  equal(historyCards[0].firstName, "Other");
  equal(historyCards[0].lastName, "Book");
  equal(historyCards[0].primaryEmail, "other@book.invalid");
  equal(historyCards[0].displayName, "Other Book");
  equal(historyCards[0].getProperty("LastModifiedDate", "bad"), "0");
  equal(historyCards[0].getProperty("AllowRemoteContent", "bad"), "0");
  equal(historyCards[0].getProperty("PopularityIndex", "bad"), "0");
  equal(historyCards[0].getProperty("PreferMailFormat", "bad"), "0");
  // This property exists in the .mab file but should not be copied to the
  // .sqlite file. It's not wrong, but we don't use them any more.
  equal(historyCards[0].getProperty("LowercasePrimaryEmail", "bad"), "bad");

  let historyLists = [...historyBook.childNodes];
  equal(historyLists.length, 0);
});
