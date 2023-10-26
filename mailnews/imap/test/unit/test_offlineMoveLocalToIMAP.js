/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test to check that offline IMAP operation for a local->IMAP message
 * move completes correctly once we go back online.
 */

// NOTE: PromiseTestUtils and MailServices already imported

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

function setupTest() {
  // Turn off autosync_offline_stores because
  // fetching messages is invoked after copying the messages.
  // (i.e. The fetching process will be invoked after OnStopCopy)
  // It will cause crash with an assertion
  // (ASSERTION: tried to add duplicate listener: 'index == -1') on teardown.

  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  setupIMAPPump();

  // These hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;
}

function teardownTest() {
  teardownIMAPPump();
}

function goOffline() {
  IMAPPump.incomingServer.closeCachedConnections();
  IMAPPump.server.stop();
  Services.io.offline = true;
}

// Go back into online mode, and wait until offline IMAP operations are completed.
async function goOnline() {
  IMAPPump.daemon.closing = false;
  Services.io.offline = false;
  IMAPPump.server.start();

  const offlineManager = Cc[
    "@mozilla.org/messenger/offline-manager;1"
  ].getService(Ci.nsIMsgOfflineManager);
  offlineManager.goOnline(
    false, // sendUnsentMessages
    true, // playbackOfflineImapOperations
    null // msgWindow
  );
  // No way to signal when offline IMAP operations are complete... so we
  // just blindly wait and cross our fingers :-(
  await PromiseTestUtils.promiseDelay(2000);
}

async function loadTestMessage(folder) {
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  const file = do_get_file("../../../data/bugmail1");
  MailServices.copy.copyFileMessage(
    file,
    folder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;
}

add_task(async function testOfflineMoveLocalToIMAP() {
  setupTest();

  // Install a test message in the local folder.
  await loadTestMessage(localAccountUtils.inboxFolder);

  goOffline();

  // Move messages in local folder to the IMAP inbox.
  // We're offline so this should result in a queued-up offline IMAP
  // operation, which will execute when we go back online.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  const msgs = [
    ...localAccountUtils.inboxFolder.msgDatabase.enumerateMessages(),
  ];
  MailServices.copy.copyMessages(
    localAccountUtils.inboxFolder,
    msgs,
    IMAPPump.inbox, // dest folder
    true, // move
    copyListener,
    null,
    false // undo?
  );
  await copyListener.promise;

  // Now, go back online and see if the operation has been performed

  await goOnline();

  const imapINBOX = IMAPPump.inbox.QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  imapINBOX.updateFolderWithListener(null, listener);
  await listener.promise;

  // Local folder should be empty, contents now in IMAP inbox.
  const localCount = [
    ...localAccountUtils.inboxFolder.msgDatabase.enumerateMessages(),
  ].length;
  const imapCount = [...IMAPPump.inbox.msgDatabase.enumerateMessages()].length;
  Assert.equal(imapCount, msgs.length);
  Assert.equal(localCount, 0);

  teardownTest();
});
