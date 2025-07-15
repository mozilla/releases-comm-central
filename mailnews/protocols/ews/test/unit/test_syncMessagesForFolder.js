/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
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

const generator = new MessageGenerator();

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
 * Test sync wherein we sync more changes than the server will send in one
 * response and need to batch message header fetch.
 */
add_task(async function testMessageBatching() {
  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());
  ewsServer.clearItems();
  ewsServer.maxSyncItems = 4;

  const messages = generator.makeMessages({});
  ewsServer.addMessages("inbox", messages);

  const listener = new EwsMessageCallbackListener();
  client.syncMessagesForFolder(listener, "inbox", null);
  await listener._deferred.promise;

  Assert.deepEqual(
    listener._createdItemIds,
    messages.map(m => btoa(m.messageId)),
    "all of the created items should have been synced"
  );
  Assert.deepEqual(
    listener._deletedItemIds,
    [],
    "no items should have been deleted"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.subject),
    messages.map(m => m.subject),
    "headers with the correct values should have been created"
  );
  Assert.ok(
    listener._syncStateToken,
    "the sync token should have been recorded"
  );

  ewsServer.maxSyncItems = Infinity;
});

/**
 * Test what happens if an item is moved or deleted.
 */
add_task(async function testNonCreateUpdate() {
  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());
  ewsServer.clearItems();

  const messages = generator.makeMessages({ count: 5 });
  ewsServer.addMessages("inbox", messages);

  // Initial sync.

  let listener = new EwsMessageCallbackListener();
  client.syncMessagesForFolder(listener, "inbox", null);
  await listener._deferred.promise;

  Assert.deepEqual(
    listener._createdItemIds,
    messages.map(m => btoa(m.messageId)),
    "all of the created items should have been synced"
  );
  Assert.deepEqual(
    listener._deletedItemIds,
    [],
    "no items should have been deleted"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.subject),
    messages.map(m => m.subject),
    "headers with the correct values should have been created"
  );
  Assert.ok(
    listener._syncStateToken,
    "the sync token should have been recorded"
  );

  // Move a message, delete a message.

  const itemIdToMove = btoa(messages[3].messageId);
  ewsServer.addNewItemOrMoveItemToFolder(itemIdToMove, "junkemail");
  const [movedMessage] = messages.splice(3, 1);
  const itemIdToDelete = btoa(messages[1].messageId);
  ewsServer.deleteItem(itemIdToDelete);
  messages.splice(1, 1);

  // Sync again to pick up the changes.

  const syncStateToken = listener._syncStateToken;
  listener = new EwsMessageCallbackListener();
  client.syncMessagesForFolder(listener, "inbox", syncStateToken);
  await listener._deferred.promise;

  Assert.deepEqual(
    listener._createdItemIds,
    [],
    "no more items should have been created"
  );
  Assert.deepEqual(
    listener._deletedItemIds,
    [itemIdToMove, itemIdToDelete],
    "the moved and deleted items should have been deleted"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.subject),
    [],
    "no headers should have been created"
  );
  Assert.ok(
    listener._syncStateToken,
    "the sync token should have been recorded"
  );
  Assert.notEqual(
    listener._syncStateToken,
    syncStateToken,
    "the sync token should differ from the previous one"
  );

  // Check that the moved message arrives at its destination.

  listener = new EwsMessageCallbackListener();
  client.syncMessagesForFolder(listener, "junkemail", null);
  await listener._deferred.promise;

  Assert.deepEqual(
    listener._createdItemIds,
    [itemIdToMove],
    "the moved item should have been created"
  );
  Assert.deepEqual(
    listener._deletedItemIds,
    [],
    "no items should have been removed"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.subject),
    [movedMessage.subject],
    "a header with the correct value should have been created"
  );
  Assert.ok(
    listener._syncStateToken,
    "the sync token should have been recorded"
  );
});

class EwsMessageCallbackListener {
  QueryInterface = ChromeUtils.generateQI(["IEwsMessageCallbacks"]);

  constructor() {
    this._createdItemIds = [];
    this._deletedItemIds = [];
    this._savedHeaders = [];
    this._deferred = Promise.withResolvers();
  }

  createNewHeaderForItem(ewsId) {
    this._createdItemIds.push(ewsId);
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgDBHdr"]),
      // Just enough to stop the test breaking.
      markHasAttachments() {},
      markRead() {},
    };
  }
  deleteHeaderFromDB(ewsId) {
    this._deletedItemIds.push(ewsId);
  }
  getHeaderForItem(_ewsId) {
    Assert.ok(false, "unexpected call to getHeaderForItem");
  }
  maybeDeleteMessageFromStore(_hdr) {
    Assert.ok(false, "unexpected call to maybeDeleteMessageFromStore");
  }
  saveNewHeader(hdr) {
    this._savedHeaders.push(hdr);
  }
  commitChanges() {
    Assert.ok(false, "unexpected call to commitChanges");
  }
  updateSyncState(syncStateToken) {
    this._syncStateToken = syncStateToken;
  }
  onSyncComplete() {
    this._deferred.resolve();
  }
  updateReadStatus(_ewsId, _readStatus) {
    Assert.ok(false, "unexpected call to updateReadStatus");
  }
  onError(_err, _desc) {
    this._deferred.reject();
  }
}
