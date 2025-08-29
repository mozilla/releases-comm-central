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

/**
 * @type {nsIMsgWindow}
 */
var msgWindow;

var rootFolder, inboxFolder, archiveFolder;

const ewsIdPropertyName = "ewsId";
const generator = new MessageGenerator();

class DummyStatusFeedback {
  showStatusString(_status) {}
  startMeteors() {}
  stopMeteors() {}
  showProgress(_percent) {}
  setWrappedStatusFeedback(_feedback) {}
}

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({});
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  msgWindow.statusFeedback = new DummyStatusFeedback();
  rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  inboxFolder = rootFolder.getChildNamed("Inbox");
  archiveFolder = rootFolder.getChildNamed("Archives");

  Assert.ok(!!inboxFolder, "Inbox folder should exist.");
  Assert.ok(!!archiveFolder, "Archive folder should exist.");
});

function findTestMessages(folder, prefix) {
  const messages = [...folder.messages];
  return messages.filter(m =>
    m.getStringProperty(ewsIdPropertyName).startsWith(prefix)
  );
}

async function setupCopyMoveTest(prefix, isMove) {
  const itemId = `${prefix}_item`;
  ewsServer.addNewItemOrMoveItemToFolder(itemId, "inbox");
  await syncFolder(incomingServer, inboxFolder);

  const headers = findTestMessages(inboxFolder, prefix);
  Assert.equal(headers.length, 1, "Should have on test message.");

  const listener = new PromiseTestUtils.PromiseCopyListener();
  archiveFolder.copyMessages(
    inboxFolder,
    headers,
    isMove,
    msgWindow,
    listener,
    false,
    true
  );
  await listener.promise;
}

function checkFolders(prefix, inboxCount, archiveCount) {
  Assert.equal(
    findTestMessages(inboxFolder, prefix).length,
    inboxCount,
    `Should have ${inboxCount} messages with id prefix ${prefix} in inbox folder.`
  );
  Assert.equal(
    findTestMessages(archiveFolder, prefix).length,
    archiveCount,
    `Should have ${archiveCount} messages with id prefix ${prefix} in archive folder.`
  );
}

add_task(async function test_undo_move() {
  const testItemPrefix = "undo_move_test";
  await setupCopyMoveTest(testItemPrefix, true);
  checkFolders(testItemPrefix, 0, 1);

  Assert.ok(
    !!msgWindow.transactionManager.peekUndoStack(),
    "Should have one transaction on the undo stack."
  );

  msgWindow.transactionManager.undoTransaction();
  await TestUtils.waitForCondition(() => {
    return findTestMessages(inboxFolder, testItemPrefix).length > 0;
  }, "Waiting for undo operation to complete.");

  checkFolders(testItemPrefix, 1, 0);

  Assert.ok(
    !!msgWindow.transactionManager.peekRedoStack(),
    "Should have one transaction on the redo stack."
  );

  msgWindow.transactionManager.redoTransaction();
  await TestUtils.waitForCondition(() => {
    return findTestMessages(archiveFolder, testItemPrefix).length > 0;
  }, "Waiting for redo operation to complete.");

  checkFolders(testItemPrefix, 0, 1);

  msgWindow.transactionManager.clear();
});

add_task(async function test_undo_copy() {
  const testItemPrefix = "undo_copy_test";
  await setupCopyMoveTest(testItemPrefix, false);
  checkFolders(testItemPrefix, 1, 1);

  Assert.ok(
    !!msgWindow.transactionManager.peekUndoStack(),
    "Should have one transaction on the undo stack."
  );

  msgWindow.transactionManager.undoTransaction();
  await TestUtils.waitForCondition(() => {
    return findTestMessages(archiveFolder, testItemPrefix).length == 0;
  }, "Waiting for undo operation to complete.");

  checkFolders(testItemPrefix, 1, 0);

  Assert.ok(
    !!msgWindow.transactionManager.peekRedoStack(),
    "Should have one transaction on the redo stack."
  );

  msgWindow.transactionManager.redoTransaction();
  await TestUtils.waitForCondition(() => {
    return findTestMessages(archiveFolder, testItemPrefix).length > 0;
  }, "Waiting for redo operation to complete.");

  checkFolders(testItemPrefix, 1, 1);

  msgWindow.transactionManager.clear();
});
