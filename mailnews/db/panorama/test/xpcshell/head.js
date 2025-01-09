/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let database, folders, messages;

async function installDB(dbName) {
  const profileDir = do_get_profile();
  const dbFile = do_get_file(`db/${dbName}`);
  dbFile.copyTo(profileDir, "panorama.sqlite");

  await loadExistingDB();
}

async function loadExistingDB() {
  database = Cc["@mozilla.org/mailnews/database-core;1"].getService(
    Ci.nsIDatabaseCore
  );
  await database.startup();
  folders = database.folders;
  messages = database.messages;
}

registerCleanupFunction(function () {
  folders = null;
  messages = null;
  database = null;
});

function drawTree(root, level = 0) {
  console.log("  ".repeat(level) + root.name);
  for (const child of root.children) {
    drawTree(child, level + 1);
  }
}

function checkRow(id, expected) {
  const stmt = database.connection.createStatement(
    "SELECT id, parent, ordinal, name, flags FROM folders WHERE id = :id"
  );
  stmt.params.id = id;
  stmt.executeStep();
  Assert.equal(stmt.row.id, expected.id, "row id");
  Assert.equal(stmt.row.parent, expected.parent, "row parent");
  Assert.equal(stmt.row.ordinal, expected.ordinal, "row ordinal");
  Assert.equal(stmt.row.name, expected.name, "row name");
  Assert.equal(stmt.row.flags, expected.flags, "row flags");
  stmt.reset();
  stmt.finalize();
}

function checkNoRow(id) {
  const stmt = database.connection.createStatement(
    "SELECT id, parent, ordinal, name, flags FROM folders WHERE id = :id"
  );
  stmt.params.id = id;
  Assert.ok(!stmt.executeStep(), `row ${id} should not exist`);
  stmt.reset();
  stmt.finalize();
}

function checkOrdinals(expected) {
  const stmt = database.connection.createStatement(
    "SELECT parent, ordinal FROM folders WHERE id=:id"
  );
  for (const [folder, parent, ordinal] of expected) {
    stmt.params.id = folder.id;
    stmt.executeStep();
    Assert.deepEqual(
      [stmt.row.parent, stmt.row.ordinal],
      [parent, ordinal],
      `parent and ordinal of ${folder.name}`
    );
    stmt.reset();
  }
  stmt.finalize();
}
