/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Moving messages has to carry their read state and their star along. Skipped
 * until bug 2065078: the fake server builds a copied message's flag list out of
 * the array's indices, so no flag survives a COPY there.
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

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

add_task(async function testMoveKeepsFlags() {
  const destination = await createImapSubfolder("keepFlags");
  const headers = await addImapMessagesAndSync(3);

  // One read, two unread, all three starred.
  IMAPPump.inbox.markMessagesFlagged(headers, true);
  IMAPPump.inbox.markMessagesRead([headers[0]], true);

  await moveImapMessages(IMAPPump.inbox, headers, destination);
  await TestUtils.waitForCondition(
    () =>
      serverMessages("keepFlags").length == 3 &&
      serverMessages("INBOX").length == 0,
    "all three messages moved on the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );

  const moved = serverMessages("keepFlags");
  Assert.equal(
    moved.filter(message => message.flags.includes("\\Flagged")).length,
    3,
    "the star survived the move"
  );
  Assert.equal(
    moved.filter(message => message.flags.includes("\\Seen")).length,
    1,
    "only the message that was read is read on the server"
  );
}).skip();
