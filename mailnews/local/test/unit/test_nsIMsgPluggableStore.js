/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/**
 * nsIMsgPluggableStore interface tests
 */

function test_discoverSubFolders() {
  const mailbox = setup_mailbox("none", create_temporary_directory());
  mailbox.msgStore.discoverSubFolders(mailbox, true);
}

// Load messages into a msgStore and make sure we can read
// them back correctly using asyncScan().
async function test_AsyncScan() {
  // NOTE: we should be able to create stand-alone msgStore to run tests on,
  // but currently they are tightly coupled with folders, msgDB et al...
  // Bug 1714472 should sort that out and strip away some of this gubbins.
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  // Populate the folder with the test messages.

  const msg1 =
    "To: bob@invalid\r\n" +
    "From: alice@invalid\r\n" +
    "Subject: Hello\r\n" +
    "\r\n" +
    "Hello, Bob! Haven't heard\r\n" +
    "From you in a while...\r\n"; // escaping will be required on this line.

  const msg2 =
    "To: alice@invalid\r\n" +
    "From: bob@invalid\r\n" +
    "Subject: Re: Hello\r\n" +
    "\r\n" +
    "Hi there Alice! All good here.\r\n";

  const messages = [msg1, msg2];

  inbox.addMessageBatch(messages);

  // Perform an async scan on the folder, and make sure we get back all
  // the messages we put in.
  const listener = new PromiseTestUtils.PromiseStoreScanListener();
  inbox.msgStore.asyncScan(inbox, listener);
  await listener.promise;

  // Note: can't rely on message ordering (especially on maildir).
  Assert.deepEqual(listener.messages.toSorted(), messages.toSorted());

  // Clear up so we can run again on different store type.
  localAccountUtils.clearAll();
}

// Return a wrapper which sets the store type before running fn().
function withStore(store, fn) {
  return async () => {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", store);
    await fn();
  };
}

for (const store of localAccountUtils.pluggableStores) {
  add_task(withStore(store, test_discoverSubFolders));
  add_task(withStore(store, test_AsyncScan));
}
