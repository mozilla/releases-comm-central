/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Test that the message failed to move to a local folder remains on IMAP
 * server. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/MessageGenerator.jsm");

setupIMAPPump();

function stop_server() {
  IMAPPump.incomingServer.closeCachedConnections();
  IMAPPump.server.stop();
  let thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}

var asyncCopyListener = {
  OnStartCopy() {},
  SetMessageKey(aMsgKey) {},
  GetMessageId() {},
  OnProgress(aProgress, aProgressMax) {
    stop_server();
  },
  OnStopCopy(aStatus) {
    Assert.equal(aStatus, 0);
    async_driver();
  },
};

var tests = [setup_messages, move_messages, check_messages];

function* setup_messages() {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  let messageGenerator = new MessageGenerator();
  let messageString = messageGenerator.makeMessage().toMessageString();
  let dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(messageString)
  );
  let imapMsg = new imapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(imapMsg);

  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

function* move_messages() {
  let msg = IMAPPump.inbox.msgDatabase.GetMsgHdrForKey(
    IMAPPump.mailbox.uidnext - 1
  );
  MailServices.copy.copyMessages(
    IMAPPump.inbox,
    [msg],
    localAccountUtils.inboxFolder,
    true,
    asyncCopyListener,
    null,
    false
  );
  yield false;
}

function* check_messages() {
  Assert.equal(IMAPPump.inbox.getTotalMessages(false), 1);
  Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);
  yield true;
}

function run_test() {
  registerCleanupFunction(function() {
    // IMAPPump.server.performTest() brings this test to a halt,
    // so we need teardownIMAPPump() without IMAPPump.server.performTest().
    IMAPPump.inbox = null;
    IMAPPump.server.resetTest();
    try {
      IMAPPump.incomingServer.closeCachedConnections();
      let serverSink = IMAPPump.incomingServer.QueryInterface(
        Ci.nsIImapServerSink
      );
      serverSink.abortQueuedUrls();
    } catch (ex) {
      dump(ex);
    }
    IMAPPump.server.stop();
    let thread = gThreadManager.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  });
  async_run_tests(tests);
}
