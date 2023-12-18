/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that operations around the 4GiB folder size boundary work correctly.
 * This test only works for mbox format mail folders.
 * Some of the tests will be removed when support for over 4GiB folders is enabled by default.
 * The test functions are executed in this order:
 * - run_test
 * -  ParseListener_run_test
 * - downloadUnder4GiB
 * - downloadOver4GiB_fail
 * - downloadOver4GiB_success
 * -  downloadOver4GiB_success_check
 * - copyIntoOver4GiB_fail
 * -  copyIntoOver4GiB_fail_check
 * - copyIntoOver4GiB_success
 * -  copyIntoOver4GiB_success_check1
 * -  copyIntoOver4GiB_success_check2
 * - compactOver4GiB
 * -  CompactListener_compactOver4GiB
 * - compactUnder4GiB
 * -  CompactListener_compactUnder4GiB
 */

// Need to do this before loading POP3Pump.js
Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/alertTestUtils.js");
load("../../../resources/POP3pump.js");

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// If we're running out of memory parsing the folder, lowering the
// block size might help, though it will slow the test down and consume
// more disk space.
var kSparseBlockSize = 102400000;
var kSizeLimit = 0x100000000; // 4GiB
var kNearLimit = kSizeLimit - 0x1000000; // -16MiB

var gInboxFile = null; // The mbox file storing the Inbox folder.
var gInboxSize = 0; // The size of the Inbox folder.
var gInbox; // The nsIMsgFolder object of the Inbox folder in Local Folders.
var gExpectedNewMessages = 0; // The number of messages pushed manually into the mbox file.

var alertIsPending = true;
var alertResolve;
var alertPromise = new Promise(resolve => {
  alertResolve = resolve;
}).finally(() => {
  alertIsPending = false;
});
function resetAlertPromise() {
  alertIsPending = true;
  alertPromise = new Promise(resolve => {
    alertResolve = resolve;
  }).finally(() => {
    alertIsPending = false;
  });
}

add_setup(async function () {
  registerAlertTestUtils();

  localAccountUtils.loadLocalMailAccount();

  allow4GBFolders(false);

  gInbox = localAccountUtils.inboxFolder;
  gInboxFile = gInbox.filePath;

  const neededFreeSpace = kSizeLimit + 0x10000000; // +256MiB
  // On Windows, check whether the drive is NTFS. If it is, mark the file as
  // sparse. If it isn't, then bail out now, because in all probability it is
  // FAT32, which doesn't support file sizes greater than 4 GiB.
  if (
    "@mozilla.org/windows-registry-key;1" in Cc &&
    mailTestUtils.get_file_system(gInboxFile) != "NTFS"
  ) {
    throw new Error("On Windows, this test only works on NTFS volumes.\n");
  }

  const freeDiskSpace = gInboxFile.diskSpaceAvailable;
  info("Free disk space = " + mailTestUtils.toMiBString(freeDiskSpace));
  if (freeDiskSpace < neededFreeSpace) {
    throw new Error(
      "This test needs " +
        mailTestUtils.toMiBString(neededFreeSpace) +
        " free space to run. Aborting."
    );
  }

  MailServices.mailSession.AddFolderListener(
    FListener,
    Ci.nsIFolderListener.all
  );

  // Grow inbox to a size near the max limit.
  gExpectedNewMessages = growInbox(kNearLimit);

  // Force the db closed, so that getDatabaseWithReparse will notice
  // that it's out of date.
  gInbox.msgDatabase.forceClosed();
  gInbox.msgDatabase = null;
  const parseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  try {
    gInbox.getDatabaseWithReparse(parseUrlListener, gDummyMsgWindow);
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
  }
  await parseUrlListener.promise;
  // Check: reparse successful.
  Assert.notEqual(gInbox.msgDatabase, null);
  Assert.ok(gInbox.msgDatabase.summaryValid);
  // Bug 813459
  // Check if the onFolderIntPropertyChanged folder listener hook can return
  //  values below 2^32 for properties which are not 64 bits long.
  Assert.equal(FListener.msgsHistory(0), gExpectedNewMessages);
  Assert.equal(FListener.msgsHistory(0), gInbox.getTotalMessages(false));
  Assert.equal(FListener.sizeHistory(0), gInbox.sizeOnDisk);
});

/**
 * Check we can download new mail when we are near 4GiB limit but do not cross it.
 */
add_task(async function downloadUnder4GiB() {
  // Check fake POP3 server is ready.
  Assert.notEqual(gPOP3Pump.fakeServer, null);

  // Download a file that still fits into the limit.
  const bigFile = do_get_file("../../../data/mime-torture");
  Assert.ok(bigFile.fileSize >= 1024 * 1024);
  Assert.ok(bigFile.fileSize <= 1024 * 1024 * 2);

  gPOP3Pump.files = ["../../../data/mime-torture"];
  let pop3Resolve;
  const pop3OnDonePromise = new Promise(resolve => {
    pop3Resolve = resolve;
  });
  gPOP3Pump.onDone = pop3Resolve;
  // It must succeed.
  gPOP3Pump.run(Cr.NS_OK);
  await pop3OnDonePromise;
});

/**
 * Bug 640371
 * Check we will not cross the 4GiB limit when downloading new mail.
 */
add_task(async function downloadOver4GiB_fail() {
  const localInboxSize = gInboxFile.clone().fileSize;
  Assert.ok(localInboxSize >= kNearLimit);
  Assert.ok(localInboxSize < kSizeLimit);
  Assert.equal(gInbox.sizeOnDisk, localInboxSize);
  Assert.ok(gInbox.msgDatabase.summaryValid);
  // The big file is between 1 and 2 MiB. Append it 16 times to attempt to cross the 4GiB limit.
  gPOP3Pump.files = [
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
  ];
  let pop3Resolve;
  const pop3OnDonePromise = new Promise(resolve => {
    pop3Resolve = resolve;
  });
  gPOP3Pump.onDone = pop3Resolve;
  // The download must fail.
  gPOP3Pump.run(Cr.NS_ERROR_FAILURE);
  await pop3OnDonePromise;
});

/**
 * Bug 789679
 * Check we can cross the 4GiB limit when downloading new mail.
 */
add_task(async function downloadOver4GiB_success_check() {
  allow4GBFolders(true);
  // Grow inbox to size greater than the max limit (+16 MiB).
  gExpectedNewMessages = 16;
  // We are in the .onDone() callback of the previous run of gPOP3Pump
  // so we need a new POP3Pump so that internal variables of the previous
  // one don't get confused.
  gPOP3Pump = new POP3Pump();
  gPOP3Pump._incomingServer = gPOP3Pump._createPop3ServerAndLocalFolders();
  gPOP3Pump.files = [
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
    "../../../data/mime-torture",
  ];
  let pop3Resolve;
  const pop3OnDonePromise = new Promise(resolve => {
    pop3Resolve = resolve;
  });
  gPOP3Pump.onDone = pop3Resolve;
  // The download must not fail.
  gPOP3Pump.run(Cr.NS_OK);
  await pop3OnDonePromise;

  /**
   * Bug 608449
   * Check we can parse a folder if it is above 4GiB.
   */
  const localInboxSize = gInboxFile.clone().fileSize;
  info(
    "Local inbox size (after downloadOver4GiB_success) = " +
      localInboxSize +
      "\n"
  );
  Assert.ok(localInboxSize > kSizeLimit);
  Assert.ok(gInbox.msgDatabase.summaryValid);

  // Bug 789679
  // Check if the public SizeOnDisk method can return sizes above 4GB.
  Assert.equal(gInbox.sizeOnDisk, localInboxSize);

  // Bug 813459
  // Check if the onFolderIntPropertyChanged folder listener hook can return
  // values above 2^32 for properties where it is relevant.
  Assert.equal(FListener.sizeHistory(0), gInbox.sizeOnDisk);
  Assert.ok(FListener.sizeHistory(1) < FListener.sizeHistory(0));
  Assert.equal(
    FListener.msgsHistory(0),
    FListener.msgsHistory(16) + gExpectedNewMessages
  );
  Assert.equal(gInbox.expungedBytes, 0);

  // Bug 1183490
  // Check that the message keys are below 4GB (thus no offset),
  // actually just incrementing by 1 for each message.
  let key = 0;
  for (const hdr of gInbox.messages) {
    key++;
    Assert.equal(hdr.messageKey, key);
  }
});

/**
 * Bug 598104
 * Check that copy operation does not allow to grow a local folder above 4 GiB.
 */
add_task(async function copyIntoOver4GiB_fail_check() {
  allow4GBFolders(false);
  // Save initial file size.
  const localInboxSize = gInboxFile.clone().fileSize;
  info("Local inbox size (before copyFileMessage) = " + localInboxSize);

  // Use copyFileMessage to (try to) append another message
  // to local inbox.
  const file = do_get_file("../../../data/mime-torture");

  // Set up local folders
  localAccountUtils.loadLocalMailAccount();

  const copiedMessageHeaderKeys = []; // Accumulated MsgHdrKeys for listener.
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      copiedMessageHeaderKeys.push(aKey);
    },
  });
  // Copy a message into the local folder
  MailServices.copy.copyFileMessage(
    file,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    gDummyMsgWindow
  );
  await Assert.rejects(
    copyListener.promise,
    reason => {
      return reason === Cr.NS_ERROR_FAILURE;
    },
    "The local folder is not above 4GiB"
  );

  Assert.equal(copiedMessageHeaderKeys.length, 0);
  const alertText = await alertPromise;
  Assert.ok(
    alertText.startsWith(
      "The folder Inbox on Local Folders is full, and can't hold any more messages."
    )
  );

  // Make sure inbox file did not grow (i.e., no data were appended).
  const newLocalInboxSize = gInboxFile.clone().fileSize;
  info("Local inbox size (after copyFileMessage()) = " + newLocalInboxSize);
});

/**
 * Bug 789679
 * Check that copy operation does allow to grow a local folder above 4 GiB.
 */
add_task(async function copyIntoOver4GiB_success_check1() {
  allow4GBFolders(true);
  // Append 2 new 2MB messages to the folder.
  gExpectedNewMessages = 2;

  // Reset the Promise for alertTestUtils.js.
  // This message will be preserved in CompactUnder4GB.
  resetAlertPromise();
  const file = do_get_file("../../../data/mime-torture");
  const copiedMessageHeaderKeys = []; // Accumulated MsgHdrKeys for listener.
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      copiedMessageHeaderKeys.push(aKey);
    },
  });
  // Copy a message into the local folder
  MailServices.copy.copyFileMessage(
    file,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    gDummyMsgWindow
  );

  await copyListener.promise;
  Assert.equal(copiedMessageHeaderKeys[0], 60);
  // An alert shouldn't be triggered after our reset.
  Assert.ok(alertIsPending);
});

add_task(async function copyIntoOver4GiB_success_check2() {
  // This message will be removed in compactOver4GB.
  const file = do_get_file("../../../data/mime-torture");
  const copiedMessageHeaderKeys = []; // Accumulated MsgHdrKeys for listener.
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    SetMessageKey(aKey) {
      copiedMessageHeaderKeys.push(aKey);
    },
  });
  // Copy a message into the local folder.
  MailServices.copy.copyFileMessage(
    file,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    gDummyMsgWindow
  );

  await copyListener.promise;
  Assert.equal(copiedMessageHeaderKeys[0], 61);
  // An alert shouldn't be triggered so far.
  Assert.ok(alertIsPending);

  Assert.equal(
    FListener.msgsHistory(0),
    FListener.msgsHistory(2) + gExpectedNewMessages
  );
});

/**
 * Bug 794303
 * Check we can compact a folder that stays above 4 GiB after compact.
 */
add_task(async function compactOver4GiB() {
  gInboxSize = gInboxFile.clone().fileSize;
  Assert.ok(gInboxSize > kSizeLimit);
  Assert.equal(gInbox.expungedBytes, 0);
  // Delete the last small message at folder end.
  const doomed = [...gInbox.messages].slice(-1);
  let sizeToExpunge = 0;
  for (const header of doomed) {
    sizeToExpunge = header.messageSize;
  }
  const deleteListener = new PromiseTestUtils.PromiseCopyListener();
  gInbox.deleteMessages(doomed, null, true, false, deleteListener, false);
  await deleteListener.promise;
  Assert.equal(gInbox.expungedBytes, sizeToExpunge);

  /* Unfortunately, the compaction now would kill the sparse markings in the file
   * so it will really take 4GiB of space in the filesystem and may be slow.
   * NOTE: compact() will also add 'X-Mozilla-Status' and 'X-Mozilla-Status2'
   * lines to message(s). So in some cases compaction could actually increase
   * the size of the mbox!
   */
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  gInbox.compact(urlListener, null);
  await urlListener.promise;
  Assert.ok(gInbox.msgDatabase.summaryValid);
  // Check that folder size is still above max limit ...
  const localInboxSize = gInbox.filePath.clone().fileSize;
  info("Local inbox size (after compact 1) = " + localInboxSize);
  Assert.ok(localInboxSize > kSizeLimit);
  // ... but it got smaller by removing 1 message.
  Assert.ok(gInboxSize > localInboxSize);
  Assert.equal(gInbox.sizeOnDisk, localInboxSize);
});

/**
 * Bug 608449
 * Check we can compact a folder to get it under 4 GiB.
 */
add_task(async function compactUnder4GiB() {
  // The folder is still above 4GB.
  Assert.ok(gInboxFile.clone().fileSize > kSizeLimit);
  const folderSize = gInbox.sizeOnDisk;
  const totalMsgs = gInbox.getTotalMessages(false);
  // Let's close the database and re-open the folder (hopefully dumping memory caches)
  // and re-reading the values from disk (msg database). That is to test if
  // the values were properly serialized to the database.
  gInbox.ForceDBClosed();
  gInbox.msgDatabase = null;
  gInbox.getDatabaseWOReparse();

  Assert.equal(gInbox.sizeOnDisk, folderSize);
  Assert.equal(gInbox.getTotalMessages(false), totalMsgs);

  // Very last header in folder is retained,
  // but all other preceding headers are marked as deleted.
  const doomed = [...gInbox.messages].slice(0, -1);
  let sizeToExpunge = gInbox.expungedBytes; // If compact in compactOver4GB was skipped, this is not 0.
  for (const header of doomed) {
    sizeToExpunge += header.messageSize;
  }
  const deleteListener = new PromiseTestUtils.PromiseCopyListener();
  gInbox.deleteMessages(doomed, null, true, false, deleteListener, false);
  await deleteListener.promise;

  // Bug 894012: size of messages to expunge is now higher than 4GB.
  // Only the small 1MiB message remains.
  Assert.equal(gInbox.expungedBytes, sizeToExpunge);
  Assert.ok(sizeToExpunge > kSizeLimit);

  // Note: compact() will also add 'X-Mozilla-Status' and 'X-Mozilla-Status2'
  // lines to message(s).
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  gInbox.compact(urlListener, null);
  await urlListener.promise;
  // Check: message successfully copied.
  Assert.ok(gInbox.msgDatabase.summaryValid);

  // Check that folder size isn't much bigger than our sparse block size, ...
  const localInboxSize = gInbox.filePath.clone().fileSize;
  info("Local inbox size (after compact 2) = " + localInboxSize);
  Assert.equal(gInbox.sizeOnDisk, localInboxSize);
  Assert.ok(localInboxSize < kSparseBlockSize + 1000);
  // ... i.e., that we just have one message.
  Assert.equal(gInbox.getTotalMessages(false), 1);
  Assert.equal(FListener.sizeHistory(0), gInbox.sizeOnDisk);
  Assert.equal(FListener.msgsHistory(0), 1);

  // The message has its key preserved in compact.
  Assert.equal([...gInbox.messages][0].messageKey, 60);
});

add_task(function endTest() {
  MailServices.mailSession.RemoveFolderListener(FListener);
  // Free up disk space - if you want to look at the file after running
  // this test, comment out this line.
  gInbox.filePath.remove(false);
  Services.prefs.clearUserPref("mailnews.allowMboxOver4GB");
  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});

// This alert() is triggered when file size becomes close (enough) to or
// exceeds 4 GiB.
// See hardcoded value in nsMsgBrkMBoxStore::HasSpaceAvailable().
function alertPS(parent, aDialogTitle, aText) {
  // See "/*/locales/en-US/chrome/*/messenger.properties > mailboxTooLarge".
  alertResolve(aText);
}

// A stub nsIMsgFolderListener that only listens to changes on Inbox and stores
// the seen values for interesting folder properties so we can later test them.
var FListener = {
  folderSize: [-1], // an array of seen values of "FolderSize"
  totalMsgs: [-1], // an array of seen values of "TotalMessages"

  // Returns the value that is stored 'aBack' entries from the last one in the history.
  sizeHistory(aBack) {
    return this.folderSize[this.folderSize.length - 1 - aBack];
  },
  msgsHistory(aBack) {
    return this.totalMsgs[this.totalMsgs.length - 1 - aBack];
  },

  onFolderAdded: function act_add(parentFolder, child) {},
  onMessageAdded: function act_add(parentFolder, msg) {},
  onFolderRemoved: function act_remove(parentFolder, child) {},
  onMessageRemoved: function act_remove(parentFolder, msg) {},

  onFolderPropertyChanged(aItem, aProperty, aOld, aNew) {},
  onFolderIntPropertyChanged(aItem, aProperty, aOld, aNew) {
    if (aItem === gInbox) {
      info(
        "Property change on folder Inbox:" +
          aProperty +
          "=" +
          aOld +
          "->" +
          aNew +
          "\n"
      );
      if (aProperty == "FolderSize") {
        this.folderSize.push(aNew);
      } else if (aProperty == "TotalMessages") {
        this.totalMsgs.push(aNew);
      }
    }
  },
  onFolderBoolPropertyChanged(aItem, aProperty, aOld, aNew) {},
  onFolderUnicharPropertyChanged(aItem, aProperty, aOld, aNew) {},
  onFolderPropertyFlagChanged(aItem, aProperty, aOld, aNew) {},
  onFolderEvent(aFolder, aEvent) {},
};

/**
 * Allow folders to grow over 4GB.
 */
function allow4GBFolders(aOn) {
  Services.prefs.setBoolPref("mailnews.allowMboxOver4GB", aOn);
}

/**
 * Grow local inbox folder to at least targetSize bytes, by appending
 * dummy messages with large sparse chunks. Potentially, this function
 * may overshoot by a couple hundred bytes or so, depending on where
 * message boundaries fall.
 * The file must be reparsed (getDatabaseWithReparse) after it is artificially
 * enlarged here.
 * The file is marked as sparse in the filesystem so that it does not
 * really take 4GiB and working with it is faster.
 *
 * @param targetSize - Minimum desired size of the Inbox mbox file.
 * @returns The number of messages created in the folder file.
 */
function growInbox(targetSize) {
  let msgsAdded = 0;

  // Generate a dummy message to extend and repeat.
  const messageGenerator = new MessageGenerator();
  const msgString = messageGenerator.makeMessage().toMessageString();

  const out = Cc["@mozilla.org/network/file-output-stream;1"]
    .createInstance(Ci.nsIFileOutputStream)
    .QueryInterface(Ci.nsISeekableStream);
  // write-only.
  out.init(gInboxFile, 0x02, 0o600, 0);

  const eol = "\r\n";
  const fromLine = "From " + eol;

  let localSize = gInboxFile.fileSize;
  out.seek(2, localSize);
  while (localSize < targetSize) {
    // The "From " line.
    out.write(fromLine, fromLine.length);
    localSize += fromLine.length;

    // The message itself.
    out.write(msgString, msgString.length);
    localSize += msgString.length;
    if (localSize < targetSize - eol.length) {
      let chunkSize = targetSize - eol.length - localSize;
      chunkSize = Math.min(chunkSize, kSparseBlockSize);
      // Could use mark_file_region_sparse() to go sparse on NTFS, but
      // unclear if that'll work on an open file...
      localSize += chunkSize;
      out.seek(0, localSize);
    }
    // Terminate the line and add a blank line.
    out.write(eol, eol.length);
    localSize += eol.length;
    out.write(eol, eol.length);
    localSize += eol.length;
    msgsAdded++;
  }
  out.close();

  // Refresh 'gInboxFile'.
  gInboxFile = gInbox.filePath;
  Assert.greaterOrEqual(gInboxFile.clone().fileSize, targetSize);
  info(
    `Grew inbox to ${
      gInboxFile.clone().fileSize
    } bytes (by adding ${msgsAdded} dummy messages)`
  );
  return msgsAdded;
}
