/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

/**
 * Test basic invalidation of a folder hierarchy sync state token.
 */
add_task(async function testInvalidatedHierarchyTokenGraph() {
  const [graphServer, incomingGraphServer] = setupBasicGraphTestServer({
    username: "invalidated-token",
  });

  // Set up the initial local state.
  graphServer.setRemoteFolders(graphServer.getWellKnownFolders());
  graphServer.appendRemoteFolder(
    new RemoteFolder("obsolete", "root", "Obsolete")
  );
  const root = incomingGraphServer.rootFolder;
  await syncFolder(incomingGraphServer, root);
  Assert.ok(
    root.containsChildNamed("Obsolete"),
    "Initial sync should create new folder"
  );
  Assert.ok(
    incomingGraphServer.getStringValue("ewsSyncStateToken"),
    "Initial sync should save a sync state token"
  );

  // Modify the remote state.
  const folderName = "Inbox";
  const folderId = "inbox";
  const messages = new MessageGenerator().makeMessages({ count: 2 });
  graphServer.addMessages(folderId, messages);
  graphServer.deleteRemoteFolderById("obsolete");
  graphServer.appendRemoteFolder(
    new RemoteFolder("replacement", "root", "Replacement")
  );

  // Fetch the remote changes, with one invalidation.
  graphServer.invalidateNextDeltaTokens = 1;
  // Fetching new messages for one folder syncs the hierarchy first.
  await syncFolder(incomingGraphServer, root.getChildNamed(folderName));

  // Check the remote changes and preservation of local state.
  Assert.equal(
    incomingGraphServer.rootFolder,
    root,
    "Recovery should preserve the account root"
  );
  Assert.deepEqual(
    root.descendants.map(folder => folder.getStringProperty("ewsId")).sort(),
    graphServer.folders
      .filter(folder => folder.id != "root")
      .map(folder => folder.id)
      .sort(),
    "Folder list should match server's after token invalidation"
  );
  Assert.ok(
    incomingGraphServer.getStringValue("ewsSyncStateToken"),
    "Recovery should save a sync state token"
  );
  Assert.deepEqual(
    Array.from(root.getChildNamed(folderName).messages, header =>
      header.getStringProperty("ewsId")
    ).sort(),
    graphServer
      .getItemsInFolder(folderId)
      .map(message => message.id)
      .sort(),
    "Selected folder should now have the new messages"
  );
});

/**
 * Test invalidation of a hierarchy sync state token part way through a
 * paginated response.
 */
add_task(async function testInvalidatedHierarchyPaginationGraph() {
  const [graphServer, incomingGraphServer] = setupBasicGraphTestServer({
    username: "invalidated-pagination",
  });
  const root = incomingGraphServer.rootFolder;

  // The initial tokenless request succeeds with a partial hierarchy. Its
  // continuation request is invalidated after those folders are processed.
  graphServer.invalidateNextDeltaTokens = 1;
  graphServer.maxSyncItems = 2;
  await syncFolder(incomingGraphServer, root);

  Assert.deepEqual(
    root.descendants.map(folder => folder.getStringProperty("ewsId")).sort(),
    graphServer.folders
      .filter(folder => folder.id != "root")
      .map(folder => folder.id)
      .sort(),
    "Folder list should match server's after token invalidation"
  );
  Assert.ok(
    incomingGraphServer.getStringValue("ewsSyncStateToken"),
    "Recovery should save a sync state token"
  );
});

/**
 * Test later recovery from sequential hierarchy sync state token invalidations.
 *
 * Recovery is attempted only once per sync. A later sync must be able to
 * complete from the state left by a second invalidation.
 */
add_task(async function testInvalidatedHierarchyRecoveryGraph() {
  const [graphServer, incomingGraphServer] = setupBasicGraphTestServer({
    username: "invalidated-recovery",
  });

  // Set up the initial local state.
  graphServer.setRemoteFolders(graphServer.getWellKnownFolders());
  graphServer.appendRemoteFolder(
    new RemoteFolder("obsolete", "root", "Obsolete")
  );
  const root = incomingGraphServer.rootFolder;
  await syncFolder(incomingGraphServer, root);
  const folderCount = root.descendants.length;
  Assert.ok(
    incomingGraphServer.getStringValue("ewsSyncStateToken"),
    "Initial sync should save a sync state token"
  );

  // Modify the remote state.
  graphServer.deleteRemoteFolderById("obsolete");

  // Reject the saved token, then a continuation request during recovery.
  graphServer.invalidateNextDeltaTokens = 2;
  graphServer.maxSyncItems = 2;
  await syncFolder(incomingGraphServer, root);

  Assert.equal(
    incomingGraphServer.getStringValue("ewsSyncStateToken"),
    "",
    "A second invalidation should leave the sync state cleared for a later sync"
  );
  Assert.equal(
    root.descendants.length,
    folderCount,
    "Failed recovery should not remove existing folders"
  );

  // Return a complete snapshot without a deletion record for the old folder.
  graphServer.maxSyncItems = Infinity;
  await syncFolder(incomingGraphServer, root);
  Assert.deepEqual(
    root.descendants.map(folder => folder.getStringProperty("ewsId")).sort(),
    graphServer.folders
      .filter(folder => folder.id != "root")
      .map(folder => folder.id)
      .sort(),
    "A later sync should rebuild a complete folder list"
  );
  Assert.ok(
    incomingGraphServer.getStringValue("ewsSyncStateToken"),
    "A later successful sync should save a sync state token"
  );
});

/**
 * Test that saved search folders still work after the hierarchy it references
 * has its sync state token invalidated.
 */
add_task(async function testInvalidatedHierarchySavedSearchGraph() {
  const [graphServer, incomingGraphServer] = setupBasicGraphTestServer({
    username: "invalidated-saved-search",
  });
  const root = incomingGraphServer.rootFolder;
  await syncFolder(incomingGraphServer, root);

  // A saved search outside the account must retain its scope when the
  // hierarchy is rebuilt and its target folder still exists on the server.
  const inboxURI = root.getChildNamed("Inbox").URI;
  localAccountUtils.loadLocalMailAccount();
  const searchRoot = localAccountUtils.rootFolder;
  VirtualFolderHelper.createNewVirtualFolder(
    "Exchange search",
    searchRoot,
    [root.getChildNamed("Inbox")],
    "ALL",
    false
  );

  graphServer.invalidateNextDeltaTokens = 1;
  await syncFolder(incomingGraphServer, root);

  Assert.ok(
    searchRoot.containsChildNamed("Exchange search"),
    "Hierarchy recovery should preserve the saved search"
  );
  const search = VirtualFolderHelper.wrapVirtualFolder(
    searchRoot.getChildNamed("Exchange search")
  );
  Assert.equal(
    search.searchFolderURIs,
    inboxURI,
    "Hierarchy recovery should preserve the saved search's scope"
  );
});
