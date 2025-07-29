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
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var incomingServer;

/**
 * @type {EwsServer}
 */
var ewsServer;

const ewsIdPropertyName = "ewsId";

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer();
});

/**
 * Construct the test structure required for copying or moving items.
 *
 * The `prefix` argument indicates the prefix to apply to the folders
 * constructed for the test setup. This function will create two folders on the
 * remote server: `<prefix>_folder1` and `<prefix>_folder2`, and will place two
 * items in `<prefix>_folder1` named `<prefix>_a` and `<prefix>_b`. This
 * function returns a tuple with the names of the two folders as the first two
 * elements and the folders themselves as the second two elements.
 *
 * @param {string} prefix
 * @returns {[string, string, nsIMsgFolder, nsIMsgFolder]}
 */
async function setup_item_copymove_structure(prefix) {
  // Create two folders for the copy/move tests.
  const folder1Name = `${prefix}_folder1`;
  const folder2Name = `${prefix}_folder2`;
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folder1Name, "root", folder1Name, folder1Name)
  );
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folder2Name, "root", folder2Name, folder2Name)
  );

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const folder1 = rootFolder.getChildNamed(folder1Name);
  Assert.ok(!!folder1, `${folder1Name} should exist.`);
  const folder2 = rootFolder.getChildNamed(folder2Name);
  Assert.ok(!!folder2, `${folder2Name} should exist.`);

  ewsServer.addNewItemOrMoveItemToFolder(`${prefix}_a`, folder1Name);
  ewsServer.addNewItemOrMoveItemToFolder(`${prefix}_b`, folder1Name);

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

  return [folder1Name, folder2Name, folder1, folder2];
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
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  destinationFolder.copyMessages(
    sourceFolder,
    headers,
    isMove,
    null,
    copyListener,
    true,
    false
  );
  return copyListener.promise;
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
  destinationFolder.copyFolder(sourceFolder, isMove, null, copyListener);
  return copyListener.promise;
}

add_task(async function test_move_item() {
  const [folder1Name, folder2Name, folder1, folder2] =
    await setup_item_copymove_structure("move");

  const headers = [];
  [...folder1.messages].forEach(header => headers.push(header));

  // Initiate the move operation.
  const isMove = true;
  await copyItems(folder1, folder2, headers, isMove);

  Assert.equal(
    ewsServer.getContainingFolderId("move_a"),
    folder2Name,
    `Item move_a should be in ${folder2Name}`
  );
  Assert.equal(
    ewsServer.getContainingFolderId("move_b"),
    folder2Name,
    `Item move_b should be in ${folder2Name}`
  );
  Assert.equal(
    folder1.getTotalMessages(false),
    0,
    `${folder1Name} should be empty`
  );
  Assert.equal(
    folder2.getTotalMessages(false),
    2,
    `${folder2Name} should have 2 messages`
  );
});

add_task(async function test_copy_item() {
  const [folder1Name, folder2Name, folder1, folder2] =
    await setup_item_copymove_structure("copy");

  const headers = [];
  [...folder1.messages].forEach(header => headers.push(header));

  // Initiate the copy operation.
  const isMove = false;
  await copyItems(folder1, folder2, headers, isMove);

  Assert.equal(
    folder1.getTotalMessages(false),
    2,
    `${folder1Name} should contain 2 messages`
  );
  Assert.equal(
    folder2.getTotalMessages(false),
    2,
    `${folder2Name} should contain 2 messages`
  );
  Assert.equal(
    ewsServer.getContainingFolderId("copy_a"),
    folder1Name,
    `Item copy_a should be in ${folder1Name}`
  );
  Assert.equal(
    ewsServer.getContainingFolderId("copy_b"),
    folder1Name,
    `Item copy_b should be in ${folder1Name}`
  );
  Assert.equal(
    ewsServer.getContainingFolderId("copy_a_copy"),
    folder2Name,
    `Item copy_a_copy should be in ${folder2Name}`
  );
  Assert.equal(
    ewsServer.getContainingFolderId("copy_b_copy"),
    folder2Name,
    `Item copy_b_copy should be in ${folder2Name}`
  );
});

add_task(async function test_copy_file_message() {
  ewsServer.appendRemoteFolder(
    new RemoteFolder(
      "copyFileMessage",
      "root",
      "copyFileMessage",
      "copyFileMessage"
    )
  );

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const folder = rootFolder.getChildNamed("copyFileMessage");

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
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  const generator = new MessageGenerator();
  const syntheticMessages = generator.makeMessages({ count: 3 });
  ewsServer.addMessages(folderName, syntheticMessages);

  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, null);

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

  const serverMessage0 = ewsServer.getItem(
    btoa(syntheticMessages[0].messageId)
  );
  Assert.ok(!serverMessage0.syntheticMessage.metaState.read);
  const serverMessage1 = ewsServer.getItem(
    btoa(syntheticMessages[1].messageId)
  );
  Assert.ok(!serverMessage1.syntheticMessage.metaState.read);
  const serverMessage2 = ewsServer.getItem(
    btoa(syntheticMessages[2].messageId)
  );
  Assert.ok(!serverMessage2.syntheticMessage.metaState.read);

  // Mark some messages as read.

  folder.markMessagesRead([messages[0], messages[2]], true);

  Assert.equal(
    folder.getNumUnread(false),
    1,
    "two messages should be marked as read"
  );
  await TestUtils.waitForCondition(
    () => serverMessage0.syntheticMessage.metaState.read,
    "waiting for message 0 to be marked as read on the server"
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

  Assert.equal(
    folder.getNumUnread(false),
    2,
    "one message should be marked as read"
  );
  await TestUtils.waitForCondition(
    () => !serverMessage2.syntheticMessage.metaState.read,
    "waiting for message 2 to be marked as unread on the server"
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

add_task(async function test_move_folder() {
  const parent1Name = "parent1";
  const parent2Name = "parent2";
  const childName = "child";

  ewsServer.appendRemoteFolder(
    new RemoteFolder(parent1Name, "root", parent1Name, parent1Name)
  );
  ewsServer.appendRemoteFolder(
    new RemoteFolder(parent2Name, "root", parent2Name, parent2Name)
  );
  ewsServer.appendRemoteFolder(
    new RemoteFolder(childName, parent1Name, childName, childName)
  );

  const rootFolder = incomingServer.rootFolder;

  await syncFolder(incomingServer, rootFolder);

  const parent1 = rootFolder.getChildNamed(parent1Name);
  Assert.ok(!!parent1, `${parent1Name} should exist.`);
  const parent2 = rootFolder.getChildNamed(parent2Name);
  Assert.ok(!!parent2, `${parent2Name} should exist.`);

  await syncFolder(incomingServer, parent1);

  const child = parent1.getChildNamed(childName);
  Assert.ok(!!child, `${childName} should exist in ${parent1Name}`);

  await copyFolder(child, parent2, true);

  Assert.ok(
    !parent1.getChildNamed(childName),
    `${childName} should not exist in ${parent1Name}`
  );
  Assert.ok(
    !!parent2.getChildNamed(childName),
    `${childName} should exist in ${parent2Name}`
  );
});
