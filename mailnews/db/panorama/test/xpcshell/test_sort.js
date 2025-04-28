/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that folders are read from the database and inserted as children of
 * their parents in the right order. Folders with an ordinal are sorted ahead
 * of folders without an ordinal. Otherwise, folders are sorted by name, in a
 * case-insensitive and locale-aware manner.
 */

add_setup(function () {
  // These id values are deliberately out-of-order. It shouldn't matter.
  installDB(`
    INSERT INTO folders (id, parent, ordinal, name) VALUES
      (7, 0, null, 'parent1'),
      (10, 7, null, 'ëcho'),
      (9, 7, null, 'Foxtrot'),
      (15, 7, null, 'golf'),
      (3, 7, null, 'Hotel'),

      (12, 0, null, 'parent2'),
      (6, 12, 3, 'kilo'),
      (2, 12, 1, 'Lima'),
      (14, 12, 4, 'November'),
      (8, 12, 2, 'Quebec'),

      (11, 0, null, 'parent3'),
      (4, 11, 3, 'sierra'),
      (13, 11, null, 'Tango'),
      (1, 11, null, 'Uniform'),
      (5, 11, 2, 'whisky');
  `);
});

/**
 * Tests folders that all have an ordinal value.
 */
add_task(function testNullOrdinals() {
  const parent = folders.getFolderById(7);
  const echo = folders.getFolderById(10); // Lowercase E with diaeresis.
  const foxtrot = folders.getFolderById(9); // Uppercase F.
  const golf = folders.getFolderById(15);
  const hotel = folders.getFolderById(3); // Uppercase H.

  Assert.deepEqual(parent.children, [echo, foxtrot, golf, hotel]);
});

/**
 * Tests folders that all have no ordinal value.
 */
add_task(function testNonNullOrdinals() {
  const parent = folders.getFolderById(12);
  const kilo = folders.getFolderById(6);
  const lima = folders.getFolderById(2); // Uppercase L.
  const november = folders.getFolderById(14); // Uppercase N.
  const quebec = folders.getFolderById(8); // Uppercase Q.

  Assert.deepEqual(parent.children, [lima, quebec, kilo, november]);
});

/**
 * Tests a mix of folders that have an ordinal value and folders that do not.
 */
add_task(function testMixedOrdinals() {
  const parent = folders.getFolderById(11);
  const sierra = folders.getFolderById(4);
  const tango = folders.getFolderById(13); // Uppercase T.
  const uniform = folders.getFolderById(1); // Uppercase U.
  const whisky = folders.getFolderById(5);

  Assert.deepEqual(parent.children, [whisky, sierra, tango, uniform]);
});
