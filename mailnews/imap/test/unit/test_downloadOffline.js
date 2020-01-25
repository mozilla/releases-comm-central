/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that downloadAllForOffline works correctly with imap folders
 * and returns success.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
load("../../../resources/logHelper.js");
load("../../../resources/MessageGenerator.jsm");

var gFileName = "bug460636";
var gMsgFile = do_get_file("../../../data/" + gFileName);

var tests = [setup, downloadAllForOffline, verifyDownloaded, teardownIMAPPump];

async function setup() {
  setupIMAPPump();

  /*
   * Ok, prelude done. Read the original message from disk
   * (through a file URI), and add it to the Inbox.
   */
  let msgfileuri = Services.io
    .newFileURI(gMsgFile)
    .QueryInterface(Ci.nsIFileURL);

  IMAPPump.mailbox.addMessage(
    new imapMessage(msgfileuri.spec, IMAPPump.mailbox.uidnext++, [])
  );

  let messages = [];
  let gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());
  let dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  let imapMsg = new imapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  imapMsg.setSize(5000);
  IMAPPump.mailbox.addMessage(imapMsg);

  // ...and download for offline use.
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  await promiseUrlListener.promise;
}

async function downloadAllForOffline() {
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  await promiseUrlListener.promise;
}

function verifyDownloaded() {
  // verify that the message headers have the offline flag set.
  let offset = {};
  let size = {};
  for (let header of IMAPPump.inbox.msgDatabase.EnumerateMessages()) {
    // Verify that each message has been downloaded and looks OK.
    if (
      header instanceof Ci.nsIMsgDBHdr &&
      header.flags & Ci.nsMsgMessageFlags.Offline
    ) {
      IMAPPump.inbox
        .getOfflineFileStream(header.messageKey, offset, size)
        .close();
    } else {
      do_throw("Message not downloaded for offline use");
    }
  }
}

function run_test() {
  tests.forEach(x => add_task(x));
  run_next_test();
}
