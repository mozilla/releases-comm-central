/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests looking up folders by path.
 */

add_setup(async function () {
  // These id values are deliberately out-of-order. It shouldn't matter.
  await installDB(`
    INSERT INTO folders (id, parent, name) VALUES
      (5, 0, 'server1'),
      (1, 5, 'INBOX'),
      (3, 5, 'Sent'),
      (9, 5, 'Junk'),
      (7, 5, 'Trash'),
      (4, 0, 'server2'),
      (6, 4, 'folder'),
      (2, 6, 'süb1'),
      (8, 2, 'sub2');
  `);
});

add_task(function testLookup() {
  const server1 = folderDB.getFolderById(5);
  const server2 = folderDB.getFolderById(4);

  drawTree(server1);
  drawTree(server2);

  Assert.equal(folderDB.getFolderByPath("server1"), server1);
  Assert.equal(folderDB.getFolderByPath("server1/INBOX"), server1.children[0]);
  Assert.equal(folderDB.getFolderByPath("server1/Junk"), server1.children[1]);
  Assert.equal(folderDB.getFolderByPath("server1/Sent"), server1.children[2]);
  Assert.equal(folderDB.getFolderByPath("server1/Trash"), server1.children[3]);

  Assert.equal(folderDB.getFolderByPath("server2"), server2);
  Assert.equal(folderDB.getFolderByPath("server2/folder"), server2.children[0]);
  // Lookup using composed unicode character.
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/s\u00FCb1"),
    server2.children[0].children[0]
  );
  // Lookup using decomposed unicode character.
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/su\u0308b1"),
    server2.children[0].children[0]
  );
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/su\u0308b1/sub2"),
    server2.children[0].children[0].children[0]
  );
});

/**
 * Tests looking up folders after moving them. Looking up the folder at the
 * new path should find it, and at the old path should find nothing.
 */
add_task(function testLookupAfterMove() {
  const folder = folderDB.getFolderById(6);
  const sub1 = folderDB.getFolderById(2);
  const sub2 = folderDB.getFolderById(8);

  Assert.equal(sub2.path, "server2/folder/s\u00FCb1/sub2");
  Assert.equal(folderDB.getFolderByPath("server2/folder/sub2"), null);
  Assert.equal(folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2"), sub2);

  folderDB.moveFolderTo(folder, sub2);
  Assert.equal(sub2.path, "server2/folder/sub2");
  Assert.equal(folderDB.getFolderByPath("server2/folder/sub2"), sub2);
  Assert.equal(folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2"), null);
  Assert.equal(sub2.id, 8);
  Assert.equal(folderDB.getFolderById(8), sub2);

  folderDB.moveFolderTo(sub1, sub2);
  Assert.equal(sub2.path, "server2/folder/s\u00FCb1/sub2");
  Assert.equal(folderDB.getFolderByPath("server2/folder/sub2"), null);
  Assert.equal(folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2"), sub2);
  Assert.equal(sub2.id, 8);
  Assert.equal(folderDB.getFolderById(8), sub2);
});
