/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the reconciliation between folders in the database and a given list of
 * folders. Folders in the list but not the database should be added, folders
 * not in the list should be removed.
 */

add_setup(async function () {
  await installDBFromFile("db/relations.sql");
});

add_task(function testReconcile() {
  const grandparent = 3;
  const parent = 6;
  const child = 4;
  const grandchild = 1;
  const sibling = 2;

  drawTree(parent);

  folderDB.reconcile(parent, ["siblîng", "inserted"]);
  drawTree(parent);

  const inserted = folderDB.getFolderByPath("grandparent/parent/inserted");
  Assert.ok(inserted);
  Assert.equal(folderDB.getFolderRoot(inserted), grandparent);
  Assert.equal(folderDB.getFolderParent(inserted), parent);
  Assert.throws(
    () => folderDB.getFolderParent(child),
    /NS_ERROR_/,
    "child no longer exists"
  );
  Assert.deepEqual(folderDB.getFolderChildren(parent), [inserted, sibling]);

  checkRow(inserted, {
    id: inserted,
    parent,
    ordinal: null,
    name: "inserted",
    flags: 0,
  });
  checkNoRow(child);
  checkNoRow(grandchild);

  // Folders with the virtual flag shouldn't be removed.

  folderDB.updateFlags(inserted, Ci.nsMsgFolderFlags.Virtual);
  folderDB.reconcile(parent, ["siblîng"]);
  drawTree(parent);

  Assert.deepEqual(folderDB.getFolderChildren(parent), [inserted, sibling]);
  checkRow(inserted, {
    id: inserted,
    parent,
    ordinal: null,
    name: "inserted",
    flags: Ci.nsMsgFolderFlags.Virtual,
  });
});
