/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

// TODO: Figure out inclusion of support files for providing responses to
// requests.

/**
 * An EWS client implementation against which we will test.
 *
 * @type {IExchangeClient}
 */
var ewsClient;

/**
 * A Graph client implementation against which we will test.
 *
 * @type {IExchangeClient}
 */
var graphClient;

/**
 * A mock Exchange server instance to provide request/response handling.
 *
 * @type {EwsServer}
 */
var ewsServer;

/**
 * A mock Exchange server instance to provide request/response handling.
 *
 * @type {GraphServer}
 */
var graphServer;

/**
 * Respective incoming server for EWS.
 *
 * @type {nsIMsgIncomingServer}
 */
var incomingEwsServer;

/**
 * Respective incoming server for Graph.
 *
 * @type {nsIMsgIncomingServer}
 */
var incomingGraphServer;

add_setup(() => {
  // Create and configure the EWS and Graph incoming servers.
  [ewsServer, incomingEwsServer] = setupBasicEwsTestServer({});
  [graphServer, incomingGraphServer] = setupBasicGraphTestServer();

  ewsClient = Cc["@mozilla.org/messenger/ews-client;1"].createInstance(
    Ci.IExchangeClient
  );
  ewsClient.initialize(
    incomingEwsServer.getStringValue("ews_url"),
    incomingEwsServer,
    false,
    "",
    "",
    "",
    "",
    ""
  );

  graphClient = Cc["@mozilla.org/messenger/graph-client;1"].createInstance(
    Ci.IExchangeClient
  );
  graphClient.initialize(
    incomingGraphServer.getStringValue("ews_url"),
    incomingGraphServer,
    false,
    "",
    "",
    "",
    "",
    ""
  );
});

/**
 * Test sync where the server returns all changes and we don't have to
 * worry about batching.
 */
add_task(async function testSimpleSync() {
  await runSimpleSyncTest(ewsClient);
  await runSimpleSyncTest(graphClient);
});

async function runSimpleSyncTest(syncClient) {
  const listener = new EwsFolderCallbackListener();
  syncClient.syncFolderHierarchy(listener, null);
  await listener._deferred.promise;

  Assert.deepEqual(
    [...listener._createdFolderIds],
    [
      "inbox",
      "deleteditems",
      "drafts",
      "outbox",
      "sentitems",
      "junkemail",
      "archive",
    ],
    "all folders should have synced"
  );
  Assert.ok(listener._syncStateToken, "sync token should exist");
}

/**
 * Test sync when a folder does not have a folder class.
 *
 * These should be created even though they don't have a class.
 * See https://bugzilla.mozilla.org/show_bug.cgi?id=2009429
 */
add_task(async function testSyncClasslessFolder() {
  ewsServer.appendRemoteFolder(
    new RemoteFolder("classless", "root", "classless", "classless", null)
  );

  const listener = new EwsFolderCallbackListener();
  ewsClient.syncFolderHierarchy(listener, null);
  await listener._deferred.promise;

  Assert.deepEqual(
    [...listener._createdFolderIds],
    [
      "inbox",
      "deleteditems",
      "drafts",
      "outbox",
      "sentitems",
      "junkemail",
      "archive",
      "classless",
    ]
  );
});

/**
 * Test sync where the server tells us that not all changes are included
 * and we have to loop.
 */
add_task(async function testSecondSyncRequired() {
  await runSecondSyncRequiredTest(ewsServer, ewsClient);
  await runSecondSyncRequiredTest(graphServer, graphClient);
});

async function runSecondSyncRequiredTest(syncServer, syncClient) {
  syncServer.setRemoteFolders(syncServer.getWellKnownFolders());
  syncServer.appendRemoteFolder(new RemoteFolder("test1", "inbox", "Test 1"));
  syncServer.appendRemoteFolder(new RemoteFolder("test2", "test1", "Test 2"));
  syncServer.appendRemoteFolder(new RemoteFolder("test3", "test2", "Test 3"));
  syncServer.appendRemoteFolder(new RemoteFolder("test4", "test1", "Test 4"));
  syncServer.appendRemoteFolder(new RemoteFolder("test5", "test1", "Test 5"));
  syncServer.maxSyncItems = 4; // 12 items requires 3 requests.

  const listener = new EwsFolderCallbackListener();
  syncClient.syncFolderHierarchy(listener, null);
  await listener._deferred.promise;

  Assert.deepEqual(
    [...listener._createdFolderIds],
    [
      "inbox",
      "deleteditems",
      "drafts",
      "outbox",
      "sentitems",
      "junkemail",
      "archive",
      "test1",
      "test2",
      "test3",
      "test4",
      "test5",
    ],
    "all folders should have synced"
  );
  Assert.ok(listener._syncStateToken, "sync token should exist");

  syncServer.maxSyncItems = Infinity;
}

/**
 * Test initial Graph sync when there is already a removed (restorable) item.
 */
add_task(async function testInitialGraphSyncWithRemovedItem() {
  graphServer.setRemoteFolders(graphServer.getWellKnownFolders());
  graphServer.appendRemoteFolder(
    new RemoteFolder("restorable-folder", "root", "Restorable Folder")
  );
  graphServer.deleteRemoteFolderById("restorable-folder");

  const listener = new GraphInitialSyncListener();
  graphClient.syncFolderHierarchy(listener, null);
  await listener._deferred.promise;

  Assert.deepEqual(
    [...listener._createdFolderIds],
    [
      "inbox",
      "deleteditems",
      "drafts",
      "outbox",
      "sentitems",
      "junkemail",
      "archive",
    ],
    "initial sync should still create all live folders"
  );
  Assert.deepEqual(
    listener._deletedFolderIds,
    ["restorable-folder"],
    "initial sync should surface removed Graph items as deletes"
  );
  Assert.ok(listener._syncStateToken, "sync token should exist");
});

class EwsFolderCallbackListener {
  QueryInterface = ChromeUtils.generateQI([
    "IExchangeFolderListener",
    "IExchangeFallibleOperationListener",
  ]);

  constructor() {
    this._createdFolderIds = new Set();
    this._deferred = Promise.withResolvers();
  }

  onNewRootFolder(id) {
    Assert.equal(id, "root", "root folder id should be 'root'");
  }
  onFolderCreated(id, _parentId, _name, _flags) {
    Assert.ok(
      !this._createdFolderIds.has(id),
      `should not already have created folder: ${id}`
    );
    this._createdFolderIds.add(id);
  }
  onFolderUpdated(id, _name) {
    if (!this._createdFolderIds.has(id)) {
      // Graph does not differentiate between created and updated messages in
      // its sync response, so we use `NS_MSG_MESSAGE_NOT_FOUND` to tell it to
      // create the message first.
      throw Components.Exception(
        `cannot update unknown folder: ${id}`,
        Cr.NS_MSG_ERROR_FOLDER_MISSING
      );
    }

    Assert.ok(false, `should not update ${id} on initial sync`);
  }
  onFolderDeleted(id) {
    Assert.ok(false, `should not delete ${id} on initial sync`);
  }
  onSyncStateTokenChanged(syncStateToken) {
    this._syncStateToken = syncStateToken;
  }
  onSuccess() {
    this._deferred.resolve();
  }
  onOperationFailure(err) {
    this._deferred.reject(new Error(`syncFolderHierarchy FAILED: ${err}`));
  }
}

class GraphInitialSyncListener extends EwsFolderCallbackListener {
  constructor() {
    super();
    this._deletedFolderIds = [];
  }

  onFolderDeleted(id) {
    this._deletedFolderIds.push(id);
  }
}

/**
 * Test sync where the server returns busy twice.
 */
add_task(async function testSimpleSyncBusyRetry() {
  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());

  ewsServer.busyResponses = 2;

  const listener = new EwsFolderCallbackListener();
  ewsClient.syncFolderHierarchy(listener, null);
  await listener._deferred.promise;

  Assert.deepEqual(
    [...listener._createdFolderIds],
    [
      "inbox",
      "deleteditems",
      "drafts",
      "outbox",
      "sentitems",
      "junkemail",
      "archive",
    ],
    "all folders should have synced"
  );
  Assert.ok(listener._syncStateToken, "sync token should exist");
});
