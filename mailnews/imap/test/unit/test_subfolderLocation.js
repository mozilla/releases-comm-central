/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test proper location of new imap offline subfolders for maildir.

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/alertTestUtils.js");

// Globals

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail10"; // message file used as the test message

add_task(function () {
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  setupIMAPPump();
});

// load and update a message in the imap fake server
add_task(async function loadImapMessage() {
  IMAPPump.mailbox.addMessage(
    new ImapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
  );
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(gDummyMsgWindow, promiseUrlListener);
  await promiseUrlListener.promise;

  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
});

add_task(async function downloadOffline() {
  // ...and download for offline use.
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  await promiseUrlListener.promise;
});

var folderName1 = "sub1";
var folderName2 = "sub2";

// use a folder method to add a subfolder
add_task(async function addSubfolder() {
  const promiseFolder1 = PromiseTestUtils.promiseFolderAdded(folderName1);
  IMAPPump.inbox.createSubfolder(folderName1, null);
  await promiseFolder1;
});

// use a store method to add a subfolder
add_task(function storeAddSubfolder() {
  IMAPPump.incomingServer.msgStore.createFolder(IMAPPump.inbox, folderName2);
});

// test that folders created with store and folder have the same parent
add_task(function testSubfolder() {
  const subfolder1 = IMAPPump.inbox.getChildNamed(folderName1);
  const subfolder2 = IMAPPump.inbox.getChildNamed(folderName2);
  Assert.equal(
    subfolder1.filePath.parent.path,
    subfolder2.filePath.parent.path
  );
});

// Cleanup at end
add_task(teardownIMAPPump);

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file("../../../data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
