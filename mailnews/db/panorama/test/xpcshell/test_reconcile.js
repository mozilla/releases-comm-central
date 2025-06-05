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
  const grandparent = folders.getFolderById(3);
  const parent = folders.getFolderById(6);
  const child = folders.getFolderById(4);
  const grandchild = folders.getFolderById(1);
  const sibling = folders.getFolderById(2);

  drawTree(parent);

  folders.reconcile(parent, ["siblîng", "inserted"]);
  drawTree(parent);

  const inserted = folders.getFolderByPath("grandparent/parent/inserted");
  Assert.ok(inserted);
  Assert.equal(inserted.rootFolder, grandparent);
  Assert.equal(inserted.parent, parent);
  Assert.ok(!child.parent);
  Assert.deepEqual(parent.children, [inserted, sibling]);

  checkRow(inserted.id, {
    id: inserted.id,
    parent: parent.id,
    ordinal: null,
    name: "inserted",
    flags: 0,
  });
  checkNoRow(child.id);
  checkNoRow(grandchild.id);

  // Folders with the virtual flag shouldn't be removed.

  folders.updateFlags(inserted, Ci.nsMsgFolderFlags.Virtual);
  folders.reconcile(parent, ["siblîng"]);
  drawTree(parent);

  Assert.deepEqual(parent.children, [inserted, sibling]);
  checkRow(inserted.id, {
    id: inserted.id,
    parent: parent.id,
    ordinal: null,
    name: "inserted",
    flags: Ci.nsMsgFolderFlags.Virtual,
  });
});
