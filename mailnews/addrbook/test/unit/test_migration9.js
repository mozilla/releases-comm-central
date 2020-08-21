/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has a personal address book with contacts and mailing
 * lists. The mailing lists have names which are now considered invalid.
 */

const { fixIterator } = ChromeUtils.import(
  "resource:///modules/iteratorUtils.jsm"
);

add_task(async function() {
  // Copy address book to be migrated into the profile.

  copyABFile("data/badlists.mab", "abook.mab");

  // Do the migration.

  await MailMigrator._migrateAddressBooks();

  // Check new files have been created, and old ones renamed.

  checkFileExists("abook.sqlite", true);
  checkFileExists("abook.mab", false);
  checkFileExists("abook.mab.bak", true);
  checkFileExists("history.sqlite", false);
  checkFileExists("history.mab", false);
  checkFileExists("history.mab.bak", false);

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

  // Check we have all the right cards.

  let personalCards = [...personalBook.childCards];
  equal(personalCards.length, 6);

  // Check the lists have the right members.

  let personalLists = [
    ...fixIterator(personalBook.childNodes, Ci.nsIAbDirectory),
  ];
  equal(personalLists.length, 4);

  equal(personalLists[0].dirName, "test list"); // Was "test  list".
  equal(personalLists[1].dirName, "test list 1"); // Was "test; list".
  equal(personalLists[2].dirName, "test list 2"); // Was "test,   list;".
  equal(personalLists[3].dirName, "List"); // Was "<>".

  let listCards = [
    ...fixIterator(personalLists[0].childCards, Ci.nsIAbCard),
  ].map(c => c.primaryEmail);
  Assert.deepEqual(listCards, ["one@invalid", "two@invalid"]);

  listCards = [...fixIterator(personalLists[1].childCards, Ci.nsIAbCard)].map(
    c => c.primaryEmail
  );
  Assert.deepEqual(listCards, ["one@invalid", "two@invalid"]);

  listCards = [...fixIterator(personalLists[2].childCards, Ci.nsIAbCard)].map(
    c => c.primaryEmail
  );
  Assert.deepEqual(listCards, ["one@invalid"]);

  listCards = [...fixIterator(personalLists[3].childCards, Ci.nsIAbCard)].map(
    c => c.primaryEmail
  );
  Assert.deepEqual(listCards, ["two@invalid"]);

  // Check the history book, which should be empty.

  let historyCards = [...historyBook.childCards];
  equal(historyCards.length, 0);

  let historyLists = [...historyBook.childNodes];
  equal(historyLists.length, 0);
});
