/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the insertion of folders into the database.
 */

add_setup(async function () {
  await installDB("relations.sqlite");
});

add_task(function testInsertRoot() {
  const serverX = folders.insertRoot("serverX");
  Assert.ok(serverX, "insertRoot should return a folder");
  Assert.equal(serverX.parent, null, "new folder should be a root folder");
  Assert.equal(
    serverX.rootFolder,
    serverX,
    "new folder's root should be itself"
  );
  Assert.equal(
    serverX.name,
    "serverX",
    "new folder should have the right name"
  );

  Assert.equal(
    folders.getFolderByPath("serverX"),
    serverX,
    "should be able to fetch the new folder by path"
  );

  checkRow(serverX.id, {
    id: serverX.id,
    parent: 0,
    ordinal: null,
    name: "serverX",
    flags: 0,
  });

  const serverXAgain = folders.insertRoot("serverX");
  Assert.equal(
    serverXAgain,
    serverX,
    "new folder should match the folder with the same name"
  );
});

add_task(function testInsertFolder() {
  const grandparent = folders.getFolderById(3);
  const parent = folders.getFolderById(6);
  const child = folders.getFolderById(4);
  const sibling = folders.getFolderById(2);

  drawTree(parent);

  const inserted = folders.insertFolder(parent, "inserted");
  drawTree(parent);
  Assert.ok(inserted, "insertFolder should return a folder");
  Assert.equal(
    inserted.name,
    "inserted",
    "new folder should have the right name"
  );

  Assert.equal(
    folders.getFolderByPath("grandparent/parent/inserted"),
    inserted,
    "should be able to fetch the new folder by path"
  );
  Assert.equal(
    inserted.rootFolder,
    grandparent,
    "new folder's grandparent should be set correctly"
  );
  Assert.equal(
    inserted.parent,
    parent,
    "new folder's parent should be set correctly"
  );
  Assert.deepEqual(
    parent.children,
    [child, inserted, sibling],
    "new folder should be added to parent's children"
  );

  checkRow(inserted.id, {
    id: inserted.id,
    parent: parent.id,
    ordinal: null,
    name: "inserted",
    flags: 0,
  });

  const existing = folders.insertFolder(parent, "child");
  drawTree(parent);
  Assert.equal(
    existing,
    child,
    "insertFolder should return a folder matching the existing folder"
  );
  Assert.deepEqual(
    parent.children,
    [child, inserted, sibling],
    "parent's children should not be modified"
  );

  Assert.throws(
    () => folders.insertFolder(null, "oops"),
    /NS_ERROR_ILLEGAL_VALUE/,
    "insertFolder should require a parent folder"
  );
});
