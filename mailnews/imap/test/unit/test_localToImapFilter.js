/*
 * This file tests copies of multiple messages using filters
 * from incoming POP3, with filter actions copying and moving
 * messages to IMAP folders. This test is adapted from
 * test_imapFolderCopy.js
 *
 * Original author: Kent James <kent@caspia.com>
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/POP3pump.js");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gEmptyLocal1, gEmptyLocal2;
var gMessages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
var gFiles = ["../../../data/bugmail1", "../../../data/draft1"];

var tests = [
  setup,
  function* copyFolder1() {
    dump("gEmpty1 " + gEmptyLocal1.URI + "\n");
    MailServices.copy.copyFolder(
      gEmptyLocal1,
      IMAPPump.inbox,
      false,
      CopyListener,
      null
    );
    yield false;
  },
  function* copyFolder2() {
    dump("gEmpty2 " + gEmptyLocal2.URI + "\n");
    MailServices.copy.copyFolder(
      gEmptyLocal2,
      IMAPPump.inbox,
      false,
      CopyListener,
      null
    );
    yield false;
  },
  function* getLocalMessages() {
    // setup copy then move mail filters on the inbox
    let filterList = gPOP3Pump.fakeServer.getFilterList(null);
    let filter = filterList.createFilter("copyThenMoveAll");
    let searchTerm = filter.createTerm();
    searchTerm.matchAll = true;
    filter.appendTerm(searchTerm);
    let copyAction = filter.createAction();
    copyAction.type = Ci.nsMsgFilterAction.CopyToFolder;
    copyAction.targetFolderUri = IMAPPump.inbox.getChildNamed("empty 1").URI;
    filter.appendAction(copyAction);
    let moveAction = filter.createAction();
    moveAction.type = Ci.nsMsgFilterAction.MoveToFolder;
    moveAction.targetFolderUri = IMAPPump.inbox.getChildNamed("empty 2").URI;
    filter.appendAction(moveAction);
    filter.enabled = true;
    filterList.insertFilterAt(0, filter);

    gPOP3Pump.files = gFiles;
    gPOP3Pump.onDone = async_driver;
    gPOP3Pump.run();
    yield false;
  },
  function* update1() {
    let folder1 = IMAPPump.inbox
      .getChildNamed("empty 1")
      .QueryInterface(Ci.nsIMsgImapMailFolder);
    folder1.updateFolderWithListener(null, asyncUrlListener);
    yield false;
  },
  function* update2() {
    let folder2 = IMAPPump.inbox
      .getChildNamed("empty 2")
      .QueryInterface(Ci.nsIMsgImapMailFolder);
    folder2.updateFolderWithListener(null, asyncUrlListener);
    yield false;
  },
  function verifyFolders() {
    let folder1 = IMAPPump.inbox.getChildNamed("empty 1");
    listMessages(folder1);
    let folder2 = IMAPPump.inbox.getChildNamed("empty 2");
    listMessages(folder2);
    listMessages(localAccountUtils.inboxFolder);
    Assert.ok(folder1 !== null);
    Assert.ok(folder2 !== null);
    // folder 1 and 2 should each now have 2 messages in them.
    Assert.equal(folderCount(folder1), 2);
    Assert.equal(folderCount(folder2), 2);
    // the local inbox folder should now be empty, since the second
    // operation was a move
    Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);
  },
  teardown,
];

function folderCount(folder) {
  return [...folder.msgDatabase.EnumerateMessages()].length;
}

function setup() {
  setupIMAPPump();
  gEmptyLocal1 = localAccountUtils.rootFolder.createLocalSubfolder("empty 1");
  gEmptyLocal2 = localAccountUtils.rootFolder.createLocalSubfolder("empty 2");

  // these hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;
}

// nsIMsgCopyServiceListener implementation - runs next test when copy
// is completed.
var CopyListener = {
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {},
  SetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
    async_driver();
  },
};

asyncUrlListener.callback = function(aUrl, aExitCode) {
  Assert.equal(aExitCode, 0);
};

function listMessages(folder) {
  var msgCount = 0;
  dump("listing messages for " + folder.prettyName + "\n");
  for (let hdr of folder.msgDatabase.EnumerateMessages()) {
    msgCount++;
    dump(msgCount + ": " + hdr.subject + "\n");
  }
}

function teardown() {
  gMessages.clear();
  gEmptyLocal1 = null;
  gEmptyLocal2 = null;
  gPOP3Pump = null;
  teardownIMAPPump();
}

function run_test() {
  async_run_tests(tests);
}
