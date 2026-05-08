/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

var incomingEwsServer;
var ewsServer;
var incomingGraphServer;
var graphServer;

const ewsIdPropertyName = "ewsId";
const generator = new MessageGenerator();

add_setup(async function () {
  [ewsServer, incomingEwsServer] = setupBasicEwsTestServer({});
  [graphServer, incomingGraphServer] = setupBasicGraphTestServer();
});

async function runCreateFolderTest(mockServer, testIncomingServer) {
  // Reset the set of folders on the server to a known state.
  mockServer.setRemoteFolders(mockServer.getWellKnownFolders());

  // Sync the folder list.
  const rootFolder = testIncomingServer.rootFolder;
  await syncFolder(testIncomingServer, rootFolder);

  // Get the parent folder we'll use, and ensure the state is clean.
  const parentName = "Inbox";
  const newFolderName = "child";
  const parentFolder = rootFolder.getChildNamed(parentName);
  Assert.ok(!!parentFolder, `${parentName} should exist before creation`);
  Assert.equal(
    parentFolder.getChildNamed(newFolderName),
    null,
    "new folder should not exist on incoming server before creation"
  );
  Assert.ok(
    !mockServer.folders.some(folder => folder.displayName == newFolderName),
    "new folder should not exist on the mock server before creation"
  );

  // Create the new folder.
  parentFolder.createSubfolder(newFolderName, null);
  await TestUtils.waitForCondition(
    () => !!parentFolder.getChildNamed(newFolderName),
    "new folder should eventually be created locally"
  );

  // Check that the operation behaved as expected.
  const remoteFolders = mockServer.folders.filter(
    folder => folder.displayName == newFolderName
  );
  Assert.equal(
    remoteFolders.length,
    1,
    "exactly one remote folder should exist"
  );
  Assert.equal(
    remoteFolders[0].parentId,
    "inbox",
    "new folder should have the right parent"
  );
}

add_task(async function test_create_folder() {
  await runCreateFolderTest(ewsServer, incomingEwsServer);
  await runCreateFolderTest(graphServer, incomingGraphServer);
});

/**
 * Create and delete a folder.
 *
 * @param {string} folderToDeleteName The name of the folder to create and then delete.
 * @param {nsIMsgFolder} parentFolder The folder in which to create/delete the new folder.
 * @param {MockServer} mockServer The mock server managing the test data.
 * @param {nsIMsgIncomingServer} incomingServer The incoming server.
 *
 * @returns {string} The ID of the folder *before* it was deleted.
 */
async function runDeleteFolderTest(
  folderToDeleteName,
  parentFolder,
  mockServer,
  incomingServer
) {
  Assert.ok(
    !!parentFolder,
    `The parent folder for the delete test should exist.`
  );

  const parentId = parentFolder.isServer
    ? "root"
    : parentFolder.getStringProperty(ewsIdPropertyName);

  // Reset the list of deleted folders on the server to avoid any side-effect
  // from another test
  mockServer.deletedFolders = [];

  // Create a new remote folder for this test.
  mockServer.appendRemoteFolder(
    new RemoteFolder(
      folderToDeleteName,
      parentId,
      folderToDeleteName,
      folderToDeleteName
    )
  );

  // Sync the folder list, updated with the new folder.
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const child = parentFolder.getChildNamed(folderToDeleteName);
  Assert.ok(!!child, `${folderToDeleteName} should exist.`);

  // Record the new folder's EWS ID, so we can compare it with the server's data
  // later on.
  const remoteEwsId = child.getStringProperty(ewsIdPropertyName);

  // Delete the folder and make sure it results in a local deletion.
  child.deleteSelf(null);
  await TestUtils.waitForCondition(
    () => parentFolder.getChildNamed(folderToDeleteName) == null,
    "the folder should eventually get deleted"
  );

  return remoteEwsId;
}

async function runHardDeleteTest(mockServer, incomingServer) {
  // Set the delete model for the server to permanently delete.
  incomingServer.QueryInterface(Ci.IEwsIncomingServer).deleteModel =
    Ci.IEwsIncomingServer.PERMANENTLY_DELETE;
  const folderToDeleteName = "folder_to_hard_delete";
  const remoteEwsId = await runDeleteFolderTest(
    folderToDeleteName,
    incomingServer.rootFolder,
    mockServer,
    incomingServer
  );

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
}

add_task(async function test_hard_delete_ews() {
  await runHardDeleteTest(ewsServer, incomingEwsServer);
});
add_task(async function test_hard_delete_graph() {
  await runHardDeleteTest(graphServer, incomingGraphServer);
});

async function runDeleteFromTrashTest(mockServer, incomingServer) {
  // Set the delete model for the server to soft delete.
  incomingServer.QueryInterface(Ci.IEwsIncomingServer).deleteModel =
    Ci.IEwsIncomingServer.MOVE_TO_TRASH;
  const folderToDeleteName = "folder_to_delete_from_trash";
  const trashFolder = incomingServer.rootFolder.getChildNamed("deleted items");
  const remoteEwsId = await runDeleteFolderTest(
    folderToDeleteName,
    trashFolder,
    mockServer,
    incomingServer
  );

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
}

add_task(async function test_delete_from_trash_ews() {
  await runDeleteFromTrashTest(ewsServer, incomingEwsServer);
});
add_task(async function test_delete_from_trash_graph() {
  await runDeleteFromTrashTest(graphServer, incomingGraphServer);
});

async function runSoftDeleteTest(mockServer, incomingServer) {
  // Set the delete model for the server to move to trash.
  incomingServer.QueryInterface(Ci.IEwsIncomingServer).deleteModel =
    Ci.IEwsIncomingServer.MOVE_TO_TRASH;
  const folderToDeleteName = "folder_to_soft_delete";
  let remoteEwsId = await runDeleteFolderTest(
    folderToDeleteName,
    incomingServer.rootFolder,
    mockServer,
    incomingServer
  );

  Assert.equal(
    0,
    mockServer.deletedFolders.length,
    "the server should have not recorded any deletions."
  );

  // Make sure it was moved to trash.
  if (incomingServer.type == "graph") {
    // This is one area where graph and EWS differ: In EWS, IDs are stable
    // between reparenting, while in Graph it changes. The mock server prepends
    // "moved-folder-" in the unstable case.
    remoteEwsId = `moved-folder-${remoteEwsId}`;
  }
  const foundFolder = mockServer.folders.filter(f => f.id === remoteEwsId);
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
  const unfoundFolder = mockServer.folders.filter(f => f.id === remoteEwsId);
  Assert.equal(
    unfoundFolder.length,
    0,
    "Server should no longer have folder in its list."
  );
}

add_task(async function test_soft_delete_ews() {
  await runSoftDeleteTest(ewsServer, incomingEwsServer);
});

// TODO: Uncomment this once we implement the empty trash operation for graph.
// See https://bugzilla.mozilla.org/show_bug.cgi?id=2037684
// add_task(async function test_soft_delete_graph() {
//   await runSoftDeleteTest(graphServer, incomingGraphServer);
// });

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
  const rootFolder = incomingEwsServer.rootFolder;
  await syncFolder(incomingEwsServer, rootFolder);
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

  const rootFolder = incomingEwsServer.rootFolder;

  await syncFolder(incomingEwsServer, rootFolder);
  const folder = rootFolder.getChildNamed(folderName);
  Assert.ok(!!folder, `${folderName} should exist`);

  await syncFolder(incomingEwsServer, folder);
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

  await syncFolder(incomingEwsServer, folder);
  Assert.equal(
    folder.getNumUnread(false),
    0,
    "all messages should still be read after sync"
  );
});

async function runRenameFolderTest(mockServer, incomingServer) {
  const originalFolderName = "renameFolder-original";
  const renamedFolderName = "renameFolder-renamed";
  mockServer.appendRemoteFolder(
    new RemoteFolder(
      originalFolderName,
      "root",
      originalFolderName,
      originalFolderName
    )
  );

  const rootFolder = incomingServer.rootFolder;

  await syncFolder(incomingServer, rootFolder);

  const testFolder = rootFolder.getChildNamed(originalFolderName);
  Assert.ok(!!testFolder, "Folder to rename should exist.");

  testFolder.rename(renamedFolderName, null);

  await TestUtils.waitForCondition(
    () => !!rootFolder.getChildNamed(renamedFolderName),
    "Folder should be renamed."
  );
}

add_task(async function test_renameFolderEws() {
  await runRenameFolderTest(ewsServer, incomingEwsServer);
});

add_task(async function test_renameFolderGraph() {
  await runRenameFolderTest(graphServer, incomingGraphServer);
});
