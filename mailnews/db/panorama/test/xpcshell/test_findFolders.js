/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that folders on the filesystem are detected and added to the database
 * on start-up.
 *
 * TODO: Test the same thing, but with an existing database that does/doesn't
 * match the file system.
 */

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

add_setup(async function () {
  const profile = new ProfileCreator(do_get_profile());

  const mboxServer = profile.addLocalServer();
  const mboxFolder = await mboxServer.rootFolder.addMailFolder("test1");
  await mboxFolder.addMailFolder("test2");
  await mboxServer.rootFolder.addMailFolder("test3");

  const maildirServer = profile.addServer("nobody", "localhost", "none");
  maildirServer.isMaildirStore = true;
  const maildirFolder = await maildirServer.rootFolder.addMailFolder("test1");
  await maildirFolder.addMailFolder("test2");
  await maildirServer.rootFolder.addMailFolder("test3");

  // Start the account manager.

  MailServices.accounts.accounts;
  loadExistingDB();
});

add_task(async function () {
  await testFolderDiscovery(MailServices.accounts.localFoldersServer);
});

add_task(async function () {
  await testFolderDiscovery(
    MailServices.accounts.findServer("nobody", "localhost", "none")
  );
});

async function testFolderDiscovery(server) {
  const rootFolder = server.rootFolder;
  Assert.deepEqual(rootFolder.subFolders.map(f => f.name).toSorted(), [
    "Trash",
    "Unsent Messages",
    "test1",
    "test3",
  ]);
  Assert.deepEqual(
    rootFolder
      .getChildNamed("test1")
      .subFolders.map(f => f.name)
      .toSorted(),
    ["test2"]
  );
  Assert.deepEqual(rootFolder.descendants.map(f => f.prettyPath).toSorted(), [
    "Trash",
    "Unsent Messages",
    "test1",
    "test1/test2",
    "test3",
  ]);

  // Check that the folders are in the db.

  const root = folderDB.getFolderByPath(server.key);
  drawTree(root);
  Assert.equal(folderDB.getFolderParent(root), 0);
  Assert.equal(folderDB.getFolderName(root), server.key);
  checkRow(root, {
    id: root,
    parent: 0,
    ordinal: null,
    name: server.key,
    flags: 0,
  });

  // Special folders were added at start-up.

  const trash = folderDB.getFolderByPath(`${server.key}/Trash`);
  Assert.ok(trash);
  Assert.equal(folderDB.getFolderParent(trash), root);
  Assert.equal(folderDB.getFolderName(trash), "Trash");
  checkRow(trash, {
    id: trash,
    parent: root,
    ordinal: null,
    name: "Trash",
    flags: Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Mail,
  });

  const unsent = folderDB.getFolderByPath(`${server.key}/Unsent Messages`);
  Assert.ok(unsent);
  Assert.equal(folderDB.getFolderParent(unsent), root);
  Assert.equal(folderDB.getFolderName(unsent), "Unsent Messages");
  checkRow(unsent, {
    id: unsent,
    parent: root,
    ordinal: null,
    name: "Unsent Messages",
    flags: Ci.nsMsgFolderFlags.Queue | Ci.nsMsgFolderFlags.Mail,
  });

  // We added some files. Check they exist.

  const test1 = folderDB.getFolderByPath(`${server.key}/test1`);
  Assert.ok(test1);
  Assert.equal(folderDB.getFolderParent(test1), root);
  Assert.equal(folderDB.getFolderName(test1), "test1");
  checkRow(test1, {
    id: test1,
    parent: root,
    ordinal: null,
    name: "test1",
    flags: 0,
  });

  const test2 = folderDB.getFolderByPath(`${server.key}/test1/test2`);
  Assert.ok(test2);
  Assert.equal(folderDB.getFolderParent(test2), test1);
  Assert.equal(folderDB.getFolderName(test2), "test2");
  checkRow(test2, {
    id: test2,
    parent: test1,
    ordinal: null,
    name: "test2",
    flags: 0,
  });
  Assert.deepEqual(folderDB.getFolderChildren(test1), [test2]);

  const test3 = folderDB.getFolderByPath(`${server.key}/test3`);
  Assert.ok(test3);
  Assert.equal(folderDB.getFolderParent(test3), root);
  Assert.equal(folderDB.getFolderName(test3), "test3");
  checkRow(test3, {
    id: test3,
    parent: root,
    ordinal: null,
    name: "test3",
    flags: 0,
  });

  Assert.deepEqual(
    folderDB.getFolderChildren(root).toSorted(),
    [test1, test3, trash, unsent].toSorted()
  );
  Assert.deepEqual(
    folderDB.getFolderChildren(test1).toSorted(),
    [test2].toSorted()
  );
  Assert.deepEqual(
    folderDB.getFolderDescendants(root).toSorted(),
    [test1, test2, test3, trash, unsent].toSorted()
  );
}
