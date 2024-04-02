/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Test that the message failed to move to a local folder remains on IMAP
 * server. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

function stop_server() {
  IMAPPump.incomingServer.closeCachedConnections();
  IMAPPump.server.stop();
  const thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}

add_setup(function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
});

add_setup(async function () {
  const messageGenerator = new MessageGenerator();
  const messageString = messageGenerator.makeMessage().toMessageString();
  const dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(messageString)
  );
  const imapMsg = new ImapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(imapMsg);

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function move_messages() {
  const msg = IMAPPump.inbox.msgDatabase.getMsgHdrForKey(
    IMAPPump.mailbox.uidnext - 1
  );
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    onProgress() {
      stop_server();
    },
  });
  MailServices.copy.copyMessages(
    IMAPPump.inbox,
    [msg],
    localAccountUtils.inboxFolder,
    true,
    copyListener,
    null,
    false
  );
  await copyListener.promise;
});

add_task(function check_messages() {
  Assert.equal(IMAPPump.inbox.getTotalMessages(false), 1);
  Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);
});

add_task(function endTest() {
  // IMAPPump.server.performTest() brings this test to a halt,
  // so we need teardownIMAPPump() without IMAPPump.server.performTest().
  IMAPPump.inbox = null;
  IMAPPump.server.resetTest();
  try {
    IMAPPump.incomingServer.closeCachedConnections();
    const serverSink = IMAPPump.incomingServer.QueryInterface(
      Ci.nsIImapServerSink
    );
    serverSink.abortQueuedUrls();
  } catch (ex) {
    dump(ex);
  }
  IMAPPump.server.stop();
  const thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
