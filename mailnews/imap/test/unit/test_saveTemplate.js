/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests imap save of message as a template, and test initial save right after
 * creation of folder.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/MessageGenerator.jsm");

// IMAP pump

setupIMAPPump();

var tests = [loadImapMessage, saveAsTemplate, endTest];

// load and update a message in the imap fake server
function* loadImapMessage() {
  let gMessageGenerator = new MessageGenerator();
  // create a synthetic message with attachment
  let smsg = gMessageGenerator.makeMessage();

  let msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(smsg.toMessageString())
  );
  let imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  let message = new imapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
  MailServices.mfn.addListener(mfnListener, MailServices.mfn.msgAdded);
  yield true;
}

// Cleanup
function* endTest() {
  teardownIMAPPump();
  yield true;
}

function saveAsUrlListener(aUri, aIdentity) {
  this.uri = aUri;
  this.identity = aIdentity;
}

saveAsUrlListener.prototype = {
  OnStartRunningUrl(aUrl) {},
  OnStopRunningUrl(aUrl, aExitCode) {
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );
    messenger.saveAs(this.uri, false, this.identity, null);
  },
};

// This is similar to the method in mailCommands.js, to test the way that
// it creates a new templates folder before saving the message as a template.
function* saveAsTemplate() {
  let hdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  let uri = IMAPPump.inbox.getUriForMsg(hdr);
  let identity = MailServices.accounts.getFirstIdentityForServer(
    IMAPPump.incomingServer
  );
  identity.stationeryFolder =
    IMAPPump.incomingServer.rootFolder.URI + "/Templates";
  let templates = MailUtils.getOrCreateFolder(identity.stationeryFolder);
  // Verify that Templates folder doesn't exist, and then create it.
  Assert.equal(templates.parent, null);
  templates.setFlag(Ci.nsMsgFolderFlags.Templates);
  templates.createStorageIfMissing(new saveAsUrlListener(uri, identity));
  yield false;
}

// listener for saveAsTemplate adding a message to the templates folder.
var mfnListener = {
  msgAdded(aMsg) {
    // Check this is the templates folder.
    Assert.equal(aMsg.folder.prettyName, "Templates");
    async_driver();
  },
};

function run_test() {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  async_run_tests(tests);
}
