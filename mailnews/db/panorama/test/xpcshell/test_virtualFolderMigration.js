/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests migrating virtualFolders.dat into the new database.
 */

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

add_setup(async function () {
  const profile = new ProfileCreator(do_get_profile());
  const server = await profile.addLocalServer();
  await server.rootFolder.addMailFolder("foo");
  await server.rootFolder.addMailFolder("bar");
  await profile.addFile(
    "virtualFolders.dat",
    `version=1
uri=mailbox://nobody@Local%20Folders/all%20messages
scope=mailbox://nobody@Local%20Folders/foo|mailbox://nobody@Local%20Folders/bar
terms=ALL
searchOnline=false
uri=mailbox://nobody@Local%20Folders/foo/test
scope=mailbox://nobody@Local%20Folders/foo
terms=AND (subject,contains,test)
searchOnline=false
uri=mailbox://nobody@smart%20mailboxes/tags/%24label1
searchFolderFlag=1000
scope=*
terms=AND (tag,contains,$label1)
searchOnline=false
uri=mailbox://nobody@smart%20mailboxes/Trash
searchFolderFlag=100
scope=mailbox://nobody@Local%20Folders/Trash
terms=ALL
searchOnline=true
`
  );

  loadExistingDB();
  MailServices.accounts.accounts;
});

add_task(async function () {
  const rootFolder = MailServices.accounts.localFoldersServer.rootFolder;
  Assert.deepEqual(rootFolder.subFolders.map(f => f.name).toSorted(), [
    "Trash",
    "Unsent Messages",
    "all messages",
    "bar",
    "foo",
  ]);

  const foo = rootFolder.getChildNamed("foo");
  const bar = rootFolder.getChildNamed("bar");

  // Check "all messages" is migrated correctly.

  const allMessages = rootFolder.getChildNamed("all messages");
  const allMessagesInfo = allMessages.msgDatabase.dBFolderInfo;
  Assert.equal(
    allMessages.flags,
    Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags.Mail
  );
  Assert.equal(allMessagesInfo.getCharProperty("searchStr"), "ALL");
  Assert.ok(!allMessagesInfo.getBooleanProperty("searchOnline", true));

  const allMessagesWrapper = Cc[
    "@mozilla.org/mailnews/virtual-folder-wrapper;1"
  ].createInstance(Ci.nsIVirtualFolderWrapper);
  allMessagesWrapper.virtualFolder = allMessages;
  Assert.deepEqual(
    allMessagesWrapper.searchFolderURIs,
    "mailbox://nobody@Local%20Folders/foo|mailbox://nobody@Local%20Folders/bar"
  );
  Assert.deepEqual(allMessagesWrapper.searchFolders, [foo, bar]);
  Assert.equal(allMessagesWrapper.searchString, "ALL");
  Assert.equal(allMessagesWrapper.onlineSearch, false);

  // Check "test" is migrated correctly.

  const test = foo.getChildNamed("test");
  const testInfo = test.msgDatabase.dBFolderInfo;
  Assert.equal(
    test.flags,
    Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags.Mail
  );
  Assert.equal(
    testInfo.getCharProperty("searchStr"),
    "AND (subject,contains,test)"
  );
  Assert.ok(!testInfo.getBooleanProperty("searchOnline", true));

  const testWrapper = Cc[
    "@mozilla.org/mailnews/virtual-folder-wrapper;1"
  ].createInstance(Ci.nsIVirtualFolderWrapper);
  testWrapper.virtualFolder = test;
  Assert.deepEqual(
    testWrapper.searchFolderURIs,
    "mailbox://nobody@Local%20Folders/foo"
  );
  Assert.deepEqual(testWrapper.searchFolders, [foo]);
  Assert.equal(testWrapper.searchString, "AND (subject,contains,test)");
  Assert.equal(testWrapper.onlineSearch, false);

  // Check the database is populated correctly.

  const allMessagesId = folderDB.getFolderByPath("server1/all messages");
  checkRow(allMessagesId, {
    id: allMessagesId,
    parent: folderDB.getFolderByPath("server1"),
    ordinal: null,
    name: "all messages",
    flags: Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags.Mail,
  });

  const testId = folderDB.getFolderByPath("server1/foo/test");
  checkRow(testId, {
    id: testId,
    parent: folderDB.getFolderByPath("server1/foo"),
    ordinal: null,
    name: "test",
    flags: Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags.Mail,
  });

  let stmt = database.connectionForTests.createStatement(
    "SELECT id, name, value FROM folder_properties ORDER BY id, name"
  );
  let rows = [];
  while (stmt.executeStep()) {
    rows.push([stmt.row.id, stmt.row.name, stmt.row.value]);
  }
  stmt.finalize();

  Assert.deepEqual(rows, [
    [allMessagesId, "searchOnline", 0],
    [allMessagesId, "searchStr", "ALL"],
    [testId, "searchOnline", 0],
    [testId, "searchStr", "AND (subject,contains,test)"],
  ]);

  const fooId = folderDB.getFolderByPath("server1/foo");
  const barId = folderDB.getFolderByPath("server1/bar");
  stmt = database.connectionForTests.createStatement(
    "SELECT virtualFolderId, searchFolderId FROM virtualFolder_folders ORDER BY virtualFolderId, searchFolderId"
  );
  rows = [];
  while (stmt.executeStep()) {
    rows.push([stmt.row.virtualFolderId, stmt.row.searchFolderId]);
  }
  stmt.finalize();

  Assert.deepEqual(rows, [
    [allMessagesId, Math.min(fooId, barId)],
    [allMessagesId, Math.max(fooId, barId)],
    [testId, fooId],
  ]);
});
