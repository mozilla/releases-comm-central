/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks that the imap code saves message to
 * offline stores correctly when streamed, and doesn't store
 * duplicate copies when downloadMessagesForOffline() is called.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Adds some messages directly to a mailbox (e.g. new mail).
function addMessagesToServer(files, mailbox) {
  // For every message we have, we need to convert it to a file:/// URI.
  files.forEach(function (file) {
    const URI = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
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

  registerCleanupFunction(() => {
    teardownIMAPPump();
  });

  const messageFiles = [
    do_get_file("../../../data/bugmail10"),
    do_get_file("../../../data/image-attach-test"),
    do_get_file("../../../data/external-attach-test"),
  ];
  addMessagesToServer(messageFiles, IMAPPump.daemon.getMailbox("INBOX"));

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  Assert.equal(
    [...IMAPPump.inbox.messages].length,
    3,
    "INBOX should contain 3 messages"
  );
});

add_task(async function streamMsgs() {
  const inbox = IMAPPump.inbox;
  const store = inbox.msgStore;

  // Stream them.
  for (const msg of inbox.messages) {
    const sizeBefore = store.estimateFolderSize(inbox);

    Assert.equal(
      msg.flags & Ci.nsMsgMessageFlags.Offline,
      0,
      "Offline flag should be clear."
    );
    const msgUri = inbox.getUriForMsg(msg);
    const msgService = MailServices.messageServiceFromURI(msgUri);

    const streamListener = new PromiseTestUtils.PromiseStreamListener();
    msgService.streamMessage(
      msgUri,
      streamListener,
      null,
      null,
      false,
      "",
      false
    );
    await streamListener.promise;
    Assert.notEqual(
      msg.flags & Ci.nsMsgMessageFlags.Offline,
      0,
      "Offline flag should now be set."
    );

    const sizeAfter = store.estimateFolderSize(inbox);

    Assert.less(sizeBefore, sizeAfter, "Storage size should have increased");
  }

  // Now download them. They're already in the local message store, so we
  // don't want to see duplicates showing up.
  for (const msg of inbox.messages) {
    Assert.notEqual(
      msg.flags & Ci.nsMsgMessageFlags.Offline,
      0,
      "Offline flag should still be set."
    );
    const sizeBefore = store.estimateFolderSize(inbox);

    const msgUid = msg.messageKey;
    const listener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.imap.downloadMessagesForOffline(
      `${msgUid}`,
      IMAPPump.inbox,
      listener,
      null
    );
    await listener.promise;

    const sizeAfter = store.estimateFolderSize(inbox);

    Assert.equal(sizeBefore, sizeAfter, "Storage size should be unchanged");
  }
});
