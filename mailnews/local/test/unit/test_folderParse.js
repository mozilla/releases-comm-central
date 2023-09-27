/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests to check local folder parsing.
 */

const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

/**
 * Sanity check for folder parsing.
 */
add_task(async function test_folderParse() {
  // Run the test for each store type.
  for (const storeKind of localAccountUtils.pluggableStores) {
    info(`Running test with ${storeKind}`);
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeKind);
    await doTestFolderParse();
  }
});

// Core test for test_FolderParse().
async function doTestFolderParse() {
  const msgs = [
    // 0
    "To: bob@invalid\r\n" +
      "From: alice@invalid\r\n" +
      "Subject: Hello\r\n" +
      "\r\n" +
      "Hello, Bob! Haven't heard\r\n" +
      "From you in a while...\r\n", // Will be escaped/unescaped by mbox store.

    // 1
    "To: alice@invalid\r\n" +
      "From: bob@invalid\r\n" +
      "Subject: Re: Hello\r\n" +
      "\r\n" +
      "Hi there Alice! All good here.\r\n",
  ];

  localAccountUtils.loadLocalMailAccount();

  const inbox = localAccountUtils.inboxFolder;

  // Load messages into the msgStore (this will perform whatever escaping is
  // required).
  inbox.addMessageBatch(msgs);

  // Close and delete the db (.msf) file.
  inbox.msgDatabase.forceClosed();
  inbox.msgDatabase = null;
  await IOUtils.remove(inbox.summaryFile.path);

  // Force a folder parse to recreate the DB.
  const parseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  try {
    inbox.getDatabaseWithReparse(parseUrlListener, null /* window */);
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
  }
  await parseUrlListener.promise;

  // Check all the messages are the right size.
  // Even if a message requires escaping in the msgStore, we should still see
  // the size of the original (unescaped) message here. Escaping should
  // be handled entirely within the msgStore.
  // We sort because we can't be sure the message order is preserved.
  const expectedSizes = msgs.map(m => m.length).sort();
  const gotSizes = Array.from(inbox.messages, m => m.messageSize).sort();
  Assert.deepEqual(expectedSizes, gotSizes);

  // Clear up so we can run again on different store type.
  localAccountUtils.clearAll();
}
