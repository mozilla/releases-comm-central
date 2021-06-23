/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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

/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/asyncTestUtils.js");
load("../../../resources/alertTestUtils.js");
load("../../../resources/MessageGenerator.jsm");
load("../../../resources/POP3pump.js");

// If we're running out of memory parsing the folder, lowering the
// block size might help, though it will slow the test down and consume
// more disk space.
var kSparseBlockSize = 102400000;
var kSizeLimit = 0x100000000; // 4GiB
var kNearLimit = kSizeLimit - 0x1000000; // -16MiB

var gGotAlert = false;
var gInboxFile = null; // The mbox file storing the Inbox folder
var gInboxSize = 0; // The size of the Inbox folder
var gInbox; // The nsIMsgFolder object of the Inbox folder in Local Folders
var gExpectedNewMessages = 0; // The number of messages pushed manually into the mbox file

/* exported alert */
// This alert() is triggered when file size becomes close (enough) to or
// exceeds 4 GiB.
// See hardcoded value in nsMsgBrkMBoxStore::HasSpaceAvailable().
function alert(aDialogTitle, aText) {
  // See "/*/locales/en-US/chrome/*/messenger.properties > mailboxTooLarge".
  // NOTE: This assumes an english-speaking locale.
  // So it'll fail if that isn't the case. Ugh.
  Assert.ok(
    aText.startsWith(
      "The folder Inbox on Local Folders is full, and can't hold any more messages."
    )
  );
  gGotAlert = true;
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

  OnItemAdded: function act_add(aRDFParentItem, aItem) {},
  OnItemRemoved: function act_remove(aRDFParentItem, aItem) {},
  OnItemPropertyChanged(aItem, aProperty, aOld, aNew) {},
  OnItemIntPropertyChanged(aItem, aProperty, aOld, aNew) {
    if (aItem === gInbox) {
      dump(
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
  OnItemBoolPropertyChanged(aItem, aProperty, aOld, aNew) {},
  OnItemUnicharPropertyChanged(aItem, aProperty, aOld, aNew) {},
  OnItemPropertyFlagChanged(aItem, aProperty, aOld, aNew) {},
  OnItemEvent(aFolder, aEvent) {},
};

/**
 * Allow folders to grow over 4GB.
 */
function allow4GBFolders(aOn) {
  Services.prefs.setBoolPref("mailnews.allowMboxOver4GB", aOn);
}

/**
 * Grow local inbox folder to the wanted size using direct appending
 * to the underlying file. The folder is filled with copies of a dummy
 * message with kSparseBlockSize bytes in size.
 * The file must be reparsed (getDatabaseWithReparse) after it is artificially
 * enlarged here.
 * The file is marked as sparse in the filesystem so that it does not
 * really take 4GiB and working with it is faster.
 *
 * @return  The number of messages created in the folder file.
 */
function growInbox(aWantedSize) {
  let msgsAdded = 0;
  // Put a single message in the Inbox.
  let messageGenerator = new MessageGenerator();
  let message = messageGenerator.makeMessage();

  // Refresh 'gInboxFile'.
  gInboxFile = gInbox.filePath;
  let localSize = 0;

  let mboxString = message.toMboxString();
  let plugStore = gInbox.msgStore;
  // Grow local inbox to our wished size that is below the max limit.
  do {
    let sparseStart = gInboxFile.clone().fileSize + mboxString.length;
    let nextOffset = Math.min(sparseStart + kSparseBlockSize, aWantedSize - 2);
    if (aWantedSize - (nextOffset + 2) < mboxString.length + 2) {
      nextOffset = aWantedSize - 2;
    }

    // Get stream to write a new message.
    let reusable = {};
    let newMsgHdr = {};
    let outputStream = plugStore
      .getNewMsgOutputStream(gInbox, newMsgHdr, reusable)
      .QueryInterface(Ci.nsISeekableStream);
    // Write message header.
    outputStream.write(mboxString, mboxString.length);
    outputStream.close();

    // "Add" a new (empty) sparse block at the end of the file.
    if (nextOffset - sparseStart == kSparseBlockSize) {
      mailTestUtils.mark_file_region_sparse(
        gInboxFile,
        sparseStart,
        kSparseBlockSize
      );
    }

    // Append message terminator.
    outputStream = Cc["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Ci.nsIFileOutputStream)
      .QueryInterface(Ci.nsISeekableStream);
    // Open in write-only mode, no truncate.
    outputStream.init(gInboxFile, 0x02, parseInt("0600", 8), 0);

    // Skip to the wished end of the message.
    outputStream.seek(0, nextOffset);
    // Add a CR+LF to terminate the message.
    outputStream.write("\r\n", 2);
    outputStream.close();
    msgsAdded++;

    // Refresh 'gInboxFile'.
    gInboxFile = gInbox.filePath;
    localSize = gInboxFile.clone().fileSize;
  } while (localSize < aWantedSize);

  Assert.equal(gInboxFile.clone().fileSize, aWantedSize);
  info(
    "Local inbox size = " +
      localSize +
      "bytes = " +
      mailTestUtils.toMiBString(localSize)
  );
  Assert.equal(localSize, aWantedSize);
  return msgsAdded;
}

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  allow4GBFolders(false);

  // "Master" do_test_pending(), paired with a do_test_finished() at the end of
  // all the operations.
  do_test_pending();

  gInbox = localAccountUtils.inboxFolder;
  gInboxFile = gInbox.filePath;

  let neededFreeSpace = kSizeLimit + 0x10000000; // +256MiB
  // On Windows, check whether the drive is NTFS. If it is, mark the file as
  // sparse. If it isn't, then bail out now, because in all probability it is
  // FAT32, which doesn't support file sizes greater than 4 GiB.
  if (
    "@mozilla.org/windows-registry-key;1" in Cc &&
    mailTestUtils.get_file_system(gInboxFile) != "NTFS"
  ) {
    dump("On Windows, this test only works on NTFS volumes.\n");

    endTest();
    return;
  }

  let freeDiskSpace = gInboxFile.diskSpaceAvailable;
  info("Free disk space = " + mailTestUtils.toMiBString(freeDiskSpace));
  if (freeDiskSpace < neededFreeSpace) {
    info(
      "This test needs " +
        mailTestUtils.toMiBString(neededFreeSpace) +
        " free space to run. Aborting."
    );
    todo_check_true(false);

    endTest();
    return;
  }

  MailServices.mailSession.AddFolderListener(
    FListener,
    Ci.nsIFolderListener.all
  );

  // Grow inbox to a size near the max limit.
  gExpectedNewMessages = growInbox(kNearLimit);

  // Force the db closed, so that getDatabaseWithReparse will notice
  // that it's out of date.
  gInbox.msgDatabase.ForceClosed();
  gInbox.msgDatabase = null;
  try {
    gInbox.getDatabaseWithReparse(ParseListener_run_test, gDummyMsgWindow);
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
  }
  // Execution continues in downloadUnder4GiB() when done.
}

/**
 * Check we can download new mail when we are near 4GiB limit but do not cross it.
 */
function downloadUnder4GiB() {
  // Check fake POP3 server is ready.
  Assert.notEqual(gPOP3Pump.fakeServer, null);

  // Download a file that still fits into the limit.
  let bigFile = do_get_file("../../../data/mime-torture");
  Assert.ok(bigFile.fileSize >= 1024 * 1024);
  Assert.ok(bigFile.fileSize <= 1024 * 1024 * 2);

  gPOP3Pump.files = ["../../../data/mime-torture"];
  gPOP3Pump.onDone = downloadOver4GiB_fail;
  // It must succeed.
  gPOP3Pump.run(Cr.NS_OK);
  // Execution continues in downloadOver4GiB_fail() when done.
}

/**
 * Bug 640371
 * Check we will not cross the 4GiB limit when downloading new mail.
 */
function downloadOver4GiB_fail() {
  let localInboxSize = gInboxFile.clone().fileSize;
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
  gPOP3Pump.onDone = downloadOver4GiB_success;
  // The download must fail.
  gPOP3Pump.run(Cr.NS_ERROR_FAILURE);
  // Execution continues in downloadOver4GiB_success() when done.
}

/**
 * Bug 789679
 * Check we can cross the 4GiB limit when downloading new mail.
 */
function downloadOver4GiB_success() {
  allow4GBFolders(true);
  // Grow inbox to size greater than the max limit (+16 MiB).
  gExpectedNewMessages = 16;
  // We are in the .onDone() callback of the previous run of gPOP3Pump
  // so we need a new POP3Pump so that internal variables of the previous
  // one don't get confused.
  // TODO: this whole test file should be converted to the new
  // Promise-based task framework to solve this problem cleanly.
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
  gPOP3Pump.onDone = downloadOver4GiB_success_check;
  // The download must not fail.
  gPOP3Pump.run(Cr.NS_OK);
  // Execution continues in growOver4GiB_success_check() when done.
}

/**
 * Bug 608449
 * Check we can parse a folder if it is above 4GiB.
 */
function downloadOver4GiB_success_check() {
  let localInboxSize = gInboxFile.clone().fileSize;
  dump(
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
  // Check if the OnItemIntPropertyChanged folder listener hook can return
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
  for (let hdr of gInbox.messages) {
    key++;
    Assert.equal(hdr.messageKey, key);
  }

  copyIntoOver4GiB_fail();
}

/**
 * Bug 598104
 * Check that copy operation does not allow to grow a local folder above 4 GiB.
 */
function copyIntoOver4GiB_fail() {
  allow4GBFolders(false);
  // Save initial file size.
  let localInboxSize = gInboxFile.clone().fileSize;
  info(
    "Local inbox size (before copyFileMessageInLocalFolder()) = " +
      localInboxSize
  );

  // Use copyFileMessageInLocalFolder() to (try to) append another message
  // to local inbox.
  gGotAlert = false;
  let file = do_get_file("../../../data/mime-torture");
  copyFileMessageInLocalFolder(
    file,
    0,
    "",
    gDummyMsgWindow,
    copyIntoOver4GiB_fail_check
  );
}

function copyIntoOver4GiB_fail_check(aMessageHeadersKeys, aStatus) {
  Assert.ok(!Components.isSuccessCode(aStatus));
  Assert.equal(aMessageHeadersKeys.length, 0);
  Assert.ok(gGotAlert);

  // Make sure inbox file did not grow (i.e., no data were appended).
  let newLocalInboxSize = gInboxFile.clone().fileSize;
  info(
    "Local inbox size (after copyFileMessageInLocalFolder()) = " +
      newLocalInboxSize
  );
  copyIntoOver4GiB_success();
}

/**
 * Bug 789679
 * Check that copy operation does allow to grow a local folder above 4 GiB.
 */
function copyIntoOver4GiB_success() {
  allow4GBFolders(true);
  // Append 2 new 2MB messages to the folder.
  gExpectedNewMessages = 2;

  // This message will be preserved in CompactUnder4GB.
  gGotAlert = false;
  let file = do_get_file("../../../data/mime-torture");
  copyFileMessageInLocalFolder(
    file,
    0,
    "",
    gDummyMsgWindow,
    copyIntoOver4GiB_success_check1
  );
}

function copyIntoOver4GiB_success_check1(aMessageHeadersKeys, aStatus) {
  Assert.ok(Components.isSuccessCode(aStatus));
  Assert.equal(aMessageHeadersKeys[0], 60);
  Assert.ok(!gGotAlert);

  // This message will be removed in compactOver4GB.
  let file = do_get_file("../../../data/mime-torture");
  copyFileMessageInLocalFolder(
    file,
    0,
    "",
    gDummyMsgWindow,
    copyIntoOver4GiB_success_check2
  );
}

function copyIntoOver4GiB_success_check2(aMessageHeadersKeys, aStatus) {
  Assert.ok(Components.isSuccessCode(aStatus));
  Assert.equal(aMessageHeadersKeys[1], 61);
  Assert.ok(!gGotAlert);

  Assert.equal(
    FListener.msgsHistory(0),
    FListener.msgsHistory(2) + gExpectedNewMessages
  );

  compactOver4GiB();
}

/**
 * Bug 794303
 * Check we can compact a folder that stays above 4 GiB after compact.
 */
function compactOver4GiB() {
  gInboxSize = gInboxFile.clone().fileSize;
  Assert.ok(gInboxSize > kSizeLimit);
  Assert.equal(gInbox.expungedBytes, 0);
  // Delete the last small message at folder end.
  let doomed = [...gInbox.messages].slice(-1);
  let sizeToExpunge = 0;
  for (let header of doomed) {
    sizeToExpunge = header.messageSize;
  }
  gInbox.deleteMessages(doomed, null, true, false, null, false);
  Assert.equal(gInbox.expungedBytes, sizeToExpunge);

  /* Unfortunately, the compaction now would kill the sparse markings in the file
   * so it will really take 4GiB of space in the filesystem and may be slow
   * (e.g. it takes ~450s on TB-try). Therefore we run this part of the test randomly,
   * only in 1 of 100 runs. Considering the number of times all the tests are run
   * per check-in, this still runs this test after several check-ins.*/
  if (Math.random() * 100 < 1) {
    // Note: compact() will also add 'X-Mozilla-Status' and 'X-Mozilla-Status2'
    // lines to message(s).
    gInbox.compact(CompactListener_compactOver4GiB, null);
    // Execution continues in compactUnder4GiB() when done.
  } else {
    // Just continue directly without compacting yet.
    dump(
      "compactOver4GiB test skipped deliberately due to long expected run time. It will be run in other test run with a 1 in 100 chance."
    );
    compactUnder4GiB();
  }
}

/**
 * Bug 608449
 * Check we can compact a folder to get it under 4 GiB.
 */
function compactUnder4GiB() {
  // The folder is still above 4GB.
  Assert.ok(gInboxFile.clone().fileSize > kSizeLimit);
  let folderSize = gInbox.sizeOnDisk;
  let totalMsgs = gInbox.getTotalMessages(false);
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
  let doomed = [...gInbox.messages].slice(0, -1);
  let sizeToExpunge = gInbox.expungedBytes; // If compact in compactOver4GB was skipped, this is not 0.
  for (let header of doomed) {
    sizeToExpunge += header.messageSize;
  }
  gInbox.deleteMessages(doomed, null, true, false, null, false);

  // Bug 894012: size of messages to expunge is now higher than 4GB.
  // Only the small 1MiB message remains.
  Assert.equal(gInbox.expungedBytes, sizeToExpunge);
  Assert.ok(sizeToExpunge > kSizeLimit);

  // Note: compact() will also add 'X-Mozilla-Status' and 'X-Mozilla-Status2'
  // lines to message(s).
  gInbox.compact(CompactListener_compactUnder4GiB, null);
  // Test ends after compaction is done.
}

var ParseListener_run_test = {
  OnStartRunningUrl(aUrl) {},
  OnStopRunningUrl(aUrl, aExitCode) {
    // Check: reparse successful
    Assert.equal(aExitCode, Cr.NS_OK);
    Assert.notEqual(gInbox.msgDatabase, null);
    Assert.ok(gInbox.msgDatabase.summaryValid);
    // Bug 813459
    // Check if the OnItemIntPropertyChanged folder listener hook can return
    // values below 2^32 for properties which are not 64 bits long.
    Assert.equal(FListener.msgsHistory(0), gExpectedNewMessages);
    Assert.equal(FListener.msgsHistory(0), gInbox.getTotalMessages(false));
    Assert.equal(FListener.sizeHistory(0), gInbox.sizeOnDisk);

    downloadUnder4GiB();
  },
};

var CompactListener_compactOver4GiB = {
  OnStartRunningUrl(aUrl) {},
  OnStopRunningUrl(aUrl, aExitCode) {
    // Check: message successfully copied.
    Assert.equal(aExitCode, Cr.NS_OK);
    Assert.ok(gInbox.msgDatabase.summaryValid);
    // Check that folder size is still above max limit ...
    let localInboxSize = gInbox.filePath.clone().fileSize;
    info("Local inbox size (after compact 1) = " + localInboxSize);
    Assert.ok(localInboxSize > kSizeLimit);
    // ... but it got smaller by removing 1 message.
    Assert.ok(gInboxSize > localInboxSize);
    Assert.equal(gInbox.sizeOnDisk, localInboxSize);

    compactUnder4GiB();
  },
};

var CompactListener_compactUnder4GiB = {
  OnStartRunningUrl(aUrl) {},
  OnStopRunningUrl(aUrl, aExitCode) {
    // Check: message successfully copied.
    Assert.equal(aExitCode, Cr.NS_OK);
    Assert.ok(gInbox.msgDatabase.summaryValid);

    // Check that folder size isn't much bigger than our sparse block size, ...
    let localInboxSize = gInbox.filePath.clone().fileSize;
    info("Local inbox size (after compact 2) = " + localInboxSize);
    Assert.equal(gInbox.sizeOnDisk, localInboxSize);
    Assert.ok(localInboxSize < kSparseBlockSize + 1000);
    // ... i.e., that we just have one message.
    Assert.equal(gInbox.getTotalMessages(false), 1);
    Assert.equal(FListener.sizeHistory(0), gInbox.sizeOnDisk);
    Assert.equal(FListener.msgsHistory(0), 1);

    // The message has its key preserved in compact.
    Assert.equal([...gInbox.messages][0].messageKey, 60);

    endTest();
  },
};

function endTest() {
  MailServices.mailSession.RemoveFolderListener(FListener);
  // Free up disk space - if you want to look at the file after running
  // this test, comment out this line.
  gInbox.filePath.remove(false);
  Services.prefs.clearUserPref("mailnews.allowMboxOver4GB");

  do_test_finished();
}
