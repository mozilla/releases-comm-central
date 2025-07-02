/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the removal of folders from the database.
 */

add_setup(async function () {
  await installDBFromFile("db/move.sql");
});

add_task(function testDelete() {
  const grandparent = folderDB.getFolderById(1);
  const parent = folderDB.getFolderById(3);
  const a = folderDB.getFolderById(4);
  const a1 = folderDB.getFolderById(5);
  const a2 = folderDB.getFolderById(6);
  const b = folderDB.getFolderById(7);
  const b1 = folderDB.getFolderById(8);
  const c = folderDB.getFolderById(9);
  const d = folderDB.getFolderById(10);

  drawTree(parent);

  // Delete a leaf folder.
  folderDB.deleteFolder(b1);
  checkNoRow(b1.id);
  drawTree(parent);
  Assert.ok(!b1.rootFolder);
  Assert.ok(!b1.parent);
  Assert.deepEqual(b.children, []);

  // Delete a leaf folder with siblings.
  folderDB.deleteFolder(a1);
  checkNoRow(a1.id);
  drawTree(parent);
  Assert.ok(!a1.rootFolder);
  Assert.ok(!a1.parent);
  Assert.deepEqual(a.children, [a2]);

  // Delete a folder with children.
  folderDB.deleteFolder(d);
  checkNoRow(d.id);
  drawTree(parent);
  Assert.ok(!d.rootFolder);
  Assert.ok(!d.parent);
  Assert.deepEqual(parent.children, [a, b, c]);

  Assert.throws(
    () => folderDB.deleteFolder(grandparent),
    /NS_ERROR_UNEXPECTED/,
    "deleteFolder should not allow the deletion of a root folder"
  );

  const stmt = database.connectionForTests.createStatement(
    "SELECT id FROM folders ORDER BY id"
  );
  const remaining = [];
  while (stmt.executeStep()) {
    remaining.push(stmt.row.id);
  }
  stmt.reset();
  stmt.finalize();
  Assert.deepEqual(remaining, [1, 2, 3, 4, 6, 7, 9, 14, 15, 16]);
});
