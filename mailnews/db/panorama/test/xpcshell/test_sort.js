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
    INSERT INTO folders (id, parent, ordinal, name, flags) VALUES
      (7, 0, null, 'parent1', 0),
      (10, 7, null, 'ëcho', 0),
      (9, 7, null, 'Foxtrot', 0),
      (15, 7, null, 'golf', 0),
      (3, 7, null, 'Hotel', 0),

      (12, 0, null, 'parent2', 0),
      (6, 12, 3, 'kilo', 0),
      (2, 12, 1, 'Lima', 0),
      (14, 12, 4, 'November', 0),
      (8, 12, 2, 'Quebec', 0),

      (11, 0, null, 'parent3', 0),
      (4, 11, 3, 'sierra', 0),
      (13, 11, null, 'Tango', 0),
      (1, 11, null, 'Uniform', 0),
      (5, 11, 2, 'whisky', 0),

      (16, 0, null, 'parent4', 0),
      (21, 16, null, 'X-Ray', 0),
      (23, 16, null, 'Yankee', 0),
      (25, 16, null, 'Zulu', 0),
      (24, 16, null, 'Sent', ${Ci.nsMsgFolderFlags.SentMail}),
      (26, 16, null, 'Drafts', ${Ci.nsMsgFolderFlags.Drafts}),
      (18, 16, null, 'Trash', ${Ci.nsMsgFolderFlags.Trash}),
      (17, 16, null, 'Archives', ${Ci.nsMsgFolderFlags.Archive}),
      (20, 16, null, 'Inbox', ${Ci.nsMsgFolderFlags.Inbox}),
      (27, 16, null, 'Templates', ${Ci.nsMsgFolderFlags.Templates}),
      (28, 16, null, 'Virtual', ${Ci.nsMsgFolderFlags.Virtual}),
      (19, 16, null, 'Unsent Messages', ${Ci.nsMsgFolderFlags.Queue}),
      (22, 16, null, 'Junk', ${Ci.nsMsgFolderFlags.Junk});
  `);
});

/**
 * Tests folders that all have an ordinal value.
 */
add_task(function testNullOrdinals() {
  const parent = folderDB.getFolderById(7);
  const echo = folderDB.getFolderById(10); // Lowercase E with diaeresis.
  const foxtrot = folderDB.getFolderById(9); // Uppercase F.
  const golf = folderDB.getFolderById(15);
  const hotel = folderDB.getFolderById(3); // Uppercase H.

  Assert.deepEqual(parent.children, [echo, foxtrot, golf, hotel]);
});

/**
 * Tests folders that all have no ordinal value.
 */
add_task(function testNonNullOrdinals() {
  const parent = folderDB.getFolderById(12);
  const kilo = folderDB.getFolderById(6);
  const lima = folderDB.getFolderById(2); // Uppercase L.
  const november = folderDB.getFolderById(14); // Uppercase N.
  const quebec = folderDB.getFolderById(8); // Uppercase Q.

  Assert.deepEqual(parent.children, [lima, quebec, kilo, november]);
});

/**
 * Tests a mix of folders that have an ordinal value and folders that do not.
 */
add_task(function testMixedOrdinals() {
  const parent = folderDB.getFolderById(11);
  const sierra = folderDB.getFolderById(4);
  const tango = folderDB.getFolderById(13); // Uppercase T.
  const uniform = folderDB.getFolderById(1); // Uppercase U.
  const whisky = folderDB.getFolderById(5);

  Assert.deepEqual(parent.children, [whisky, sierra, tango, uniform]);
});

/**
 * Tests that folders with special flags are ordered in the natural order.
 */
add_task(function testSpecialFolders() {
  const parent = folderDB.getFolderById(16);
  const xray = folderDB.getFolderById(21);
  const yankee = folderDB.getFolderById(23);
  const zulu = folderDB.getFolderById(25);
  const archives = folderDB.getFolderById(17);
  const drafts = folderDB.getFolderById(26);
  const inbox = folderDB.getFolderById(20);
  const junk = folderDB.getFolderById(22);
  const sent = folderDB.getFolderById(24);
  const templates = folderDB.getFolderById(27);
  const trash = folderDB.getFolderById(18);
  const unsent = folderDB.getFolderById(19);
  const virtual = folderDB.getFolderById(28);

  Assert.deepEqual(parent.children, [
    inbox,
    drafts,
    templates,
    sent,
    archives,
    junk,
    trash,
    virtual,
    unsent,
    xray,
    yankee,
    zulu,
  ]);

  // Reorder the folders to check that still works with special folders involved.

  folderDB.moveFolderWithin(parent, xray, inbox);
  folderDB.moveFolderWithin(parent, zulu, xray);

  Assert.deepEqual(parent.children, [
    zulu,
    xray,
    inbox,
    drafts,
    templates,
    sent,
    archives,
    junk,
    trash,
    virtual,
    unsent,
    yankee,
  ]);

  folderDB.moveFolderWithin(parent, archives, templates);
  folderDB.moveFolderWithin(parent, junk, xray);

  Assert.deepEqual(parent.children, [
    zulu,
    junk,
    xray,
    inbox,
    drafts,
    archives,
    templates,
    sent,
    trash,
    virtual,
    unsent,
    yankee,
  ]);

  // Reset the order to check it goes back correctly.

  folderDB.resetChildOrder(parent);

  Assert.deepEqual(parent.children, [
    inbox,
    drafts,
    templates,
    sent,
    archives,
    junk,
    trash,
    virtual,
    unsent,
    xray,
    yankee,
    zulu,
  ]);
});
