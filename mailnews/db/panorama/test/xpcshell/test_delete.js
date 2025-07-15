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
  const grandparent = 1;
  const parent = 3;
  const a = 4;
  const a1 = 5;
  const a2 = 6;
  const b = 7;
  const b1 = 8;
  const c = 9;
  const d = 10;

  drawTree(parent);

  // Delete a leaf folder.
  folderDB.deleteFolder(b1);
  checkNoRow(b1);
  drawTree(parent);
  Assert.throws(
    () => folderDB.getFolderRoot(b1),
    /NS_ERROR_UNEXPECTED/,
    "Deleted folder should be gone"
  );
  Assert.throws(
    () => folderDB.getFolderParent(b1),
    /NS_ERROR_UNEXPECTED/,
    "Deleted folder should be gone"
  );
  Assert.deepEqual(folderDB.getFolderChildren(b), []);

  // Delete a leaf folder with siblings.
  folderDB.deleteFolder(a1);
  checkNoRow(a1);
  drawTree(parent);
  Assert.deepEqual(folderDB.getFolderChildren(a), [a2]);

  // Delete a folder with children.
  folderDB.deleteFolder(d);
  checkNoRow(d);
  drawTree(parent);
  Assert.deepEqual(
    folderDB.getFolderChildren(parent).toSorted(),
    [a, b, c].toSorted()
  );

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
