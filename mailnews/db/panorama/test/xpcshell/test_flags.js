/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the hierarchical attributes and functions of folders.
 */

const FLAG_ONE = 0x1;
const FLAG_TWO = 0x2;
const FLAG_FOUR = 0x4;
const FLAG_EIGHT = 0x8;

add_setup(async function () {
  await installDBFromFile("db/relations.sql");
});

add_task(function testFlags() {
  const folderId = folderDB.getFolderByPath(
    "grandparent/parent/child/grandchild"
  );

  Assert.equal(folderDB.getFolderFlags(folderId), 0);
  checkFlags(0);

  for (let flagBits = 0; flagBits < 16; flagBits++) {
    folderDB.updateFlags(folderId, flagBits);
    Assert.equal(folderDB.getFolderFlags(folderId), flagBits);
    checkFlags(flagBits);
  }
});

function checkFlags(expected) {
  const stmt = database.connectionForTests.createStatement(
    "SELECT flags FROM folders WHERE id=:id"
  );
  stmt.params.id = 1;
  stmt.executeStep();
  Assert.equal(stmt.row.flags, expected);
  stmt.reset();
  stmt.finalize();
}
