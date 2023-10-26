/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that BCC gets added to message headers on IMAP download
 *
 * adapted from test_downloadOffline.js
 *
 * original author Kent James <kent@caspia.com>
 */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var gFileName = "draft1";
var gMsgFile = do_get_file("../../../data/" + gFileName);

add_setup(async function () {
  setupIMAPPump();

  /*
   * Ok, prelude done. Read the original message from disk
   * (through a file URI), and add it to the Inbox.
   */
  const msgfileuri = Services.io
    .newFileURI(gMsgFile)
    .QueryInterface(Ci.nsIFileURL);

  IMAPPump.mailbox.addMessage(
    new ImapMessage(msgfileuri.spec, IMAPPump.mailbox.uidnext++, [])
  );

  // ...and download for offline use.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(listener, null);
  await listener.promise;
});

add_task(function checkBccs() {
  // locate the new message by enumerating through the database
  for (const hdr of IMAPPump.inbox.msgDatabase.enumerateMessages()) {
    Assert.ok(hdr.bccList.includes("Another Person"));
    Assert.ok(hdr.bccList.includes("<u1@example.com>"));
    Assert.ok(!hdr.bccList.includes("IDoNotExist"));
  }
});

add_task(function endTest() {
  teardownIMAPPump();
});
