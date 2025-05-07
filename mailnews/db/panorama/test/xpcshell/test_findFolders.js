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
    "test1",
    "test1/test2",
    "test3",
  ]);

  // Check that the nsIFolder objects exist.

  const root = folders.getFolderByPath(server.key);
  drawTree(root);
  Assert.equal(root.parent, null);
  Assert.equal(root.name, server.key);
  checkRow(root.id, {
    id: root.id,
    parent: 0,
    ordinal: null,
    name: server.key,
    flags: 0,
  });
  Assert.equal(folders.getFolderById(root.id), root);

  // We added some files. Check they exist.

  const test1 = folders.getFolderByPath(`${server.key}/test1`);
  Assert.ok(test1);
  Assert.equal(test1.parent, root);
  Assert.equal(test1.name, "test1");
  checkRow(test1.id, {
    id: test1.id,
    parent: root.id,
    ordinal: null,
    name: "test1",
    flags: 0,
  });

  const test2 = folders.getFolderByPath(`${server.key}/test1/test2`);
  Assert.ok(test2);
  Assert.equal(test2.parent, test1);
  Assert.equal(test2.name, "test2");
  checkRow(test2.id, {
    id: test2.id,
    parent: test1.id,
    ordinal: null,
    name: "test2",
    flags: 0,
  });
  Assert.deepEqual(test1.children, [test2]);

  const test3 = folders.getFolderByPath(`${server.key}/test3`);
  Assert.ok(test3);
  Assert.equal(test3.parent, root);
  Assert.equal(test3.name, "test3");
  checkRow(test3.id, {
    id: test3.id,
    parent: root.id,
    ordinal: null,
    name: "test3",
    flags: 0,
  });

  Assert.deepEqual(root.children, [test1, test3]);
  Assert.deepEqual(test1.children, [test2]);
  Assert.deepEqual(root.descendants, [test1, test2, test3]);
}
