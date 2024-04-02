/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test suite for empty trash
 *
 * Currently tested:
 * - Empty local trash
 * TODO
 * - Empty imap trash
 */

// Globals
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gMsgFile1;
var gLocalTrashFolder;
var gCurTestNum;
var gMsgHdrs = [];
var gRootFolder;

var nsIMFNService = Ci.nsIMsgFolderNotificationService;

/**
 * @implements {nsIMsgCopyServiceListener}
 */
var copyListener = {
  onStartCopy() {},
  onProgress() {},
  setMessageKey(aKey) {
    const hdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
    gMsgHdrs.push({ hdr, ID: hdr.messageId });
  },
  getMessageId() {
    return null;
  },
  onStopCopy(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
    // Ugly hack: make sure we don't get stuck in a JS->C++->JS->C++... call stack
    // This can happen with a bunch of synchronous functions grouped together, and
    // can even cause tests to fail because they're still waiting for the listener
    // to return
    do_timeout(0, function () {
      doTest(++gCurTestNum);
    });
  },
};

var urlListener = {
  OnStartRunningUrl() {},
  OnStopRunningUrl(aUrl, aExitCode) {
    // Check: message successfully copied.
    Assert.equal(aExitCode, 0);
    // Ugly hack: make sure we don't get stuck in a JS->C++->JS->C++... call stack
    // This can happen with a bunch of synchronous functions grouped together, and
    // can even cause tests to fail because they're still waiting for the listener
    // to return
    do_timeout(0, function () {
      doTest(++gCurTestNum);
    });
  },
};

function copyFileMessage(file, destFolder, isDraftOrTemplate) {
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
}

function deleteMessages(srcFolder, items) {
  srcFolder.deleteMessages(items, null, false, true, copyListener, true);
}

/*
 * TESTS
 */

// Beware before commenting out a test -- later tests might just depend on earlier ones
var gTestArray = [
  // Copying message from file
  function testCopyFileMessage1() {
    copyFileMessage(gMsgFile1, localAccountUtils.inboxFolder, false);
  },

  // Delete message
  function testDeleteMessage() {
    // delete to trash
    // Let's take a moment to re-initialize stuff that got moved
    const inboxDB = localAccountUtils.inboxFolder.msgDatabase;
    gMsgHdrs[0].hdr = inboxDB.getMsgHdrForMessageID(gMsgHdrs[0].ID);

    // Now delete the message
    deleteMessages(localAccountUtils.inboxFolder, [gMsgHdrs[0].hdr]);
  },
  function emptyTrash() {
    gRootFolder = localAccountUtils.incomingServer.rootMsgFolder;
    gLocalTrashFolder = gRootFolder.getChildNamed("Trash");
    // hold onto a db to make sure that empty trash deals with the case
    // of someone holding onto the db, but the trash folder has a null db.
    const gLocalTrashDB = gLocalTrashFolder.msgDatabase; // eslint-disable-line no-unused-vars
    gLocalTrashFolder.msgDatabase = null;
    // this is synchronous
    gLocalTrashFolder.emptyTrash(null);
    // check that the trash folder is 0 size, that the db has a 0 message count
    // and has no messages.
    Assert.equal(0, gLocalTrashFolder.filePath.fileSize);
    Assert.equal(0, gLocalTrashFolder.msgDatabase.dBFolderInfo.numMessages);
    const msgs = [...gLocalTrashFolder.msgDatabase.enumerateMessages()];
    Assert.equal(0, msgs.length);
    urlListener.OnStopRunningUrl(null, 0);
  },
];

// Our listener, which captures events.
function gMFListener() {}
gMFListener.prototype = {
  folderDeleted(aFolder) {
    aFolder.msgDatabase = null;
  },
};

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  // Load up a message so that we can copy it in later.
  gMsgFile1 = do_get_file("../../../data/bugmail10");
  // our front end code clears the msg db when it gets told the folder for
  // an open view has been deleted - so simulate that.
  var folderDeletedListener = new gMFListener();
  MailServices.mfn.addListener(
    folderDeletedListener,
    nsIMFNService.folderDeleted
  );

  // "Master" do_test_pending(), paired with a do_test_finished() at the end of all the operations.
  do_test_pending();

  // Do the test.
  doTest(1);
}

function doTest(test) {
  if (test <= gTestArray.length) {
    gCurTestNum = test;

    var testFn = gTestArray[test - 1];
    // Set a limit of three seconds; if the notifications haven't arrived by then there's a problem.
    do_timeout(10000, function () {
      if (gCurTestNum == test) {
        do_throw(
          "Notifications not received in 10000 ms for operation " + testFn.name
        );
      }
    });
    try {
      testFn();
    } catch (ex) {
      dump(ex);
    }
  } else {
    gMsgHdrs = null;
    do_test_finished(); // for the one in run_test()
  }
}
