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
    listener._created.length,
    messages.length,
    "all of the created items should have been synced"
  );
  Assert.deepEqual(
    listener._deletedItemIds,
    [],
    "no items should have been deleted"
  );
  Assert.deepEqual(
    listener._created.map(entry =>
      deAngled(getHeader(entry.headers, "Message-Id"))
    ),
    messages.map(m => deAngled(m.messageId)),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener._created.map(entry => getHeader(entry.headers, "Subject")),
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

  const messages = generator.makeMessages({ count: 6 });
  ewsServer.addMessages("inbox", messages);

  // Initial sync.

  let listener = new EwsMessageCallbackListener();
  client.syncMessagesForFolder(listener, "inbox", null);
  await listener._deferred.promise;

  Assert.equal(
    listener._created.length,
    messages.length,
    "all of the created items should have been synced"
  );
  Assert.equal(
    listener._deletedItemIds.length,
    0,
    "no items should have been deleted"
  );
  Assert.deepEqual(
    listener._readStatusUpdates,
    [],
    "no items should have been marked as read"
  );
  Assert.deepEqual(
    listener._created.map(entry =>
      deAngled(getHeader(entry.headers, "Message-Id"))
    ),
    messages.map(m => deAngled(m.messageId)),
    "headers with the correct values should have been created"
  );
  Assert.deepEqual(
    listener._created.map(entry => getHeader(entry.headers, "Subject")),
    messages.map(m => m.subject),
    "headers with the correct values should have been created"
  );
  Assert.ok(
    listener._syncStateToken,
    "the sync token should have been recorded"
  );

  // Change a message, move a message, delete a message, mark a message read,
  // flag a message.

  const messageIdToUpdate = messages[5].messageId;
  const itemIdToUpdate = btoa(messages[5].messageId);
  messages[5].subject = "Scary Monster Under Your Bed";
  ewsServer.itemChanges.push(["update", "inbox", itemIdToUpdate]);

  const itemIdToMove = btoa(messages[4].messageId);
  ewsServer.addNewItemOrMoveItemToFolder(itemIdToMove, "junkemail");
  const [movedMessage] = messages.splice(4, 1);

  const itemIdToDelete = btoa(messages[2].messageId);
  ewsServer.deleteItem(itemIdToDelete);
  messages.splice(2, 1);

  const itemIdToMarkRead = btoa(messages[1].messageId);
  messages[1].metaState.read = true;
  ewsServer.itemChanges.push(["readflag", "inbox", itemIdToMarkRead]);

  const messageIdToFlag = messages[0].messageId;
  const itemIdToFlag = btoa(messages[0].messageId);
  messages[0].metaState.flagged = true;
  ewsServer.itemChanges.push(["update", "inbox", itemIdToFlag]);

  // Sync again to pick up the changes.

  const syncStateToken = listener._syncStateToken;
  listener = new EwsMessageCallbackListener();
  client.syncMessagesForFolder(listener, "inbox", syncStateToken);
  await listener._deferred.promise;

  Assert.equal(
    listener._created.length,
    0,
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
  Assert.equal(
    listener._deletedItemIds.length,
    [messageIdToUpdate, messageIdToFlag].length,
    "the updated messages should have been deleted from the store"
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
    listener._created.map(entry => entry.ewsId),
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
    listener._created.map(entry =>
      deAngled(getHeader(entry.headers, "Message-Id"))
    ),
    [deAngled(movedMessage.messageId)],
    "a header with the correct value should have been created"
  );
  Assert.deepEqual(
    listener._deletedItemIds,
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
    this._created = [];
    this._updated = [];
    this._deletedItemIds = [];
    this._readStatusUpdates = [];
    this._syncStateToken = null;
    this._deferred = Promise.withResolvers();
  }

  onMessageCreated(ewsId, headers, messageSize, isRead, isFlagged, preview) {
    this._created.push({
      ewsId,
      headers,
      messageSize,
      isRead,
      isFlagged,
      preview,
    });
  }
  onMessageUpdated(ewsId, headers, messageSize, isRead, isFlagged, preview) {
    this._updated.push({
      ewsId,
      headers,
      messageSize,
      isRead,
      isFlagged,
      preview,
    });
  }
  onReadStatusChanged(ewsId, readStatus) {
    this._readStatusUpdates.push({ ewsId, readStatus });
  }
  onMessageDeleted(ewsId) {
    this._deletedItemIds.push(ewsId);
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

  const messages = generator.makeMessages({ count: 6 });
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
    6,
    "there should be 6 messages in the inbox at the start"
  );
  Assert.equal(
    inbox.getNumUnread(false),
    6,
    "6 messages should be unread at the start"
  );

  const messageIdToUpdate = messages[5].messageId;
  const originalMessage = inbox.msgDatabase.getMsgHdrForMessageID(
    messages[5].messageId
  );
  const originalMessageText = await getMessageText(originalMessage);
  const originalGreeting = originalMessageText.match(/Hello (\w+ \w+)!/);
  Assert.ok(originalGreeting, "the message content should contain a greeting");
  const originalStoreToken = originalMessage.storeToken;
  Assert.ok(originalStoreToken, "the message should have been stored");
  const originalMsgSize = originalMessage.messageSize;

  Assert.equal(
    messages[5].toMessageString().length,
    originalMsgSize,
    "the right size should have been stored for the message"
  );

  // Change a message, move a message, delete a message, mark a message read,
  // flag a message.

  const itemIdToUpdate = btoa(messages[5].messageId);
  messages[5].subject = "Scary Monster Under Your Bed";
  messages[5].bodyPart.body = `Kia ora ${originalGreeting[1]}!`;
  ewsServer.itemChanges.push(["update", "inbox", itemIdToUpdate]);

  const itemIdToMove = btoa(messages[4].messageId);
  ewsServer.addNewItemOrMoveItemToFolder(itemIdToMove, "junkemail");
  const [movedMessage] = messages.splice(4, 1);

  const itemIdToDelete = btoa(messages[3].messageId);
  ewsServer.deleteItem(itemIdToDelete);
  messages.splice(3, 1);

  const itemIdToMarkRead = btoa(messages[1].messageId);
  messages[1].metaState.read = true;
  ewsServer.itemChanges.push(["readflag", "inbox", itemIdToMarkRead]);

  const messageIdToFlag = messages[0].messageId;
  const itemIdToFlag = btoa(messages[0].messageId);
  messages[0].metaState.flagged = true;
  ewsServer.itemChanges.push(["update", "inbox", itemIdToFlag]);

  // Sync again to pick up the changes.

  await syncFolder(incomingServer, inbox);
  Assert.equal(
    inbox.getTotalMessages(false),
    4,
    "there should be 4 messages remaining in the inbox"
  );
  Assert.notEqual(
    inbox.getStringProperty("ewsSyncStateToken"),
    syncStateToken,
    "the sync token should differ from the previous one"
  );
  Assert.equal(inbox.getNumUnread(false), 3, "3 messages should be unread");

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

  const flaggedMessage =
    inbox.msgDatabase.getMsgHdrForMessageID(messageIdToFlag);
  Assert.ok(flaggedMessage.isFlagged, "Message should be flagged");

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
 * Test that the recipients of a new message are correctly persisted.
 */
add_task(async function testSyncRecipients() {
  // Create a new folder for our test on the server.
  const folderName = "recipientsSync";
  ewsServer.appendRemoteFolder(
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

  ewsServer.addMessages(folderName, [msg]);

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
  const message = [...folder.messages][0];

  Assert.equal(
    message.recipients,
    '"Tinderbox" <tinderbox@foo.invalid>, "Alice" <alice@foo.invalid>',
    "the recipients property on the message should match the ones in the message"
  );

  Assert.equal(
    message.ccList,
    '"Bob" <bob@foo.invalid>',
    "the ccList property on the message should match the ones in the message"
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
