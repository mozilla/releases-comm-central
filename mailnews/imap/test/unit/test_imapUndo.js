/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests undoing of an imap delete to the trash.
// There are three main cases:
// 1. Normal undo
// 2. Undo after the source folder has been compacted.
// 2.1 Same, but the server doesn't support COPYUID (GMail case)
//
// Original Author: David Bienvenu <bienvenu@nventure.com>

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gRootFolder;
var gMessages = [];
var gMsgWindow;

var gMsgFile1 = do_get_file("../../../data/bugmail10");
var gMsgFile2 = do_get_file("../../../data/bugmail11");
// var gMsgFile3 = do_get_file("../../../data/draft1");
var gMsgFile4 = do_get_file("../../../data/bugmail7");
var gMsgFile5 = do_get_file("../../../data/bugmail6");

// Copied straight from the example files
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gMsgId2 = "200804111417.m3BEHTk4030129@mrapp51.mozilla.org";
// var gMsgId3 = "4849BF7B.2030800@example.com";
var gMsgId4 = "bugmail7.m47LtAEf007542@mrapp51.mozilla.org";
var gMsgId5 = "bugmail6.m47LtAEf007542@mrapp51.mozilla.org";

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox) {
  // For every message we have, we need to convert it to a file:/// URI
  messages.forEach(function (message) {
    const URI = Services.io
      .newFileURI(message.file)
      .QueryInterface(Ci.nsIFileURL);
    // Create the ImapMessage and store it on the mailbox.
    mailbox.addMessage(new ImapMessage(URI.spec, mailbox.uidnext++, []));
  });
}

function alertListener() {}

alertListener.prototype = {
  reset() {},

  onAlert(aMessage, aMsgWindow) {
    throw new Error("got alert - TEST FAILED " + aMessage);
  },
};

add_setup(function () {
  setupIMAPPump();

  var listener1 = new alertListener();

  MailServices.mailSession.addUserFeedbackListener(listener1);

  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  Services.prefs.setBoolPref("mail.server.server1.offline_download", false);

  gMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );

  gRootFolder = IMAPPump.incomingServer.rootFolder;
  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;

  // Add a couple of messages to the INBOX
  // this is synchronous, afaik
  addMessagesToServer(
    [
      { file: gMsgFile1, messageId: gMsgId1 },
      { file: gMsgFile4, messageId: gMsgId4 },
      { file: gMsgFile5, messageId: gMsgId5 },
      { file: gMsgFile2, messageId: gMsgId2 },
    ],
    IMAPPump.mailbox
  );
});

add_task(async function updateFolder() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function deleteMessage() {
  const msgToDelete = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId1);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  gMessages.push(msgToDelete);
  IMAPPump.inbox.deleteMessages(
    gMessages,
    gMsgWindow,
    false,
    true,
    copyListener,
    true
  );
  await copyListener.promise;
});

add_task(async function expunge() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.expunge(listener, gMsgWindow);
  await listener.promise;

  // Ensure that the message has been surely deleted.
  Assert.equal(IMAPPump.inbox.msgDatabase.dBFolderInfo.numMessages, 3);
});

add_task(async function undoDelete() {
  gMsgWindow.transactionManager.undoTransaction();
  // after undo, we select the trash and then the inbox, so that we sync
  // up with the server, and clear out the effects of having done the
  // delete offline.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  const trash = gRootFolder.getChildNamed("Trash");
  trash
    .QueryInterface(Ci.nsIMsgImapMailFolder)
    .updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function goBackToInbox() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(gMsgWindow, listener);
  await listener.promise;
});

add_task(function verifyFolders() {
  const msgRestored = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId1);
  Assert.ok(msgRestored !== null);
  Assert.equal(IMAPPump.inbox.msgDatabase.dBFolderInfo.numMessages, 4);
});

add_task(function endTest() {
  // Cleanup, null out everything, close all cached connections and stop the
  // server
  gMessages = [];
  gMsgWindow.closeWindow();
  gMsgWindow = null;
  gRootFolder = null;
  teardownIMAPPump();
});
