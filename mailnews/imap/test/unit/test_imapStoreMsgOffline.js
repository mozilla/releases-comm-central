/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks if the imap protocol code saves message to
 * offline stores correctly, when we fetch the message for display.
 * It checks:
 *   - Normal messages, no attachments.
 *   - Message with inline attachment (e.g., image)
 *   - Message with non-inline attachment (e.g., .doc file)
 *   - Message with mix of attachment types.
 */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gMessageGenerator = new MessageGenerator();

var gMsgFile1 = do_get_file("../../../data/bugmail10");
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gMsgFile2 = do_get_file("../../../data/image-attach-test");
var gMsgId2 = "4A947F73.5030709@example.com";
var gMsgFile3 = do_get_file("../../../data/external-attach-test");
var gMsgId3 = "876TY.5030709@example.com";

var gFirstNewMsg;
var gFirstMsgSize;
var gImapInboxOfflineStoreSize;

// Adds some messages directly to a mailbox (e.g. new mail).
function addMessagesToServer(messages, mailbox) {
  // For every message we have, we need to convert it to a file:/// URI.
  messages.forEach(function (message) {
    const URI = Services.io
      .newFileURI(message.file)
      .QueryInterface(Ci.nsIFileURL);
    // Create the ImapMessage and store it on the mailbox.
    mailbox.addMessage(new ImapMessage(URI.spec, mailbox.uidnext++, []));
  });
}

add_setup(async function () {
  // We aren't interested in downloading messages automatically.
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  Services.prefs.setBoolPref("mail.server.server1.offline_download", true);

  setupIMAPPump();

  // These hacks are required because we've created the inbox before
  //  running initial folder discovery, and adding the folder bails
  //  out before we set it as verified online, so we bail out, and
  //  then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;

  addMessagesToServer(
    [
      { file: gMsgFile1, messageId: gMsgId1 },
      { file: gMsgFile2, messageId: gMsgId2 },
      { file: gMsgFile3, messageId: gMsgId3 },
    ],
    IMAPPump.daemon.getMailbox("INBOX")
  );

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

var gIMAPService;

add_task(async function selectFirstMsg() {
  // We postpone creating the imap service until after we've set the prefs
  //  that it reads on its startup.
  gIMAPService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=imap"
  ].getService(Ci.nsIMsgMessageService);

  const db = IMAPPump.inbox.msgDatabase;
  const msg1 = db.getMsgHdrForMessageID(gMsgId1);
  const listener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl: (aUrl, aExitCode) => {
      Assert.equal(aExitCode, 0);
    },
  });
  // We use the streamListener as a display consumer.
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  gIMAPService.loadMessage(
    IMAPPump.inbox.getUriForMsg(msg1),
    streamListener,
    null,
    listener,
    false
  );
  await listener.promise;
});

add_task(async function select2ndMsg() {
  const msg1 = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId1);
  Assert.notEqual(msg1.flags & Ci.nsMsgMessageFlags.Offline, 0);
  const db = IMAPPump.inbox.msgDatabase;
  const msg2 = db.getMsgHdrForMessageID(gMsgId2);
  const listener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl: (aUrl, aExitCode) => {
      Assert.equal(aExitCode, 0);
    },
  });
  // We use the streamListener as a display consumer.
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  gIMAPService.loadMessage(
    IMAPPump.inbox.getUriForMsg(msg2),
    streamListener,
    null,
    listener,
    false
  );
  await listener.promise;
});

add_task(async function select3rdMsg() {
  const msg2 = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId2);
  Assert.notEqual(msg2.flags & Ci.nsMsgMessageFlags.Offline, 0);
  const db = IMAPPump.inbox.msgDatabase;
  const msg3 = db.getMsgHdrForMessageID(gMsgId3);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  // We use the streamListener as a display consumer.
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  gIMAPService.loadMessage(
    IMAPPump.inbox.getUriForMsg(msg3),
    streamListener,
    null,
    listener,
    false
  );
  await listener.promise;
});

add_task(
  {
    // Can't turn this on because our fake server doesn't support body structure.
    skip_if: () => true,
  },
  function verify3rdMsg() {
    const db = IMAPPump.inbox.msgDatabase;
    const msg3 = db.getMsgHdrForMessageID(gMsgId3);
    Assert.equal(msg3.flags & Ci.nsMsgMessageFlags.Offline, 0);
  }
);

add_task(async function addNewMsgs() {
  const mbox = IMAPPump.daemon.getMailbox("INBOX");
  // Make a couple of messages.
  let messages = [];
  let bodyString = "";
  for (let i = 0; i < 100; i++) {
    bodyString +=
      "1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890\r\n";
  }

  gMessageGenerator = new MessageGenerator();
  messages = messages.concat(
    gMessageGenerator.makeMessage({
      body: { body: bodyString, contentType: "text/plain" },
    })
  );

  gFirstNewMsg = mbox.uidnext;
  // Need to account for x-mozilla-status, status2, and envelope.
  gFirstMsgSize = messages[0].toMessageString().length + 102;

  messages.forEach(function (message) {
    const dataUri = Services.io.newURI(
      "data:text/plain;base64," + btoa(message.toMessageString())
    );
    mbox.addMessage(new ImapMessage(dataUri.spec, mbox.uidnext++, []));
  });

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});
add_task(async function test_queuedOfflineDownload() {
  // Make sure that streaming the same message and then trying to download
  //  it for offline use doesn't end up in it getting added to the offline
  //  store twice.
  gImapInboxOfflineStoreSize = IMAPPump.inbox.filePath.fileSize + gFirstMsgSize;
  const newMsgHdr = IMAPPump.inbox.GetMessageHeader(gFirstNewMsg);
  const msgURI = newMsgHdr.folder.getUriForMsg(newMsgHdr);
  const msgServ = MailServices.messageServiceFromURI(msgURI);
  const listener = new PromiseTestUtils.PromiseStreamListener();
  msgServ.streamMessage(msgURI, listener, null, null, false, "", false);
  await listener.promise;
});
add_task(async function firstStreamFinished() {
  // nsIMsgFolder.downloadMessagesForOffline does not take a listener, so
  //  we invoke nsIImapService.downloadMessagesForOffline directly
  //  with a listener.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.downloadMessagesForOffline(
    gFirstNewMsg,
    IMAPPump.inbox,
    listener,
    null
  );
  await listener.promise;
});
add_task(function checkOfflineStoreSize() {
  Assert.ok(IMAPPump.inbox.filePath.fileSize <= gImapInboxOfflineStoreSize);
});

add_task(function endTest() {
  teardownIMAPPump();
});
