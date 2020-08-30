/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has an address book containing two cards that have the
 * same UID. This should never happen, but it apparently does.
 */
add_task(async function() {
  // Copy address books to be migrated into the profile.

  copyABFile("data/duplicateUID.mab", "abook.mab");

  // Do the migration.

  await MailMigrator._migrateAddressBooks();

  let [personalBook] = MailServices.ab.directories;
  let [firstCard, secondCard] = [...personalBook.childCards];

  // The first card should be copied unchanged.

  equal(firstCard.UID, "d144f8e6-ddc7-4be7-9ded-28b2dd026916");
  equal(firstCard.firstName, "First");
  equal(firstCard.lastName, "Last");
  equal(firstCard.displayName, "First Last");
  equal(firstCard.primaryEmail, "first@last.invalid");

  // The second card should also be copied, but with a new UID.

  notEqual(secondCard.UID, "d144f8e6-ddc7-4be7-9ded-28b2dd026916");
  equal(secondCard.firstName, "Second");
  equal(secondCard.lastName, "Last");
  equal(secondCard.displayName, "Second Last");
  equal(secondCard.primaryEmail, "second@last.invalid");
});
