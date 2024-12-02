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
  const parent = folders.getFolderById(7);
  const echo = folders.getFolderById(10);
  const foxtrot = folders.getFolderById(9);
  const golf = folders.getFolderById(15);
  const hotel = folders.getFolderById(3);

  Assert.deepEqual(parent.children, [echo, foxtrot, golf, hotel]);
});

/**
 * Tests folders that all have no ordinal value.
 */
add_task(function testNonNullOrdinals() {
  const parent = folders.getFolderById(12);
  const kilo = folders.getFolderById(6);
  const lima = folders.getFolderById(2);
  const november = folders.getFolderById(14);
  const quebec = folders.getFolderById(8);

  Assert.deepEqual(parent.children, [lima, quebec, kilo, november]);
});

/**
 * Tests a mix of folders that have an ordinal value and folders that do not.
 */
add_task(function testMixedOrdinals() {
  const parent = folders.getFolderById(11);
  const sierra = folders.getFolderById(4);
  const tango = folders.getFolderById(13);
  const uniform = folders.getFolderById(1);
  const whisky = folders.getFolderById(5);

  Assert.deepEqual(parent.children, [whisky, sierra, tango, uniform]);
});
