/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that arbitrary message header properties are preserved
//  during online move of an imap message.

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

// IMAP pump

// Globals
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gMessage = "bugmail10"; // message file used as the test message

setupIMAPPump();

// Definition of tests
var tests = [
  createSubfolder,
  loadImapMessage,
  moveMessageToSubfolder,
  testPropertyOnMove,
  endTest,
];

var gSubfolder;
function* createSubfolder() {
  IMAPPump.incomingServer.rootFolder.createSubfolder("Subfolder", null);
  dl("wait for folderAdded notification");
  yield false;
  gSubfolder = IMAPPump.incomingServer.rootFolder.getChildNamed("Subfolder");
  Assert.ok(gSubfolder instanceof Ci.nsIMsgImapMailFolder);
  gSubfolder.updateFolderWithListener(null, asyncUrlListener);
  dl("wait for OnStopRunningURL");
  yield false;
}

// load and update a message in the imap fake server
function* loadImapMessage() {
  IMAPPump.mailbox.addMessage(
    new imapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
  );
  IMAPPump.inbox.updateFolder(null);
  dl("wait for msgAdded notification");
  yield false;
  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);

  // set an arbitrary property
  msgHdr.setStringProperty("testprop", "somevalue");
  yield true;
}

// move the message to a subfolder
function* moveMessageToSubfolder() {
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  MailServices.copy.copyMessages(
    IMAPPump.inbox, // srcFolder
    [msgHdr], // messages
    gSubfolder, // dstFolder
    true, // isMove
    asyncCopyListener, // listener
    null, // msgWindow
    false // allowUndo
  );
  dl("wait for OnStopCopy");
  yield false;
}

function* testPropertyOnMove() {
  gSubfolder.updateFolderWithListener(null, asyncUrlListener);
  dl("wait for msgAdded");
  yield false; // wait for msgAdded notification
  dl("wait for OnStopRunningURL");
  yield false; // wait for OnStopRunningUrl
  let msgHdr = mailTestUtils.firstMsgHdr(gSubfolder);
  Assert.equal(msgHdr.getStringProperty("testprop"), "somevalue");
  yield true;
}

// Cleanup
function endTest() {
  teardownIMAPPump();
}

// listeners

var mfnListener = {
  folderAdded(aFolder) {
    dl("folderAdded <" + aFolder.name + ">");
    // we are only using async yield on the Subfolder add
    if (aFolder.name == "Subfolder") {
      async_driver();
    }
  },

  msgAdded(aMsg) {
    dl("msgAdded with subject <" + aMsg.subject + ">");
    async_driver();
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

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  let file = do_get_file("../../../data/" + aFileName);
  let msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}

// shorthand output of a line of text
function dl(text) {
  dump(text + "\n");
}
