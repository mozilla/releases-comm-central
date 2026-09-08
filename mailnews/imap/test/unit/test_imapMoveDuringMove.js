/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Moving messages between two folders of the same IMAP account used to lose
 * them when a second move was requested while the first one was still being
 * carried out: they vanished from both folders in the client while they were
 * still sitting in the source folder on the server (bug 624082).
 *
 * The test moves messages the way a user does and then looks at the server.
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
  registerCleanupFunction(() => teardownIMAPPump());
});

/**
 * A folder update between two moves must not lose the second one, and the
 * source folder has to keep working afterwards - a folder wrongly left marked
 * as having pending work is handed to the playback machinery on every update
 * instead of being selected, so new mail never arrives.
 */
add_task(async function testMoveWhileAnotherIsInFlight() {
  Assert.ok(!Services.io.offline, "test must run online");
  const destination = await createImapSubfolder("secondMove");
  const headers = await addImapMessagesAndSync(2);

  await moveImapMessages(IMAPPump.inbox, [headers[0]], destination);

  // Deliberately not awaited: the second move has to be requested while this
  // one is still running.
  IMAPPump.inbox.updateFolder(null);

  await moveImapMessages(IMAPPump.inbox, [headers[1]], destination);

  await TestUtils.waitForCondition(
    () =>
      serverMessages("secondMove").length == 2 &&
      serverMessages("INBOX").length == 0,
    "both messages moved on the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );

  // New mail for the folder the messages were moved out of.
  addImapMessage();
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
  await TestUtils.waitForCondition(
    () => IMAPPump.inbox.getTotalMessages(false) == 1,
    "the new message arrived in the source folder",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
});
