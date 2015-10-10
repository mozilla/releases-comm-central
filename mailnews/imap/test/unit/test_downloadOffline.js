/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that downloadAllForOffline works correctly with imap folders
 * and returns success.
 */

load("../../../resources/logHelper.js");
load("../../../resources/messageGenerator.js");

var gFileName = "bug460636";
var gMsgFile = do_get_file("../../../data/" + gFileName);

var tests = [
  setup,
  downloadAllForOffline,
  verifyDownloaded,
  teardownIMAPPump
];

function *setup() {
  setupIMAPPump();

 /*
   * Ok, prelude done. Read the original message from disk
   * (through a file URI), and add it to the Inbox.
   */
  let msgfileuri =
    Services.io.newFileURI(gMsgFile).QueryInterface(Ci.nsIFileURL);

  IMAPPump.mailbox.addMessage(new imapMessage(msgfileuri.spec, IMAPPump.mailbox.uidnext++, []));

  let messages = [];
  let gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());
  let dataUri = Services.io.newURI("data:text/plain;base64," +
                                   btoa(messages[0].toMessageString()),
                                   null, null);
  let imapMsg = new imapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  imapMsg.setSize(5000);
  IMAPPump.mailbox.addMessage(imapMsg);
  
  // ...and download for offline use.
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  yield promiseUrlListener.promise;
}

function *downloadAllForOffline() {
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  yield promiseUrlListener.promise;
}

function verifyDownloaded() {
  // verify that the message headers have the offline flag set.
  let msgEnumerator = IMAPPump.inbox.msgDatabase.EnumerateMessages();
  let offset = {};
  let size = {};
  while (msgEnumerator.hasMoreElements()) {
    let header = msgEnumerator.getNext();
    // Verify that each message has been downloaded and looks OK.
    if (header instanceof Components.interfaces.nsIMsgDBHdr &&
        (header.flags & Ci.nsMsgMessageFlags.Offline))
      IMAPPump.inbox.getOfflineFileStream(header.messageKey, offset, size).close();
    else
      do_throw("Message not downloaded for offline use");
  }
}

function run_test() {
  tests.forEach(add_task);
  run_next_test();
}
