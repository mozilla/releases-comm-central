/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var incomingServer;

/**
 * @type {EwsServer}
 */
var ewsServer;

/**
 * @type {nsIMsgWindow}
 */
var msgWindow;

var rootFolder;

const ewsIdPropertyName = "ewsId";

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({});
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
});

function findTestMessages(folder, prefix) {
  const messages = [...folder.messages];
  return messages.filter(m =>
    m.getStringProperty(ewsIdPropertyName).startsWith(prefix)
  );
}

async function setupCopyMoveTest(srcFolder, dstFolder, isMove) {
  ewsServer.addItemToFolder("copy_move_item", srcFolder.name);
  await syncFolder(incomingServer, srcFolder);

  const headers = [...srcFolder.messages];
  Assert.equal(
    headers.length,
    1,
    "Should have one message in the source folder."
  );

  const listener = new PromiseTestUtils.PromiseCopyListener();
  dstFolder.copyMessages(
    srcFolder,
    headers,
    isMove,
    msgWindow,
    listener,
    false,
    true
  );
  await listener.promise;
}

function checkFolders(folderCounts) {
  for (const [folder, count] of folderCounts) {
    Assert.equal(
      [...folder.messages].length,
      count,
      `Should have ${count} messages in folder ${folder.name}.`
    );
  }
}

add_task(async function test_undo_move() {
  const srcFolderName = "undo_move_src";
  const dstFolderName = "undo_move_dst";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(srcFolderName, "root", srcFolderName, srcFolderName)
  );
  ewsServer.appendRemoteFolder(
    new RemoteFolder(dstFolderName, "root", dstFolderName, dstFolderName)
  );

  await syncFolder(incomingServer, rootFolder);
  const srcFolder = rootFolder.getChildNamed(srcFolderName);
  const dstFolder = rootFolder.getChildNamed(dstFolderName);

  await setupCopyMoveTest(srcFolder, dstFolder, true);

  checkFolders([
    [srcFolder, 0],
    [dstFolder, 1],
  ]);

  const currentUndoItem = msgWindow.transactionManager.peekUndoStack();
  Assert.ok(!!currentUndoItem, "Should have a transaction on the undo stack.");
  Assert.equal(
    currentUndoItem.QueryInterface(Ci.nsIMsgTxn).txnType,
    Ci.nsIMessenger.eMoveMsg
  );

  msgWindow.transactionManager.undoTransaction();
  await TestUtils.waitForCondition(() => {
    return !![...srcFolder.messages].length;
  }, "Waiting for undo operation to complete.");

  checkFolders([
    [srcFolder, 1],
    [dstFolder, 0],
  ]);

  const currentRedoItem = msgWindow.transactionManager.peekRedoStack();
  Assert.ok(!!currentRedoItem, "Should have a transaction on the redo stack.");
  Assert.equal(
    currentRedoItem.QueryInterface(Ci.nsIMsgTxn).txnType,
    Ci.nsIMessenger.eMoveMsg
  );

  msgWindow.transactionManager.redoTransaction();
  await TestUtils.waitForCondition(() => {
    return !![...dstFolder.messages].length;
  }, "Waiting for redo operation to complete.");

  checkFolders([
    [srcFolder, 0],
    [dstFolder, 1],
  ]);

  msgWindow.transactionManager.clear();
});

add_task(async function test_undo_copy() {
  const srcFolderName = "undo_copy_src";
  const dstFolderName = "undo_copy_dst";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(srcFolderName, "root", srcFolderName, srcFolderName)
  );
  ewsServer.appendRemoteFolder(
    new RemoteFolder(dstFolderName, "root", dstFolderName, dstFolderName)
  );

  await syncFolder(incomingServer, rootFolder);
  const srcFolder = rootFolder.getChildNamed(srcFolderName);
  const dstFolder = rootFolder.getChildNamed(dstFolderName);

  await setupCopyMoveTest(srcFolder, dstFolder, false);

  checkFolders([
    [srcFolder, 1],
    [dstFolder, 1],
  ]);

  const currentUndoItem = msgWindow.transactionManager.peekUndoStack();
  Assert.ok(!!currentUndoItem, "Should have a transaction on the undo stack.");
  Assert.equal(
    currentUndoItem.QueryInterface(Ci.nsIMsgTxn).txnType,
    Ci.nsIMessenger.eCopyMsg
  );

  msgWindow.transactionManager.undoTransaction();
  await TestUtils.waitForCondition(() => {
    return ![...dstFolder.messages].length;
  }, "Waiting for undo operation to complete.");

  checkFolders([
    [srcFolder, 1],
    [dstFolder, 0],
  ]);

  const currentRedoItem = msgWindow.transactionManager.peekRedoStack();
  Assert.ok(!!currentRedoItem, "Should have a transaction on the redo stack.");
  Assert.equal(
    currentRedoItem.QueryInterface(Ci.nsIMsgTxn).txnType,
    Ci.nsIMessenger.eCopyMsg
  );

  msgWindow.transactionManager.redoTransaction();
  await TestUtils.waitForCondition(() => {
    return !![...dstFolder.messages].length;
  }, "Waiting for redo operation to complete.");

  checkFolders([
    [srcFolder, 1],
    [dstFolder, 1],
  ]);

  msgWindow.transactionManager.clear();
});

/**
 * This test tests undoing of soft delete operations, in which the item is moved
 * to the trash. There is no way to undo a hard delete in which the item is
 * permanently deleted.
 */
add_task(async function test_undo_delete() {
  const trashFolder = rootFolder.getChildNamed("Deleted Items");
  Assert.ok(!!trashFolder, "Trash folder should exist.");

  const folderName = "undo_delete";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, folderName)
  );
  ewsServer.addItemToFolder("undo_delete_test", folderName);
  await syncFolder(incomingServer, rootFolder);

  const folder = rootFolder.getChildNamed(folderName);
  await syncFolder(incomingServer, folder);

  const messagesToDelete = [...folder.messages];
  Assert.equal(messagesToDelete.length, 1, "Should have a message to delete.");

  const listener = new PromiseTestUtils.PromiseCopyListener();
  folder.deleteMessages(
    messagesToDelete,
    msgWindow,
    false,
    false,
    listener,
    true
  );
  await listener.promise;

  checkFolders([
    [folder, 0],
    [trashFolder, 1],
  ]);

  const undoTransaction = msgWindow.transactionManager.peekUndoStack();
  Assert.ok(!!undoTransaction, "Should have an undo transaction.");
  Assert.equal(
    undoTransaction.QueryInterface(Ci.nsIMsgTxn).txnType,
    Ci.nsIMessenger.eDeleteMsg
  );

  msgWindow.transactionManager.undoTransaction();
  await TestUtils.waitForCondition(() => {
    return !![...folder.messages].length;
  }, "Waiting for message to reappear in source folder.");

  checkFolders([
    [folder, 1],
    [trashFolder, 0],
  ]);

  const redoTransaction = msgWindow.transactionManager.peekRedoStack();
  Assert.ok(!!redoTransaction, "Should have a redo transaction.");
  Assert.equal(
    redoTransaction.QueryInterface(Ci.nsIMsgTxn).txnType,
    Ci.nsIMessenger.eDeleteMsg
  );

  msgWindow.transactionManager.redoTransaction();
  await TestUtils.waitForCondition(() => {
    return ![...folder.messages].length;
  }, "Waiting for message to disappear from folder.");

  checkFolders([
    [folder, 0],
    [trashFolder, 1],
  ]);

  msgWindow.transactionManager.clear();
});
