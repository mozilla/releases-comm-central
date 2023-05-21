/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests imap save of message as a template, and test initial save right after
 * creation of folder.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

add_setup(function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
});

// load and update a message in the imap fake server
add_task(async function loadImapMessage() {
  let gMessageGenerator = new MessageGenerator();
  // create a synthetic message with attachment
  let smsg = gMessageGenerator.makeMessage();

  let msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(smsg.toMessageString())
  );
  let imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  let message = new ImapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

// This is similar to the method in mailCommands.js, to test the way that
// it creates a new templates folder before saving the message as a template.
add_task(async function saveAsTemplate() {
  // Prepare msgAddedListener for this test.
  let msgAddedListener = new MsgAddedListener();
  MailServices.mfn.addListener(msgAddedListener, MailServices.mfn.msgAdded);

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
  let listener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl() {
      let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
        Ci.nsIMessenger
      );
      messenger.saveAs(uri, false, identity, null);
    },
  });
  templates.createStorageIfMissing(listener);
  await listener.promise;

  await msgAddedListener.promise;
});

// Cleanup
add_task(function endTest() {
  teardownIMAPPump();
});

// listener for saveAsTemplate adding a message to the templates folder.
function MsgAddedListener() {
  this._promise = new Promise(resolve => {
    this._resolve = resolve;
  });
}

MsgAddedListener.prototype = {
  msgAdded(aMsg) {
    // Check this is the templates folder.
    Assert.equal(aMsg.folder.prettyName, "Templates");
    this._resolve();
  },
};
