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

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

// Globals
var gMsgFile1, gMsgFile2, gMsgFile3;
var gMsg2ID = "200804111417.m3BEHTk4030129@mrapp51.mozilla.org";
var gMsg3ID = "4849BF7B.2030800@example.com";
var gLocalFolder2;
var gLocalFolder3;
// After a compact (or other operation), this is what we expect the
// folder size to be.
var gExpectedFolderSize;
var gMsgHdrs = [];
var gExpectedInboxSize;
var gExpectedFolder2Size;
var gExpectedFolder3Size;
// Use this to account for the size of the separating line after the message
// body. The compactor tries to preserve the convention already in the mbox,
// and we know that our test messages have CRLFs, so that's what we'll use.
var gSeparatorLine = "\r\n";

// Transfer message keys between function calls.
var gMsgKeys = [];

// nsIMsgCopyServiceListener implementation
var copyListenerWrap = {
  SetMessageKey(aKey) {
    let hdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
    gMsgHdrs.push({ hdr, ID: hdr.messageId });
  },
  OnStopCopy(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
  },
};

var urlListenerWrap = {
  OnStopRunningUrl(aUrl, aExitCode) {
    // Check: message successfully copied.
    Assert.equal(aExitCode, 0);

    if (gMsgKeys.length > 0) {
      // Bug 854798: Check if the new message keys are the same as before compaction.
      let folderMsgs = [...gMsgKeys.folder.messages];
      // First message was deleted so skip it in the old array.
      let expectedKeys = [...gMsgKeys].slice(1);
      Assert.equal(folderMsgs.length, expectedKeys.length);
      for (let i = 1; i < expectedKeys.length; i++) {
        Assert.equal(folderMsgs[i], expectedKeys[i]);
      }
      gMsgKeys.length = 0;
    }
  },
};

function copyFileMessage(file, destFolder, isDraftOrTemplate) {
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  MailServices.copy.copyFileMessage(
    file,
    destFolder,
    null,
    isDraftOrTemplate,
    0,
    "",
    listener,
    null
  );
  return listener.promise;
}

function copyMessages(items, isMove, srcFolder, destFolder) {
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  MailServices.copy.copyMessages(
    srcFolder,
    items,
    destFolder,
    isMove,
    listener,
    null,
    true
  );
  return listener.promise;
}

function deleteMessages(srcFolder, items) {
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  srcFolder.deleteMessages(items, null, false, true, listener, true);
  return listener.promise;
}

function calculateFolderSize(folder) {
  let msgDB = folder.msgDatabase;
  let totalSize = 0;
  for (let header of msgDB.enumerateMessages()) {
    totalSize += header.messageSize + gSeparatorLine.length;
  }
  return totalSize;
}

function verifyMsgOffsets(folder) {
  let msgDB = folder.msgDatabase;
  let enumerator = msgDB.enumerateMessages();
  if (enumerator) {
    for (let header of enumerator) {
      if (header instanceof Ci.nsIMsgDBHdr) {
        let storeToken = header.getStringProperty("storeToken");
        Assert.equal(storeToken, header.messageOffset);
      }
    }
  }
}

/*
 * TESTS
 */

// Beware before commenting out a test -- later tests might just depend on earlier ones
var gTestArray = [
  // Copying messages from files
  async function testCopyFileMessage1() {
    await copyFileMessage(gMsgFile1, localAccountUtils.inboxFolder, false);
  },
  async function testCopyFileMessage2() {
    await copyFileMessage(gMsgFile2, localAccountUtils.inboxFolder, false);
  },
  async function testCopyFileMessage3() {
    await copyFileMessage(gMsgFile3, localAccountUtils.inboxFolder, true);
    showMessages(
      localAccountUtils.inboxFolder,
      "after initial 3 messages copy to inbox"
    );
  },

  // Moving/copying messages
  async function testCopyMessages1() {
    await copyMessages(
      [gMsgHdrs[0].hdr],
      false,
      localAccountUtils.inboxFolder,
      gLocalFolder2
    );
  },
  async function testCopyMessages2() {
    await copyMessages(
      [gMsgHdrs[1].hdr, gMsgHdrs[2].hdr],
      false,
      localAccountUtils.inboxFolder,
      gLocalFolder2
    );
    showMessages(gLocalFolder2, "after copying 3 messages");
  },
  async function testMoveMessages1() {
    await copyMessages(
      [gMsgHdrs[0].hdr, gMsgHdrs[1].hdr],
      true,
      localAccountUtils.inboxFolder,
      gLocalFolder3
    );

    showMessages(localAccountUtils.inboxFolder, "after moving 2 messages");
    showMessages(gLocalFolder3, "after moving 2 messages");
  },

  // Deleting messages
  async function testDeleteMessages1() {
    // delete to trash
    // Let's take a moment to re-initialize stuff that got moved
    var folder3DB = gLocalFolder3.msgDatabase;
    gMsgHdrs[0].hdr = folder3DB.getMsgHdrForMessageID(gMsgHdrs[0].ID);

    // Store message keys before deletion and compaction.
    gMsgKeys.folder = gLocalFolder3;
    for (let header of gLocalFolder3.messages) {
      gMsgKeys.push(header.messageKey);
    }

    // Now delete the message
    await deleteMessages(gLocalFolder3, [gMsgHdrs[0].hdr]);

    showMessages(gLocalFolder3, "after deleting 1 message to trash");
  },
  async function compactFolder() {
    gExpectedFolderSize = calculateFolderSize(gLocalFolder3);
    Assert.notEqual(gLocalFolder3.expungedBytes, 0);
    let listener = new PromiseTestUtils.PromiseUrlListener(urlListenerWrap);
    gLocalFolder3.compact(listener, null);
    await listener.promise;

    showMessages(gLocalFolder3, "after compact");
  },
  async function testDeleteMessages2() {
    Assert.equal(gExpectedFolderSize, gLocalFolder3.filePath.fileSize);
    verifyMsgOffsets(gLocalFolder3);
    var folder2DB = gLocalFolder2.msgDatabase;
    gMsgHdrs[0].hdr = folder2DB.getMsgHdrForMessageID(gMsgHdrs[0].ID);

    // Store message keys before deletion and compaction.
    gMsgKeys.folder = gLocalFolder2;
    for (let header of gLocalFolder2.messages) {
      gMsgKeys.push(header.messageKey);
    }

    // Now delete the message
    await deleteMessages(gLocalFolder2, [gMsgHdrs[0].hdr]);

    showMessages(gLocalFolder2, "after deleting 1 message");
  },
  async function compactAllFolders() {
    gExpectedInboxSize = calculateFolderSize(localAccountUtils.inboxFolder);
    gExpectedFolder2Size = calculateFolderSize(gLocalFolder2);
    gExpectedFolder3Size = calculateFolderSize(gLocalFolder3);

    // Save the first message key, which will change after compact with
    // rebuild.
    let f2m2Key =
      gLocalFolder2.msgDatabase.getMsgHdrForMessageID(gMsg2ID).messageKey;

    // force expunged bytes count to get cached.
    gLocalFolder2.expungedBytes;
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
    let preInboxMsg3Key =
      localAccountUtils.inboxFolder.msgDatabase.getMsgHdrForMessageID(
        gMsg3ID
      ).messageKey;

    // We used to check here that the keys did not change during rebuild.
    // But that is no true in general, it was only conicidental since the
    // checked folder had never been compacted, so the key equaled the offset.
    // We do not in guarantee that, indeed after rebuild we expect the keys
    // to change.
    let checkResult = {
      OnStopRunningUrl(aUrl, aExitCode) {
        // Check: message successfully compacted.
        Assert.equal(aExitCode, 0);
      },
    };
    let listener = new PromiseTestUtils.PromiseUrlListener(checkResult);
    localAccountUtils.inboxFolder.compactAll(listener, null);
    await listener.promise;

    showMessages(localAccountUtils.inboxFolder, "after compactAll");
    showMessages(gLocalFolder2, "after compactAll");

    // For the inbox, which was compacted but not rebuild, key is unchanged.
    let postInboxMsg3Key =
      localAccountUtils.inboxFolder.msgDatabase.getMsgHdrForMessageID(
        gMsg3ID
      ).messageKey;
    Assert.equal(preInboxMsg3Key, postInboxMsg3Key);

    // For folder2, which was rebuilt, keys change but all messages should exist.
    let message2 = gLocalFolder2.msgDatabase.getMsgHdrForMessageID(gMsg2ID);
    Assert.ok(message2);
    Assert.ok(gLocalFolder2.msgDatabase.getMsgHdrForMessageID(gMsg3ID));

    // In folder2, gMsg2ID is the first message. After compact with database
    // rebuild, that key has now changed.
    Assert.notEqual(message2.messageKey, f2m2Key);
  },
  function lastTestCheck() {
    Assert.equal(
      gExpectedInboxSize,
      localAccountUtils.inboxFolder.filePath.fileSize
    );
    Assert.equal(gExpectedFolder2Size, gLocalFolder2.filePath.fileSize);
    Assert.equal(gExpectedFolder3Size, gLocalFolder3.filePath.fileSize);
    verifyMsgOffsets(gLocalFolder2);
    verifyMsgOffsets(gLocalFolder3);
    verifyMsgOffsets(localAccountUtils.inboxFolder);
  },
];

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  // Load up some messages so that we can copy them in later.
  gMsgFile1 = do_get_file("../../../data/bugmail10");
  gMsgFile2 = do_get_file("../../../data/bugmail11");
  gMsgFile3 = do_get_file("../../../data/draft1");

  // Create another folder to move and copy messages around, and force initialization.
  gLocalFolder2 = localAccountUtils.rootFolder.createLocalSubfolder("folder2");

  // Create a third folder for more testing.
  gLocalFolder3 = localAccountUtils.rootFolder.createLocalSubfolder("folder3");

  gTestArray.forEach(x => add_task(x));
  run_next_test();
}

// debug utility to show the key/offset/ID relationship of messages in a folder
function showMessages(folder, text) {
  dump(`***** Show messages for folder <${folder.name}> "${text} *****\n`);
  for (let hdr of folder.messages) {
    dump(
      `  key: ${hdr.messageKey} offset: ${hdr.messageOffset} size: ${hdr.messageSize} ID: ${hdr.messageId}\n`
    );
  }
}
