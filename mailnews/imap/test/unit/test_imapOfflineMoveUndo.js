/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let headers;
let cancelledFolder;
let ordinaryFolder;
let mixedFolder;
let txnMgr;

add_setup(async function () {
  setupIMAPPump();
  txnMgr = MailServices.txns.transactionManager;
  registerCleanupFunction(() => {
    txnMgr.clear();
    // Collect offline-operation wrappers before teardown closes their database.
    Cu.forceGC();
    teardownIMAPPump();
    Services.io.offline = false;
    Services.prefs.clearUserPref("mail.server.default.autosync_offline_stores");
    Services.prefs.clearUserPref("offline.download.download_messages");
  });
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  Services.prefs.setIntPref("offline.download.download_messages", 2);

  cancelledFolder = await createImapSubfolder("cancelled");
  ordinaryFolder = await createImapSubfolder("ordinary");
  mixedFolder = await createImapSubfolder("mixed");
  headers = await addImapMessagesAndSync(5);
  txnMgr.clear();

  IMAPPump.incomingServer.closeCachedConnections();
  IMAPPump.server.stop();
  Services.io.offline = true;
});

add_task(async function test_cancelledMoveHasNoUndo() {
  const sourceDB = IMAPPump.inbox.msgDatabase;
  // A self-referencing kMoveResult makes CopyMessagesOffline cancel the
  // existing operation without setting up a new move or its undo headers.
  for (const header of headers.slice(0, 2)) {
    const op = sourceDB.getOfflineOpForKey(header.messageKey, true);
    op.setMoveResultOp(IMAPPump.inbox.URI);
    op.srcMessageKey = header.messageKey;
  }

  await moveImapMessages(IMAPPump.inbox, headers.slice(0, 2), cancelledFolder);

  Assert.equal(
    cancelledFolder.getTotalMessages(false),
    2,
    "The cancelled moves should still copy the local headers"
  );
  Assert.deepEqual(
    sourceDB.listAllOfflineOpIds(),
    [],
    "The source offline operations should have been cancelled"
  );
  const destDB = cancelledFolder.msgDatabase;
  for (const header of cancelledFolder.messages) {
    Assert.equal(
      destDB.getOfflineOpForKey(header.messageKey, false),
      null,
      "A cancelled move should not leave a destination offline operation"
    );
  }
  Assert.equal(
    txnMgr.numberOfUndoItems,
    0,
    "Cancelling every offline operation should not add an empty undo entry"
  );
});

add_task(async function test_ordinaryMoveHasUndo() {
  txnMgr.clear();
  // Keep source headers so undo only needs to clear their IMAPDeleted flag.
  IMAPPump.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
  const messageId = headers[2].messageId;
  await moveImapMessages(IMAPPump.inbox, [headers[2]], ordinaryFolder);

  Assert.ok(
    ordinaryFolder.msgDatabase.getMsgHdrForMessageID(messageId),
    "The moved message should be in the destination folder"
  );
  Assert.ok(
    headers[2].flags & Ci.nsMsgMessageFlags.IMAPDeleted,
    "The move should mark the source header deleted"
  );
  Assert.equal(
    txnMgr.numberOfUndoItems,
    1,
    "An ordinary offline move should add one undo entry"
  );
  txnMgr.undoTransaction();
  Assert.equal(
    ordinaryFolder.msgDatabase.getMsgHdrForMessageID(messageId),
    null,
    "Undo should remove the moved header from the destination"
  );
  Assert.ok(
    IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(messageId),
    "Undo should retain the source header"
  );
  Assert.ok(
    !(headers[2].flags & Ci.nsMsgMessageFlags.IMAPDeleted),
    "Undo should clear the source header's deleted flag"
  );
});

add_task(async function test_mixedMoveHasUndo() {
  txnMgr.clear();
  const cancelledId = headers[3].messageId;
  const movedId = headers[4].messageId;
  const sourceDB = IMAPPump.inbox.msgDatabase;
  const op = sourceDB.getOfflineOpForKey(headers[3].messageKey, true);
  op.setMoveResultOp(IMAPPump.inbox.URI);
  op.srcMessageKey = headers[3].messageKey;

  await moveImapMessages(IMAPPump.inbox, headers.slice(3), mixedFolder);

  Assert.ok(
    mixedFolder.msgDatabase.getMsgHdrForMessageID(movedId),
    "The ordinary move should be in the destination folder"
  );
  Assert.equal(
    txnMgr.numberOfUndoItems,
    1,
    "A batch with an ordinary move should retain its undo entry"
  );
  txnMgr.undoTransaction();
  Assert.equal(
    mixedFolder.msgDatabase.getMsgHdrForMessageID(movedId),
    null,
    "Undo should remove the ordinary move from the destination"
  );
  Assert.ok(
    mixedFolder.msgDatabase.getMsgHdrForMessageID(cancelledId),
    "Undo should leave the cancelled move in the destination"
  );
  Assert.ok(
    IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(movedId),
    "Undo should retain the ordinary move's source header"
  );
  Assert.ok(
    !(headers[4].flags & Ci.nsMsgMessageFlags.IMAPDeleted),
    "Undo should clear the ordinary move's deleted flag"
  );
});
