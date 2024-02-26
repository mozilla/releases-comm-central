/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that compacting offline stores works correctly with imap folders
 * and returns success.
 */

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

// Globals
var gRootFolder;
var gImapInboxOfflineStoreSize;

var gMsgFile1 = do_get_file("../../../data/bugmail10");
var gMsgFile2 = do_get_file("../../../data/bugmail11");
// var gMsgFile3 = do_get_file("../../../data/draft1");
var gMsgFile4 = do_get_file("../../../data/bugmail7");
var gMsgFile5 = do_get_file("../../../data/bugmail6");

// Copied straight from the example files
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gMsgId2 = "200804111417.m3BEHTk4030129@mrapp51.mozilla.org";
// var gMsgId3 = "4849BF7B.2030800@example.com";
var gMsgId4 = "bugmail7.m47LtAEf007542@mrapp51.mozilla.org";
var gMsgId5 = "bugmail6.m47LtAEf007542@mrapp51.mozilla.org";

// Adds some messages directly to a mailbox (e.g. new mail).
function addMessagesToServer(messages, mailbox) {
  // For every message we have, we need to convert it to a file:/// URI
  messages.forEach(function (message) {
    const URI = Services.io
      .newFileURI(message.file)
      .QueryInterface(Ci.nsIFileURL);
    // Create the ImapMessage and store it on the mailbox.
    mailbox.addMessage(new ImapMessage(URI.spec, mailbox.uidnext++, []));
  });
}

function addGeneratedMessagesToServer(messages, mailbox) {
  // Create the ImapMessages and store them on the mailbox
  messages.forEach(function (message) {
    const dataUri = Services.io.newURI(
      "data:text/plain;base64," + btoa(message.toMessageString())
    );
    mailbox.addMessage(new ImapMessage(dataUri.spec, mailbox.uidnext++, []));
  });
}

function checkOfflineStore(prevOfflineStoreSize) {
  const enumerator = IMAPPump.inbox.msgDatabase.enumerateMessages();
  if (enumerator) {
    for (const header of enumerator) {
      // this will verify that the message in the offline store
      // starts with "From " - otherwise, it returns an error.
      if (
        header instanceof Ci.nsIMsgDBHdr &&
        header.flags & Ci.nsMsgMessageFlags.Offline
      ) {
        IMAPPump.inbox.getLocalMsgStream(header).close();
      }
    }
  }
  // check that the offline store shrunk by at least 100 bytes.
  // (exact calculation might be fragile).
  Assert.ok(prevOfflineStoreSize > IMAPPump.inbox.filePath.fileSize + 100);
}

add_setup(function () {
  setupIMAPPump();

  gRootFolder = IMAPPump.incomingServer.rootFolder;
  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;

  const messageGenerator = new MessageGenerator();
  let messages = [];
  for (let i = 0; i < 50; i++) {
    messages = messages.concat(messageGenerator.makeMessage());
  }

  addGeneratedMessagesToServer(messages, IMAPPump.daemon.getMailbox("INBOX"));

  // Add a couple of messages to the INBOX
  // this is synchronous, afaik
  addMessagesToServer(
    [
      { file: gMsgFile1, messageId: gMsgId1 },
      { file: gMsgFile4, messageId: gMsgId4 },
      { file: gMsgFile2, messageId: gMsgId2 },
      { file: gMsgFile5, messageId: gMsgId5 },
    ],
    IMAPPump.daemon.getMailbox("INBOX")
  );
});

add_task(async function downloadForOffline() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(listener, null);
  await listener.promise;
});

add_task(async function markOneMsgDeleted() {
  // mark a message deleted, and then do a compact of just
  // that folder.
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId5);
  // store the deleted flag
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.storeImapFlags(0x0008, true, [msgHdr.messageKey], listener);
  await listener.promise;
});

add_task(async function compactOneFolder() {
  IMAPPump.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.compact(listener, null);
  await listener.promise;
});

add_task(async function test_deleteOneMessage() {
  // check that nstmp file has been cleaned up.
  const tmpFile = gRootFolder.filePath;
  tmpFile.append("nstmp");
  Assert.ok(!tmpFile.exists());
  // Deleting one message.
  IMAPPump.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.MoveToTrash;
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId1);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  IMAPPump.inbox.deleteMessages(
    [msgHdr],
    null,
    false,
    true,
    copyListener,
    false
  );
  await copyListener.promise;

  const trashFolder = gRootFolder.getChildNamed("Trash");
  // hack to force uid validity to get initialized for trash.
  trashFolder.updateFolder(null);
});

add_task(async function compactOfflineStore() {
  gImapInboxOfflineStoreSize = IMAPPump.inbox.filePath.fileSize;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gRootFolder.compactAll(listener, null);
  await listener.promise;
});

add_task(function test_checkCompactionResult1() {
  checkOfflineStore(gImapInboxOfflineStoreSize);
});

add_task(async function pendingRemoval() {
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId2);
  IMAPPump.inbox.markPendingRemoval(msgHdr, true);
  gImapInboxOfflineStoreSize = IMAPPump.inbox.filePath.fileSize;
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gRootFolder.compactAll(listener, null);
  await listener.promise;
});

add_task(function test_checkCompactionResult2() {
  const tmpFile = gRootFolder.filePath;
  tmpFile.append("nstmp");
  Assert.ok(!tmpFile.exists());
  checkOfflineStore(gImapInboxOfflineStoreSize);
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId2);
  Assert.equal(msgHdr.flags & Ci.nsMsgMessageFlags.Offline, 0);
});

add_task(function endTest() {
  gRootFolder = null;
  teardownIMAPPump();
});
