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

/**
 * Test basic invalidation of a folder's sync state token.
 */
add_task(async function testInvalidatedMessageTokenGraph() {
  const [graphServer, incomingGraphServer] = setupBasicGraphTestServer({
    username: "invalidated-messages",
  });

  // Set up the initial local state.
  const folderName = "Inbox";
  const folderId = "inbox";
  const root = incomingGraphServer.rootFolder;
  await syncFolder(incomingGraphServer, root);
  const folder = root.getChildNamed(folderName);
  const generator = new MessageGenerator();
  const messages = generator.makeMessages({ count: 2 });
  graphServer.addMessages(folderId, messages);
  await syncFolder(incomingGraphServer, folder);
  const original = folder.msgDatabase.getMsgHdrForMessageID(
    messages[0].messageId
  );
  const originalKey = original.messageKey;
  original.setStringProperty("keywords", "keep-tag");
  const token = folder.getStringProperty("ewsSyncStateToken");
  Assert.ok(token, "Initial sync should save a sync state token");

  // Modify the remote state.
  messages[0].metaState.read = true;
  graphServer.deleteItem(messages[1].messageId);
  const added = generator.makeMessages({ count: 1 });
  graphServer.addMessages(folderId, added);

  // Fetch the remote changes, with one invalidation.
  graphServer.invalidateNextDeltaTokens = 1;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  // This needs to be called directly, to avoid invalidating the hierarchy sync
  // in syncFolder instead of the target folder delta request.
  folder.getNewMessages(false, listener);
  await listener.promise;

  // Check the remote changes and preservation of local state.
  Assert.deepEqual(
    Array.from(folder.messages, header =>
      header.getStringProperty("ewsId")
    ).sort(),
    graphServer
      .getItemsInFolder(folderId)
      .map(message => message.id)
      .sort(),
    "Folder contents should match server's after token invalidation"
  );
  const surviving = folder.msgDatabase.getMsgHdrForMessageID(
    messages[0].messageId
  );
  Assert.equal(
    surviving.messageKey,
    originalKey,
    "Surviving messages should keep their keys"
  );
  Assert.equal(
    surviving.getStringProperty("keywords"),
    "keep-tag",
    "Recovery should preserve local tags"
  );
  Assert.ok(surviving.isRead, "Recovery should refresh server message flags");
  Assert.equal(
    folder.getNumNewMessages(false),
    1,
    "Existing messages should not be reported as new"
  );
  Assert.ok(
    folder.getStringProperty("ewsSyncStateToken"),
    "Recovery should save a sync state token"
  );
  Assert.notEqual(
    folder.getStringProperty("ewsSyncStateToken"),
    token,
    "Recovery should replace the invalidated sync state token"
  );
});

/**
 * Test invalidation of a folder's sync state token part way through a
 * paginated response.
 */
add_task(async function testInvalidatedMessagePaginationGraph() {
  const [graphServer, incomingGraphServer] = setupBasicGraphTestServer({
    username: "invalidated-message-pagination",
  });

  // Set up the initial local state.
  const folderName = "Inbox";
  const folderId = "inbox";
  const root = incomingGraphServer.rootFolder;
  await syncFolder(incomingGraphServer, root);
  const folder = root.getChildNamed(folderName);
  const messages = new MessageGenerator().makeMessages({ count: 3 });
  graphServer.addMessages(folderId, messages);
  // Clear the token to avoid invalidating the first page.
  folder.setStringProperty("ewsSyncStateToken", "");
  graphServer.maxSyncItems = 1;

  // After the first page creates a local message, delete it remotely and
  // invalidate the next page fetch.
  const notificationListener = {
    msgAdded(header) {
      if (header.messageId == messages[0].messageId) {
        graphServer.deleteItem(messages[0].messageId);
        graphServer.invalidateNextDeltaTokens = 1;
      }
    },
  };
  MailServices.mfn.addListener(
    notificationListener,
    Ci.nsIMsgFolderNotificationService.msgAdded
  );
  try {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    folder.getNewMessages(false, listener);
    await listener.promise;
  } finally {
    MailServices.mfn.removeListener(notificationListener);
  }

  Assert.deepEqual(
    Array.from(folder.messages, header =>
      header.getStringProperty("ewsId")
    ).sort(),
    graphServer
      .getItemsInFolder(folderId)
      .map(message => message.id)
      .sort(),
    "Folder contents should match server's after token invalidation"
  );
  Assert.equal(
    folder.getNumNewMessages(false),
    2,
    "Only surviving messages should be reported as new mail"
  );
  Assert.ok(
    folder.getStringProperty("ewsSyncStateToken"),
    "Recovery should save a sync state token"
  );
});

/**
 * Test later recovery from sequential folder sync state token invalidations.
 *
 * Recovery is attempted only once per sync. A later sync must be able to
 * complete from the state left by a second invalidation.
 */
add_task(async function testInvalidatedMessageRecoveryGraph() {
  const [graphServer, incomingGraphServer] = setupBasicGraphTestServer({
    username: "invalidated-message-recovery",
  });

  // Set up the initial local state.
  const folderName = "Inbox";
  const folderId = "inbox";
  const root = incomingGraphServer.rootFolder;
  await syncFolder(incomingGraphServer, root);
  const folder = root.getChildNamed(folderName);
  const messages = new MessageGenerator().makeMessages({ count: 3 });
  graphServer.addMessages(folderId, messages);
  await syncFolder(incomingGraphServer, folder);
  Assert.ok(
    folder.getStringProperty("ewsSyncStateToken"),
    "Initial sync should save a sync state token"
  );

  // Modify the remote state.
  graphServer.deleteItem(messages[0].messageId);

  // Reject the saved token, then a continuation request during recovery.
  graphServer.invalidateNextDeltaTokens = 2;
  graphServer.maxSyncItems = 1;

  let listener = new PromiseTestUtils.PromiseUrlListener();
  folder.getNewMessages(false, listener);
  await Assert.rejects(
    listener.promise,
    new RegExp(Cr.NS_ERROR_NET_ERROR_RESPONSE),
    "A second invalidation should fail to sync"
  );
  Assert.equal(
    folder.getStringProperty("ewsSyncStateToken"),
    "",
    "A second invalidation should leave the sync state cleared for a later sync"
  );
  Assert.equal(
    folder.getTotalMessages(false),
    messages.length,
    "Failed recovery should not remove existing messages"
  );

  // Return a complete snapshot without a deletion record for the old message.
  graphServer.maxSyncItems = Infinity;
  listener = new PromiseTestUtils.PromiseUrlListener();
  folder.getNewMessages(false, listener);
  await listener.promise;
  Assert.deepEqual(
    Array.from(folder.messages, header =>
      header.getStringProperty("ewsId")
    ).sort(),
    graphServer
      .getItemsInFolder(folderId)
      .map(message => message.id)
      .sort(),
    "A later sync should rebuild the folder contents"
  );
  Assert.ok(
    folder.getStringProperty("ewsSyncStateToken"),
    "A later successful sync should save a sync state token"
  );
});
