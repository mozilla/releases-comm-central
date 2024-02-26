/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This tests that copied multiple messages in maildir are correct.
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var testSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
];

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/maildirstore;1"
);

add_task(async function runPump() {
  // Test for multiple message copy for maildir.
  const storeID = "@mozilla.org/msgstore/maildirstore;1";
  gPOP3Pump.resetPluggableStore(storeID);
  // Set the default mailbox store.
  Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeID);

  // We want to test cross-server copy, so don't defer.
  gPOP3Pump.fakeServer.deferredToAccount = "";

  gPOP3Pump.files = ["../../../data/bugmail1", "../../../data/draft1"];
  await gPOP3Pump.run();

  // get message headers for the inbox folder
  const inbox = gPOP3Pump.fakeServer.rootMsgFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  dump("inbox is at " + inbox.filePath.path + "\n");

  // Accumulate messages to copy.
  let messages = [];
  let msgCount = 0;
  for (const hdr of inbox.msgDatabase.enumerateMessages()) {
    msgCount++;
    messages.push(hdr);
    Assert.equal(hdr.subject, testSubjects[msgCount - 1]);
  }
  Assert.equal(messages.length, 2);

  // Create a test folder on the Local Folders account.
  const testFolder = localAccountUtils.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("test");
  dump("testFolder is at " + testFolder.filePath.path + "\n");

  // Copy messages to that folder.
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    inbox,
    messages,
    testFolder,
    false,
    promiseCopyListener,
    null,
    false
  );
  await promiseCopyListener.promise;

  // Check the destination headers.
  messages = [];
  msgCount = 0;
  const subjects = [];
  for (const hdr of testFolder.msgDatabase.enumerateMessages()) {
    msgCount++;
    messages.push(hdr);
    dump("Subject: " + hdr.subject + "\n");
    subjects.push(hdr.subject);
  }
  Assert.equal(messages.length, 2);

  // Check for subjects. maildir order for messages may not match
  // order for creation, hence the array.includes.
  for (const subject of testSubjects) {
    Assert.ok(subjects.includes(subject));
  }

  // Make sure the body matches the message.
  for (const hdr of testFolder.msgDatabase.enumerateMessages()) {
    const body = mailTestUtils.loadMessageToString(testFolder, hdr);
    Assert.ok(body.includes(hdr.subject));
  }

  gPOP3Pump = null;
});
