/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the OfflineManager correctly downloads IMAP messages
 * via nsIMsgOfflineManager.synchronizeForOffline().
 *
 * SynchronizeForOffline() is the only path which exercises
 * nsImapOfflineDownloader, which is what we're aiming to cover here.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

// Helper to load a list of messages directly into the fake IMAP server.
function injectMessages(messages, mailbox) {
  messages.forEach(function (raw) {
    const dataUri = Services.io.newURI("data:text/plain;base64," + btoa(raw));
    mailbox.addMessage(new ImapMessage(dataUri.spec, mailbox.uidnext++, []));
  });
}

// We want a fake IMAP server.
// We also want to stop AutoSyncManager interfering with our test by from
// downloading messages in the background.
add_setup(async function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  registerCleanupFunction(teardownIMAPPump);
});

add_task(async function testSynchronizeForOffline() {
  // Add a bunch of messages directly to inbox on the server.
  const generator = new MessageGenerator();
  const messages = generator
    .makeMessages({ count: 10 })
    .map(message => message.toMessageString());
  injectMessages(messages, IMAPPump.daemon.getMailbox("INBOX"));

  const inbox = IMAPPump.inbox;

  // Sync message list with the server (without downloading them in full).
  {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    inbox.updateFolderWithListener(null, listener);
    await listener.promise;
  }

  // Sanity check - Make sure the messages have not yet been downloaded for
  // offline use.
  for (const msg of inbox.messages) {
    Assert.equal(
      msg.flags & Ci.nsMsgMessageFlags.Offline,
      0,
      "Messages should not yet be downloaded."
    );
  }

  // Ask OfflineManager to download all the mail.
  {
    const offlineManager = Cc[
      "@mozilla.org/messenger/offline-manager;1"
    ].getService(Ci.nsIMsgOfflineManager);
    offlineManager.inProgress = true;
    offlineManager.synchronizeForOffline(
      false /* downloadNews */,
      true /* downloadMail */,
      false /* sendUnsentMessages */,
      false /* goOfflineWhenDone */,
      null /* window */
    );

    await TestUtils.waitForCondition(
      () => !offlineManager.inProgress,
      "wait for offlineManager not in progress"
    );
    // We need a fudge-factor delay in order to pass reliably in --verify mode.
    // See https://bugzilla.mozilla.org/show_bug.cgi?id=2059876
    await PromiseTestUtils.promiseDelay(100);
  }

  // At this point all the messages should have been downloaded.
  for (const msg of inbox.messages) {
    Assert.notEqual(
      msg.flags & Ci.nsMsgMessageFlags.Offline,
      0,
      "Messages should now be downloaded and available offline."
    );
  }
});
