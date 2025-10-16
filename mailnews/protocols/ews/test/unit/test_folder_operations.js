/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var incomingServer;
var ewsServer;

const ewsIdPropertyName = "ewsId";
const generator = new MessageGenerator();

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({});
});

async function runDeleteFolderTest(folderToDeleteName) {
  // Reset the list of deleted folders on the server to avoid any side-effect
  // from another test
  ewsServer.deletedFolders = [];

  // Create a new remote folder for this test.
  ewsServer.appendRemoteFolder(
    new RemoteFolder(
      folderToDeleteName,
      "root",
      folderToDeleteName,
      folderToDeleteName
    )
  );

  // Sync the folder list, updated with the new folder.
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const child = rootFolder.getChildNamed(folderToDeleteName);
  Assert.ok(!!child, `${folderToDeleteName} should exist.`);

  // Record the new folder's EWS ID, so we can compare it with the server's data
  // later on.
  const remoteEwsId = child.getStringProperty(ewsIdPropertyName);

  // Delete the folder and make sure it results in a local deletion.
  child.deleteSelf(null);
  await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed(folderToDeleteName) == null,
    "the folder should eventually get deleted"
  );

  return remoteEwsId;
}

add_task(async function test_hard_delete() {
  // Set the delete model for the server to permanently delete.
  incomingServer.QueryInterface(Ci.IEwsIncomingServer).deleteModel =
    Ci.IEwsIncomingServer.PERMANENTLY_DELETE;
  const folderToDeleteName = "folder_to_hard_delete";
  const remoteEwsId = await runDeleteFolderTest(folderToDeleteName);

  // Ensure the server has recorded a folder deletion and that it's for the
  // folder we've just deleted.
  Assert.equal(
    1,
    ewsServer.deletedFolders.length,
    "the server should have recorded one folder deletion"
  );
  Assert.equal(
    remoteEwsId,
    ewsServer.deletedFolders[0].id,
    "the deleted folder should be the one we've just deleted"
  );
});

add_task(async function test_soft_delete() {
  // Set the delete model for the server to move to trash.
  incomingServer.QueryInterface(Ci.IEwsIncomingServer).deleteModel =
    Ci.IEwsIncomingServer.MOVE_TO_TRASH;
  const folderToDeleteName = "folder_to_soft_delete";
  const remoteEwsId = await runDeleteFolderTest(folderToDeleteName);

  Assert.equal(
    0,
    ewsServer.deletedFolders.length,
    "the server should have not recorded any deletions."
  );

  // Make sure it was moved to trash.
  const foundFolder = ewsServer.folders.filter(f => f.id === remoteEwsId);
  Assert.equal(foundFolder.length, 1, "Server should have folder in its list.");
  Assert.equal(
    foundFolder[0].parentId,
    "deleteditems",
    "Parent of deleted folder should be deleted items folder."
  );

  // Now test trash operations
  const trashFolder = incomingServer.rootFolder.getChildNamed("Deleted Items");
  Assert.ok(!!trashFolder, "server should have trash folder");
  Assert.ok(trashFolder.hasSubFolders, "Folder should be in trash");

  // Empty the trash (should work from any folder)
  trashFolder.emptyTrash(null);
  await TestUtils.waitForCondition(
    () => !trashFolder.hasSubFolders,
    "The trash should eventually be emptied."
  );

  await syncFolder(incomingServer, incomingServer.rootFolder);
  const unfoundFolder = ewsServer.folders.filter(f => f.id === remoteEwsId);
  Assert.equal(
    unfoundFolder.length,
    0,
    "Server should no longer have folder in its list."
  );
});

add_task(async function test_delete_id_mismatch() {
  // Reset the list of deleted folders on the server to avoid any side-effect
  // from another test
  ewsServer.deletedFolders = [];

  // Create a new remote folder for this test.
  const folderToDeleteName = "folder_to_delete_id_mismatch";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(
      folderToDeleteName,
      "root",
      folderToDeleteName,
      folderToDeleteName
    )
  );

  // Sync the folder list, updated with the new folder.
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const child = rootFolder.getChildNamed(folderToDeleteName);
  Assert.ok(!!child, `${folderToDeleteName} should exist.`);

  // Set the new folder's EWS ID to one the server does not know.
  child.setStringProperty(ewsIdPropertyName, "foo");

  // Delete the folder and make sure it results in a local deletion, even though
  // the server will respond by saying it doesn't know this folder.
  child.deleteSelf(null);
  await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed(folderToDeleteName) == null,
    "the folder should eventually get deleted"
  );

  // Ensure the server really did not know the folder, and so hasn't recorded
  // the deletion of a known folder.
  Assert.equal(
    0,
    ewsServer.deletedFolders.length,
    "the server should not have recorded any deletion"
  );
});

add_task(async function test_mark_as_read() {
  const folderName = "markRead";
  ewsServer.appendRemoteFolder(new RemoteFolder(folderName, "root"));

  const syntheticMessages = generator.makeMessages({ count: 3 });
  ewsServer.addMessages(folderName, syntheticMessages);

  const rootFolder = incomingServer.rootFolder;

  await syncFolder(incomingServer, rootFolder);
  const folder = rootFolder.getChildNamed(folderName);
  Assert.ok(!!folder, `${folderName} should exist`);

  await syncFolder(incomingServer, folder);
  Assert.equal(
    folder.getTotalMessages(false),
    3,
    `${folderName} should have 3 messages`
  );

  Assert.equal(
    folder.getNumUnread(false),
    3,
    "all messages should be unread at the start"
  );

  folder.markAllMessagesRead(null);

  await TestUtils.waitForCondition(
    () => folder.getNumUnread(false) == 0,
    "waiting for all messages to be marked as read locally"
  );

  await syncFolder(incomingServer, folder);
  Assert.equal(
    folder.getNumUnread(false),
    0,
    "all messages should still be read after sync"
  );
});
