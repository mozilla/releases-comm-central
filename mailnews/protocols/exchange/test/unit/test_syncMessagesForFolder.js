/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
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
 * A mock Exchange/EWS server instance to provide request/response handling.
 *
 * @type {EwsServer}
 */
var ewsServer;

/**
 * A mock Exchange/Graph server instance to provide request/response handling.
 *
 * @type {GraphServer}
 */
var graphServer;

/**
 * Incoming server for EWS tests.
 *
 * @type {nsIMsgIncomingServer}
 */
var incomingEwsServer;

/**
 * Incoming server for Graph tests.
 *
 * @type {nsIMsgIncomingServer}
 */
var incomingGraphServer;

const generator = new MessageGenerator();

/**
 * Helper to fetch the value of the first matching header in a IHeaderBlock,
 * or null if none.
 */
function getHeader(headerBlock, name) {
  for (let i = 0; i < headerBlock.numHeaders; ++i) {
    if (name == headerBlock.name(i)) {
      return headerBlock.value(i);
    }
  }
  return null;
}

/**
 * Helper to strip surrounding angle brackets from Message-Id.
 * e.g.
 *   "<foo@bar>" -> "foo@bar"
 *   "1234@example.com" -> "1234@example.com"
 */
function deAngled(rawMessageId) {
  return rawMessageId.replace(/<(.*)>/, "$1");
}

add_setup(async () => {
  // Create and configure the EWS and Graph incoming servers.
  [ewsServer, incomingEwsServer] = setupBasicEwsTestServer({});
  [graphServer, incomingGraphServer] = setupBasicGraphTestServer();

  await syncFolder(incomingEwsServer, incomingEwsServer.rootFolder);
  await syncFolder(incomingGraphServer, incomingGraphServer.rootFolder);

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

add_task(async function testMessageBatchingEws() {
  await testMessageBatching(ewsServer, ewsClient);
});

add_task(async function testMessageBatchingGraph() {
  await testMessageBatching(graphServer, graphClient);
});

add_task(async function testSyncChangesWithClientEws() {
  await testSyncChangesWithClient(ewsServer, ewsClient, true);
});

add_task(async function testSyncChangesWithClientGraph() {
  await testSyncChangesWithClient(graphServer, graphClient, false);
});

add_task(async function testSyncChangesWithRealFolderEws() {
  await testSyncChangesWithRealFolder(ewsServer, incomingEwsServer);
});

add_task(async function testSyncChangesWithRealFolderGraph() {
  await testSyncChangesWithRealFolder(graphServer, incomingGraphServer);
});

add_task(async function testSyncRecipientsEws() {
  await testSyncRecipients(ewsServer, incomingEwsServer);
});

add_task(async function testSyncRecipientsGraph() {
  await testSyncRecipients(graphServer, incomingGraphServer);
});

/**
 * Test sync wherein we sync more changes than the server will send in one
 * response and need to batch message header fetch.
 */
async function testMessageBatching(mockServer, client) {
  mockServer.setRemoteFolders(mockServer.getWellKnownFolders());
  mockServer.clearItems();
  mockServer.maxSyncItems = 4;

  const messages = generator.makeMessages({});
  mockServer.addMessages("inbox", messages);

  const listener = new ExchangeMessageCallbackListener();
  client.syncMessagesForFolder(listener, "inbox", null);
  await listener.deferred.promise;

  Assert.deepEqual(
    listener.created.length,
    messages.length,
    "all of the created items should have been synced"
  );
  Assert.deepEqual(
    listener.deletedItemIds,
    [],
    "no items should have been deleted"
  );
  Assert.deepEqual(
    listener.created.map(entry =>
      deAngled(getHeader(entry.headers, "Message-Id"))
    ),
    messages.map(m => deAngled(m.messageId)),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener.created.map(entry => getHeader(entry.headers, "Subject")),
    messages.map(m => m.subject),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener.created.map(entry => entry.messageSize),
    messages.map(message => message.toMessageString().length),
    "the correct message sizes should have been reported"
  );
  Assert.ok(
    listener.syncStateToken,
    "the sync token should have been recorded"
  );

  mockServer.maxSyncItems = Infinity;
}

/**
 * Test what happens if an item is moved or deleted.
 *
 * @param {MockServer} mockServer - The `MockServer` instance that implements
 *   the protocol being tested.
 * @param {EwsClient|GraphClient} client - The protocol client to test.
 * @param {boolean} separateReadStatusUpdates - Whether the protocol separates
 *   read status updates from other message updates.
 */
async function testSyncChangesWithClient(
  mockServer,
  client,
  separateReadStatusUpdates
) {
  mockServer.setRemoteFolders(mockServer.getWellKnownFolders());
  mockServer.clearItems();

  const messages = generator.makeMessages({ count: 6 });
  mockServer.addMessages("inbox", messages);

  // Initial sync.

  let listener = new ExchangeMessageCallbackListener();
  client.syncMessagesForFolder(listener, "inbox", null);
  await listener.deferred.promise;

  Assert.equal(
    listener.created.length,
    messages.length,
    "all of the created items should have been synced"
  );
  Assert.equal(
    listener.deletedItemIds.length,
    0,
    "no items should have been deleted"
  );
  Assert.deepEqual(
    listener.readStatusUpdates,
    [],
    "no items should have been marked as read"
  );
  Assert.deepEqual(
    listener.created.map(entry =>
      deAngled(getHeader(entry.headers, "Message-Id"))
    ),
    messages.map(m => deAngled(m.messageId)),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener.created.map(entry => getHeader(entry.headers, "Subject")),
    messages.map(m => m.subject),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener.created.map(entry => entry.messageSize),
    messages.map(message => message.toMessageString().length),
    "the correct message sizes should have been reported"
  );
  Assert.ok(
    !!listener.syncStateToken,
    "the sync token should have been recorded"
  );

  // Change a message, move a message, delete a message, mark a message read,
  // flag a message.

  const messageIdToUpdate = messages[5].messageId;
  const itemIdToUpdate = messages[5].messageId;
  messages[5].subject = "Scary Monster Under Your Bed";
  mockServer.itemChanges.push(["update", "inbox", itemIdToUpdate]);
  info(`Updating subject of message ${itemIdToUpdate}`);

  const itemIdToMove = messages[4].messageId;
  const movedItemId = mockServer.moveItemToFolder(itemIdToMove, "junkemail");
  const [movedMessage] = messages.splice(4, 1);
  info(`Moving message ${itemIdToMove}`);

  const itemIdToDelete = messages[2].messageId;
  mockServer.deleteItem(itemIdToDelete);
  messages.splice(2, 1);

  const itemIdToMarkRead = messages[1].messageId;
  messages[1].metaState.read = true;
  mockServer.itemChanges.push(["readflag", "inbox", itemIdToMarkRead]);
  info(`Marking message ${itemIdToMarkRead} as read`);

  const messageIdToFlag = messages[0].messageId;
  const itemIdToFlag = messages[0].messageId;
  messages[0].metaState.flagged = true;
  mockServer.itemChanges.push(["update", "inbox", itemIdToFlag]);
  info(`Flagging message ${itemIdToFlag}`);

  // Sync again to pick up the changes.

  const syncStateToken = listener.syncStateToken;
  listener.reset();
  client.syncMessagesForFolder(listener, "inbox", syncStateToken);
  await listener.deferred.promise;

  Assert.equal(
    listener.created.length,
    0,
    "no more items should have been created"
  );
  Assert.deepEqual(
    listener.deletedItemIds,
    [itemIdToMove, itemIdToDelete],
    "the moved and deleted items should have been deleted"
  );
  if (separateReadStatusUpdates) {
    Assert.deepEqual(
      listener.readStatusUpdates,
      [{ ewsId: itemIdToMarkRead, readStatus: true }],
      "the read message should have been updated"
    );
  }
  Assert.equal(
    listener.deletedItemIds.length,
    [messageIdToUpdate, messageIdToFlag].length,
    "the updated messages should have been deleted from the store"
  );
  Assert.ok(
    listener.syncStateToken,
    "the sync token should have been recorded"
  );
  Assert.notEqual(
    listener.syncStateToken,
    syncStateToken,
    "the sync token should differ from the previous one"
  );

  // Check that the moved message arrives at its destination.

  listener = new ExchangeMessageCallbackListener();
  client.syncMessagesForFolder(listener, "junkemail", null);
  await listener.deferred.promise;

  Assert.deepEqual(
    listener.created.map(entry => entry.ewsId),
    [movedItemId],
    "the moved item should have been created"
  );
  Assert.deepEqual(
    listener.deletedItemIds,
    [],
    "no items should have been removed"
  );
  Assert.deepEqual(
    listener.readStatusUpdates,
    [],
    "no items should have been marked as read"
  );
  Assert.deepEqual(
    listener.created.map(entry =>
      deAngled(getHeader(entry.headers, "Message-Id"))
    ),
    [deAngled(movedMessage.messageId)],
    "a header with the correct value should have been created"
  );
  Assert.deepEqual(
    listener.deletedItemIds,
    [],
    "no stored message should have been deleted from the store"
  );
  Assert.ok(
    listener.syncStateToken,
    "the sync token should have been recorded"
  );
}

class ExchangeMessageCallbackListener {
  QueryInterface = ChromeUtils.generateQI(["IExchangeMessageSyncListener"]);

  constructor() {
    this.created = [];
    this.updated = [];
    this.deletedItemIds = [];
    this.readStatusUpdates = [];
    this.syncStateToken = null;
    this.deferred = Promise.withResolvers();
    this._existingMessageIds = new Set();
  }

  /**
   * Resets the current listener to its state at construction.
   *
   * The only member that's not being reset is the set used internally to record
   * messages that have been created in tests, so that updating an existing
   * message can be correctly recorded even if that message doesn't appear in
   * `this.created`.
   */
  reset() {
    this.created = [];
    this.updated = [];
    this.deletedItemIds = [];
    this.readStatusUpdates = [];
    this.syncStateToken = null;
    this.deferred = Promise.withResolvers();
  }

  onMessageCreated(ewsId, headers, messageSize, isRead, isFlagged, preview) {
    this._existingMessageIds.add(ewsId);
    this.created.push({
      ewsId,
      headers,
      messageSize,
      isRead,
      isFlagged,
      preview,
    });
  }
  onMessageUpdated(ewsId, headers, messageSize, isRead, isFlagged, preview) {
    if (!this._existingMessageIds.has(ewsId)) {
      // Note: Ideally we'd throw `NS_MSG_MESSAGE_NOT_FOUND` here, however we
      // can't do that now as Thunderbird errors aren't included in `Cr`, so any
      // such code we use in a `Components.Exception` will be replaced with
      // `NS_ERROR_FAILURE`. See
      // https://bugzilla.mozilla.org/show_bug.cgi?id=2033105
      throw Components.Exception(
        `cannot update unknown message: ${ewsId}`,
        Cr.NS_ERROR_FAILURE
      );
    }

    this.updated.push({
      ewsId,
      headers,
      messageSize,
      isRead,
      isFlagged,
      preview,
    });
  }
  onReadStatusChanged(ewsId, readStatus) {
    this.readStatusUpdates.push({ ewsId, readStatus });
  }
  onMessageDeleted(ewsId) {
    this._existingMessageIds.delete(ewsId);
    this.deletedItemIds.push(ewsId);
  }
  onSyncStateTokenChanged(syncStateToken) {
    this.syncStateToken = syncStateToken;
  }
  onSyncComplete() {
    this.deferred.resolve();
  }
  onOperationError(_status) {
    this.deferred.reject();
  }
}

/**
 * The same as above, but using folders, to check the changes make it all the
 * way to the database.
 */
async function testSyncChangesWithRealFolder(mockServer, incomingServer) {
  mockServer.clearItems();

  const folderName = `${incomingServer.type}_sync_real_folder`;
  const moveDestinationFolderName = `${incomingServer.type}_sync_real_folder_move`;

  mockServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, folderName)
  );
  mockServer.appendRemoteFolder(
    new RemoteFolder(
      moveDestinationFolderName,
      "root",
      moveDestinationFolderName,
      moveDestinationFolderName
    )
  );

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const folder = rootFolder.getChildNamed(folderName);
  const moveDestinationFolder = rootFolder.getChildNamed(
    moveDestinationFolderName
  );

  const messages = generator.makeMessages({ count: 6 });
  mockServer.addMessages(folderName, messages);

  // Initial sync.

  await syncFolder(incomingServer, folder);
  const syncStateToken = folder.getStringProperty("ewsSyncStateToken");
  Assert.ok(
    syncStateToken,
    "the sync token should have been saved in the database"
  );
  Assert.equal(
    folder.getTotalMessages(false),
    6,
    "there should be 6 messages in the folder at the start"
  );
  Assert.equal(
    folder.getNumUnread(false),
    6,
    "6 messages should be unread at the start"
  );

  const messageIdToUpdate = messages[5].messageId;
  const originalMessage = folder.msgDatabase.getMsgHdrForMessageID(
    messages[5].messageId
  );
  const originalMessageText = await getMessageText(originalMessage);
  const originalGreeting = originalMessageText.match(/Hello (\w+ \w+)!/);
  Assert.ok(originalGreeting, "the message content should contain a greeting");
  const originalStoreToken = originalMessage.storeToken;
  Assert.ok(originalStoreToken, "the message should have been stored");
  const originalMsgSize = originalMessage.messageSize;

  // Storing message sizes from sync isn't supported for Graph yet, see:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=2025016
  if (incomingServer.type != "graph") {
    Assert.equal(
      messages[5].toMessageString().length,
      originalMsgSize,
      "the right size should have been stored for the message"
    );
  }

  // Change a message, move a message, delete a message, mark a message read,
  // flag a message.

  const itemIdToUpdate = messages[5].messageId;
  messages[5].subject = "Scary Monster Under Your Bed";
  messages[5].bodyPart.body = `Kia ora ${originalGreeting[1]}!`;
  mockServer.itemChanges.push(["update", folderName, itemIdToUpdate]);

  const itemIdToMove = messages[4].messageId;
  mockServer.moveItemToFolder(itemIdToMove, moveDestinationFolderName);
  const [movedMessage] = messages.splice(4, 1);

  const itemIdToDelete = messages[3].messageId;
  mockServer.deleteItem(itemIdToDelete);
  messages.splice(3, 1);

  const itemIdToMarkRead = messages[1].messageId;
  messages[1].metaState.read = true;
  mockServer.itemChanges.push(["readflag", folderName, itemIdToMarkRead]);

  const messageIdToFlag = messages[0].messageId;
  const itemIdToFlag = messages[0].messageId;
  messages[0].metaState.flagged = true;
  mockServer.itemChanges.push(["update", folderName, itemIdToFlag]);

  // Sync again to pick up the changes.

  await syncFolder(incomingServer, folder);
  Assert.equal(
    folder.getTotalMessages(false),
    4,
    "there should be 4 messages remaining in the folder"
  );
  Assert.notEqual(
    folder.getStringProperty("ewsSyncStateToken"),
    syncStateToken,
    "the sync token should differ from the previous one"
  );
  Assert.equal(folder.getNumUnread(false), 3, "3 messages should be unread");

  const updatedMessage =
    folder.msgDatabase.getMsgHdrForMessageID(messageIdToUpdate);
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

  const flaggedMessage =
    folder.msgDatabase.getMsgHdrForMessageID(messageIdToFlag);

  // Flagging messages isn't supported for Graph yet, see:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=2025019
  if (incomingServer.type != "graph") {
    Assert.ok(flaggedMessage.isFlagged, "Message should be flagged");
  }

  // Check that the moved message arrives at its destination.

  await syncFolder(incomingServer, moveDestinationFolder);
  Assert.equal(
    moveDestinationFolder.getTotalMessages(false),
    1,
    "there should be 1 message in the move destination folder"
  );
  Assert.ok(
    moveDestinationFolder.getStringProperty("ewsSyncStateToken"),
    "the sync token should have been saved in the database"
  );
  Assert.equal(
    moveDestinationFolder.getNumUnread(false),
    1,
    "the message should be unread"
  );
  Assert.equal(
    moveDestinationFolder.messages.getNext().messageId,
    movedMessage.messageId,
    "the message should be the right message"
  );
}

/**
 * Test that the recipients of a new message are correctly persisted.
 */
async function testSyncRecipients(mockServer, incomingServer) {
  // Create a new folder for our test on the server.
  const folderName = "recipientsSync";
  mockServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  // Create a fake message with multiple recipients and a CC'd recipient.
  const msgGen = new MessageGenerator();
  const msg = msgGen.makeMessage({
    from: ["Tinderbox", "tinderbox@foo.invalid"],
    to: [
      ["Tinderbox", "tinderbox@foo.invalid"],
      ["Alice", "alice@foo.invalid"],
    ],
    cc: [["Bob", "bob@foo.invalid"]],
    subject: "Hello world",
  });

  mockServer.addMessages(folderName, [msg]);

  // Sync and wait for the message to show up.
  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, null);

  const folder = await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed(folderName),
    "waiting for folder to exist"
  );
  await TestUtils.waitForCondition(
    () => folder.getTotalMessages(false) == 1,
    "waiting for the message to exist"
  );

  // Retrieve the message and check that the recipients that are persisted are
  // correct.
  //
  // Depending on the protocol, the display names might not be surrounded by
  // quotes, so we strip them out if present so we don't fail valid recipient
  // strings.
  const message = [...folder.messages][0];

  Assert.equal(
    message.recipients.replaceAll('"', ""),
    "Tinderbox <tinderbox@foo.invalid>, Alice <alice@foo.invalid>",
    "the recipients property on the message should match the ones in the message"
  );

  Assert.equal(
    message.ccList.replaceAll('"', ""),
    "Bob <bob@foo.invalid>",
    "the ccList property on the message should match the ones in the message"
  );
}

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
