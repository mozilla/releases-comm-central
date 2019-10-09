/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has a non-default Mork address book, and no default
 * address books.
 */

const { fixIterator } = ChromeUtils.import(
  "resource:///modules/iteratorUtils.jsm"
);

add_task(async function() {
  // Copy address book to be migrated into the profile.

  copyABFile("data/existing.mab", "test.mab");

  Services.prefs.setStringPref(
    "ldap_2.servers.Test.description",
    "This is a test!"
  );
  Services.prefs.setIntPref("ldap_2.servers.Test.dirType", 2);
  Services.prefs.setStringPref("ldap_2.servers.Test.filename", "test.mab");
  Services.prefs.setStringPref(
    "ldap_2.servers.Test.uid",
    "12345678-1234-1234-1234-123456789012"
  );
  Services.prefs.setStringPref(
    "ldap_2.servers.Test.uri",
    "moz-abmdbdirectory://test.mab"
  );
  Services.prefs.setStringPref(
    "mail.collect_addressbook",
    "moz-abmdbdirectory://test.mab"
  );
  Services.prefs.setStringPref(
    "mail.server.default.whiteListAbURI",
    "moz-abmdbdirectory://test.mab"
  );

  // Do the migration.

  await MailMigrator._migrateAddressBooks();

  // Check new files have been created, and old ones renamed.

  checkFileExists("abook.sqlite", true);
  checkFileExists("abook.mab", false);
  checkFileExists("abook.mab.bak", false);
  checkFileExists("history.sqlite", true);
  checkFileExists("history.mab", false);
  checkFileExists("history.mab.bak", false);
  checkFileExists("test.sqlite", true);
  checkFileExists("test.mab", false);
  checkFileExists("test.mab.bak", true);

  // Check that the default preferences are untouched.

  equal(Services.prefs.getIntPref("ldap_2.servers.pab.dirType"), 101);
  equal(
    Services.prefs.getStringPref("ldap_2.servers.pab.filename"),
    "abook.sqlite"
  );
  equal(Services.prefs.getIntPref("ldap_2.servers.history.dirType"), 101);
  equal(
    Services.prefs.getStringPref("ldap_2.servers.history.filename"),
    "history.sqlite"
  );

  // Check that the test book's preferences are updated, or not updated.

  equal(
    Services.prefs.getStringPref("ldap_2.servers.Test.description"),
    "This is a test!"
  );
  equal(Services.prefs.getIntPref("ldap_2.servers.Test.dirType"), 101);
  equal(
    Services.prefs.getStringPref("ldap_2.servers.Test.filename"),
    "test.sqlite"
  );
  equal(
    Services.prefs.getStringPref("ldap_2.servers.Test.uid"),
    "12345678-1234-1234-1234-123456789012"
  );
  equal(
    Services.prefs.getStringPref("ldap_2.servers.Test.uri"),
    "jsaddrbook://test.sqlite"
  );

  // Check that references to the book are updated.

  equal(
    Services.prefs.getStringPref("mail.collect_addressbook"),
    "jsaddrbook://test.sqlite"
  );
  equal(
    Services.prefs.getStringPref("mail.server.default.whiteListAbURI"),
    "jsaddrbook://test.sqlite"
  );

  // Check the new address books.

  let directories = [...MailServices.ab.directories];
  equal(directories.length, 3);
  equal(directories[0].dirType, 101);
  equal(directories[1].dirType, 101);
  equal(directories[2].dirType, 101);

  let [testBook] = directories;

  // Check we have all the right cards.

  let testCards = [...testBook.childCards];
  equal(testCards.length, 2);

  ok(testCards[0].isMailList);
  equal(testCards[0].displayName, "List");

  ok(!testCards[1].isMailList);
  equal(testCards[1].displayName, "First Last");
  equal(testCards[1].primaryEmail, "first@last");
});
