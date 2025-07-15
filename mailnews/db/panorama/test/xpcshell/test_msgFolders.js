/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that getMsgFolderForFolder() works.
 */

add_task(async function testMsgFolders() {
  do_get_profile();
  await loadExistingDB();

  const account = MailServices.accounts.createLocalMailAccount();
  Assert.equal(account.incomingServer.key, "server1");

  const rootMsgFolder = account.incomingServer.rootFolder;
  rootMsgFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const alphaMsgFolder = rootMsgFolder.createLocalSubfolder("alpha");
  const bravoMsgFolder = rootMsgFolder.createLocalSubfolder("bravo");
  // These folders are created automagically at start-up.
  const outboxMsgFolder = rootMsgFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Queue
  );
  Assert.equal(outboxMsgFolder.name, "Unsent Messages");
  const trashMsgFolder = rootMsgFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Trash
  );
  Assert.equal(trashMsgFolder.name, "Trash");
  Assert.deepEqual(
    rootMsgFolder.subFolders.toSorted((a, b) => (a.name < b.name ? -1 : 1)),
    [trashMsgFolder, outboxMsgFolder, alphaMsgFolder, bravoMsgFolder]
  );

  const rootDBFolder = folderDB.getFolderByPath("server1");
  const alphaDBFolder = folderDB.getFolderByPath("server1/alpha");
  const bravoDBFolder = folderDB.getFolderByPath("server1/bravo");
  const outboxDBFolder = folderDB.getFolderByPath("server1/Unsent Messages");
  const trashDBFolder = folderDB.getFolderByPath("server1/Trash");
  Assert.deepEqual(folderDB.getFolderChildren(rootDBFolder), [
    trashDBFolder,
    outboxDBFolder,
    alphaDBFolder,
    bravoDBFolder,
  ]);

  Assert.equal(rootMsgFolder.id, rootDBFolder);
  Assert.equal(alphaMsgFolder.id, alphaDBFolder);
  Assert.equal(bravoMsgFolder.id, bravoDBFolder);
  Assert.equal(outboxMsgFolder.id, outboxDBFolder);
  Assert.equal(trashMsgFolder.id, trashDBFolder);

  Assert.equal(folderDB.getMsgFolderForFolder(rootDBFolder), rootMsgFolder);
  Assert.equal(folderDB.getMsgFolderForFolder(alphaDBFolder), alphaMsgFolder);
  Assert.equal(folderDB.getMsgFolderForFolder(bravoDBFolder), bravoMsgFolder);
  Assert.equal(folderDB.getMsgFolderForFolder(outboxDBFolder), outboxMsgFolder);
  Assert.equal(folderDB.getMsgFolderForFolder(trashDBFolder), trashMsgFolder);

  Assert.throws(
    () => folderDB.getMsgFolderForFolder(12345678),
    /NS_ERROR_/,
    "should fail for non-existent folder"
  );

  Assert.throws(
    () => folderDB.getMsgFolderForFolder(0),
    /NS_ERROR_/,
    "should fail for null folder"
  );
});
