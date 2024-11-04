/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests to check our mbox reading is forgiving enough to be tolerant of
 * malformed mboxes in unambiguous cases.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

// Force mbox mailstore.
Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

/**
 * Test that an mbox with unescaped (but unambiguous) messages can be parsed.
 */
add_task(async function test_unescapedMbox() {
  const messages = [
    // 0
    "To: bob@invalid\r\n" +
      "From: alice@invalid\r\n" +
      "Subject: Hello\r\n" +
      "\r\n" +
      "Hello, Bob! Haven't heard\r\n" +
      "\r\n" +
      "From you in a while...\r\n", // Ambiguous without escaping!

    // 1
    "To: alice@invalid\r\n" +
      "From: bob@invalid\r\n" +
      "Subject: Re: Hello\r\n" +
      "\r\n" +
      "Hi there Alice! All good here.\r\n",
  ];

  // TODO: Would be much better to just instantiate raw msgStore for this test,
  // but currently it's too tightly coupled to folder.
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  // Install mbox with non-escaped messages.
  const mbox = messages.map(m => `From \r\n${m}\r\n`).join("");
  await IOUtils.writeUTF8(inbox.filePath.path, mbox);

  // Perform an async scan on the store, and make sure we get back all
  // the messages unchanged.
  const listener = new PromiseTestUtils.PromiseStoreScanListener();
  inbox.msgStore.asyncScan(inbox, listener);
  await listener.promise;

  // NOTE: asyncScan doesn't guarantee ordering.
  Assert.deepEqual(listener.messages.toSorted(), messages.toSorted());

  // Clear up.
  localAccountUtils.clearAll();
});

/**
 * Test that reading from bad offset fails.
 */
add_task(async function test_badStoreTokens() {
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  // Add some messages to inbox.
  const generator = new MessageGenerator();
  inbox.addMessageBatch(
    generator.makeMessages({ count: 10 }).map(m => m.toMessageString())
  );

  // Corrupt the storeTokens by adding 3
  for (const msg of inbox.messages) {
    const offset = Number(msg.storeToken) + 3;
    msg.storeToken = offset.toString();
  }

  // Check that message reads fail.
  const NS_MSG_ERROR_MBOX_MALFORMED = 0x80550024;
  for (const msg of inbox.messages) {
    const streamListener = new PromiseTestUtils.PromiseStreamListener();
    const uri = inbox.getUriForMsg(msg);
    const service = MailServices.messageServiceFromURI(uri);

    try {
      service.streamMessage(uri, streamListener, null, null, false, "", true);
      await streamListener.promise;
    } catch (e) {
      Assert.equal(
        e,
        NS_MSG_ERROR_MBOX_MALFORMED,
        "Bad read causes NS_MSG_ERROR_MBOX_MALFORMED"
      );
    }
  }

  // Clear up.
  localAccountUtils.clearAll();
});
