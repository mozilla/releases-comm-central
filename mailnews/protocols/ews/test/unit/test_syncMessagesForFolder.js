/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { MessageGenerator, SyntheticPartLeaf } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

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

/**
 * @type {nsIMsgIncomingServer}
 */
var incomingServer;

const generator = new MessageGenerator();

add_setup(async () => {
  do_get_profile();

  ewsServer = new EwsServer();
  ewsServer.start();

  // Create and configure the EWS incoming server.
  incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  incomingServer.QueryInterface(Ci.IEwsIncomingServer);
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  await syncFolder(incomingServer, incomingServer.rootFolder);

  client = Cc["@mozilla.org/messenger/ews-client;1"].createInstance(
    Ci.IEwsClient
  );
  client.initialize(
    incomingServer.getStringValue("ews_url"),
    incomingServer,
    false,
    "",
    "",
    "",
    "",
    ""
  );

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
    listener._savedHeaders.map(h => h.messageId),
    messages.map(m => m.messageId),
    "headers with the correct values should have been created"
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
add_task(async function testSyncChangesWithClient() {
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
    listener._readStatusUpdates,
    [],
    "no items should have been marked as read"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.messageId),
    messages.map(m => m.messageId),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.subject),
    messages.map(m => m.subject),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener._deletedMessages.map(h => h.messageId),
    [],
    "no stored message should have been deleted from the store"
  );
  Assert.ok(
    listener._syncStateToken,
    "the sync token should have been recorded"
  );

  // Change a message, move a message, delete a message, mark a message read.

  const messageIdToUpdate = messages[4].messageId;
  const itemIdToUpdate = btoa(messages[4].messageId);
  messages[4].subject = "Scary Monster Under Your Bed";
  ewsServer.itemChanges.push(["update", "inbox", itemIdToUpdate]);

  const itemIdToMove = btoa(messages[3].messageId);
  ewsServer.addNewItemOrMoveItemToFolder(itemIdToMove, "junkemail");
  const [movedMessage] = messages.splice(3, 1);

  const itemIdToDelete = btoa(messages[1].messageId);
  ewsServer.deleteItem(itemIdToDelete);
  messages.splice(1, 1);

  const itemIdToMarkRead = btoa(messages[0].messageId);
  messages[0].metaState.read = true;
  ewsServer.itemChanges.push(["readflag", "inbox", itemIdToMarkRead]);

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
    listener._readStatusUpdates,
    [{ ewsId: itemIdToMarkRead, readStatus: true }],
    "the read message should have been updated"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.messageId),
    [],
    "no headers should have been created"
  );
  Assert.deepEqual(
    listener._deletedMessages.map(h => h.messageId),
    [messageIdToUpdate],
    "the updated message should have been deleted from the store"
  );
  Assert.deepEqual(
    listener._deletedMessages.map(h => h.subject),
    ["Scary Monster Under Your Bed"],
    "the updated message header should have been updated"
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
    listener._readStatusUpdates,
    [],
    "no items should have been marked as read"
  );
  Assert.deepEqual(
    listener._savedHeaders.map(h => h.messageId),
    [movedMessage.messageId],
    "a header with the correct value should have been created"
  );
  Assert.deepEqual(
    listener._deletedMessages.map(h => h.messageId),
    [],
    "no stored message should have been deleted from the store"
  );
  Assert.ok(
    listener._syncStateToken,
    "the sync token should have been recorded"
  );
});

class EwsMessageCallbackListener {
  QueryInterface = ChromeUtils.generateQI(["IEwsMessageSyncListener"]);

  constructor() {
    this._createdItemIds = [];
    this._deletedItemIds = [];
    this._readStatusUpdates = [];
    this._savedHeaders = [];
    this._deletedMessages = [];
    this._deferred = Promise.withResolvers();
  }

  onMessageCreated(ewsId) {
    this._createdItemIds.push(ewsId);
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgDBHdr"]),
      // Just enough to stop the test breaking.
      markHasAttachments() {},
      markRead() {},
    };
  }
  onMessageUpdated(_ewsId) {
    const hdr = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgDBHdr"]),
      // Just enough to stop the test breaking.
      markHasAttachments() {},
      markRead() {},
    };

    this._deletedMessages.push(hdr);

    return hdr;
  }
  onReadStatusChanged(ewsId, readStatus) {
    this._readStatusUpdates.push({ ewsId, readStatus });
  }
  onMessageDeleted(ewsId) {
    this._deletedItemIds.push(ewsId);
  }
  onDetachedHdrPopulated(hdr) {
    this._savedHeaders.push(hdr);
  }
  onExistingHdrChanged() {
    Assert.greater(
      this._deletedMessages.length,
      0,
      "commitChanges should only be called if there are updated messages"
    );
  }
  onSyncStateTokenChanged(syncStateToken) {
    this._syncStateToken = syncStateToken;
  }
  onSyncComplete() {
    this._deferred.resolve();
  }
  onOperationError(_status) {
    this._deferred.reject();
  }
}

/**
 * The same as above, but using folders, to check the changes make it all the
 * way to the database.
 */
add_task(async function testSyncChangesWithRealFolder() {
  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());
  ewsServer.clearItems();

  const inbox = incomingServer.rootFolder.getChildNamed("Inbox");
  const junk = incomingServer.rootFolder.getChildNamed("Junk");

  const messages = generator.makeMessages({ count: 5 });
  ewsServer.addMessages("inbox", messages);

  // Initial sync.

  await syncFolder(incomingServer, inbox);
  const syncStateToken = inbox.getStringProperty("ewsSyncStateToken");
  Assert.ok(
    syncStateToken,
    "the sync token should have been saved in the database"
  );
  Assert.equal(
    inbox.getTotalMessages(false),
    5,
    "there should be 5 messages in the inbox at the start"
  );
  Assert.equal(
    inbox.getNumUnread(false),
    5,
    "5 messages should be unread at the start"
  );

  const messageIdToUpdate = messages[4].messageId;
  const originalMessage = inbox.msgDatabase.getMsgHdrForMessageID(
    messages[4].messageId
  );
  const originalMessageText = await getMessageText(originalMessage);
  const originalGreeting = originalMessageText.match(/Hello (\w+ \w+)!/);
  Assert.ok(originalGreeting, "the message content should contain a greeting");
  const originalStoreToken = originalMessage.storeToken;
  Assert.ok(originalStoreToken, "the message should have been stored");
  const originalMsgSize = originalMessage.messageSize;
  Assert.equal(
    messages[4].toMessageString().length,
    originalMsgSize,
    "the right size should have been stored for the message"
  );

  // Change a message, move a message, delete a message, mark a message read.

  const itemIdToUpdate = btoa(messages[4].messageId);
  messages[4].subject = "Scary Monster Under Your Bed";
  messages[4].bodyPart.body = `Kia ora ${originalGreeting[1]}!`;
  ewsServer.itemChanges.push(["update", "inbox", itemIdToUpdate]);

  const itemIdToMove = btoa(messages[3].messageId);
  ewsServer.addNewItemOrMoveItemToFolder(itemIdToMove, "junkemail");
  const [movedMessage] = messages.splice(3, 1);

  const itemIdToDelete = btoa(messages[1].messageId);
  ewsServer.deleteItem(itemIdToDelete);
  messages.splice(1, 1);

  const itemIdToMarkRead = btoa(messages[0].messageId);
  messages[0].metaState.read = true;
  ewsServer.itemChanges.push(["readflag", "inbox", itemIdToMarkRead]);

  // Sync again to pick up the changes.

  await syncFolder(incomingServer, inbox);
  Assert.equal(
    inbox.getTotalMessages(false),
    3,
    "there should be 3 messages remaining in the inbox"
  );
  Assert.notEqual(
    inbox.getStringProperty("ewsSyncStateToken"),
    syncStateToken,
    "the sync token should differ from the previous one"
  );
  Assert.equal(inbox.getNumUnread(false), 2, "2 messages should be unread");

  const updatedMessage =
    inbox.msgDatabase.getMsgHdrForMessageID(messageIdToUpdate);
  Assert.equal(
    updatedMessage.subject,
    "Scary Monster Under Your Bed",
    "the updated message should have an updated subject"
  );
  const updatedMessageText = await getMessageText(updatedMessage);
  const updatedGreeting = updatedMessageText.match(/Kia ora \w+ \w+!/);
  Assert.ok(
    updatedGreeting,
    "the updated message content should contain a different greeting"
  );
  Assert.notEqual(
    updatedMessage.storeToken,
    originalStoreToken,
    "the updated message should have been stored"
  );

  // Check that the moved message arrives at its destination.

  await syncFolder(incomingServer, junk);
  Assert.equal(
    junk.getTotalMessages(false),
    1,
    "there should be 1 message in the junk folder"
  );
  Assert.ok(
    junk.getStringProperty("ewsSyncStateToken"),
    "the sync token should have been saved in the database"
  );
  Assert.equal(junk.getNumUnread(false), 1, "the message should be unread");
  Assert.equal(
    junk.messages.getNext().messageId,
    movedMessage.messageId,
    "the message should be the right message"
  );

  // Remove the messages from these real folders to return to a clean slate.

  incomingServer.deleteModel = Ci.IEwsIncomingServer.DELETE_PERMANENTLY;
  inbox.deleteMessages([...inbox.messages], null, true, false, null, false);
  junk.deleteMessages([...junk.messages], null, true, false, null, false);
  await TestUtils.waitForCondition(
    () => incomingServer.rootFolder.getTotalMessages(true) == 0,
    "waiting for messages to be deleted"
  );
});

/**
 * Fetch the full message from the message service. If necessary, from the server.
 *
 * @param {nsIMsgDBHdr} header
 */
async function getMessageText(header) {
  const uri = header.folder.generateMessageURI(header.messageKey);
  const service = MailServices.messageServiceFromURI(uri);

  const deferred = Promise.withResolvers();
  NetUtil.asyncFetch(
    {
      uri: service.getUrlForUri(uri),
      loadUsingSystemPrincipal: true,
    },
    stream => {
      deferred.resolve(
        NetUtil.readInputStreamToString(stream, stream.available())
      );
    }
  );
  return deferred.promise;
}
