/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that folders are read from the database and inserted as children of
 * their parents in the right order.
 */

add_setup(async function () {
  await installDB("sort.sqlite");
});

/**
 * Tests folders that all have an ordinal value.
 */
add_task(function testNullOrdinals() {
  const parent = database.getFolderById(7);
  const echo = database.getFolderById(10);
  const foxtrot = database.getFolderById(9);
  const golf = database.getFolderById(15);
  const hotel = database.getFolderById(3);

  Assert.deepEqual(parent.children, [echo, foxtrot, golf, hotel]);
});

/**
 * Tests folders that all have no ordinal value.
 */
add_task(function testNonNullOrdinals() {
  const parent = database.getFolderById(12);
  const kilo = database.getFolderById(6);
  const lima = database.getFolderById(2);
  const november = database.getFolderById(14);
  const quebec = database.getFolderById(8);

  Assert.deepEqual(parent.children, [lima, quebec, kilo, november]);
});

/**
 * Tests a mix of folders that have an ordinal value and folders that do not.
 */
add_task(function testMixedOrdinals() {
  const parent = database.getFolderById(11);
  const sierra = database.getFolderById(4);
  const tango = database.getFolderById(13);
  const uniform = database.getFolderById(1);
  const whisky = database.getFolderById(5);

  Assert.deepEqual(parent.children, [whisky, sierra, tango, uniform]);
});
