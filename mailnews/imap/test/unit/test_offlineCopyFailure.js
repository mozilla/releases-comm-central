/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_setup(function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  Services.prefs.setBoolPref("mail.suppressAlertsForTests", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.server.default.autosync_offline_stores");
    Services.prefs.clearUserPref("mail.suppressAlertsForTests");
    // Collect offline-operation wrappers before teardown closes their database.
    Cu.forceGC();
    teardownIMAPPump();
  });
});

/**
 * Plays queued IMAP operations and waits for the offline manager to finish.
 */
async function playOfflineOperations() {
  const manager = Cc["@mozilla.org/messenger/offline-manager;1"].getService(
    Ci.nsIMsgOfflineManager
  );
  manager.inProgress = true;
  manager.goOnline(false, true, null);
  await TestUtils.waitForCondition(
    () => !manager.inProgress,
    "Offline playback should finish"
  );
}

add_task(async function test_localFailureRetainsCopyForRetry() {
  const source = IMAPPump.inbox;
  const target = localAccountUtils.rootFolder.createLocalSubfolder(
    "offline-copy-target"
  );
  const body = "The offline copy should retain this message body.";
  const message = new MessageGenerator().makeMessage({ body: { body } });
  const uri = Services.io.newURI(
    "data:text/plain;base64," + btoa(message.toMessageString())
  );
  IMAPPump.mailbox.addMessage(
    new ImapMessage(uri.spec, IMAPPump.mailbox.uidnext++, [])
  );
  let listener = new PromiseTestUtils.PromiseUrlListener();
  source.updateFolderWithListener(false, listener);
  await listener.promise;
  listener = new PromiseTestUtils.PromiseUrlListener();
  source.downloadAllForOffline(listener, false);
  await listener.promise;

  const [header] = source.messages;
  const key = header.messageKey;
  const db = source.msgDatabase;
  db.getOfflineOpForKey(key, true).setMsgCopyOp(target.URI);
  source.setFlag(Ci.nsMsgFolderFlags.OfflineEvents);

  const alerts = [];
  const feedback = {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
    onAlert(text) {
      alerts.push(text);
      return true;
    },
  };
  MailServices.mailSession.addUserFeedbackListener(feedback);
  registerCleanupFunction(() =>
    MailServices.mailSession.removeUserFeedbackListener(feedback)
  );
  target.acquireSemaphore(source, "Offline copy failure test");
  try {
    await playOfflineOperations();
    const pending = source.msgDatabase.getOfflineOpForKey(key, false);
    Assert.ok(pending, "The failed copy should remain queued");
    Assert.ok(
      pending.playingBack,
      "Playback should have attempted the queued copy"
    );
    Assert.equal(
      alerts.length,
      1,
      "The failed attempt should report its local destination error"
    );
    Assert.equal(
      pending.operation,
      Ci.nsIMsgOfflineImapOperation.kMsgCopy,
      "A local destination error should retain the copy operation"
    );
    Assert.equal(
      pending.getCopyDestination(0),
      target.URI,
      "The pending copy should retain its destination"
    );
    Assert.ok(
      source.getFlag(Ci.nsMsgFolderFlags.OfflineEvents),
      "The source should still have offline work after the local failure"
    );
    Assert.equal(
      target.getTotalMessages(false),
      0,
      "A locked destination should remain empty"
    );
    Assert.equal(
      source.getTotalMessages(false),
      1,
      "The source message should survive the failed playback"
    );
  } finally {
    target.releaseSemaphore(source, "Offline copy failure test");
  }

  await playOfflineOperations();
  Assert.deepEqual(
    source.msgDatabase.listAllOfflineOpIds(),
    [],
    "Successful playback should clear the queued copy"
  );
  Assert.ok(
    !source.getFlag(Ci.nsMsgFolderFlags.OfflineEvents),
    "Successful playback should clear the source's offline work flag"
  );
  Assert.deepEqual(
    [...target.messages].map(copied => copied.messageId),
    [message.messageId],
    "Retrying should copy the message exactly once"
  );
  const [copied] = target.messages;
  const content = mailTestUtils.loadMessageToString(target, copied);
  Assert.ok(
    content.includes(body),
    "The retried copy should preserve the message body"
  );
});
