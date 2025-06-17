/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that changing the name of a folder results in it being stored
 * correctly in the database.
 */

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

add_task(async function () {
  do_get_profile();
  const profile = new ProfileCreator(do_get_profile());
  const server = profile.addLocalServer();
  await server.rootFolder.addMailFolder("folderA");
  await server.rootFolder.addMailFolder("folderB");
  await server.rootFolder.addMailFolder("folderC");
  await installDBFromFile("db/messages.sql");

  Assert.deepEqual(
    Array.from(MailServices.accounts.allServers, s => s.key),
    ["server1"]
  );

  let stmt = database.connectionForTests.createStatement(
    "SELECT id, name FROM folders ORDER BY id"
  );
  let dbFolders = [];
  while (stmt.executeStep()) {
    dbFolders.push([stmt.row.id, stmt.row.name]);
  }
  stmt.reset();
  stmt.finalize();

  Assert.deepEqual(dbFolders, [
    [1, "server1"],
    [2, "folderA"],
    [3, "folderB"],
    [4, "folderC"],
    [5, "Trash"],
    [6, "Unsent Messages"],
  ]);

  const folderA = MailServices.folderLookup.getFolderForURL(
    "mailbox://nobody@Local%20Folders/folderA"
  );
  Assert.equal(folderA.filePath.leafName, "folderA");
  Assert.equal(folderA.name, "folderA");

  folderA.name = "alpha";
  Assert.equal(folderA.filePath.leafName, "folderA");
  Assert.equal(folderA.name, "alpha");
  Assert.equal(folderA.URI, "mailbox://nobody@Local%20Folders/folderA");

  Assert.ok(
    MailServices.folderLookup.getFolderForURL(
      "mailbox://nobody@Local%20Folders/folderA"
    ),
    "folder should still be available at the original URL"
  );
  Assert.ok(
    !MailServices.folderLookup.getFolderForURL(
      "mailbox://nobody@Local%20Folders/alpha"
    ),
    "folder should not still be available at a new URL"
  );

  stmt = database.connectionForTests.createStatement(
    "SELECT id, name FROM folders ORDER BY id"
  );
  dbFolders = [];
  while (stmt.executeStep()) {
    dbFolders.push([stmt.row.id, stmt.row.name]);
  }
  stmt.reset();
  stmt.finalize();

  Assert.deepEqual(dbFolders, [
    [1, "server1"],
    [2, "alpha"],
    [3, "folderB"],
    [4, "folderC"],
    [5, "Trash"],
    [6, "Unsent Messages"],
  ]);

  stmt = database.connectionForTests.createStatement(
    "SELECT id, name, value FROM folder_properties ORDER BY id, name"
  );
  const properties = [];
  while (stmt.executeStep()) {
    properties.push([stmt.row.id, stmt.row.name, stmt.row.value]);
  }
  stmt.finalize();

  Assert.deepEqual(properties, []);
});
