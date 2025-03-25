/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that folders on the filesystem are detected and added to the database
 * on start-up.
 */

add_task(async function testFindFolders() {
  do_get_profile();

  const account = MailServices.accounts.createLocalMailAccount();
  Assert.equal(account.incomingServer.key, "server1");

  const rootFile = account.incomingServer.localPath;

  const test1File = rootFile.clone();
  test1File.append("test1.sbd");
  test1File.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755, true);

  const test2File = test1File.clone();
  test2File.append("test2");
  test2File.create(Ci.nsIFile.FILE_TYPE, 0o644, true);

  const test3File = rootFile.clone();
  test3File.append("test3.msf");
  test3File.create(Ci.nsIFile.FILE_TYPE, 0o644, true);

  info(Array.from(rootFile.directoryEntries, e => e.leafName));

  await loadExistingDB();

  const root = folders.getFolderByPath("server1");
  Assert.equal(root.id, 1);
  Assert.equal(root.parent, null);
  Assert.equal(root.name, "server1");
  checkRow(1, { id: 1, parent: 0, ordinal: null, name: "server1", flags: 0 });
  Assert.equal(folders.getFolderById(1), root);

  // `createLocalMailAccount` created two default folders. Check they exist.

  const trash = folders.getFolderByPath("server1/Trash");
  Assert.ok(trash);
  Assert.equal(trash.parent, root);
  Assert.equal(trash.name, "Trash");
  checkRow(trash.id, {
    id: trash.id,
    parent: 1,
    ordinal: null,
    name: "Trash",
    flags: Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Trash,
  });

  const outbox = folders.getFolderByPath("server1/Outbox");
  Assert.ok(outbox);
  Assert.equal(outbox.parent, root);
  Assert.equal(outbox.name, "Outbox");
  checkRow(outbox.id, {
    id: outbox.id,
    parent: 1,
    ordinal: null,
    name: "Outbox",
    flags: Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Queue,
  });

  // We added some files. Check they exist.

  const test1 = folders.getFolderByPath("server1/test1");
  Assert.ok(test1);
  Assert.equal(test1.parent, root);
  Assert.equal(test1.name, "test1");
  checkRow(test1.id, {
    id: test1.id,
    parent: 1,
    ordinal: null,
    name: "test1",
    flags: 0,
  });

  const test2 = folders.getFolderByPath("server1/test1/test2");
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

  const test3 = folders.getFolderByPath("server1/test3");
  Assert.ok(test3);
  Assert.equal(test3.parent, root);
  Assert.equal(test3.name, "test3");
  checkRow(test3.id, {
    id: test3.id,
    parent: 1,
    ordinal: null,
    name: "test3",
    flags: 0,
  });

  Assert.deepEqual(root.children, [outbox, test1, test3, trash]);
  Assert.deepEqual(root.descendants, [outbox, test1, test2, test3, trash]);
});
