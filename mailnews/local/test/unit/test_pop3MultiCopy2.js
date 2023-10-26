/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This tests that moved multiple messages from maildir->mbox and
   mbox->maildir are correct.
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/maildirstore;1"
);

var gInboxFolder, gTestFolder;

gPOP3Pump.files = ["../../../data/bugmail1", "../../../data/draft1"];
var gTestSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
];

add_setup(async function () {
  const storeID = "@mozilla.org/msgstore/maildirstore;1";
  resetPluggableStoreLocal(storeID);

  // We want to test cross-server copy, so don't defer.
  gPOP3Pump.fakeServer.deferredToAccount = "";

  // Create a test folder on the Local Folders account.
  gTestFolder = localAccountUtils.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("test");
  dump("testFolder is at " + gTestFolder.filePath.path + "\n");
  await gPOP3Pump.run();
});

add_task(async function maildirToMbox() {
  // Test for multiple message copy for maildir->mbox.

  // get message headers for the inbox folder
  gInboxFolder = gPOP3Pump.fakeServer.rootMsgFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  dump("inbox is at " + gInboxFolder.filePath.path + "\n");

  // Accumulate messages to copy.
  let messages = [];
  for (const hdr of gInboxFolder.msgDatabase.enumerateMessages()) {
    messages.push(hdr);
  }
  Assert.equal(messages.length, 2);

  // Move messages to mbox test folder.
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    gInboxFolder,
    messages,
    gTestFolder,
    true, // isMove
    promiseCopyListener,
    null, // window
    false // allowUndo
  );
  await promiseCopyListener.promise;

  // Check the destination headers.
  messages = [];
  const subjects = [];
  for (const hdr of gTestFolder.msgDatabase.enumerateMessages()) {
    messages.push(hdr);
    dump("Subject: " + hdr.subject + "\n");
    subjects.push(hdr.subject);
  }
  Assert.equal(messages.length, 2);

  // messages should be missing from source
  Assert.equal(gInboxFolder.getTotalMessages(false), 0);

  // Check for subjects. maildir order for messages may not match
  // order for creation, hence the array.includes.
  for (const subject of gTestSubjects) {
    Assert.ok(subjects.includes(subject));
  }

  // Make sure the body matches the message.
  for (const hdr of gTestFolder.msgDatabase.enumerateMessages()) {
    const body = mailTestUtils.loadMessageToString(gTestFolder, hdr);
    Assert.ok(body.includes(hdr.subject));
  }
});

add_task(async function mboxToMaildir() {
  // Test for multiple message copy for mbox->maildir.

  // Accumulate messages to copy.
  let messages = [];
  for (const hdr of gTestFolder.msgDatabase.enumerateMessages()) {
    messages.push(hdr);
  }
  Assert.equal(messages.length, 2);

  // Move messages to inbox folder.
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    gTestFolder,
    messages,
    gInboxFolder,
    true,
    promiseCopyListener,
    null,
    false
  );
  await promiseCopyListener.promise;

  // Check the destination headers.
  messages = [];
  const subjects = [];
  for (const hdr of gInboxFolder.msgDatabase.enumerateMessages()) {
    messages.push(hdr);
    dump("Subject: " + hdr.subject + "\n");
    subjects.push(hdr.subject);
  }
  Assert.equal(messages.length, 2);

  // messages should be missing from source
  Assert.equal(gTestFolder.getTotalMessages(false), 0);

  // Check for subjects. maildir order for messages may not match
  // order for creation, hence the array.includes.
  for (const subject of gTestSubjects) {
    Assert.ok(subjects.includes(subject));
  }

  // Make sure the body matches the message.
  for (const hdr of gInboxFolder.msgDatabase.enumerateMessages()) {
    const body = mailTestUtils.loadMessageToString(gInboxFolder, hdr);
    Assert.ok(body.includes(hdr.subject));
  }
});

add_task(function testCleanup() {
  gPOP3Pump = null;
});

// Clone of POP3pump resetPluggableStore that does not reset local folders.
function resetPluggableStoreLocal(aStoreContractID) {
  Services.prefs.setCharPref(
    "mail.serverDefaultStoreContractID",
    aStoreContractID
  );

  // Cleanup existing files, server and account instances, if any.
  if (gPOP3Pump._server) {
    gPOP3Pump._server.stop();
  }

  if (gPOP3Pump.fakeServer && gPOP3Pump.fakeServer.valid) {
    gPOP3Pump.fakeServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(gPOP3Pump.fakeServer, false);
  }

  gPOP3Pump.fakeServer = localAccountUtils.create_incoming_server(
    "pop3",
    gPOP3Pump.kPOP3_PORT,
    "fred",
    "wilma"
  );

  // localAccountUtils.clearAll();

  gPOP3Pump._incomingServer = gPOP3Pump.fakeServer;
  gPOP3Pump._mailboxStoreContractID = aStoreContractID;
}
