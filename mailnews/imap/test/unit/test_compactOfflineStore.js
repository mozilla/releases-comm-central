/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that compacting offline stores works correctly with imap folders
 * and returns success.
 */

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/MessageGenerator.jsm");
load("../../../resources/alertTestUtils.js");

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

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox) {
  // For every message we have, we need to convert it to a file:/// URI
  messages.forEach(function(message) {
    let URI = Services.io
      .newFileURI(message.file)
      .QueryInterface(Ci.nsIFileURL);
    // Create the imapMessage and store it on the mailbox.
    mailbox.addMessage(new imapMessage(URI.spec, mailbox.uidnext++, []));
  });
}

function addGeneratedMessagesToServer(messages, mailbox) {
  // Create the imapMessages and store them on the mailbox
  messages.forEach(function(message) {
    let dataUri = Services.io.newURI(
      "data:text/plain;base64," + btoa(message.toMessageString())
    );
    mailbox.addMessage(new imapMessage(dataUri.spec, mailbox.uidnext++, []));
  });
}

function checkOfflineStore(prevOfflineStoreSize) {
  dump("checking offline store\n");
  let offset = {};
  let size = {};
  let enumerator = IMAPPump.inbox.msgDatabase.EnumerateMessages();
  if (enumerator) {
    for (let header of enumerator) {
      // this will verify that the message in the offline store
      // starts with "From " - otherwise, it returns an error.
      if (
        header instanceof Ci.nsIMsgDBHdr &&
        header.flags & Ci.nsMsgMessageFlags.Offline
      ) {
        IMAPPump.inbox
          .getOfflineFileStream(header.messageKey, offset, size)
          .close();
      }
    }
  }
  // check that the offline store shrunk by at least 100 bytes.
  // (exact calculation might be fragile).
  Assert.ok(prevOfflineStoreSize > IMAPPump.inbox.filePath.fileSize + 100);
}

var tests = [
  setup,
  function* downloadForOffline() {
    // ...and download for offline use.
    dump("Downloading for offline use\n");
    IMAPPump.inbox.downloadAllForOffline(asyncUrlListener, null);
    yield false;
  },
  function* markOneMsgDeleted() {
    // mark a message deleted, and then do a compact of just
    // that folder.
    let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId5);
    // store the deleted flag
    IMAPPump.inbox.storeImapFlags(
      0x0008,
      true,
      [msgHdr.messageKey],
      asyncUrlListener
    );
    yield false;
  },
  function* compactOneFolder() {
    IMAPPump.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
    // asyncUrlListener will get called when both expunge and offline store
    // compaction are finished. dummyMsgWindow is required to make the backend
    // compact the offline store.
    IMAPPump.inbox.compact(asyncUrlListener, gDummyMsgWindow);
    yield false;
  },
  function* deleteOneMessage() {
    // check that nstmp file has been cleaned up.
    let tmpFile = gRootFolder.filePath;
    tmpFile.append("nstmp");
    Assert.ok(!tmpFile.exists());
    dump("deleting one message\n");
    IMAPPump.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.MoveToTrash;
    let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId1);
    IMAPPump.inbox.deleteMessages(
      [msgHdr],
      null,
      false,
      true,
      CopyListener,
      false
    );
    let trashFolder = gRootFolder.getChildNamed("Trash");
    // hack to force uid validity to get initialized for trash.
    trashFolder.updateFolder(null);
    yield false;
  },
  function* compactOfflineStore() {
    dump("compacting offline store\n");
    gImapInboxOfflineStoreSize = IMAPPump.inbox.filePath.fileSize;
    gRootFolder.compactAll(asyncUrlListener, null, true);
    yield false;
  },
  function* checkCompactionResult() {
    checkOfflineStore(gImapInboxOfflineStoreSize);
    asyncUrlListener.OnStopRunningUrl(null, 0);
    yield false;
  },
  function* testPendingRemoval() {
    let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId2);
    IMAPPump.inbox.markPendingRemoval(msgHdr, true);
    gImapInboxOfflineStoreSize = IMAPPump.inbox.filePath.fileSize;
    gRootFolder.compactAll(asyncUrlListener, null, true);
    yield false;
  },
  function* checkCompactionResult() {
    let tmpFile = gRootFolder.filePath;
    tmpFile.append("nstmp");
    Assert.ok(!tmpFile.exists());
    checkOfflineStore(gImapInboxOfflineStoreSize);
    asyncUrlListener.OnStopRunningUrl(null, 0);
    yield false;
    let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId2);
    Assert.equal(msgHdr.flags & Ci.nsMsgMessageFlags.Offline, 0);
  },
  teardown,
];

function setup() {
  setupIMAPPump();

  gRootFolder = IMAPPump.incomingServer.rootFolder;
  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;

  let messageGenerator = new MessageGenerator();
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
}

// nsIMsgCopyServiceListener implementation - runs next test when copy
// is completed.
var CopyListener = {
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {},
  SetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
    async_driver();
  },
};

function teardown() {
  gRootFolder = null;
  teardownIMAPPump();
}

function run_test() {
  async_run_tests(tests);
}
