/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks that the imap code saves message to
 * offline stores correctly when streamed, and doesn't store
 * duplicate copies when downloadMessagesForOffline() is called.
 */

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
  IMAPPump.inbox.updateFolderWithListener(false, listener);
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
    msgService.streamMessage(msgUri, streamListener, null, false, "", false);
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

    const msgUid = msg.uidOnServer;
    const listener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.imap.downloadMessagesForOffline(
      `${msgUid}`,
      IMAPPump.inbox,
      listener,
      false
    );
    await listener.promise;

    const sizeAfter = store.estimateFolderSize(inbox);

    Assert.equal(sizeBefore, sizeAfter, "Storage size should be unchanged");
  }
});

add_task(async function test_consumerErrorsKeepOfflineCopy() {
  const inbox = IMAPPump.inbox;
  const message = [...inbox.messages][0];
  const uri = inbox.getUriForMsg(message);
  const service = MailServices.messageServiceFromURI(uri);
  const storeToken = message.storeToken;
  const size = inbox.msgStore.estimateFolderSize(inbox);

  for (const [callback, error] of [
    ["onStartRequest", Cr.NS_ERROR_FAILURE],
    ["onDataAvailable", Cr.NS_BINDING_ABORTED],
    ["onDataAvailable", Cr.NS_ERROR_ILLEGAL_VALUE],
  ]) {
    const { promise, resolve } = Promise.withResolvers();
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      onStartRequest() {},
      onDataAvailable() {},
      onStopRequest(request, status) {
        resolve(status);
      },
    };
    listener[callback] = () => {
      throw new Components.Exception("Consumer rejected the message", error);
    };

    service.streamMessage(uri, listener, null, null, false, "", false);
    const status = await promise;
    Assert.equal(status, error, "the consumer's error should be reported");
    Assert.ok(
      message.flags & Ci.nsMsgMessageFlags.Offline,
      "a consumer error should preserve the offline copy"
    );
    Assert.equal(
      message.storeToken,
      storeToken,
      "a consumer error should preserve the storage location"
    );
    Assert.equal(
      inbox.msgStore.estimateFolderSize(inbox),
      size,
      "a consumer error should not change the offline store size"
    );
  }
});

add_task(
  { skip_if: () => IMAPPump.inbox.msgStore.storeType != "mbox" },
  async function test_readFailureDiscardsOfflineCopy() {
    const inbox = IMAPPump.inbox;
    const message = [...inbox.messages][0];
    Assert.greater(
      message.messageSize,
      512,
      "the message should exceed the minimum storage read limit"
    );

    // Force the mbox stream to fail while reading beyond its size limit.
    message.messageSize = 1;
    message.offlineMessageSize = 1;
    const uri = inbox.getUriForMsg(message);
    const listener = new PromiseTestUtils.PromiseStreamListener();
    MailServices.messageServiceFromURI(uri).streamMessage(
      uri,
      listener,
      null,
      null,
      false,
      "",
      false
    );
    await Assert.rejects(
      listener.promise,
      new RegExp(Cr.NS_MSG_ERROR_UNEXPECTED_SIZE),
      "the storage read failure should be reported"
    );
    Assert.equal(
      message.flags & Ci.nsMsgMessageFlags.Offline,
      0,
      "a storage read failure should discard the offline copy"
    );
    Assert.equal(
      message.storeToken,
      "",
      "a storage read failure should clear the storage location"
    );
  }
);
