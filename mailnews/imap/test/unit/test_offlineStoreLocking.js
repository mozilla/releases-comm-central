/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that code that writes to the imap offline store deals
 * with offline store locking correctly.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/MessageGenerator.jsm");
load("../../../resources/alertTestUtils.js");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// Globals
var gIMAPTrashFolder, gMsgImapInboxFolder;
var gGotAlert = false;
var gMovedMsgId;

/* exported alert */
// to alertTestUtils.js
function alert(aDialogTitle, aText) {
  // do_check_true(aText.startsWith("Connection to server Mail for  timed out."));
  gGotAlert = true;
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

var gStreamedHdr = null;

var tests = [
  setup,
  function* downloadForOffline() {
    // ...and download for offline use.
    dump("Downloading for offline use\n");
    IMAPPump.inbox.downloadAllForOffline(asyncUrlListener, null);
    yield false;
  },
  function* deleteOneMsg() {
    let enumerator = IMAPPump.inbox.msgDatabase.EnumerateMessages();
    let msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    IMAPPump.inbox.deleteMessages(
      [msgHdr],
      null,
      false,
      true,
      CopyListener,
      false
    );
    yield false;
  },
  function* compactOneFolder() {
    let enumerator = IMAPPump.inbox.msgDatabase.EnumerateMessages();
    let msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    gStreamedHdr = msgHdr;
    // mark the message as not being offline, and then we'll make sure that
    // streaming the message while we're compacting doesn't result in the
    // message being marked for offline use.
    // Luckily, compaction compacts the offline store first, so it should
    // lock the offline store.
    IMAPPump.inbox.msgDatabase.MarkOffline(msgHdr.messageKey, false, null);
    let msgURI = msgHdr.folder.getUriForMsg(msgHdr);
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );
    let msgServ = messenger.messageServiceFromURI(msgURI);
    // UrlListener will get called when both expunge and offline store
    // compaction are finished. dummyMsgWindow is required to make the backend
    // compact the offline store.
    IMAPPump.inbox.compact(asyncUrlListener, gDummyMsgWindow);
    // Stream the message w/o a stream listener in an attempt to get the url
    // started more quickly, while the compact is still going on.
    msgServ.streamMessage(
      msgURI,
      null,
      null,
      asyncUrlListener,
      false,
      "",
      false
    );
    yield false;

    // Because we're streaming the message while compaction is going on,
    // we should not have stored it for offline use.
    Assert.equal(false, gStreamedHdr.flags & Ci.nsMsgMessageFlags.Offline);

    yield false;
  },
  function* deleteAnOtherMsg() {
    let enumerator = IMAPPump.inbox.msgDatabase.EnumerateMessages();
    let msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    IMAPPump.inbox.deleteMessages(
      [msgHdr],
      null,
      false,
      true,
      CopyListener,
      false
    );
    yield false;
  },
  function* updateTrash() {
    gIMAPTrashFolder = IMAPPump.incomingServer.rootFolder
      .getChildNamed("Trash")
      .QueryInterface(Ci.nsIMsgImapMailFolder);
    // hack to force uid validity to get initialized for trash.
    gIMAPTrashFolder.updateFolderWithListener(null, asyncUrlListener);
    yield false;
  },
  function* downloadTrashForOffline() {
    // ...and download for offline use.
    dump("Downloading for offline use\n");
    gIMAPTrashFolder.downloadAllForOffline(asyncUrlListener, null);
    yield false;
  },
  function testOfflineBodyCopy() {
    // In order to check that offline copy of messages doesn't try to copy
    // the body if the offline store is locked, we're going to go offline.
    // Thunderbird itself does move/copies pseudo-offline, but that's too
    // hard to test because of the half-second delay.
    IMAPPump.server.stop();
    Services.io.offline = true;
    let enumerator = gIMAPTrashFolder.msgDatabase.EnumerateMessages();
    let msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    gMovedMsgId = msgHdr.messageId;
    IMAPPump.inbox.compact(asyncUrlListener, gDummyMsgWindow);
    MailServices.copy.copyMessages(
      gIMAPTrashFolder,
      [msgHdr],
      IMAPPump.inbox,
      true,
      CopyListener,
      null,
      true
    );
  },
  function* verifyNoOfflineMsg() {
    try {
      let movedMsg = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
        gMovedMsgId
      );
      Assert.equal(false, movedMsg.flags & Ci.nsMsgMessageFlags.Offline);
    } catch (ex) {
      dump(ex);
    }
    yield false;
    yield false;
  },
  teardown,
];

function run_test() {
  async_run_tests(tests);
}

function setup() {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  setupIMAPPump();

  gMsgImapInboxFolder = IMAPPump.inbox.QueryInterface(Ci.nsIMsgImapMailFolder);
  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  gMsgImapInboxFolder.hierarchyDelimiter = "/";
  gMsgImapInboxFolder.verifiedAsOnlineFolder = true;

  let messageGenerator = new MessageGenerator();
  let messages = [];
  let bodyString = "";
  for (let i = 0; i < 100; i++) {
    bodyString +=
      "1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890\r\n";
  }

  for (let i = 0; i < 50; i++) {
    messages = messages.concat(
      messageGenerator.makeMessage({
        body: { body: bodyString, contentType: "text/plain" },
      })
    );
  }

  addGeneratedMessagesToServer(messages, IMAPPump.daemon.getMailbox("INBOX"));
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
  Assert.ok(gGotAlert);
  gMsgImapInboxFolder = null;
  gIMAPTrashFolder = null;

  // IMAPPump.server has already stopped, we do not need to IMAPPump.server.stop().
  IMAPPump.inbox = null;
  try {
    IMAPPump.incomingServer.closeCachedConnections();
    let serverSink = IMAPPump.incomingServer.QueryInterface(
      Ci.nsIImapServerSink
    );
    serverSink.abortQueuedUrls();
  } catch (ex) {
    dump(ex);
  }
  let thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}
