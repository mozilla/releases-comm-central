/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the reconciliation between folders in the database and a given list of
 * folders. Folders in the list but not the database should be added, folders
 * not in the list should be removed.
 */

add_setup(async function () {
  await installDB("relations.sqlite");
});

add_task(function testReconcile() {
  const grandparent = database.getFolderById(3);
  const parent = database.getFolderById(6);
  const child = database.getFolderById(4);
  const grandchild = database.getFolderById(1);
  const sibling = database.getFolderById(2);

  drawTree(parent);

  database.reconcile(parent, ["sibling", "inserted"]);
  drawTree(parent);

  const inserted = database.getFolderByPath("grandparent/parent/inserted");
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
});
