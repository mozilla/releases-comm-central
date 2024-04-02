/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test suite for nsIMsgFolderListener events due to local mail folder
 * operations.
 *
 * Currently tested:
 * - Adding new folders
 * - Copy messages from files into the db
 * - Moving and copying one or more messages from one local folder to another
 * - Moving folders, with and without subfolders
 * - Renaming folders
 * - Deleting messages and folders, to trash and from trash (permanently)
 */

/* import-globals-from ../../../test/resources/msgFolderListenerSetup.js */
load("../../../resources/msgFolderListenerSetup.js");

// Globals
var gMsgFile1, gMsgFile2, gMsgFile3;
var gRootFolder;
var gLocalFolder2;
var gLocalFolder3;
var gLocalTrashFolder;

// storeIn takes a string containing the variable to store the new folder in
function addFolder(parent, folderName, storeIn) {
  gExpectedEvents = [
    [MailServices.mfn.folderAdded, parent, folderName, storeIn],
  ];
  // We won't receive a copy listener notification for this
  gCurrStatus |= kStatus.onStopCopyDone;
  parent.createSubfolder(folderName, null);
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

/**
 * This will introduce a new message to the system which will generate an added
 * notification and subsequently a classification notification.  For the
 * classification because no messages have yet been marked as junk and there
 * are no traits configured, aJunkProcessed and aTraitProcessed will be false.
 */
function copyFileMessage(file, destFolder, isDraftOrTemplate) {
  copyListener.mFolderStoredIn = destFolder;
  gExpectedEvents = [
    [MailServices.mfn.msgAdded, gHdrsReceived],
    [MailServices.mfn.msgsClassified, gHdrsReceived, false, false],
  ];
  MailServices.copy.copyFileMessage(
    file,
    destFolder,
    null,
    isDraftOrTemplate,
    0,
    "",
    copyListener,
    null
  );
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

function copyMessages(items, isMove, srcFolder, destFolder) {
  gExpectedEvents = [
    [MailServices.mfn.msgsMoveCopyCompleted, isMove, items, destFolder, true],
  ];
  MailServices.copy.copyMessages(
    srcFolder,
    items,
    destFolder,
    isMove,
    copyListener,
    null,
    true
  );
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

function copyFolder(srcFolder, isMove, destFolder) {
  gExpectedEvents = [
    [MailServices.mfn.folderMoveCopyCompleted, isMove, [srcFolder], destFolder],
  ];
  MailServices.copy.copyFolder(
    srcFolder,
    destFolder,
    isMove,
    copyListener,
    null
  );
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

function deleteMessages(srcFolder, items, deleteStorage, isMove) {
  // We should only get the delete notification only if we are not moving, and are deleting from
  // the storage/trash. We should get only the move/copy notification if we aren't.
  var isTrashFolder = srcFolder.getFlag(Ci.nsMsgFolderFlags.Trash);
  if (!isMove && (deleteStorage || isTrashFolder)) {
    // We won't be getting any onStopCopy notification in this case
    gCurrStatus = kStatus.onStopCopyDone;
    gExpectedEvents = [[MailServices.mfn.msgsDeleted, items]];
  } else {
    // We have to be getting a move notification, even if isMove is false
    gExpectedEvents = [
      [
        MailServices.mfn.msgsMoveCopyCompleted,
        true,
        items,
        gLocalTrashFolder,
        true,
      ],
    ];
  }

  srcFolder.deleteMessages(
    items,
    null,
    deleteStorage,
    isMove,
    copyListener,
    true
  );
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

function renameFolder(folder, newName) {
  gExpectedEvents = [[MailServices.mfn.folderRenamed, [folder], newName]];
  gCurrStatus = kStatus.onStopCopyDone;
  folder.rename(newName, null);
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

function deleteFolder(folder, child) {
  // We won't be getting any onStopCopy notification at all
  // XXX delete to trash should get one, but we'll need to pass the listener
  // somehow to deleteSelf
  gCurrStatus = kStatus.onStopCopyDone;
  // If ancestor is trash, expect a folderDeleted, otherwise expect
  // a folderMoveCopyCompleted.
  if (gLocalTrashFolder.isAncestorOf(folder)) {
    if (child) {
      gExpectedEvents = [
        [MailServices.mfn.folderDeleted, [child]],
        [MailServices.mfn.folderDeleted, [folder]],
      ];
    } else {
      gExpectedEvents = [[MailServices.mfn.folderDeleted, [folder]]];
    }
  } else {
    gExpectedEvents = [
      [
        MailServices.mfn.folderMoveCopyCompleted,
        true,
        [folder],
        gLocalTrashFolder,
      ],
    ];
  }

  folder.deleteSelf(null);
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

function compactFolder(folder) {
  gExpectedEvents = [
    [MailServices.mfn.folderCompactStart, folder],
    [MailServices.mfn.folderCompactFinish, folder],
  ];
  // We won't receive a copy listener notification for this
  gCurrStatus |= kStatus.onStopCopyDone;
  folder.compact(null, null);
  gCurrStatus |= kStatus.functionCallDone;
  if (gCurrStatus == kStatus.everythingDone) {
    resetStatusAndProceed();
  }
}

/*
 * TESTS
 */

// Beware before commenting out a test -- later tests might just depend on earlier ones
var gTestArray = [
  // Adding folders
  // Create another folder to move and copy messages around, and force initialization.
  function addFolder1() {
    addFolder(gRootFolder, "folder2", function (folder) {
      gLocalFolder2 = folder;
    });
  },
  // Create a third folder for more testing.
  function addFolder2() {
    addFolder(gRootFolder, "folder3", function (folder) {
      gLocalFolder3 = folder;
    });
  },
  // Folder structure is now
  // Inbox
  // Trash
  // folder2
  // folder3
  // Copying messages from files
  function testCopyFileMessage1() {
    copyFileMessage(gMsgFile1, localAccountUtils.inboxFolder, false);
  },
  function testCopyFileMessage2() {
    copyFileMessage(gMsgFile2, localAccountUtils.inboxFolder, false);
  },
  function testCopyFileMessage3() {
    copyFileMessage(gMsgFile3, localAccountUtils.inboxFolder, true);
  },

  // Moving/copying messages
  function testCopyMessages1() {
    copyMessages(
      [gMsgHdrs[0].hdr],
      false,
      localAccountUtils.inboxFolder,
      gLocalFolder2
    );
  },
  function testCopyMessages2() {
    copyMessages(
      [gMsgHdrs[1].hdr, gMsgHdrs[2].hdr],
      false,
      localAccountUtils.inboxFolder,
      gLocalFolder2
    );
  },
  function testMoveMessages1() {
    copyMessages(
      [gMsgHdrs[0].hdr, gMsgHdrs[1].hdr],
      true,
      localAccountUtils.inboxFolder,
      gLocalFolder3
    );
  },
  function testMoveMessages2() {
    copyMessages(
      [gMsgHdrs[2].hdr],
      true,
      localAccountUtils.inboxFolder,
      gLocalTrashFolder
    );
  },
  function testMoveMessages3() {
    // This is to test whether the notification is correct for moving from trash
    gMsgHdrs[2].hdr = gLocalTrashFolder.msgDatabase.getMsgHdrForMessageID(
      gMsgHdrs[2].ID
    );
    copyMessages([gMsgHdrs[2].hdr], true, gLocalTrashFolder, gLocalFolder3);
  },
  // Moving/copying folders
  function testCopyFolder1() {
    copyFolder(gLocalFolder3, false, gLocalFolder2);
  },
  function testMoveFolder1() {
    copyFolder(gLocalFolder3, true, localAccountUtils.inboxFolder);
  },
  function testMoveFolder2() {
    copyFolder(gLocalFolder2, true, localAccountUtils.inboxFolder);
  },
  // Folder structure should now be
  // Inbox
  // -folder2
  // --folder3
  // -folder3
  // Trash

  // Deleting messages
  function testDeleteMessages1() {
    // delete to trash
    // Let's take a moment to re-initialize stuff that got moved
    gLocalFolder2 = localAccountUtils.inboxFolder.getChildNamed("folder2");
    gLocalFolder3 = gLocalFolder2.getChildNamed("folder3");
    var folder3DB = gLocalFolder3.msgDatabase;
    for (var i = 0; i < gMsgHdrs.length; i++) {
      gMsgHdrs[i].hdr = folder3DB.getMsgHdrForMessageID(gMsgHdrs[i].ID);
    }

    // Now delete the message
    deleteMessages(
      gLocalFolder3,
      [gMsgHdrs[0].hdr, gMsgHdrs[1].hdr],
      false,
      false
    );
  },
  // shift delete
  function testDeleteMessages2() {
    deleteMessages(gLocalFolder3, [gMsgHdrs[2].hdr], true, false);
  },
  function testDeleteMessages3() {
    // normal delete from trash
    var trashDB = gLocalTrashFolder.msgDatabase;
    for (var i = 0; i < gMsgHdrs.length; i++) {
      gMsgHdrs[i].hdr = trashDB.getMsgHdrForMessageID(gMsgHdrs[i].ID);
    }
    deleteMessages(gLocalTrashFolder, [gMsgHdrs[0].hdr], false, false);
  },
  // shift delete from trash
  function testDeleteMessages4() {
    deleteMessages(gLocalTrashFolder, [gMsgHdrs[1].hdr], true, false);
  },

  // Renaming folders
  function testRename1() {
    renameFolder(gLocalFolder3, "folder4");
  },
  function testRename2() {
    renameFolder(gLocalFolder2.getChildNamed("folder4"), "folder3");
  },
  function testRename3() {
    renameFolder(gLocalFolder2, "folder4");
  },
  function testRename4() {
    renameFolder(
      localAccountUtils.inboxFolder.getChildNamed("folder4"),
      "folder2"
    );
  },

  // Folder structure should still be
  // Inbox
  // -folder2
  // --folder3
  // -folder3
  // Trash

  // Deleting folders (currently only one folder delete is supported through the UI)
  function deleteFolder1() {
    deleteFolder(localAccountUtils.inboxFolder.getChildNamed("folder3"), null);
  },
  // Folder structure should now be
  // Inbox
  // -folder2
  // --folder3
  // Trash
  // -folder3
  function deleteFolder2() {
    deleteFolder(localAccountUtils.inboxFolder.getChildNamed("folder2"), null);
  },
  // Folder structure should now be
  // Inbox
  // Trash
  // -folder2
  // --folder3
  // -folder3
  function deleteFolder3() {
    deleteFolder(gLocalTrashFolder.getChildNamed("folder3"), null);
  },
  // Folder structure should now be
  // Inbox
  // Trash
  // -folder2
  // --folder3
  function deleteFolder4() {
    // Let's take a moment to re-initialize stuff that got moved
    gLocalFolder2 = gLocalTrashFolder.getChildNamed("folder2");
    gLocalFolder3 = gLocalFolder2.getChildNamed("folder3");
    deleteFolder(gLocalFolder2, gLocalFolder3);
  },
  function compactInbox() {
    if (localAccountUtils.inboxFolder.msgStore.supportsCompaction) {
      compactFolder(localAccountUtils.inboxFolder);
    } else {
      doTest(++gTest);
    }
  },
];
// Folder structure should just be
// Inbox
// Trash

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  // Add a listener.
  MailServices.mfn.addListener(gMFListener, allTestedEvents);

  // Load up some messages so that we can copy them in later.
  gMsgFile1 = do_get_file("../../../data/bugmail10");
  gMsgFile2 = do_get_file("../../../data/bugmail11");
  gMsgFile3 = do_get_file("../../../data/draft1");

  // "Trash" folder
  gRootFolder = localAccountUtils.incomingServer.rootMsgFolder;
  gLocalTrashFolder = gRootFolder.getChildNamed("Trash");

  // "Master" do_test_pending(), paired with a do_test_finished() at the end of all the operations.
  do_test_pending();

  // Do the test.
  doTest(1);
}

function doTest(test) {
  if (test <= gTestArray.length) {
    var testFn = gTestArray[test - 1];
    // Set a limit of 10 seconds; if the notifications haven't arrived by then there's a problem.
    do_timeout(10000, function () {
      if (gTest == test) {
        do_throw(
          "Notifications not received in 10000 ms for operation " +
            testFn.name +
            ", current status is " +
            gCurrStatus
        );
      }
    });
    dump("=== Test: " + testFn.name + "\n");
    testFn();
  } else {
    gHdrsReceived = null;
    gMsgHdrs = null;
    MailServices.mfn.removeListener(gMFListener);
    do_test_finished(); // for the one in run_test()
  }
}
