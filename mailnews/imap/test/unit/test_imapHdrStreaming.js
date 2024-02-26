/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks if the imap message service code streams headers correctly.
 * It checks that streaming headers for messages stored for offline use works.
 * It doesn't test streaming messages that haven't been stored for offline use
 * because that's not implemented yet, and it's unclear if anyone will want it.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

setupIMAPPump();

var gMsgFile1 = do_get_file("../../../data/bugmail10");
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";

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
  // Add a couple of messages to the INBOX
  //   this is synchronous, afaik.
  addMessagesToServer(
    [{ file: gMsgFile1, messageId: gMsgId1 }],
    IMAPPump.daemon.getMailbox("INBOX")
  );
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  // Update IMAP Folder.
  const listenerUpdate = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listenerUpdate);
  await listenerUpdate.promise;
  // Download all for offline.
  const listenerDownload = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(listenerDownload, null);
  await listenerDownload.promise;
});

add_task(async function test_streamHeaders() {
  const newMsgHdr = IMAPPump.inbox.GetMessageHeader(1);
  const msgURI = newMsgHdr.folder.getUriForMsg(newMsgHdr);
  const msgServ = MailServices.messageServiceFromURI(msgURI);
  // We use this as a display consumer
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  msgServ.streamHeaders(msgURI, streamListener, null, true);
  const data = await streamListener.promise;
  Assert.ok(data.includes("Content-Type"));
});

add_task(async function endTest() {
  teardownIMAPPump();
});
