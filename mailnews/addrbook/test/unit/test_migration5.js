/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has an existing default address book, and a file that
 * already exists named abook.mab.bak. After migration the Mork file should
 * be named something other than abook.mab or abook.mab.bak.
 */
add_task(async function() {
  // Copy address books to be migrated into the profile.

  copyABFile("data/cardForEmail.mab", "abook.mab");
  let existingBackupFile = profileDir.clone();
  existingBackupFile.append("abook.mab.bak");
  existingBackupFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

  // Do the migration.

  await MailMigrator._migrateAddressBooks();

  // Check new files have been created, and old ones renamed.

  checkFileExists("abook.sqlite", true);
  checkFileExists("abook.mab", false);
  checkFileExists("abook.mab.bak", true);

  equal(existingBackupFile.fileSize, 0);

  let profileFiles = [...profileDir.directoryEntries].map(
    file => file.leafName
  );
  info("Files in profile: " + profileFiles.join(", "));
  ok(profileFiles.includes("abook.mab-1.bak"));
});
