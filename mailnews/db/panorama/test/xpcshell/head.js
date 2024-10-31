/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let database;

async function installDB(dbName) {
  const profileDir = do_get_profile();
  const dbFile = do_get_file(`db/${dbName}`);
  dbFile.copyTo(profileDir, "panorama.sqlite");

  database = Cc["@mozilla.org/mailnews/folder-database;1"].getService(
    Ci.nsIFolderDatabase
  );
  await database.loadFolders();
}

registerCleanupFunction(function () {
  database = null;
});

function drawTree(root, level = 0) {
  console.log("  ".repeat(level) + root.name);
  for (const child of root.children) {
    drawTree(child, level + 1);
  }
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
