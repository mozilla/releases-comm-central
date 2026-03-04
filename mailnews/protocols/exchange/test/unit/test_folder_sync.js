/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

var incomingServer;
var ewsServer;

const ewsIdPropertyName = "ewsId";

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
 * Tests that triggering a folder hierarchy sync via
 * `nsIMsgFolder::GetNewMessages` correctly populates subfolders.
 */
add_task(async function test_get_new_messages() {
  // Populate the mock EWS server with all base folders.

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  // Check that all of the subfolders have been created.
  for (const folder of ewsServer.folders) {
    if (folder.distinguishedId == "msgfolderroot") {
      // The root folder should not be a subfolder of itself.
      continue;
    }

    const child = rootFolder.getChildNamed(folder.displayName);
    Assert.ok(!!child, `${folder.displayName} should exist`);
  }

  // TODO: Check that items are also populated.
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
  await syncFolder(incomingServer, rootFolder);
  const childShouldNotExist = rootFolder.getChildNamed(newFolderName);
  Assert.ok(!childShouldNotExist, `${newFolderName} should not exist.`);

  ewsServer.appendRemoteFolder(
    new RemoteFolder(newFolderName, "root", newFolderName, newFolderName)
  );

  await syncFolder(incomingServer, rootFolder);
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
  await syncFolder(incomingServer, rootFolder);
  const child = rootFolder.getChildNamed(folderToDeleteName);
  Assert.ok(!!child, `${folderToDeleteName} should exist.`);

  ewsServer.deleteRemoteFolderById(folderToDeleteName);
  Assert.equal(1, ewsServer.deletedFolders.length);
  await syncFolder(incomingServer, rootFolder);
  const deletedChild = rootFolder.getChildNamed(folderToDeleteName);
  Assert.ok(!deletedChild, `${folderToDeleteName} should not exist.`);
});

add_task(async function test_rename_folder() {
  const initialFolderName = "rename_folder_original";
  const finalFolderName = "rename_folder_new";

  ewsServer.appendRemoteFolder(
    new RemoteFolder(
      initialFolderName,
      "root",
      initialFolderName,
      initialFolderName
    )
  );

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const child = rootFolder.getChildNamed(initialFolderName);
  Assert.ok(!!child, `${initialFolderName} should exist.`);
  const initialEwsId = child.getStringProperty(ewsIdPropertyName);

  ewsServer.renameFolderById(initialFolderName, finalFolderName);
  await syncFolder(incomingServer, rootFolder);
  const renamedChild = rootFolder.getChildNamed(finalFolderName);
  Assert.ok(!!renamedChild, `${finalFolderName} should exist.`);
  const finalEwsId = renamedChild.getStringProperty(ewsIdPropertyName);
  Assert.equal(
    finalEwsId,
    initialEwsId,
    "EWS ID should be maintained through rename."
  );
});

add_task(async function test_reparent_folder() {
  const childName = "reparent_child";
  const parent1Name = "reparent_parent_1";
  const parent2Name = "reparent_parent_2";
  const parentNames = [parent1Name, parent2Name];

  parentNames.forEach(name => {
    ewsServer.appendRemoteFolder(new RemoteFolder(name, "root", name, name));
  });

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const parent1 = rootFolder.getChildNamed(parent1Name);
  Assert.ok(!!parent1, `${parent1Name} should exist.`);
  const parent2 = rootFolder.getChildNamed(parent2Name);
  Assert.ok(!!parent2, `${parent2Name} should exist.`);

  // Add the child to the first parent.
  ewsServer.appendRemoteFolder(
    new RemoteFolder(childName, parent1Name, childName, childName)
  );

  await syncFolder(incomingServer, parent1);
  const child = parent1.getChildNamed(childName);
  Assert.ok(!!child, `${childName} should exist in ${parent1Name}`);
  Assert.ok(
    !parent2.getChildNamed(childName),
    `${childName} should not exist in ${parent2Name}`
  );
  const initialEwsId = child.getStringProperty(ewsIdPropertyName);

  ewsServer.reparentFolderById(childName, parent2Name);

  await syncFolder(incomingServer, parent1);
  await syncFolder(incomingServer, parent2);
  const renamedChild = parent2.getChildNamed(childName);
  Assert.ok(!!renamedChild, `${childName} should exist in ${parent2Name}`);
  Assert.ok(
    !parent1.getChildNamed(childName),
    `${childName} should not exist in ${parent1Name}`
  );
  const finalEwsId = renamedChild.getStringProperty(ewsIdPropertyName);
  Assert.equal(
    finalEwsId,
    initialEwsId,
    "EWS ID should be maintained through reparent."
  );
});

add_task(async function test_reparent_folder_tree() {
  const parent1Name = "parent_1";
  const parent2Name = "parent_2";
  const child1Name = "child_1";
  const child2Name = "child_2";
  const child3Name = "child_3";

  // Create the parents.
  const parentNames = [parent1Name, parent2Name];
  parentNames.forEach(name => {
    ewsServer.appendRemoteFolder(new RemoteFolder(name, "root", name, name));
  });
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const parentFolders = parentNames.map(name => {
    const parentFolder = rootFolder.getChildNamed(name);
    Assert.ok(!!parentFolder, `${name} should exist in root folder.`);
    return parentFolder;
  });

  // Create the hierarchy under the first parent:
  // parent
  // | -- child1
  //      | -- child2
  //           | -- child3
  // Do this level-by-level to make it easier to know
  // when the async operations have completed.
  const ensureCreateFolder = async (childName, parentFolder) => {
    ewsServer.appendRemoteFolder(
      new RemoteFolder(childName, parentFolder.name, childName, childName)
    );
    await syncFolder(incomingServer, parentFolder);
    const newChild = parentFolder.getChildNamed(childName);
    Assert.ok(!!newChild, `${childName} should exist in ${parentFolder.name}`);
    return newChild;
  };
  const child1Folder = await ensureCreateFolder(child1Name, parentFolders[0]);
  const child2Folder = await ensureCreateFolder(child2Name, child1Folder);
  const child3Folder = await ensureCreateFolder(child3Name, child2Folder);

  const child1FolderEwsId = child1Folder.getStringProperty(ewsIdPropertyName);
  const child2FolderEwsId = child2Folder.getStringProperty(ewsIdPropertyName);
  const child3FolderEwsId = child3Folder.getStringProperty(ewsIdPropertyName);

  const assertHierarchy = parentName => {
    const parent = rootFolder.getChildNamed(parentName);
    Assert.ok(!!parent, `${parentName} should exist in root folder.`);
    const child1 = parent.getChildNamed(child1Name);
    Assert.ok(!!child1, `${child1Name} should exist in ${parentName}`);
    const child2 = child1.getChildNamed(child2Name);
    Assert.ok(!!child2, `${child2Name} should exist in ${child1Name}`);
    const child3 = child2.getChildNamed(child3Name);
    Assert.ok(!!child3, `${child3Name} should exist in ${child2Name}`);
  };

  assertHierarchy(parent1Name);

  // Reparent the entire hierarchy at once and wait for
  // the full operation to complete.
  ewsServer.reparentFolderById(child1Name, parent2Name);
  await syncFolder(incomingServer, parentFolders[0]);
  await syncFolder(incomingServer, parentFolders[1]);

  assertHierarchy(parent2Name);

  const child1Reparented = parentFolders[1].getChildNamed(child1Name);
  const child2Reparented = child1Reparented.getChildNamed(child2Name);
  const child3Reparented = child2Reparented.getChildNamed(child3Name);

  Assert.equal(
    child1Reparented.getStringProperty(ewsIdPropertyName),
    child1FolderEwsId,
    `${child1Name} EWS ID should be the same after reparenting.`
  );
  Assert.equal(
    child2Reparented.getStringProperty(ewsIdPropertyName),
    child2FolderEwsId,
    `${child2Name} EWS ID should be the same after reparenting.`
  );
  Assert.equal(
    child3Reparented.getStringProperty(ewsIdPropertyName),
    child3FolderEwsId,
    `${child3Name} EWS ID should be the same after reparenting.`
  );
});
