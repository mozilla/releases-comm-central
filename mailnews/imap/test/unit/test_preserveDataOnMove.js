/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that arbitrary message header properties are preserved
//  during online move of an imap message.

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gMessage = "bugmail10"; // message file used as the test message
var gSubfolder;

add_setup(function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
});

add_task(async function createSubfolder() {
  IMAPPump.incomingServer.rootFolder.createSubfolder("Subfolder", null);
  await PromiseTestUtils.promiseFolderAdded("Subfolder");
  gSubfolder = IMAPPump.incomingServer.rootFolder.getChildNamed("Subfolder");
  Assert.ok(gSubfolder instanceof Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSubfolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

// load and update a message in the imap fake server
add_task(async function loadImapMessage() {
  IMAPPump.mailbox.addMessage(
    new ImapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
  );
  IMAPPump.inbox.updateFolder(null);
  await PromiseTestUtils.promiseFolderNotification(IMAPPump.inbox, "msgAdded");
  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);

  // set an arbitrary property
  msgHdr.setStringProperty("testprop", "somevalue");
});

// move the message to a subfolder
add_task(async function moveMessageToSubfolder() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    IMAPPump.inbox, // srcFolder
    [msgHdr], // messages
    gSubfolder, // dstFolder
    true, // isMove
    copyListener, // listener
    null, // msgWindow
    false // allowUndo
  );
  await copyListener.promise;
});

add_task(async function testPropertyOnMove() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSubfolder.updateFolderWithListener(null, listener);
  await PromiseTestUtils.promiseFolderNotification(gSubfolder, "msgAdded");
  await listener.promise;
  const msgHdr = mailTestUtils.firstMsgHdr(gSubfolder);
  Assert.equal(msgHdr.getStringProperty("testprop"), "somevalue");
});

// Cleanup
add_task(function endTest() {
  teardownIMAPPump();
});

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file("../../../data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
