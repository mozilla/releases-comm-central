/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that you can stream a message without the attachments. Tests the
 * MsgHdrToMimeMessage API that exposes this.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
Services.prefs.setIntPref("mail.imap.mime_parts_on_demand_threshold", 1000);

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

// javascript mime emitter functions
var mimeMsg = {};
ChromeUtils.import("resource:///modules/gloda/MimeMessage.jsm", mimeMsg);

// make sure we are in the optimal conditions!
add_task(function setupTest() {
  setupIMAPPump();
  Services.prefs.setIntPref("mail.imap.mime_parts_on_demand_threshold", 20);
  Services.prefs.setBoolPref("mail.imap.mime_parts_on_demand", true);
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  Services.prefs.setBoolPref("mail.server.server1.offline_download", false);
  Services.prefs.setBoolPref("mail.server.server1.download_on_biff", false);
  Services.prefs.setIntPref("browser.cache.disk.capacity", 0);
});

// load and update a message in the imap fake server
add_task(async function loadImapMessage() {
  let file = do_get_file("../../../data/bodystructuretest1");
  let msgURI = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);

  let imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  let message = new imapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);
  // add a second message with no external parts. We want to make
  // sure that streaming this message doesn't mark it read, even
  // though we will fallback to fetching the whole message.
  file = do_get_file("../../../data/bodystructuretest3");
  msgURI = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  message = new imapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  Assert.equal(2, IMAPPump.inbox.getTotalMessages(false));
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
});

// process the message through mime
add_task(async function startMime() {
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  await new Promise(resolve => {
    mimeMsg.MsgHdrToMimeMessage(
      msgHdr,
      this,
      function(aMsgHdr, aMimeMessage) {
        let url = aMimeMessage.allUserAttachments[0].url;
        // A URL containing this string indicates that the attachment will be
        // downloaded on demand.
        Assert.ok(url.includes("/;section="));
        resolve();
      },
      true /* allowDownload */,
      { partsOnDemand: true, examineEncryptedParts: true }
    );
  });
});

// test that we don't mark all inline messages as read.
add_task(async function testAllInlineMessage() {
  for (let msg of IMAPPump.inbox.msgDatabase.EnumerateMessages()) {
    await new Promise(resolve => {
      mimeMsg.MsgHdrToMimeMessage(
        msg,
        this,
        function(aMsgHdr, aMimeMessage) {
          resolve();
        },
        true, // allowDownload
        { partsOnDemand: true }
      );
    });
  }
});

add_task(async function updateCounts() {
  // select the trash, then the inbox again, to force an update of the
  // read state of messages.
  let trash = IMAPPump.incomingServer.rootFolder.getChildNamed("Trash");
  Assert.ok(trash instanceof Ci.nsIMsgImapMailFolder);
  let trashListener = new PromiseTestUtils.PromiseUrlListener();
  trash.updateFolderWithListener(null, trashListener);
  await trashListener.promise;
  let inboxListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, inboxListener);
  await inboxListener.promise;
});

add_task(function testNotRead() {
  Assert.equal(2, IMAPPump.inbox.getNumUnread(false));
});

// Cleanup
add_task(function endTest() {
  teardownIMAPPump();
});
