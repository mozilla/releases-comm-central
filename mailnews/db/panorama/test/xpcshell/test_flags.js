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
  await installDB("relations.sqlite");
});

add_task(function testFlags() {
  const folder = database.getFolderById(1);

  Assert.equal(folder.flags, 0);
  checkFlags(0);

  for (const flag of [FLAG_ONE, FLAG_TWO, FLAG_FOUR, FLAG_EIGHT]) {
    database.updateFlags(folder, folder.flags | flag);
    Assert.equal(folder.flags, flag);
    checkFlags(flag);

    database.updateFlags(folder, folder.flags ^ flag);
    Assert.equal(folder.flags, 0);
    checkFlags(0);

    database.updateFlags(folder, folder.flags ^ flag);
    Assert.equal(folder.flags, flag);
    checkFlags(flag);

    database.updateFlags(folder, folder.flags & ~flag);
    Assert.equal(folder.flags, 0);
    checkFlags(0);
  }

  database.updateFlags(folder, folder.flags | FLAG_ONE);
  Assert.equal(folder.flags, FLAG_ONE);
  database.updateFlags(folder, folder.flags ^ FLAG_TWO);
  Assert.equal(folder.flags, FLAG_ONE | FLAG_TWO);
  database.updateFlags(folder, folder.flags | FLAG_FOUR);
  Assert.equal(folder.flags, FLAG_ONE | FLAG_TWO | FLAG_FOUR);
  database.updateFlags(folder, folder.flags ^ FLAG_EIGHT);
  Assert.equal(folder.flags, FLAG_ONE | FLAG_TWO | FLAG_FOUR | FLAG_EIGHT);

  database.updateFlags(folder, folder.flags ^ FLAG_ONE);
  Assert.equal(folder.flags, FLAG_TWO | FLAG_FOUR | FLAG_EIGHT);
  database.updateFlags(folder, folder.flags & ~FLAG_TWO);
  Assert.equal(folder.flags, FLAG_FOUR | FLAG_EIGHT);
  database.updateFlags(folder, folder.flags ^ FLAG_FOUR);
  Assert.equal(folder.flags, FLAG_EIGHT);
  database.updateFlags(folder, folder.flags & ~FLAG_EIGHT);
  Assert.equal(folder.flags, 0);
});

function checkFlags(expected) {
  const stmt = database.connection.createStatement(
    "SELECT flags FROM folders WHERE id=:id"
  );
  stmt.params.id = 1;
  stmt.executeStep();
  Assert.equal(stmt.row.flags, expected);
  stmt.reset();
  stmt.finalize();
}
