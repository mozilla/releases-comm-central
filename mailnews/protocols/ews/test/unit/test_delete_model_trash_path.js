/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var incomingServer;
var ewsServer;
var ewsIncomingServer;

add_setup(async function () {
  // Ensure we have an on-disk profile.
  do_get_profile();

  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer();
  ewsServer.start();

  // Create and configure the EWS incoming server.
  incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
  });

  ewsIncomingServer = incomingServer.QueryInterface(Ci.IEwsIncomingServer);
  Assert.ok(!!ewsIncomingServer, "Created server should be an EWS server.");
});

/**
 * Trigger the `deleteMessages` operation and return a promise that resolves on
 * completion.
 *
 * @param {nsIMsgFolder} folder
 * @param {[nsIMsgDBHdr]} headersToDelete
 */
async function deleteItems(folder, headersToDelete) {
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  folder.deleteMessages(
    headersToDelete,
    null,
    false,
    false,
    copyListener,
    false
  );
  return copyListener.promise;
}

add_task(async function test_delete_model() {
  const rootFolder = incomingServer.rootFolder;

  await syncFolder(incomingServer, rootFolder);

  const deletedItemsFolder = rootFolder.getChildNamed("Deleted Items");
  Assert.ok(!!deletedItemsFolder, "Deleted Items folder should exist.");

  const inboxFolder = rootFolder.getChildNamed("Inbox");
  Assert.ok(!!inboxFolder, "Inbox should exist.");

  // By default, the delete model should be move to trash, and the folder should
  // be the distinguished folder we got from the server.
  Assert.equal(
    ewsIncomingServer.deleteModel,
    Ci.IEwsIncomingServer.MOVE_TO_TRASH,
    "Default delete model should be move to trash"
  );
  Assert.equal(
    ewsIncomingServer.trashFolderPath,
    "Deleted Items",
    "trash folder path should be 'Deleted Items'"
  );

  Assert.ok(
    !!(deletedItemsFolder.flags & Ci.nsMsgFolderFlags.Trash),
    "Deleted Items should have the trash flag."
  );

  // Add some items to the inbox.
  ewsServer.addNewItemOrMoveItemToFolder("item1", "inbox");
  ewsServer.addNewItemOrMoveItemToFolder("item2", "inbox");
  ewsServer.addNewItemOrMoveItemToFolder("item3", "inbox");

  await syncFolder(incomingServer, inboxFolder);

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    3,
    "Inbox should have 3 messages."
  );

  const headersToDelete1 = [[...inboxFolder.messages][0]];

  await deleteItems(inboxFolder, headersToDelete1);

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    2,
    "Inbox should have 2 messages."
  );
  Assert.equal(
    deletedItemsFolder.getTotalMessages(false),
    1,
    "Deleted Items should have 1 item."
  );

  // Create a new folder to use as trash.
  ewsServer.appendRemoteFolder(
    new RemoteFolder("delete2", "root", "delete2", "delete2")
  );

  await syncFolder(incomingServer, rootFolder);

  const newDeleteFolder = rootFolder.getChildNamed("delete2");
  Assert.ok(!!newDeleteFolder, "New delete folder should exist.");

  ewsIncomingServer.trashFolderPath = "delete2";

  const headersToDelete2 = [[...inboxFolder.messages][0]];

  await deleteItems(inboxFolder, headersToDelete2);

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    1,
    "Inbox should have 1 message."
  );
  Assert.equal(
    newDeleteFolder.getTotalMessages(false),
    1,
    "New trash folder should have 1 message."
  );

  ewsIncomingServer.deleteModel = Ci.IEwsIncomingServer.DELETE_PERMANENTLY;

  const headersToDelete3 = [[...inboxFolder.messages][0]];

  await deleteItems(inboxFolder, headersToDelete3);

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    0,
    "Should have reached inbox zero."
  );

  // Make sure the two delete folders we used in this test still only have one
  // message each.
  Assert.equal(
    deletedItemsFolder.getTotalMessages(false),
    1,
    "Deleted Items should have 1 message."
  );
  Assert.equal(
    newDeleteFolder.getTotalMessages(false),
    1,
    "delete2 should have 1 message."
  );
});
