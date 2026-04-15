/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MockServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var ewsIncomingServer;
var graphIncomingServer;

/**
 * @type {MockServer}
 */
var ewsServer;
var graphServer;

const ewsIdPropertyName = "ewsId";
const generator = new MessageGenerator();

add_setup(async function () {
  [ewsServer, ewsIncomingServer] = setupBasicEwsTestServer({});
  [graphServer, graphIncomingServer] = setupBasicGraphTestServer({});
});

/**
 * Construct the test structure required for copying or moving items.
 *
 * The `prefix` argument indicates the prefix to apply to the folders
 * constructed for the test setup. This function will create two folders on the
 * remote server: `<prefix>_folder1` and `<prefix>_folder2`, and will place two
 * items in `<prefix>_folder1` named `<prefix>_a` and `<prefix>_b`, each with a
 * synthetic message.
 *
 * This function returns a tuple with the the two folders as the first two
 * elements and an array containing the synthetic messages in order.
 *
 * @param {string} prefix
 * @returns {[string, string, nsIMsgFolder, nsIMsgFolder]}
 */
async function setup_item_copymove_structure(
  prefix,
  mockServer,
  incomingServer
) {
  const type = incomingServer.type;

  // Create two folders for the copy/move tests.
  const folder1Name = `${type}_${prefix}_folder1`;
  const folder2Name = `${type}_${prefix}_folder2`;
  mockServer.appendRemoteFolder(
    new RemoteFolder(folder1Name, "root", folder1Name, folder1Name)
  );
  mockServer.appendRemoteFolder(
    new RemoteFolder(folder2Name, "root", folder2Name, folder2Name)
  );

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const folder1 = rootFolder.getChildNamed(folder1Name);
  Assert.ok(!!folder1, `${folder1Name} should exist.`);
  const folder2 = rootFolder.getChildNamed(folder2Name);
  Assert.ok(!!folder2, `${folder2Name} should exist.`);

  const msgs = generator.makeMessages({ count: 2 });

  mockServer.addItemToFolder(`${type}_${prefix}_a`, folder1Name, msgs[0]);
  mockServer.addItemToFolder(`${type}_${prefix}_b`, folder1Name, msgs[1]);

  await syncFolder(incomingServer, folder1);

  Assert.equal(
    folder1.getTotalMessages(false),
    2,
    `${folder1Name} should have 2 messages`
  );
  Assert.equal(
    folder2.getTotalMessages(false),
    0,
    `${folder2Name} should be empty.`
  );

  return [folder1, folder2, msgs];
}

/**
 * Copy or move items between folders.
 *
 * This function initiates a copy of the items represented by the given
 * `headers` from the `sourceFolder` to the `destinationFolder`.  The `isMove`
 * parameter specifies whether this is a move or a copy operation.  Returns a
 * promise that can be awaited to guarantee the async copy operation has
 * finished.
 *
 * @param {nsIMsgFolder} sourceFolder
 * @param {nsIMsgFolder} destinationFolder
 * @param {[nsIMsgDBHdr]} headers
 * @param {boolean} isMove
 * @returns {Promise}
 */
async function copyItems(sourceFolder, destinationFolder, headers, isMove) {
  let eventHappened = false;
  const eventPromise = PromiseTestUtils.promiseFolderEvent(
    sourceFolder,
    "DeleteOrMoveMsgCompleted"
  ).then(() => (eventHappened = true));

  const notificationPromise = PromiseTestUtils.promiseFolderNotification(
    destinationFolder,
    "msgsMoveCopyCompleted"
  );

  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    sourceFolder,
    headers,
    destinationFolder,
    isMove,
    copyListener,
    null, // msgWindow
    false // allowUndo
  );
  await copyListener.promise;

  if (isMove) {
    await eventPromise;
  } else {
    Assert.ok(
      !eventHappened,
      "there should not be a DeleteOrMoveMsgCompleted event for a copy operation"
    );
  }

  const notificationArgs = await notificationPromise;
  Assert.equal(notificationArgs[0], isMove, "notification is move");
  Assert.equal(
    notificationArgs[1].length,
    headers.length,
    "notification source message count"
  );
  Assert.equal(
    notificationArgs[2],
    destinationFolder,
    "notification destination folder"
  );
  Assert.equal(
    notificationArgs[3].length,
    headers.length,
    "notification destination message count"
  );
}

/**
 * Copy or move a folder.
 *
 * This function initiates a copy of move of the given `sourceFolder` to the
 * given `destinationFolder`.  The `isMove` parameters specifies whether this is
 * a copy or a move operation. Returns a promise that can be awaited to
 * guarantee the async copy operation has finished.
 *
 * @param {nsIMsgFolder} sourceFolder
 * @param {nsIMsgFolder} destinationFolder
 * @param {nsIMsgFolder} isMove
 * @returns {Promise}
 */
async function copyFolder(sourceFolder, destinationFolder, isMove) {
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(
    sourceFolder,
    destinationFolder,
    isMove,
    copyListener,
    null
  );
  return copyListener.promise;
}

/**
 * Tests that an account is capable of moving messages from one folder to
 * another.
 *
 * @param {MockServer} mockServer - The `MockServer` child class instance to use
 *   for creating folders and messages.
 * @param {nsIMsgIncomingFolder} incomingServer - The incoming message for the
 *   protocol that's being tested.
 */
async function subtestMoveItem(mockServer, incomingServer) {
  const [folder1, folder2, msgs] = await setup_item_copymove_structure(
    "move",
    mockServer,
    incomingServer
  );

  const headers = [];
  [...folder1.messages].forEach(header => headers.push(header));

  // Initiate the move operation.
  const isMove = true;
  await copyItems(folder1, folder2, headers, isMove);

  Assert.equal(
    folder1.getTotalMessages(false),
    0,
    `${folder1.name} should be empty`
  );
  Assert.equal(
    folder2.getTotalMessages(false),
    2,
    `${folder2.name} should have 2 messages`
  );

  // Check that the messages in `folder2` are the correct ones.
  const expectedSubjects = msgs.map(msg => msg.subject);
  const actualSubjects = [...folder2.messages].map(msg => msg.subject);

  for (const subject of expectedSubjects) {
    Assert.ok(
      actualSubjects.includes(subject),
      `${folder2.name} should contain a message with the subject \"${subject}\"`
    );
  }
}

add_task(async function testMoveItemEws() {
  await subtestMoveItem(ewsServer, ewsIncomingServer);
});

add_task(async function testMoveItemGraph() {
  await subtestMoveItem(graphServer, graphIncomingServer);
});

add_task(async function test_copy_item() {
  const [folder1, folder2, msgs] = await setup_item_copymove_structure(
    "copy",
    ewsServer,
    ewsIncomingServer
  );

  const headers = [];
  [...folder1.messages].forEach(header => headers.push(header));

  // Initiate the copy operation.
  const isMove = false;
  await copyItems(folder1, folder2, headers, isMove);

  Assert.equal(
    folder1.getTotalMessages(false),
    2,
    `${folder1.name} should contain 2 messages`
  );
  Assert.equal(
    folder2.getTotalMessages(false),
    2,
    `${folder2.name} should contain 2 messages`
  );

  // Check that we have a copy of each message in each folder.
  const expectedSubjects = msgs.map(msg => msg.subject);
  const folder1Subjects = [...folder1.messages].map(msg => msg.subject);
  const folder2Subjects = [...folder2.messages].map(msg => msg.subject);

  for (const subject of expectedSubjects) {
    Assert.ok(
      folder1Subjects.includes(subject),
      `${folder1.name} should contain a message with the subject \"${subject}\"`
    );
    Assert.ok(
      folder2Subjects.includes(subject),
      `${folder2.name} should contain a message with the subject \"${subject}\"`
    );
  }
});

add_task(async function test_move_copy_messages_from_another_server() {
  ewsServer.appendRemoteFolder(
    new RemoteFolder("copyFromAnotherServer", "root")
  );

  const ewsRootFolder = ewsIncomingServer.rootFolder;
  ewsIncomingServer.performExpand(null);
  const ewsDestFolder = await TestUtils.waitForCondition(
    () => ewsRootFolder.getChildNamed("copyFromAnotherServer"),
    "waiting for test folder to exist"
  );
  await syncFolder(ewsIncomingServer, ewsDestFolder);
  Assert.equal(
    ewsDestFolder.getTotalMessages(false),
    0,
    "ewsDestFolder should start with no messages"
  );

  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRootFolder = localAccount.incomingServer.rootFolder;
  localRootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const localSourceFolder = localRootFolder.createLocalSubfolder(
    "copyToAnotherServer"
  );
  localSourceFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  localSourceFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );
  const localHeaders = [...localSourceFolder.messages];

  await copyItems(
    localSourceFolder,
    ewsDestFolder,
    localHeaders.slice(2, 4),
    false
  );

  Assert.equal(
    ewsDestFolder.getTotalMessages(false),
    2,
    "ewsDestFolder should contain two copied messages"
  );
  Assert.equal(
    localSourceFolder.getTotalMessages(false),
    10,
    "localSourceFolder should still have the copied messages"
  );

  await copyItems(
    localSourceFolder,
    ewsDestFolder,
    localHeaders.slice(8, 9),
    true
  );

  Assert.equal(
    ewsDestFolder.getTotalMessages(false),
    3,
    "ewsDestFolder should contain the moved message"
  );
  Assert.equal(
    localSourceFolder.getTotalMessages(false),
    9,
    "localSourceFolder should not still have the moved message"
  );

  Assert.throws(
    () =>
      MailServices.copy.copyMessages(
        localSourceFolder,
        [undefined],
        ewsDestFolder,
        true, // isMove
        null, // listener
        null, // msgWindow
        false // allowUndo
      ),
    /NS_ERROR_ILLEGAL_VALUE/,
    "moving an undefined message should throw"
  );

  MailServices.accounts.removeAccount(localAccount, false);
});

add_task(async function test_move_copy_messages_to_another_server() {
  ewsServer.appendRemoteFolder(new RemoteFolder("copyToAnotherServer", "root"));
  ewsServer.addMessages("copyToAnotherServer", generator.makeMessages({}));

  const ewsRootFolder = ewsIncomingServer.rootFolder;
  ewsIncomingServer.performExpand(null);
  const ewsSourceFolder = await TestUtils.waitForCondition(
    () => ewsRootFolder.getChildNamed("copyToAnotherServer"),
    "waiting for test folder to exist"
  );
  await syncFolder(ewsIncomingServer, ewsSourceFolder);
  Assert.equal(
    ewsSourceFolder.getTotalMessages(false),
    10,
    "ewsSourceFolder should start with 10 messages"
  );
  const ewsHeaders = [...ewsSourceFolder.messages];

  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRootFolder = localAccount.incomingServer.rootFolder;
  localRootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const localDestFolder = localRootFolder.createLocalSubfolder(
    "copyFromAnotherServer"
  );

  await copyItems(
    ewsSourceFolder,
    localDestFolder,
    ewsHeaders.slice(5, 7),
    false
  );

  Assert.equal(
    localDestFolder.getTotalMessages(false),
    2,
    "localDestFolder should contain the copied messages"
  );
  Assert.equal(
    ewsSourceFolder.getTotalMessages(false),
    10,
    "ewsSourceFolder should still have the copied messages"
  );

  await copyItems(
    ewsSourceFolder,
    localDestFolder,
    ewsHeaders.slice(1, 2),
    true
  );

  Assert.equal(
    localDestFolder.getTotalMessages(false),
    3,
    "localDestFolder should contain the moved message"
  );
  // This should have happened already. But move operations typically call
  // DeleteMessages without waiting for it to happen.
  await TestUtils.waitForCondition(
    () => ewsSourceFolder.getTotalMessages(false) == 9,
    "waiting for ewsSourceFolder to delete the moved message"
  );
  Assert.equal(
    ewsSourceFolder.getTotalMessages(false),
    9,
    "ewsSourceFolder should not still have the moved message"
  );

  Assert.throws(
    () =>
      MailServices.copy.copyMessages(
        ewsSourceFolder,
        [undefined],
        localDestFolder,
        true, // isMove
        null, // listener
        null, // msgWindow
        false // allowUndo
      ),
    /NS_ERROR_ILLEGAL_VALUE/,
    "moving an undefined message should throw"
  );

  MailServices.accounts.removeAccount(localAccount, false);

  ewsServer.clearItems();
});

add_task(async function test_copy_file_message() {
  ewsServer.appendRemoteFolder(new RemoteFolder("copyFileMessage", "root"));

  const rootFolder = ewsIncomingServer.rootFolder;
  ewsIncomingServer.performExpand(null);
  const folder = await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed("copyFileMessage"),
    "waiting for test folder to exist"
  );

  // Copy the message.

  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    do_get_file("../../../../test/data/bugmail11"),
    folder,
    null,
    false,
    0, // message flags
    "$label4", // keywords
    copyListener,
    null // window
  );
  const copied = await copyListener.promise;

  // Check the copied message.

  const header = folder.GetMessageHeader(copied.messageKeys[0]);
  Assert.equal(
    header.messageId,
    "200804111417.m3BEHTk4030129@mrapp51.mozilla.org",
    "copied message's Message-ID is set from the message"
  );
  Assert.ok(
    header.getStringProperty("ewsId"),
    "copied message should have been assigned an EWS ID"
  );
  Assert.ok(
    header.storeToken,
    "copied message should have been stored on disk"
  );
  // TODO:
  // Assert.equal(
  //   header.getStringProperty("keywords"),
  //   "$label4",
  //   "keywords should have been set in the database"
  // );

  // Check the message is on the server;

  const serverMessage = ewsServer.getItem(header.getStringProperty("ewsId"));
  Assert.ok(serverMessage);
  Assert.equal(serverMessage.parentId, "copyFileMessage");
});

add_task(async function test_mark_as_read() {
  const folderName = "markRead";
  ewsServer.appendRemoteFolder(new RemoteFolder(folderName, "root"));

  const syntheticMessages = generator.makeMessages({ count: 3 });
  ewsServer.addMessages(folderName, syntheticMessages);

  const rootFolder = ewsIncomingServer.rootFolder;
  ewsIncomingServer.getNewMessages(rootFolder, null, null);

  const folder = await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed(folderName),
    "waiting for folder to exist"
  );
  await TestUtils.waitForCondition(
    () => folder.getTotalMessages(false) == 3,
    "waiting for messages to exist"
  );

  Assert.equal(
    folder.getNumUnread(false),
    3,
    "all messages should be unread at the start"
  );
  const messages = [...folder.messages];

  const serverMessage0 = ewsServer.getItem(syntheticMessages[0].messageId);
  Assert.ok(!serverMessage0.syntheticMessage.metaState.read);
  const serverMessage1 = ewsServer.getItem(syntheticMessages[1].messageId);
  Assert.ok(!serverMessage1.syntheticMessage.metaState.read);
  const serverMessage2 = ewsServer.getItem(syntheticMessages[2].messageId);
  Assert.ok(!serverMessage2.syntheticMessage.metaState.read);

  // Mark some messages as read.

  folder.markMessagesRead([messages[0], messages[2]], true);

  await TestUtils.waitForCondition(
    () => serverMessage0.syntheticMessage.metaState.read,
    "waiting for message 0 to be marked as read on the server"
  );
  await TestUtils.waitForCondition(
    () => folder.getNumUnread(false) == 1,
    "waiting for two of three messages to be marked as read"
  );
  Assert.ok(
    !serverMessage1.syntheticMessage.metaState.read,
    "message 1 should still be marked as unread on the server"
  );
  Assert.ok(
    serverMessage2.syntheticMessage.metaState.read,
    "message 2 should be marked as read on the server"
  );

  // Mark a message as unread.

  folder.markMessagesRead([messages[2]], false);
  await TestUtils.waitForCondition(
    () => !serverMessage2.syntheticMessage.metaState.read,
    "waiting for message 2 to be marked as unread on the server"
  );

  await TestUtils.waitForCondition(
    () => folder.getNumUnread(false) == 2,
    "waiting for message 2 to be marked as unread locally"
  );
  Assert.ok(
    !serverMessage1.syntheticMessage.metaState.read,
    "message 1 should still be marked as unread on the server"
  );
  Assert.ok(
    serverMessage0.syntheticMessage.metaState.read,
    "message 0 should still be marked as read on the server"
  );
});

/**
 * Set up the structure required for the folder copy/move tests.
 *
 * This creates `<prefix>_parent1` and `<prefix>_parent2` in the root folder,
 * and `<prefix>_child` inside of `<prefix>_parent1`. Returns a tuple containing
 * the first parent folder, the second parent folder, and the child folder in
 * that order.
 *
 * @param {string} prefix
 * @returns {[nsIMsgFolder, nsIMsgFolder, nsIMsgFolder]}
 */
async function setup_folder_copymove_structure(prefix) {
  const parent1Name = `${prefix}_parent1`;
  const parent2Name = `${prefix}_parent2`;
  const childName = `${prefix}_child`;

  ewsServer.appendRemoteFolder(
    new RemoteFolder(parent1Name, "root", parent1Name, parent1Name)
  );
  ewsServer.appendRemoteFolder(
    new RemoteFolder(parent2Name, "root", parent2Name, parent2Name)
  );
  ewsServer.appendRemoteFolder(
    new RemoteFolder(childName, parent1Name, childName, childName)
  );

  const rootFolder = ewsIncomingServer.rootFolder;

  await syncFolder(ewsIncomingServer, rootFolder);

  const parent1 = rootFolder.getChildNamed(parent1Name);
  Assert.ok(!!parent1, `${parent1Name} should exist.`);
  const parent2 = rootFolder.getChildNamed(parent2Name);
  Assert.ok(!!parent2, `${parent2Name} should exist.`);

  await syncFolder(ewsIncomingServer, parent1);

  const child = parent1.getChildNamed(childName);
  Assert.ok(!!child, `${childName} should exist in ${parent1Name}`);

  return [parent1, parent2, child];
}

add_task(async function test_move_folder() {
  const [parent1, parent2, child] =
    await setup_folder_copymove_structure("folder_move");

  await copyFolder(child, parent2, true);

  Assert.ok(
    !parent1.getChildNamed(child.name),
    `${child.name} should not exist in ${parent1.name}`
  );
  Assert.ok(
    !!parent2.getChildNamed(child.name),
    `${child.name} should exist in ${parent2.name}`
  );
});

add_task(async function test_copy_folder() {
  const [parent1, parent2, child] =
    await setup_folder_copymove_structure("folder_copy");

  await copyFolder(child, parent2, false);

  Assert.ok(
    !!parent1.getChildNamed(child.name),
    `${child.name} should exist in ${parent1.name}`
  );
  Assert.ok(
    !!parent2.getChildNamed(child.name),
    `${child.name} should exist in ${parent2.name}`
  );
});

add_task(async function test_mark_as_junk() {
  const rootFolder = ewsIncomingServer.rootFolder;
  await syncFolder(ewsIncomingServer, rootFolder);

  // Add messages to the test folder.
  const junkMessages = generator.makeMessages({ count: 2 });
  ewsServer.addItemToFolder("junk_message_1", "inbox", junkMessages[0]);
  ewsServer.addItemToFolder("junk_message_2", "inbox", junkMessages[1]);

  const inboxFolder = rootFolder.getChildNamed("Inbox");
  Assert.ok(!!inboxFolder, `Inbox folder should exist`);
  const junkFolder = rootFolder.getChildNamed("Junk");
  Assert.ok(!!junkFolder, "Junk folder should exist");

  await syncFolder(ewsIncomingServer, inboxFolder);
  await syncFolder(ewsIncomingServer, junkFolder);

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    2,
    "Should start with two messages."
  );

  // As per the EWS documentation, unmarking a message as junk can only move
  // that message back to the inbox, so we cannot use a dedicated folder to test
  // this. This means we need to make sure we clean up any leftover messages in
  // the inbox folder to avoid any side-effect.
  registerCleanupFunction(async () => {
    const messages = [...inboxFolder.messages];
    const eventPromise = PromiseTestUtils.promiseFolderEvent(
      inboxFolder,
      "DeleteOrMoveMsgCompleted"
    );
    inboxFolder.deleteMessages(messages, null, true, false, null, false);
    await eventPromise;
  });

  const junkMessageKeys = [...inboxFolder.messages].map(
    header => header.messageKey
  );
  Assert.equal(
    junkMessageKeys.length,
    2,
    "Should have found two messages to mark as junk in the test folder."
  );

  const junkListener = new PromiseTestUtils.PromiseCopyListener();
  inboxFolder.handleViewCommand(
    Ci.nsMsgViewCommandType.junk,
    junkMessageKeys,
    null,
    junkListener
  );
  await junkListener.promise;

  Assert.equal(
    [...inboxFolder.messages].length,
    0,
    "Should be no messages in the test folder."
  );

  Assert.equal(
    [...junkFolder.messages].length,
    2,
    "Should have two messages in the Junk folder."
  );

  // Unjunk the first message and make sure it moved back to the inbox.
  const newMessageKeys = [...junkFolder.messages].map(m => m.messageKey);
  const unjunkListener = new PromiseTestUtils.PromiseCopyListener();
  junkFolder.handleViewCommand(
    Ci.nsMsgViewCommandType.unjunk,
    [newMessageKeys[0]],
    null,
    unjunkListener
  );
  await unjunkListener.promise;
  await syncFolder(ewsIncomingServer, inboxFolder);

  Assert.equal(
    [...inboxFolder.messages].length,
    1,
    "Should be one unjunked message in the test folder."
  );
  Assert.equal(
    [...junkFolder.messages].length,
    1,
    "Should still be one junked message in junk folder."
  );
});

add_task(async function test_change_flag_status() {
  const folderName = "change_flag_status";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, folderName)
  );

  const rootFolder = ewsIncomingServer.rootFolder;
  await syncFolder(ewsIncomingServer, rootFolder);

  const folder = rootFolder.getChildNamed(folderName);
  Assert.ok(!!folder, `${folderName} folder should exist.`);

  // Add messages to the folder.
  const message = generator.makeMessages({ count: 1 })[0];
  ewsServer.addItemToFolder("message", folderName, message);

  await syncFolder(ewsIncomingServer, folder);

  // Get the message header.
  const messageHeaders = [...folder.messages];
  Assert.equal(messageHeaders.length, 1, "Should have one message to flag.");
  const messageHeader = messageHeaders[0];

  const serverItem = ewsServer.getItemInfo("message");
  Assert.ok(!!serverItem, "Message should exist on server.");
  const serverMessage = serverItem.syntheticMessage;
  Assert.ok(!!serverMessage, "Synthetic message should exist.");

  // Flag the message.
  folder.markMessagesFlagged([messageHeader], true);
  TestUtils.waitForCondition(
    () => serverMessage.metaState.flagged,
    "Waiting for message to be flagged."
  );

  // Unflag the message.
  folder.markMessagesFlagged([messageHeader], false);
  TestUtils.waitForCondition(
    () => !serverMessage.metaState.flagged,
    "Waiting for message to be unflagged."
  );
});

add_task(async function test_hard_delete_item() {
  const folderName = "hard_delete";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, folderName)
  );

  const rootFolder = ewsIncomingServer.rootFolder;
  await syncFolder(ewsIncomingServer, rootFolder);

  const folder = rootFolder.getChildNamed(folderName);
  Assert.ok(!!folder, `${folderName} folder should exist.`);

  const message = generator.makeMessages({ count: 1 })[0];
  ewsServer.addItemToFolder("message_to_delete", folderName, message);

  await syncFolder(ewsIncomingServer, folder);

  const messageHeaders = [...folder.messages];
  Assert.equal(
    messageHeaders.length,
    1,
    "Should be one message to delete in the inbox."
  );

  const eventPromise = PromiseTestUtils.promiseFolderEvent(
    folder,
    "DeleteOrMoveMsgCompleted"
  );
  folder.deleteMessages([messageHeaders[0]], null, true, false, null, false);
  await eventPromise;

  // Message should no longer be in the inbox.
  const matchingMessages = [...folder.messages];
  Assert.equal(matchingMessages.length, 0, "Message should have been deleted.");
});
