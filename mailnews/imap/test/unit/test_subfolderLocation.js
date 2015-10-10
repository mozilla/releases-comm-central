/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test proper location of new imap offline subfolders for maildir.

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var CC = Components.Constructor;
var Cu = Components.utils;

// async support
load("../../../resources/logHelper.js");
load("../../../resources/alertTestUtils.js");

// Globals

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail10"; // message file used as the test message

add_task(function () {
  Services.prefs.setBoolPref("mail.server.server1.autosync_offline_stores", false);
  setupIMAPPump();
});

// load and update a message in the imap fake server
add_task(function* loadImapMessage() {
  IMAPPump.mailbox.addMessage(new imapMessage(specForFileName(gMessage),
                              IMAPPump.mailbox.uidnext++, []));
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(gDummyMsgWindow, promiseUrlListener);
  yield promiseUrlListener.promise;

  do_check_eq(1, IMAPPump.inbox.getTotalMessages(false));
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  do_check_true(msgHdr instanceof Ci.nsIMsgDBHdr);
});

add_task(function* downloadOffline() {
  // ...and download for offline use.
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  yield promiseUrlListener.promise;
});

var folderName1 = "sub1";
var folderName2 = "sub2";

// use a folder method to add a subfolder
add_task(function* addSubfolder() {
  let promiseFolder1 = PromiseTestUtils.promiseFolderAdded(folderName1);
  IMAPPump.inbox.createSubfolder(folderName1, null);
  yield promiseFolder1;
});

// use a store method to add a subfolder
add_task(function storeAddSubfolder() {
  IMAPPump.incomingServer.msgStore.createFolder(IMAPPump.inbox, folderName2);
});

// test that folders created with store and folder have the same parent
add_task(function testSubfolder() {
  let subfolder1 = IMAPPump.inbox.getChildNamed(folderName1);
  let subfolder2 = IMAPPump.inbox.getChildNamed(folderName2);
  do_check_eq(subfolder1.filePath.parent.path, subfolder2.filePath.parent.path);
});

// Cleanup at end
add_task(teardownIMAPPump);

function run_test() {
  run_next_test();
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
