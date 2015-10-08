/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This tests that moved multiple messages from maildir->mbox and
   mbox->maildir are correct.
 */

load("../../../resources/POP3pump.js");
Components.utils.import("resource://gre/modules/Promise.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/maildirstore;1");

var gInboxFolder, gTestFolder;

gPOP3Pump.files = ["../../../data/bugmail1",
                   "../../../data/draft1"];
var gTestSubjects = ["[Bug 397009] A filter will let me tag, but not untag",
                     "Hello, did you receive my bugmail?"];

add_task(function* setupFolders() {
  let storeID = "@mozilla.org/msgstore/maildirstore;1";
  resetPluggableStoreLocal(storeID);

  // We want to test cross-server copy, so don't defer.
  gPOP3Pump.fakeServer.deferredToAccount = "";

  // Create a test folder on the Local Folders account.
  gTestFolder = localAccountUtils.rootFolder
                                 .QueryInterface(Ci.nsIMsgLocalMailFolder)
                                 .createLocalSubfolder("test");
  dump("testFolder is at " + gTestFolder.filePath.path + "\n");
  yield gPOP3Pump.run();
});
  
add_task(function* maildirToMbox() {
  // Test for multiple message copy for maildir->mbox.

  // get message headers for the inbox folder
  gInboxFolder = gPOP3Pump.fakeServer
                          .rootMsgFolder
                          .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  dump("inbox is at " + gInboxFolder.filePath.path + "\n");

  // Accumulate messages to copy.
  let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  let enumerator = gInboxFolder.msgDatabase.EnumerateMessages();
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    messages.appendElement(hdr, false);
  }
  do_check_eq(messages.length, 2);

  // Move messages to mbox test folder.
  let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.CopyMessages(gInboxFolder, messages, gTestFolder, true,
                                 promiseCopyListener, null, false);
  yield promiseCopyListener.promise;

  // Check the destination headers.
  messages.clear();
  enumerator = gTestFolder.msgDatabase.EnumerateMessages();
  let subjects = [];
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    messages.appendElement(hdr, false);
    dump("Subject: " + hdr.subject + "\n");
    subjects.push(hdr.subject);
  }
  do_check_eq(messages.length, 2);

  // messages should be missing from source
  do_check_eq(gInboxFolder.getTotalMessages(false), 0);

  // Check for subjects. maildir order for messages may not match
  // order for creation, hence the array.includes.
  for (let subject of gTestSubjects) {
    do_check_true(subjects.includes(subject));
  }

  // Make sure the body matches the message.
  enumerator = gTestFolder.msgDatabase.EnumerateMessages();
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    let body = mailTestUtils.loadMessageToString(gTestFolder, hdr);
    do_check_true(body.indexOf(hdr.subject) >= 0);
  }
});

add_task(function* mboxToMaildir() {
  // Test for multiple message copy for mbox->maildir.

  // Accumulate messages to copy.
  let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  let enumerator = gTestFolder.msgDatabase.EnumerateMessages();
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    messages.appendElement(hdr, false);
  }
  do_check_eq(messages.length, 2);

  // Move messages to inbox folder.
  let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.CopyMessages(gTestFolder, messages, gInboxFolder, true,
                                 promiseCopyListener, null, false);
  yield promiseCopyListener.promise;

  // Check the destination headers.
  messages.clear();
  enumerator = gInboxFolder.msgDatabase.EnumerateMessages();
  let subjects = [];
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    messages.appendElement(hdr, false);
    dump("Subject: " + hdr.subject + "\n");
    subjects.push(hdr.subject);
  }
  do_check_eq(messages.length, 2);

  // messages should be missing from source
  do_check_eq(gTestFolder.getTotalMessages(false), 0);

  // Check for subjects. maildir order for messages may not match
  // order for creation, hence the array.includes.
  for (let subject of gTestSubjects) {
    do_check_true(subjects.includes(subject));
  }

  // Make sure the body matches the message.
  enumerator = gInboxFolder.msgDatabase.EnumerateMessages();
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    let body = mailTestUtils.loadMessageToString(gInboxFolder, hdr);
    do_check_true(body.indexOf(hdr.subject) >= 0);
  }
});

add_task(function testCleanup() {
  gPOP3Pump = null;
});

function run_test() {
  run_next_test();
}

// Clone of POP3pump resetPluggableStore that does not reset local folders.
function resetPluggableStoreLocal(aStoreContractID)
{
  Services.prefs.setCharPref("mail.serverDefaultStoreContractID", aStoreContractID);

  // Cleanup existing files, server and account instances, if any.
  if (gPOP3Pump._server)
    gPOP3Pump._server.stop();

  if (gPOP3Pump.fakeServer && gPOP3Pump.fakeServer.valid) {
    gPOP3Pump.fakeServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(gPOP3Pump.fakeServer, false);
  }

  gPOP3Pump.fakeServer = localAccountUtils.create_incoming_server("pop3",
      gPOP3Pump.kPOP3_PORT, "fred", "wilma");

  //localAccountUtils.clearAll();

  gPOP3Pump._incomingServer = gPOP3Pump.fakeServer;
  gPOP3Pump._mailboxStoreContractID = aStoreContractID;
};
