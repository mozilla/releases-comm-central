/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that BCC gets added to message headers on IMAP download
 *
 * adapted from test_downloadOffline.js
 *
 * original author Kent James <kent@caspia.com>
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

var gFileName = "draft1";
var gMsgFile = do_get_file("../../../data/" + gFileName);

var tests = [setup, downloadAllForOffline, checkBccs, teardown];

function* setup() {
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

  // ...and download for offline use.
  IMAPPump.inbox.downloadAllForOffline(asyncUrlListener, null);
  yield false;
}

function* downloadAllForOffline() {
  IMAPPump.inbox.downloadAllForOffline(asyncUrlListener, null);
  yield false;
}

function checkBccs() {
  // locate the new message by enumerating through the database
  for (let hdr of IMAPPump.inbox.msgDatabase.EnumerateMessages()) {
    Assert.ok(hdr.bccList.includes("Another Person"));
    Assert.ok(hdr.bccList.includes("<u1@example.com>"));
    Assert.ok(!hdr.bccList.includes("IDoNotExist"));
  }
}

function teardown() {
  teardownIMAPPump();
}

function run_test() {
  async_run_tests(tests);
}
