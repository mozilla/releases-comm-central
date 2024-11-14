/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that downloadAllForOffline works correctly with imap folders
 * and returns success.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

add_task(async function setup() {
  setupIMAPPump();
  const msgFile = do_get_file("../../../data/bug460636");

  /*
   * Ok, prelude done. Read the original message from disk
   * (through a file URI), and add it to the Inbox.
   */
  const msgfileuri = Services.io
    .newFileURI(msgFile)
    .QueryInterface(Ci.nsIFileURL);

  IMAPPump.mailbox.addMessage(
    new ImapMessage(msgfileuri.spec, IMAPPump.mailbox.uidnext++, [])
  );

  let messages = [];
  const gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());
  const dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  const imapMsg = new ImapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  imapMsg.setSize(5000);
  IMAPPump.mailbox.addMessage(imapMsg);
});

add_task(async function downloadAllForOffline() {
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  await promiseUrlListener.promise;
});

add_task(async function verifyDownloaded() {
  const inbox = IMAPPump.inbox;
  for (const msg of inbox.messages) {
    Assert.ok(
      msg.flags & Ci.nsMsgMessageFlags.Offline,
      "Message should have Offline flag"
    );
    // Make sure we can successfully read the whole message.
    const streamListener = new PromiseTestUtils.PromiseStreamListener();
    const uri = inbox.getUriForMsg(msg);
    const service = MailServices.messageServiceFromURI(uri);
    service.streamMessage(uri, streamListener, null, null, false, "", true);
    await streamListener.promise;
  }
});

/**
 * For mbox, make sure that offline messages fail if the storeTokens
 * don't point to the beginning of a message.
 */
add_task(
  {
    skip_if: () => IMAPPump.inbox.msgStore.storeType != "mbox",
  },
  async function checkBadStoreTokens() {
    const inbox = IMAPPump.inbox;

    // Corrupt the storeTokens by adding 3.
    for (const msg of inbox.messages) {
      Assert.equal(
        true,
        inbox.hasMsgOffline(msg.messageKey),
        "Messages should be marked Offline."
      );
      const offset = Number(msg.storeToken) + 3;
      msg.storeToken = offset.toString();
    }

    // Make sure message reading fails.
    const NS_MSG_ERROR_MBOX_MALFORMED = 0x80550024;
    for (const msg of inbox.messages) {
      const streamListener = new PromiseTestUtils.PromiseStreamListener();
      const uri = inbox.getUriForMsg(msg);
      const service = MailServices.messageServiceFromURI(uri);
      try {
        service.streamMessage(
          uri,
          streamListener,
          null,
          null,
          false,
          "",
          false // localOnly
        );
        await streamListener.promise;
        Assert.ok(false, "Bad storeToken should cause error.");
      } catch (e) {
        Assert.equal(
          e,
          NS_MSG_ERROR_MBOX_MALFORMED,
          "Bad storeToken causes NS_MSG_ERROR_MBOX_MALFORMED for mbox"
        );
      }
    }

    // Make sure that the offline messages were discarded.
    for (const msg of inbox.messages) {
      Assert.equal(
        false,
        inbox.hasMsgOffline(msg.messageKey),
        "Bad message should not be marked Offline."
      );
      Assert.equal(
        msg.storeToken,
        "",
        "Bad message should have had their storeToken cleared."
      );
      Assert.equal(
        msg.flags & Ci.nsMsgMessageFlags.Offline,
        0,
        "Bad message should have had their Offline flag cleared."
      );
      Assert.equal(
        msg.offlineMessageSize,
        0,
        "Bad message should have had their .offlineMessageSize zeroed."
      );
    }

    // Stream them again from the server.
    for (const msg of inbox.messages) {
      const streamListener = new PromiseTestUtils.PromiseStreamListener();
      const uri = inbox.getUriForMsg(msg);
      const service = MailServices.messageServiceFromURI(uri);
      service.streamMessage(uri, streamListener, null, null, false, "", false);
      await streamListener.promise;
    }

    // The offline copies should have been re-downloaded.
    for (const msg of inbox.messages) {
      Assert.equal(
        true,
        inbox.hasMsgOffline(msg.messageKey),
        "Message should again be available Offline."
      );
      const streamListener = new PromiseTestUtils.PromiseStreamListener();
      const uri = inbox.getUriForMsg(msg);
      const service = MailServices.messageServiceFromURI(uri);
      // One more time, but with localOnly set.
      service.streamMessage(uri, streamListener, null, null, false, "", true);
      await streamListener.promise;
    }
  }
);
