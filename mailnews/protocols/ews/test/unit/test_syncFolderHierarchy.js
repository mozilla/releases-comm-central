/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

// TODO: Figure out inclusion of support files for providing responses to
// requests.

/**
 * An EWS client implementation against which we will test.
 *
 * @type {IEwsClient}
 */
var client;

/**
 * A mock Exchange server instance to provide request/response handling.
 *
 * @type {EwsServer}
 */
var ewsServer;

add_setup(() => {
  ewsServer = new EwsServer();
  ewsServer.start();

  // Create and configure the EWS incoming server.
  const server = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  server.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  client = Cc["@mozilla.org/messenger/ews-client;1"].createInstance(
    Ci.IEwsClient
  );
  client.initialize(server.getStringValue("ews_url"), server);

  registerCleanupFunction(() => {
    // We need to stop the mock server, but the client has no additional
    // teardown needed.
    ewsServer.stop();
  });
});

/**
 * Test sync where the server returns all changes and we don't have to
 * worry about batching.
 */
add_task(async function testSimpleSync() {
  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());

  const listener = new EwsFolderCallbackListener();
  client.syncFolderHierarchy(listener, null);
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

/**
 * Test sync where the server tells us that not all changes are included
 * and we have to loop.
 */
add_task(async function testSecondSyncRequired() {
  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());
  ewsServer.appendRemoteFolder(new RemoteFolder("test1", "inbox", "Test 1"));
  ewsServer.appendRemoteFolder(new RemoteFolder("test2", "test1", "Test 2"));
  ewsServer.appendRemoteFolder(new RemoteFolder("test3", "test2", "Test 3"));
  ewsServer.appendRemoteFolder(new RemoteFolder("test4", "test1", "Test 4"));
  ewsServer.appendRemoteFolder(new RemoteFolder("test5", "test1", "Test 5"));
  ewsServer.maxSyncItems = 4; // 11 items requires 3 requests.

  const listener = new EwsFolderCallbackListener();
  client.syncFolderHierarchy(listener, null);
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

  ewsServer.maxSyncItems = Infinity;
});

class EwsFolderCallbackListener {
  QueryInterface = ChromeUtils.generateQI(["IEwsFolderCallbacks"]);

  constructor() {
    this._createdFolderIds = new Set();
    this._deferred = Promise.withResolvers();
  }

  recordRootFolder(id) {
    Assert.equal(id, "root", "root folder id should be 'root'");
  }
  create(id, _parentId, _name, _flags) {
    Assert.ok(
      !this._createdFolderIds.has(id),
      `should not already have created folder: ${id}`
    );
    this._createdFolderIds.add(id);
  }
  update(id, _name) {
    Assert.ok(false, `should not update ${id} on initial sync`);
  }
  delete(id) {
    Assert.ok(false, `should not delete ${id} on initial sync`);
  }
  updateSyncState(syncStateToken) {
    this._syncStateToken = syncStateToken;
  }
  onSuccess() {
    this._deferred.resolve();
  }
  onError(err, desc) {
    this._deferred.reject(
      new Error(`syncFolderHierarchy FAILED; ${err} - ${desc}`)
    );
  }
}
