/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

 /*
  * Test suite for folder compaction
  *
  * Currently tested:
  * - Compacting local folders
  * TODO
  * - Compacting imap offline stores.
  */

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

// Globals
var gMsgFile1, gMsgFile2, gMsgFile3;
var gMsg1ID = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gMsg2ID = "200804111417.m3BEHTk4030129@mrapp51.mozilla.org";
var gMsg3ID = "4849BF7B.2030800@example.com";
var gLocalFolder2;
var gLocalFolder3;
var gLocalTrashFolder;
var gCurTestNum;
// After a compact (or other operation), this is what we expect the 
// folder size to be.
var gExpectedFolderSize;
var gMsgHdrs = new Array();
var gExpectedInboxSize;
var gExpectedFolder2Size;
var gExpectedFolder3Size;

// Transfer message keys between function calls.
var gMsgKeys = [];

// nsIMsgCopyServiceListener implementation
var copyListenerWrap = 
{
  SetMessageKey: function(aKey)
  {
    let hdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
    gMsgHdrs.push({hdr: hdr, ID: hdr.messageId});
  },
  OnStopCopy: function(aStatus)
  {
    // Check: message successfully copied.
    do_check_eq(aStatus, 0);
  }
};

var urlListenerWrap =
{
  OnStopRunningUrl: function (aUrl, aExitCode) {
    // Check: message successfully copied.
    do_check_eq(aExitCode, 0);

    if (gMsgKeys.length > 0) {
      // Bug 854798: Check if the new message keys are the same as before compaction.
      let folderMsgs = gMsgKeys.folder.messages;
      // First message was deleted so skip it in the old array.
      for (let i = 1; i < gMsgKeys.length; i++) {
        do_check_true(folderMsgs.hasMoreElements());
        let header = folderMsgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
        do_check_eq(header.messageKey, gMsgKeys[i]);
      }
      do_check_false(folderMsgs.hasMoreElements());
      gMsgKeys.length = 0;
    }
  }
};

function copyFileMessage(file, destFolder, isDraftOrTemplate)
{
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  MailServices.copy.CopyFileMessage(file, destFolder, null, isDraftOrTemplate, 0, "", listener, null);
  return listener.promise;
}

function copyMessages(items, isMove, srcFolder, destFolder)
{
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  var array = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  items.forEach(function (item) {
    array.appendElement(item, false);
  });
  MailServices.copy.CopyMessages(srcFolder, array, destFolder, isMove, listener, null, true);
  return listener.promise;
}

function deleteMessages(srcFolder, items)
{
  var array = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  items.forEach(function (item) {
    array.appendElement(item, false);
  });
  
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  srcFolder.deleteMessages(array, null, false, true, listener, true);
  return listener.promise;
}

function calculateFolderSize(folder)
{
  let msgDB = folder.msgDatabase;
  let enumerator = msgDB.EnumerateMessages();
  let totalSize = 0;
  if (enumerator)
  {
    while (enumerator.hasMoreElements())
    {
      var header = enumerator.getNext();
      if (header instanceof Components.interfaces.nsIMsgDBHdr)
        totalSize += header.messageSize;
    }
  }
  return totalSize;
}

function verifyMsgOffsets(folder)
{
  let msgDB = folder.msgDatabase;
  let enumerator = msgDB.EnumerateMessages();
  if (enumerator)
  {
    while (enumerator.hasMoreElements())
    {
      let header = enumerator.getNext();
      if (header instanceof Components.interfaces.nsIMsgDBHdr) {
        let storeToken = header.getStringProperty("storeToken");
        do_check_eq(storeToken, header.messageOffset);
      }
    }
  }
}

/*
 * TESTS
 */

// Beware before commenting out a test -- later tests might just depend on earlier ones
var gTestArray =
[
  // Copying messages from files
  function* testCopyFileMessage1() {
    yield copyFileMessage(gMsgFile1, localAccountUtils.inboxFolder, false);
  },
  function* testCopyFileMessage2() {
    yield copyFileMessage(gMsgFile2, localAccountUtils.inboxFolder, false);
  },
  function* testCopyFileMessage3() {
    yield copyFileMessage(gMsgFile3, localAccountUtils.inboxFolder, true);
    showMessages(localAccountUtils.inboxFolder, "after initial 3 messages copy to inbox");
  },

  // Moving/copying messages
  function* testCopyMessages1() {
    yield copyMessages([gMsgHdrs[0].hdr], false, localAccountUtils.inboxFolder, gLocalFolder2);
  },
  function* testCopyMessages2() {
    yield copyMessages([gMsgHdrs[1].hdr, gMsgHdrs[2].hdr], false, localAccountUtils.inboxFolder, gLocalFolder2);
    showMessages(gLocalFolder2, "after copying 3 messages");
  },
  function* testMoveMessages1() {
    yield copyMessages([gMsgHdrs[0].hdr, gMsgHdrs[1].hdr], true, localAccountUtils.inboxFolder, gLocalFolder3);

    showMessages(localAccountUtils.inboxFolder, "after moving 2 messages");
    showMessages(gLocalFolder3, "after moving 2 messages");
  },

  // Deleting messages
  function* testDeleteMessages1() { // delete to trash
    // Let's take a moment to re-initialize stuff that got moved
    var folder3DB = gLocalFolder3.msgDatabase;
    gMsgHdrs[0].hdr = folder3DB.getMsgHdrForMessageID(gMsgHdrs[0].ID);

    // Store message keys before deletion and compaction.
    gMsgKeys.folder = gLocalFolder3;
    let folderMsgs = gLocalFolder3.messages;
    while (folderMsgs.hasMoreElements()) {
      let header = folderMsgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      gMsgKeys.push(header.messageKey);
    }

    // Now delete the message
    yield deleteMessages(gLocalFolder3, [gMsgHdrs[0].hdr], false, false);

    showMessages(gLocalFolder3, "after deleting 1 message to trash");
  },
  function* compactFolder()
  {
    gExpectedFolderSize = calculateFolderSize(gLocalFolder3);
    do_check_neq(gLocalFolder3.expungedBytes, 0);
    let listener = new PromiseTestUtils.PromiseUrlListener(urlListenerWrap);
    gLocalFolder3.compact(listener, null);
    yield listener.promise;

    showMessages(gLocalFolder3, "after compact");
  },
  function* testDeleteMessages2() {
    do_check_eq(gExpectedFolderSize, gLocalFolder3.filePath.fileSize);
    verifyMsgOffsets(gLocalFolder3);
    var folder2DB = gLocalFolder2.msgDatabase;
    gMsgHdrs[0].hdr = folder2DB.getMsgHdrForMessageID(gMsgHdrs[0].ID);

    // Store message keys before deletion and compaction.
    gMsgKeys.folder = gLocalFolder2;
    let folderMsgs = gLocalFolder2.messages;
    while (folderMsgs.hasMoreElements()) {
      let header = folderMsgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      gMsgKeys.push(header.messageKey);
    }

    // Now delete the message
    yield deleteMessages(gLocalFolder2, [gMsgHdrs[0].hdr], false, false);

    showMessages(gLocalFolder2, "after deleting 1 message");
  },
  function* compactAllFolders()
  {
    gExpectedInboxSize = calculateFolderSize(localAccountUtils.inboxFolder);
    gExpectedFolder2Size = calculateFolderSize(gLocalFolder2);
    gExpectedFolder3Size = calculateFolderSize(gLocalFolder3);

    // Save the first message key, which will change after compact with
    // rebuild.
    let f2m2Key =
      gLocalFolder2.msgDatabase.getMsgHdrForMessageID(gMsg2ID).messageKey;

    // force expunged bytes count to get cached.
    let localFolder2ExpungedBytes = gLocalFolder2.expungedBytes;
    // mark localFolder2 as having an invalid db, and remove it
    // for good measure.
    gLocalFolder2.msgDatabase.summaryValid = false;
    gLocalFolder2.msgDatabase = null;
    gLocalFolder2.ForceDBClosed();
    let dbPath = gLocalFolder2.filePath;
    dbPath.leafName = dbPath.leafName + ".msf";
    dbPath.remove(false);

    showMessages(localAccountUtils.inboxFolder, "before compactAll");
    // Save the key for the inbox message, we'll check after compact that it
    // did not change.
    let preInboxMsg3Key = localAccountUtils.inboxFolder.msgDatabase
                                           .getMsgHdrForMessageID(gMsg3ID)
                                           .messageKey;

    // We used to check here that the keys did not change during rebuild.
    // But that is no true in general, it was only conicidental since the
    // checked folder had never been compacted, so the key equaled the offset.
    // We do not in guarantee that, indeed after rebuild we expect the keys
    // to change.
    let checkResult = {
      OnStopRunningUrl: function (aUrl, aExitCode) {
      // Check: message successfully compacted.
      do_check_eq(aExitCode, 0);
      }
    };
    let listener = new PromiseTestUtils.PromiseUrlListener(checkResult);
    localAccountUtils.inboxFolder.compactAll(listener, null, true);
    yield listener.promise;

    showMessages(localAccountUtils.inboxFolder, "after compactAll");
    showMessages(gLocalFolder2, "after compactAll");

    // For the inbox, which was compacted but not rebuild, key is unchanged.
    let postInboxMsg3Key = localAccountUtils.inboxFolder.msgDatabase
                                            .getMsgHdrForMessageID(gMsg3ID)
                                            .messageKey;
    do_check_eq(preInboxMsg3Key, postInboxMsg3Key);

    // For folder2, which was rebuilt, keys change but all messages should exist.
    let message2 = gLocalFolder2.msgDatabase.getMsgHdrForMessageID(gMsg2ID);
    do_check_true(message2);
    do_check_true(gLocalFolder2.msgDatabase.getMsgHdrForMessageID(gMsg3ID));

    // In folder2, gMsg2ID is the first message. After compact with database
    // rebuild, that key has now changed.
    do_check_neq(message2.messageKey, f2m2Key);
  },
  function lastTestCheck()
  {
    do_check_eq(gExpectedInboxSize, localAccountUtils.inboxFolder.filePath.fileSize);
    do_check_eq(gExpectedFolder2Size, gLocalFolder2.filePath.fileSize);
    do_check_eq(gExpectedFolder3Size, gLocalFolder3.filePath.fileSize);
    verifyMsgOffsets(gLocalFolder2);
    verifyMsgOffsets(gLocalFolder3);
    verifyMsgOffsets(localAccountUtils.inboxFolder);
  }
];

function run_test()
{
  localAccountUtils.loadLocalMailAccount();
  // Load up some messages so that we can copy them in later.
  gMsgFile1 = do_get_file("../../../data/bugmail10");
  gMsgFile2 = do_get_file("../../../data/bugmail11");
  gMsgFile3 = do_get_file("../../../data/draft1");

  // Create another folder to move and copy messages around, and force initialization.
  gLocalFolder2 = localAccountUtils.rootFolder.createLocalSubfolder("folder2");
  let folderName = gLocalFolder2.prettiestName;
  // Create a third folder for more testing.
  gLocalFolder3 = localAccountUtils.rootFolder.createLocalSubfolder("folder3");
  folderName = gLocalFolder3.prettiestName;

  gTestArray.forEach(add_task);
  run_next_test();
}

// debug utility to show the key/offset/ID relationship of messages in a folder
function showMessages(folder, text)
{
  dump("Show messages for folder <" + folder.name + "> " + text + "\n");
  let folderMsgs = folder.messages;
  while (folderMsgs.hasMoreElements()) {
    let header = folderMsgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    dump("key: " + header.messageKey +
          " offset: " + header.messageOffset +
          " ID: " + header.messageId +
          "\n");
  }
}
