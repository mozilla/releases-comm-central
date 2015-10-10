/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that operations around the 4GiB folder size boundary work correctly.
 * This test only works for mbox format mail folders.
 * Some of the tests will be removed when support for over 4GiB folders is enabled by default.
 * The test functions are executed in this order:
 * - run_test
 * -  ParseListener_run_test
 * - downloadUnder4GiB
 * - downloadOver4GiB
 * - growOver4GiB
 * -  ParseListener_growOver4GiB
 * - copyIntoOver4GiB
 * -  ParseListener_copyIntoOver4GiB
 * - compactOver4GiB
 * -  CompactListener_compactOver4GiB
 * - compactUnder4GiB
 * -  CompactListener_compactUnder4GiB
 */

load("../../../resources/asyncTestUtils.js");
load("../../../resources/alertTestUtils.js");
load("../../../resources/messageGenerator.js");
load("../../../resources/POP3pump.js");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

// If we're running out of memory parsing the folder, lowering the
// block size might help, though it will slow the test down and consume
// more disk space.
var kSparseBlockSize = 102400000;
var kSizeLimit = 0x100000000; // 4GiB
var kNearLimit = kSizeLimit - 0x1000000; // -16MiB

var gGotAlert = false;
var gInboxFile = null;         // The mbox file storing the Inbox folder
var gInboxSize = 0;            // The size of the Inbox folder
var gInbox;                    // The nsIMsgFolder object of the Inbox folder in Local Folders
var gExpectedNewMessages = 0;  // The number of messages pushed manually into the mbox file

// This alert() is triggered when file size becomes close (enough) to or
// exceeds 4 GiB.
// See hardcoded value in nsMsgBrkMBoxStore::HasSpaceAvailable().
function alert(aDialogTitle, aText) {
  // See "/*/locales/en-US/chrome/*/messenger.properties > mailboxTooLarge".
  do_check_true(aText.startsWith("The folder Inbox is full, and can't hold any more messages."));
  gGotAlert = true;
}

// A stub nsIMsgFolderListener that only listens to changes on Inbox and stores
// the seen values for interesting folder properties so we can later test them.
var FListener = {
  folderSize: [-1], // an array of seen values of "FolderSize"
  totalMsgs: [-1],  // an array of seen values of "TotalMessages"

  // Returns the value that is stored 'aBack' entries from the last one in the history.
  sizeHistory: function (aBack) {
    return this.folderSize[this.folderSize.length - 1 - aBack];
  },
  msgsHistory: function (aBack) {
    return this.totalMsgs[this.totalMsgs.length - 1 - aBack];
  },

  OnItemAdded: function act_add(aRDFParentItem, aItem) {},
  OnItemRemoved: function act_remove(aRDFParentItem, aItem) {},
  OnItemPropertyChanged: function(aItem, aProperty, aOld, aNew) {},
  OnItemIntPropertyChanged: function(aItem, aProperty, aOld, aNew) {
    if (aItem === gInbox) {
      dump("Property change on folder Inbox:" + aProperty + "=" + aOld + "->" + aNew + "\n");
      if (aProperty == "FolderSize")
        this.folderSize.push(aNew);
      else if (aProperty == "TotalMessages")
        this.totalMsgs.push(aNew);
    }
  },
  OnItemBoolPropertyChanged: function(aItem, aProperty, aOld, aNew) {},
  OnItemUnicharPropertyChanged: function(aItem, aProperty, aOld, aNew) {},
  OnItemPropertyFlagChanged: function(aItem, aProperty, aOld, aNew) {},
  OnItemEvent: function(aFolder, aEvent) {},
};

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
    let sparseStart = gInboxFile.fileSize + mboxString.length;
    let nextOffset = Math.min(sparseStart + kSparseBlockSize, aWantedSize - 2);
    if ((aWantedSize - (nextOffset + 2)) < (mboxString.length + 2))
      nextOffset = aWantedSize - 2;

    // Get stream to write a new message.
    let reusable = new Object;
    let newMsgHdr = new Object;
    let outputStream = plugStore.getNewMsgOutputStream(gInbox, newMsgHdr, reusable)
                                .QueryInterface(Ci.nsISeekableStream);
    // Write message header.
    outputStream.write(mboxString, mboxString.length);
    outputStream.close();

    // "Add" a new (empty) sparse block at the end of the file.
    if (nextOffset - sparseStart == kSparseBlockSize)
      mailTestUtils.mark_file_region_sparse(gInboxFile, sparseStart, kSparseBlockSize);

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
    localSize = gInboxFile.fileSize;
  }
  while (localSize < aWantedSize);

  do_check_eq(gInboxFile.fileSize, aWantedSize);
  do_print("Local inbox size = " + localSize + "bytes = " +
           mailTestUtils.toMiBString(localSize));
  do_check_eq(localSize, aWantedSize);
  return msgsAdded;
}

function run_test()
{
  localAccountUtils.loadLocalMailAccount();

  // "Master" do_test_pending(), paired with a do_test_finished() at the end of
  // all the operations.
  do_test_pending();

  gInbox = localAccountUtils.inboxFolder;
  gInboxFile = gInbox.filePath;

  let neededFreeSpace = kSizeLimit + 0x10000000; // +256MiB
  // On Windows, check whether the drive is NTFS. If it is, mark the file as
  // sparse. If it isn't, then bail out now, because in all probability it is
  // FAT32, which doesn't support file sizes greater than 4 GiB.
  if ("@mozilla.org/windows-registry-key;1" in Cc &&
      mailTestUtils.get_file_system(gInboxFile) != "NTFS")
  {
    dump("On Windows, this test only works on NTFS volumes.\n");

    endTest();
    return;
  }

  let freeDiskSpace = gInboxFile.diskSpaceAvailable;
  do_print("Free disk space = " + mailTestUtils.toMiBString(freeDiskSpace));
  if (freeDiskSpace < neededFreeSpace) {
    do_print("This test needs " + mailTestUtils.toMiBString(neededFreeSpace) +
             " free space to run. Aborting.");
    todo_check_true(false);

    endTest();
    return;
  }

  MailServices.mailSession.AddFolderListener(FListener, Ci.nsIFolderListener.all);

  // Grow inbox to a size near the max limit.
  gExpectedNewMessages = growInbox(kNearLimit);

  // Force the db closed, so that getDatabaseWithReparse will notice
  // that it's out of date.
  gInbox.msgDatabase.ForceClosed();
  gInbox.msgDatabase = null;
  try {
    gInbox.getDatabaseWithReparse(ParseListener_run_test, gDummyMsgWindow);
  } catch (ex) {
    do_check_eq(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
  }
  // Execution continues in downloadUnder4GiB() when done.
}

/**
 * Check we can download new mail when we are near 4GiB limit but do not cross it.
 */
function downloadUnder4GiB()
{
  // Check fake POP3 server is ready.
  do_check_neq(gPOP3Pump.fakeServer, null);

  // Download a file that still fits into the limit.
  let bigFile = do_get_file("../../../data/mime-torture");
  do_check_true(bigFile.fileSize >= 1024 * 1024);
  do_check_true(bigFile.fileSize <= 1024 * 1024 * 2);

  gPOP3Pump.files = ["../../../data/mime-torture"];
  gPOP3Pump.onDone = downloadOver4GiB;
  // It must succeed.
  gPOP3Pump.run(0);
  // Execution continues in downloadOver4GiB() when done.
}

/**
 * Bug 640371
 * Check we will not cross the 4GiB limit when downloading new mail.
 */
function downloadOver4GiB()
{
  let localInboxSize = gInboxFile.clone().fileSize;
  do_check_true(localInboxSize >= kNearLimit);
  do_check_true(localInboxSize < kSizeLimit);
  do_check_eq(gInbox.sizeOnDisk, localInboxSize);
  // The big file is between 1 and 2 MiB. Append it 16 times to attempt to cross the 4GiB limit.
  gPOP3Pump.files = ["../../../data/mime-torture", "../../../data/mime-torture",
                     "../../../data/mime-torture", "../../../data/mime-torture",
                     "../../../data/mime-torture", "../../../data/mime-torture",
                     "../../../data/mime-torture", "../../../data/mime-torture",
                     "../../../data/mime-torture", "../../../data/mime-torture",
                     "../../../data/mime-torture", "../../../data/mime-torture",
                     "../../../data/mime-torture", "../../../data/mime-torture",
                     "../../../data/mime-torture", "../../../data/mime-torture"];
  gPOP3Pump.onDone = growOver4GiB;
  // The download must fail.
  gPOP3Pump.run(2147500037);
  // Execution continues in growOver4GiB() when done.
}

/**
 * Bug 608449
 * Check we can parse a folder if it is above 4GiB.
 */
function growOver4GiB()
{
  gPOP3Pump = null;

  // Grow inbox to size greater than the max limit (+16 MiB).
  gExpectedNewMessages = growInbox(kSizeLimit + 0x1000000);
  do_check_true(gInboxFile.fileSize > kSizeLimit);

  // Force the db closed, so that getDatabaseWithReparse will notice
  // that it's out of date.
  gInbox.msgDatabase.ForceClosed();
  gInbox.msgDatabase = null;
  try {
    gInbox.getDatabaseWithReparse(ParseListener_growOver4GiB, gDummyMsgWindow);
  } catch (ex) {
    do_check_eq(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
  }
  // Execution continues in copyOver4GiB() when done.
}

/**
 * Bug 598104
 * Check that copy operation does not allow to grow a local folder above 4 GiB.
 */
function copyIntoOver4GiB()
{
  // Save initial file size.
  let localInboxSize = gInboxFile.fileSize;
  do_print("Local inbox size (before copyFileMessageInLocalFolder()) = " +
           localInboxSize);

  // Use copyFileMessageInLocalFolder() to (try to) append another message
  // to local inbox.
  let file = do_get_file("../../../data/multipart-complex2");
  copyFileMessageInLocalFolder(file, 0, "", gDummyMsgWindow,
                               function(aMessageHeadersKeys, aStatus) {
    do_check_false(Components.isSuccessCode(aStatus));
  });
  do_check_true(gGotAlert);

  // Make sure inbox file did not grow (i.e., no data were appended).
  let newLocalInboxSize = gInboxFile.fileSize;
  do_print("Local inbox size (after copyFileMessageInLocalFolder()) = " +
           newLocalInboxSize);
  do_check_eq(newLocalInboxSize, localInboxSize);

  // Append 2 new small messages to the folder (+1 MiB each).
  growInbox(gInboxFile.fileSize + 0x100000); // will be removed in compactOver4GB
  growInbox(gInboxFile.fileSize + 0x100000); // will be preserved in CompactUnder4GB
  do_check_true(gInboxFile.fileSize > kSizeLimit);

  // Force the db closed, so that getDatabaseWithReparse will notice
  // that it's out of date.
  gInbox.msgDatabase.ForceClosed();
  gInbox.msgDatabase = null;
  try {
    gInbox.getDatabaseWithReparse(ParseListener_copyIntoOver4GiB, gDummyMsgWindow);
  } catch (ex) {
    do_check_eq(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
  }
  // Execution continues in compactOver4GiB() when done.
}

/**
 * Bug 794303
 * Check we can compact a folder that stays above 4 GiB after compact.
 */
function compactOver4GiB()
{
  gInboxSize = gInboxFile.fileSize;
  do_check_true(gInboxSize > kSizeLimit);
  // Delete the last small message at folder end.
  let enumerator = gInbox.messages;
  let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  let sizeToExpunge = 0;
  while (enumerator.hasMoreElements()) {
    let header = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    if (!enumerator.hasMoreElements()) {
      messages.appendElement(header, false);
      sizeToExpunge = header.messageSize;
    }
  }
  gInbox.deleteMessages(messages, null, true, false, null, false);
  do_check_eq(gInbox.expungedBytes, sizeToExpunge);

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
    dump("compactOver4GiB test skipped deliberately due to long expected run time. It will be run in other test run with a 1 in 100 chance.");
    compactUnder4GiB();
  }
}

/**
 * Bug 608449
 * Check we can compact a folder to get it under 4 GiB.
 */
function compactUnder4GiB()
{
  // The folder is still above 4GB.
  do_check_true(gInboxFile.fileSize > kSizeLimit);
  let folderSize = gInbox.sizeOnDisk;
  let totalMsgs = gInbox.getTotalMessages(false);
  // Let's close the database and re-open the folder (hopefully dumping memory caches)
  // and re-reading the values from disk (msg database). That is to test if
  // the values were properly serialized to the database.
  gInbox.ForceDBClosed();
  gInbox.msgDatabase = null;
  gInbox.getDatabaseWOReparse();

  do_check_eq(gInbox.sizeOnDisk, folderSize);
  do_check_eq(gInbox.getTotalMessages(false), totalMsgs);

  // Very last header in folder is retained,
  // but all other preceding headers are marked as deleted.
  let enumerator = gInbox.messages;
  let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  let sizeToExpunge = gInbox.expungedBytes; // If compact in compactOver4GB was skipped, this is not 0.
  while (enumerator.hasMoreElements()) {
    let header = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    if (enumerator.hasMoreElements()) {
      messages.appendElement(header, false);
      sizeToExpunge += header.messageSize;
    }
  }
  gInbox.deleteMessages(messages, null, true, false, null, false);

  // Bug 894012: size of messages to expunge is now higher than 4GB.
  // Only the small 1MiB message remains.
  do_check_eq(gInbox.expungedBytes, sizeToExpunge);
  do_check_true(sizeToExpunge > kSizeLimit);

  // Note: compact() will also add 'X-Mozilla-Status' and 'X-Mozilla-Status2'
  // lines to message(s).
  gInbox.compact(CompactListener_compactUnder4GiB, null);
  // Test ends after compaction is done.
}

var ParseListener_run_test =
{
  OnStartRunningUrl: function (aUrl) {},
  OnStopRunningUrl: function (aUrl, aExitCode) {
    // Check: reparse successful
    do_check_eq(aExitCode, 0);
    do_check_neq(gInbox.msgDatabase, null);
    do_check_true(gInbox.msgDatabase.summaryValid);
    // Bug 813459
    // Check if the OnItemIntPropertyChanged folder listener hook can return
    // values below 2^32 for properties which are not 64 bits long.
    do_check_eq(FListener.msgsHistory(0), gExpectedNewMessages);
    do_check_eq(FListener.msgsHistory(0), gInbox.getTotalMessages(false));
    do_check_eq(FListener.sizeHistory(0), gInbox.sizeOnDisk);

    downloadUnder4GiB();
  }
};

var ParseListener_growOver4GiB =
{
  OnStartRunningUrl: function (aUrl) {},
  OnStopRunningUrl: function (aUrl, aExitCode) {
    // Check: reparse successful
    do_check_eq(aExitCode, 0);
    do_check_neq(gInbox.msgDatabase, null);
    do_check_true(gInbox.msgDatabase.summaryValid);
    // Bug 789679
    // Check if the public SizeOnDisk method can return sizes above 4GB.
    do_check_true(gInbox.sizeOnDisk > kSizeLimit);
    // Bug 813459
    // Check if the OnItemIntPropertyChanged folder listener hook can return
    // values above 2^32 for properties where it is relevant.
    do_check_eq(FListener.sizeHistory(0), gInbox.sizeOnDisk);
    do_check_true(FListener.sizeHistory(1) < FListener.sizeHistory(0));
    do_check_eq(FListener.msgsHistory(0),
                FListener.msgsHistory(1) + gExpectedNewMessages);
    do_check_eq(gInbox.expungedBytes, 0);

    copyIntoOver4GiB();
  }
};

var ParseListener_copyIntoOver4GiB =
{
  OnStartRunningUrl: function (aUrl) {},
  OnStopRunningUrl: function (aUrl, aExitCode) {
    // Check: reparse successful
    do_check_eq(aExitCode, 0);
    do_check_neq(gInbox.msgDatabase, null);
    do_check_true(gInbox.msgDatabase.summaryValid);

    compactOver4GiB();
  }
};

var CompactListener_compactOver4GiB =
{
  OnStartRunningUrl: function (aUrl) {},
  OnStopRunningUrl: function (aUrl, aExitCode) {
    // Check: message successfully copied.
    do_check_eq(aExitCode, 0);
    do_check_true(gInbox.msgDatabase.summaryValid);
    // Check that folder size is still above max limit ...
    let localInboxSize = gInbox.filePath.fileSize;
    do_print("Local inbox size (after compact 1) = " + localInboxSize);
    do_check_true(localInboxSize > kSizeLimit);
    // ... but it got smaller by removing 1 message.
    do_check_true(gInboxSize > localInboxSize);
    do_check_eq(gInbox.sizeOnDisk, localInboxSize);

    compactUnder4GiB();
  }
};

var CompactListener_compactUnder4GiB =
{
  OnStartRunningUrl: function (aUrl) {},
  OnStopRunningUrl: function (aUrl, aExitCode) {
    // Check: message successfully copied.
    do_check_eq(aExitCode, 0);
    do_check_true(gInbox.msgDatabase.summaryValid);

    // Check that folder size isn't much bigger than our sparse block size, ...
    let localInboxSize = gInbox.filePath.fileSize;
    do_print("Local inbox size (after compact 2) = " + localInboxSize);
    do_check_eq(gInbox.sizeOnDisk, localInboxSize);
    do_check_true(localInboxSize < kSparseBlockSize + 1000);
    // ... i.e., that we just have one message.
    do_check_eq(gInbox.getTotalMessages(false), 1);
    do_check_eq(FListener.sizeHistory(0), gInbox.sizeOnDisk);
    do_check_eq(FListener.msgsHistory(0), 1);

    endTest();
  }
};

function endTest()
{
  MailServices.mailSession.RemoveFolderListener(FListener);
  // Free up disk space - if you want to look at the file after running
  // this test, comment out this line.
  gInbox.filePath.remove(false);

  do_test_finished();
}
