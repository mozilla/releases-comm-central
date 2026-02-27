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
      (8, 2, 'sub2'),
      (10, 8, 'I/O stuff'),
      (11, 8, 'I%2FO stuff');
  `);
});

const folder = 6;
const server1 = 5;
const server2 = 4;
const sub1 = 2;
const sub2 = 8;
const iostuff = 10;
const iostuff2 = 11;

add_task(function testLookup() {
  drawTree(server1);
  drawTree(server2);

  // Non-existent paths should return 0 (not error).
  Assert.equal(folderDB.getFolderByPath("NotAServer"), 0);
  Assert.equal(folderDB.getFolderByPath("Not/a/real/path"), 0);

  // Basic lookups.
  Assert.equal(folderDB.getFolderByPath("server1"), server1);
  const server1Children = folderDB.getFolderChildren(server1);
  Assert.equal(folderDB.getFolderByPath("server1/INBOX"), server1Children[0]);
  Assert.equal(folderDB.getFolderByPath("server1/Junk"), server1Children[1]);
  Assert.equal(folderDB.getFolderByPath("server1/Sent"), server1Children[2]);
  Assert.equal(folderDB.getFolderByPath("server1/Trash"), server1Children[3]);

  // Paths are case sensitive.
  Assert.equal(folderDB.getFolderByPath("SErVEr1"), 0);
  Assert.equal(folderDB.getFolderByPath("server1/InBoX"), 0);
  Assert.equal(folderDB.getFolderByPath("server1/INBOX"), server1Children[0]);

  Assert.equal(folderDB.getFolderByPath("server2"), server2);
  const server2Children = folderDB.getFolderChildren(server2);
  Assert.equal(folderDB.getFolderByPath("server2/folder"), server2Children[0]);
  // Lookup using composed unicode character.
  Assert.equal(folderDB.getFolderByPath("server2/folder/s\u00FCb1"), sub1);
  // Lookup using decomposed unicode character.
  Assert.equal(folderDB.getFolderByPath("server2/folder/su\u0308b1"), sub1);
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/su\u0308b1/sub2"),
    sub2
  );

  // Lookup with part component that requires escaping for use in path.
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/süb1/sub2/I/O stuff"),
    0
  );
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/süb1/sub2/I%2FO stuff"),
    iostuff
  );
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/süb1/sub2/I%2fO stuff"),
    iostuff
  );
  Assert.equal(
    folderDB.getFolderPath(iostuff),
    "server2/folder/süb1/sub2/I%2FO stuff"
  );

  // Check that getFolderByPath() works with names that contain things that
  // look like percent-encoding.
  // TODO: we haven't yet nailed down the exact rules for our path encoding.
  // Once that's done, enable and expand these.
  /*
  Assert.equal(folderDB.getFolderChildNamed(sub2, iostuff2), "I%2FO stuff");
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/süb1/sub2/I%252FO stuff"),
    iostuff2
  );
  Assert.equal(
    folderDB.getFolderPath(iostuff2, "server2/folder/süb1/sub2/I%252FO stuff"));
  );
  */
});

/**
 * Tests looking up folders after moving them. Looking up the folder at the
 * new path should find it, and at the old path should find nothing.
 */
add_task(function testLookupAfterMove() {
  Assert.equal(folderDB.getFolderPath(sub2), "server2/folder/s\u00FCb1/sub2");
  Assert.equal(folderDB.getFolderByPath("server2/folder/sub2"), 0);
  Assert.equal(folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2"), sub2);

  folderDB.moveFolderTo(folder, sub2);
  Assert.equal(folderDB.getFolderPath(sub2), "server2/folder/sub2");
  Assert.equal(folderDB.getFolderByPath("server2/folder/sub2"), sub2);
  Assert.equal(folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2"), 0);
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2/I%2FO stuff"),
    0
  );

  folderDB.moveFolderTo(sub1, sub2);
  Assert.equal(folderDB.getFolderPath(sub2), "server2/folder/s\u00FCb1/sub2");
  Assert.equal(folderDB.getFolderByPath("server2/folder/sub2"), 0);
  Assert.equal(folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2"), sub2);
  Assert.equal(
    folderDB.getFolderByPath("server2/folder/s\u00FCb1/sub2/I%2FO stuff"),
    iostuff
  );
});
