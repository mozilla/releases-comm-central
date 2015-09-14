/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This tests that copied multiple messages in maildir are correct.
 */

load("../../../resources/POP3pump.js");
Components.utils.import("resource://gre/modules/Promise.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

var testSubjects = ["[Bug 397009] A filter will let me tag, but not untag",
                    "Hello, did you receive my bugmail?"];

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/maildirstore;1");

add_task(function* runPump() {
  // Test for multiple message copy for maildir.
  let storeID = "@mozilla.org/msgstore/maildirstore;1";
  gPOP3Pump.resetPluggableStore(storeID);
  // Set the default mailbox store.
  Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeID);

  // We want to test cross-server copy, so don't defer.
  gPOP3Pump.fakeServer.deferredToAccount = "";

  gPOP3Pump.files = ["../../../data/bugmail1",
                     "../../../data/draft1"];
  yield gPOP3Pump.run();

  // get message headers for the inbox folder
  let inbox = gPOP3Pump.fakeServer
                       .rootMsgFolder
                       .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  dump("inbox is at " + inbox.filePath.path + "\n");

  // Accumulate messages to copy.
  let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  let enumerator = inbox.msgDatabase.EnumerateMessages();
  let msgCount = 0;
  while (enumerator.hasMoreElements()) {
    msgCount++;
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    messages.appendElement(hdr, false);
    do_check_eq(hdr.subject, testSubjects[msgCount - 1]);
  }
  do_check_eq(messages.length, 2);

  // Create a test folder on the Local Folders account.
  let testFolder = localAccountUtils.rootFolder
                                    .QueryInterface(Ci.nsIMsgLocalMailFolder)
                                    .createLocalSubfolder("test");
  dump("testFolder is at " + testFolder.filePath.path + "\n");

  // Copy messages to that folder.
  let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.CopyMessages(inbox, messages, testFolder, false,
                                 promiseCopyListener, null, false);
  yield promiseCopyListener.promise;

  // Check the destination headers.
  messages.clear();
  enumerator = testFolder.msgDatabase.EnumerateMessages();
  msgCount = 0;
  let subjects = [];
  while (enumerator.hasMoreElements()) {
    msgCount++;
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    messages.appendElement(hdr, false);
    dump("Subject: " + hdr.subject + "\n");
    subjects.push(hdr.subject);
  }
  do_check_eq(messages.length, 2);

  // Check for subjects. maildir order for messages may not match
  // order for creation, hence the array.includes.
  for (let subject of testSubjects) {
    do_check_true(subjects.includes(subject));
  }

  // Make sure the body matches the message.
  enumerator = testFolder.msgDatabase.EnumerateMessages();
  while (enumerator.hasMoreElements()) {
    let hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    let body = mailTestUtils.loadMessageToString(testFolder, hdr);
    do_check_true(body.indexOf(hdr.subject) >= 0);
  }

  gPOP3Pump = null;
});

function run_test() {
  run_next_test();
}
