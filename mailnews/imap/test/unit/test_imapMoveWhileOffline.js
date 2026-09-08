/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A message moved while offline has to reach the server once the client is
 * back online, even when other changes were made offline as well. It used to
 * be dropped in the client instead (bug 624082).
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

// Moves reach the server over IMAP round trips, so allow more than
// TestUtils.waitForCondition's default five seconds.
const WAIT_INTERVAL = 100;
const WAIT_TRIES = 100;

add_setup(async function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  // Don't prompt about offline download when going offline.
  Services.prefs.setIntPref("offline.download.download_messages", 2);
  registerCleanupFunction(() => teardownIMAPPump());
});

add_task(async function testMoveMadeOffline() {
  const destination = await createImapSubfolder("madeOffline");
  const headers = await addImapMessagesAndSync(2);

  IMAPPump.server.stop();
  Services.io.offline = true;

  // Both a flag change and a move are made offline. The flag change is played
  // back first, and its message is the one the run stumbles over.
  IMAPPump.inbox.markMessagesRead([headers[0]], true);
  await moveImapMessages(IMAPPump.inbox, [headers[1]], destination);

  IMAPPump.daemon.closing = false;
  Services.io.offline = false;
  IMAPPump.server.start();

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  await TestUtils.waitForCondition(
    () =>
      serverMessages("madeOffline").length == 1 &&
      serverMessages("INBOX").length == 1,
    "the offline move reached the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
});
