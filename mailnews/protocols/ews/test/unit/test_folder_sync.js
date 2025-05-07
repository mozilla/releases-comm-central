/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var incomingServer;
var ewsServer;

add_setup(async function () {
  // Ensure we have an on-disk profile.
  do_get_profile();

  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer();
  ewsServer.start();

  // Create and configure the EWS incoming server.
  incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
  });
});

/**
 * Wait for the final create operation given the mock server data.
 *
 * @param {nsIMsgFolder} folder - The direct parent of the last folder to be created.
 */
async function waitForFinalCreate(folder) {
  // Wait for the folders list to finish being synchronised.
  await TestUtils.waitForCondition(() => {
    // Folders are created in the order we give them to the EWS server in.
    // Therefore if the last one in the array has been created, we can safely
    // assume all of the folders have been correctly synchronised.
    const lastFolder = ewsServer.folders.at(-1);
    return !!folder.getChildNamed(lastFolder.displayName);
  }, "waiting for subfolders to populate");
}

/**
 * Wait for the final delete operation given the mock server data.
 *
 * @param {nsIMsgFolder} folder - The direct parent of the last folder to be deleted.
 */
async function waitForFinalDelete(folder) {
  await TestUtils.waitForCondition(() => {
    const lastDelete = ewsServer.deletedFolders.at(-1);
    return !folder.getChildNamed(lastDelete.displayName);
  }, "waiting for subfolders to be deleted");
}

/**
 * Tests that triggering a folder hierarchy sync via
 * `nsIMsgFolder::GetNewMessages` correctly populates subfolders.
 */
add_task(async function test_get_new_messages() {
  // Populate the mock EWS server with all base folders.

  const rootFolder = incomingServer.rootFolder;
  rootFolder.getNewMessages(null, null);
  await waitForFinalCreate(rootFolder);

  // Check that all of the subfolders have been created.
  for (const folder of ewsServer.folders) {
    if (folder.distinguishedId == "msgfolderroot") {
      // The root folder should not be a subfolder of itself.
      continue;
    }

    const child = rootFolder.getChildNamed(folder.displayName);
    Assert.ok(!!child, `${folder.displayName} should exist`);
  }
});

/**
 * Tests that adding a new folder causes it to show up on the next sync via
 * `nsIMSgFolder::GetNewMessages`. The implementation of the mock server also
 * ensures that this test is testing repeat creations of existing folders as the
 * mock server sends a complete sync for every request for new messages.
 */
add_task(async function test_create_folder() {
  const newFolderName = "created_folder";

  const rootFolder = incomingServer.rootFolder;
  rootFolder.getNewMessages(null, null);
  await waitForFinalCreate(rootFolder);
  const childShouldNotExist = rootFolder.getChildNamed(newFolderName);
  Assert.ok(!childShouldNotExist, `${newFolderName} should not exist.`);

  ewsServer.appendRemoteFolder(
    new RemoteFolder(newFolderName, "root", newFolderName, newFolderName)
  );

  rootFolder.getNewMessages(null, null);
  await waitForFinalCreate(rootFolder);
  const child = rootFolder.getChildNamed(newFolderName);
  Assert.ok(!!child, `${newFolderName} should exist.`);
});

/**
 * Tests that deleting a folder causes it to be remove on the next
 * sync via `nsIMsgFolder::GetNewMessages`.
 */
add_task(async function test_delete_folder() {
  const folderToDeleteName = "folder_to_delete";

  ewsServer.appendRemoteFolder(
    new RemoteFolder(
      folderToDeleteName,
      "root",
      folderToDeleteName,
      folderToDeleteName
    )
  );

  const rootFolder = incomingServer.rootFolder;
  rootFolder.getNewMessages(null, null);
  await waitForFinalCreate(rootFolder);
  const child = rootFolder.getChildNamed(folderToDeleteName);
  Assert.ok(!!child, `${folderToDeleteName} should exist.`);

  ewsServer.deleteRemoteFolderById(folderToDeleteName);
  Assert.equal(1, ewsServer.deletedFolders.length);
  rootFolder.getNewMessages(null, null);
  await waitForFinalDelete(rootFolder);
  const deletedChild = rootFolder.getChildNamed(folderToDeleteName);
  Assert.ok(!deletedChild, `${folderToDeleteName} should not exist.`);
});
