/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests our handling of server timeouts during online move of
// an imap message. The move is done as an offline operation and then
// played back, to copy what the apps do.

Services.prefs.setIntPref("mailnews.tcptimeout", 2);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gTargetFolder;
var alertResolve;
var alertPromise = new Promise(resolve => {
  alertResolve = resolve;
});

function alertPS(parent, aDialogTitle, aText) {
  alertResolve(aText);
}

add_setup(function () {
  registerAlertTestUtils();
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
});

add_task(async function createTargetFolder() {
  IMAPPump.daemon.copySleep = 5000;
  IMAPPump.incomingServer.rootFolder.createSubfolder("targetFolder", null);
  await PromiseTestUtils.promiseFolderAdded("targetFolder");
  gTargetFolder =
    IMAPPump.incomingServer.rootFolder.getChildNamed("targetFolder");
  Assert.ok(gTargetFolder instanceof Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gTargetFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

// load and update a message in the imap fake server
add_task(async function loadImapMessage() {
  let messages = [];
  const gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());

  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  const imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  var gMessage = new ImapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(gMessage);

  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
});

// move the message to a diffent folder
add_task(async function moveMessageToTargetFolder() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  // This should cause the move to be done as an offline imap operation
  // that's played back immediately.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    IMAPPump.inbox,
    [msgHdr],
    gTargetFolder,
    true,
    copyListener,
    gDummyMsgWindow,
    true
  );
  await copyListener.promise;
});

add_task(async function waitForOfflinePlayback() {
  // Just wait for the alert about timed out connection.
  const alertText = await alertPromise;
  Assert.ok(alertText.startsWith("Connection to server localhost timed out."));
});

add_task(async function updateTargetFolderAndInbox() {
  const urlListenerTargetFolder = new PromiseTestUtils.PromiseUrlListener();
  gTargetFolder.updateFolderWithListener(null, urlListenerTargetFolder);
  await urlListenerTargetFolder.promise;
  const urlListenerInbox = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, urlListenerInbox);
  await urlListenerInbox.promise;
});

// Cleanup
add_task(async function endTest() {
  // Make sure neither source nor target folder have offline events.
  Assert.ok(!IMAPPump.inbox.getFlag(Ci.nsMsgFolderFlags.OfflineEvents));
  Assert.ok(!gTargetFolder.getFlag(Ci.nsMsgFolderFlags.OfflineEvents));

  // fake server does the copy, but then times out, so make sure the target
  // folder has only 1 message, not the multiple ones it would have if we
  // retried.
  Assert.equal(gTargetFolder.getTotalMessages(false), 1);
  teardownIMAPPump();
});
