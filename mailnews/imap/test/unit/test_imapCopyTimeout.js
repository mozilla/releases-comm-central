/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests our handling of server timeouts during online move of
// an imap message. The move is done as an offline operation and then
// played back, to copy what the apps do.

Services.prefs.setIntPref("mailnews.tcptimeout", 2);

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/alertTestUtils.js");
load("../../../resources/MessageGenerator.jsm");

// IMAP pump

// Globals
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

setupIMAPPump();

var gGotAlert = false;
var gGotMsgAdded = false;

/* exported alert */
// to alertTestUtils.js
function alert(aDialogTitle, aText) {
  Assert.ok(aText.startsWith("Connection to server localhost timed out."));
  gGotAlert = true;
  async_driver();
}

var CopyListener = {
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aMsgKey) {},
  GetMessageId() {},
  OnStopCopy(aStatus) {
    async_driver();
  },
};

// Definition of tests
var tests = [
  createTargetFolder,
  loadImapMessage,
  moveMessageToTargetFolder,
  waitForOfflinePlayback,
  updateTargetFolder,
  endTest,
];

var gTargetFolder;
function* createTargetFolder() {
  IMAPPump.daemon.copySleep = 5000;
  IMAPPump.incomingServer.rootFolder.createSubfolder("targetFolder", null);
  yield false;
  gTargetFolder = IMAPPump.incomingServer.rootFolder.getChildNamed(
    "targetFolder"
  );
  Assert.ok(gTargetFolder instanceof Ci.nsIMsgImapMailFolder);
  gTargetFolder.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

// load and update a message in the imap fake server
function* loadImapMessage() {
  let messages = [];
  let gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());

  let msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  let imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  var gMessage = new imapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(gMessage);
  IMAPPump.inbox.updateFolder(null);
  yield false;
  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);

  yield true;
}

// move the message to a diffent folder
function* moveMessageToTargetFolder() {
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);

  // This should cause the move to be done as an offline imap operation
  // that's played back immediately.
  MailServices.copy.copyMessages(
    IMAPPump.inbox,
    [msgHdr],
    gTargetFolder,
    true,
    CopyListener,
    gDummyMsgWindow,
    true
  );
  yield false;
}

function* waitForOfflinePlayback() {
  // just wait for the alert about timed out connection.
  yield false;
  // then, wait for a second so we don't get our next url aborted.
  do_timeout(1000, async_driver);
  yield false;
}

function* updateTargetFolder() {
  gTargetFolder.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

// Cleanup
function endTest() {
  Assert.ok(gGotAlert);
  // Make sure neither source nor target folder have offline events.
  Assert.ok(!IMAPPump.inbox.getFlag(Ci.nsMsgFolderFlags.OfflineEvents));
  Assert.ok(!gTargetFolder.getFlag(Ci.nsMsgFolderFlags.OfflineEvents));

  // fake server does the copy, but then times out, so make sure the target
  // folder has only 1 message, not the multiple ones it would have if we
  // retried.
  Assert.equal(gTargetFolder.getTotalMessages(false), 1);
  teardownIMAPPump();
}

// listeners

var mfnListener = {
  folderAdded(aFolder) {
    // we are only using async yield on the target folder add
    if (aFolder.name == "targetFolder") {
      async_driver();
    }
  },

  msgAdded(aMsg) {
    if (!gGotMsgAdded) {
      async_driver();
    }
    gGotMsgAdded = true;
  },
};

function run_test() {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  // Add folder listeners that will capture async events
  const nsIMFNService = Ci.nsIMsgFolderNotificationService;
  let flags = nsIMFNService.folderAdded | nsIMFNService.msgAdded;
  MailServices.mfn.addListener(mfnListener, flags);
  async_run_tests(tests);
}
