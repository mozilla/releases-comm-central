/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the insertion of folders into the database.
 */

add_setup(async function () {
  await installDBFromFile("db/relations.sql");
});

add_task(function testInsertRoot() {
  // Use a unicode key, because we can.
  const serverX = folderDB.insertRoot("serv\u011BrX");
  Assert.ok(serverX, "insertRoot should return a folder");
  Assert.equal(
    folderDB.getFolderParent(serverX),
    0,
    "new folder should be a root folder"
  );

  Assert.equal(
    folderDB.getFolderRoot(serverX),
    serverX,
    "new folder's root should be itself"
  );
  Assert.equal(
    folderDB.getFolderName(serverX),
    "serv\u011BrX",
    "new folder should have the right name"
  );

  Assert.equal(
    folderDB.getFolderByPath("serv\u011BrX"),
    serverX,
    "should be able to fetch the new folder by path"
  );
  // Temporarily disabled, bug 2019183.
  // Assert.equal(
  //   folderDB.getFolderByPath("serve\u030CrX"),
  //   serverX,
  //   "should be able to fetch the new folder by path"
  // );

  // Root folders can have names containing '/' (not a great idea, but
  // we want to define the corner cases).
  const flipflop = folderDB.insertRoot("Flip/Flop");
  Assert.ok(flipflop, "insertRoot should handle name containing '/'");

  Assert.equal(
    folderDB.getFolderName(flipflop),
    "Flip/Flop",
    "new folder should have the right name"
  );
  Assert.equal(
    folderDB.getFolderPath(flipflop),
    "Flip%2FFlop",
    "path should percent-encode '/' chars"
  );

  checkRow(flipflop, {
    id: flipflop,
    parent: 0,
    ordinal: null,
    name: "Flip/Flop",
    flags: 0,
  });

  Assert.throws(
    () => folderDB.insertRoot("Flip/Flop"),
    /NS_ERROR_/,
    "should fail when trying to insert a root that already exists."
  );
});

add_task(function testInsertFolder() {
  const grandparent = 3;
  const parent = 6;
  const child = 4;
  const sibling = 2;

  drawTree(parent);

  // Use a unicode name, because we can.
  const inserted = folderDB.insertFolder(parent, "insert\u0113d");
  drawTree(parent);
  Assert.ok(inserted, "insertFolder should return a folder");
  Assert.equal(
    folderDB.getFolderName(inserted),
    "insert\u0113d",
    "new folder should have the right name"
  );

  Assert.equal(
    folderDB.getFolderByPath("grandparent/parent/insert\u0113d"),
    inserted,
    "should be able to fetch the new folder by path"
  );
  Assert.equal(
    folderDB.getFolderRoot(inserted),
    grandparent,
    "new folder's grandparent should be set correctly"
  );
  Assert.equal(
    folderDB.getFolderParent(inserted),
    parent,
    "new folder's parent should be set correctly"
  );
  Assert.deepEqual(
    folderDB.getFolderChildren(parent),
    [child, inserted, sibling],
    "new folder should be added to parent's children"
  );

  checkRow(inserted, {
    id: inserted,
    parent,
    ordinal: null,
    name: "insert\u0113d",
    flags: 0,
  });

  Assert.deepEqual(
    folderDB.getFolderChildren(parent),
    [child, inserted, sibling],
    "parent's children should not be modified"
  );

  Assert.throws(
    () => folderDB.insertFolder(0, "oops"),
    /NS_ERROR_ILLEGAL_VALUE/,
    "insertFolder should require a parent folder"
  );

  Assert.throws(
    () => folderDB.insertFolder(parent, "insert\u0113d"),
    /NS_ERROR_/,
    "insertFolder should fail if folder exists"
  );

  // Temporarily disabled, bug 2019183.
  // Assert.throws(
  //   () => folderDB.insertFolder(parent, "inserte\u0304d"),
  //   /NS_ERROR_/,
  //   "insertFolder should fail if folder exists and not be fooled by different unicode representations"
  // );
});
