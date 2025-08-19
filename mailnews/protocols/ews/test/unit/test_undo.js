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

const ewsIdPropertyName = "ewsId";
const generator = new MessageGenerator();

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({});
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
});

add_task(async function test_undo_move() {
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const inboxFolder = rootFolder.getChildNamed("Inbox");
  const archiveFolder = rootFolder.getChildNamed("Archives");

  Assert.ok(!!inboxFolder, "Inbox folder should exist.");
  Assert.ok(!!archiveFolder, "Archive folder should exist.");

  const itemId = "undo_move_test_item";
  ewsServer.addNewItemOrMoveItemToFolder(itemId, "inbox");
  await syncFolder(incomingServer, inboxFolder);

  const findTestMessages = folder => {
    const messages = [...folder.messages];
    return messages.filter(m =>
      m.getStringProperty("ewsId").startsWith("undo_move_test")
    );
  };

  const headers = findTestMessages(inboxFolder);
  Assert.equal(headers.length, 1, "Should have on test message.");

  const listener = new PromiseTestUtils.PromiseCopyListener();
  archiveFolder.copyMessages(
    inboxFolder,
    headers,
    true,
    msgWindow,
    listener,
    false,
    true
  );
  await listener.promise;

  const movedHeaders = findTestMessages(archiveFolder);
  Assert.equal(
    movedHeaders.length,
    1,
    "Message should have moved to archive folder."
  );

  Assert.ok(
    !!msgWindow.transactionManager.peekUndoStack(),
    "Should have one transaction on the undo stack."
  );

  msgWindow.transactionManager.undoTransaction();
  await TestUtils.waitForCondition(() => {
    return findTestMessages(inboxFolder).length > 0;
  }, "Waiting for undo operation to complete.");

  const undoneHeaders = findTestMessages(inboxFolder);
  Assert.equal(
    undoneHeaders.length,
    1,
    "Undo should have moved message back to inbox."
  );

  Assert.ok(
    !!msgWindow.transactionManager.peekRedoStack(),
    "Should have one transaction on the redo stack."
  );

  msgWindow.transactionManager.redoTransaction();
  await TestUtils.waitForCondition(() => {
    return findTestMessages(archiveFolder).length > 0;
  }, "Waiting for redo operation to complete.");

  const redoneHeaders = findTestMessages(archiveFolder);
  Assert.equal(
    redoneHeaders.length,
    1,
    "Redo should have moved message back to the archive folder."
  );
});
