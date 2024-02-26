/*
 * This file tests copy followed by a move in a single filter.
 * Tests fix from bug 448337.
 *
 * Original author: Kent James <kent@caspia.com>
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gFiles = ["../../../data/bugmail1"];
var gCopyFolder;
var gMoveFolder;
var gFilter; // the test filter
var gFilterList;
var gTestArray = [
  function createFilters() {
    // setup manual copy then move mail filters on the inbox
    gFilterList = localAccountUtils.incomingServer.getFilterList(null);
    gFilter = gFilterList.createFilter("copyThenMoveAll");
    const searchTerm = gFilter.createTerm();
    searchTerm.matchAll = true;
    gFilter.appendTerm(searchTerm);
    const copyAction = gFilter.createAction();
    copyAction.type = Ci.nsMsgFilterAction.CopyToFolder;
    copyAction.targetFolderUri = gCopyFolder.URI;
    gFilter.appendAction(copyAction);
    const moveAction = gFilter.createAction();
    moveAction.type = Ci.nsMsgFilterAction.MoveToFolder;
    moveAction.targetFolderUri = gMoveFolder.URI;
    gFilter.appendAction(moveAction);
    gFilter.enabled = true;
    gFilter.filterType = Ci.nsMsgFilterType.Manual;
    gFilterList.insertFilterAt(0, gFilter);
  },
  // just get a message into the local folder
  async function getLocalMessages1() {
    gPOP3Pump.files = gFiles;
    await gPOP3Pump.run();
  },
  // test applying filters to a message header
  async function applyFilters() {
    const promiseFolderEvent = PromiseTestUtils.promiseFolderEvent(
      localAccountUtils.inboxFolder,
      "DeleteOrMoveMsgCompleted"
    );
    MailServices.filters.applyFilters(
      Ci.nsMsgFilterType.Manual,
      [localAccountUtils.inboxFolder.firstNewMessage],
      localAccountUtils.inboxFolder,
      null
    );
    await promiseFolderEvent;
  },
  function verifyFolders1() {
    // Copy and Move should each now have 1 message in them.
    Assert.equal(folderCount(gCopyFolder), 1);
    Assert.equal(folderCount(gMoveFolder), 1);
    // the local inbox folder should now be empty, since the second
    // operation was a move
    Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);
  },
  // just get a message into the local folder
  async function getLocalMessages2() {
    gPOP3Pump.files = gFiles;
    await gPOP3Pump.run();
  },
  // use the alternate call into the filter service
  async function applyFiltersToFolders() {
    const folders = [localAccountUtils.inboxFolder];
    const promiseFolderEvent = PromiseTestUtils.promiseFolderEvent(
      localAccountUtils.inboxFolder,
      "DeleteOrMoveMsgCompleted"
    );
    MailServices.filters.applyFiltersToFolders(gFilterList, folders, null);
    await promiseFolderEvent;
  },
  function verifyFolders2() {
    // Copy and Move should each now have 2 message in them.
    Assert.equal(folderCount(gCopyFolder), 2);
    Assert.equal(folderCount(gMoveFolder), 2);
    // the local inbox folder should now be empty, since the second
    // operation was a move
    Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);
  },
  function endTest() {
    // Cleanup, null out everything, close all cached connections and stop the
    // server
    dump(" Exiting mail tests\n");
    gPOP3Pump = null;
  },
];

function folderCount(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}

function run_test() {
  if (!localAccountUtils.inboxFolder) {
    localAccountUtils.loadLocalMailAccount();
  }

  gCopyFolder = localAccountUtils.rootFolder.createLocalSubfolder("CopyFolder");
  gMoveFolder = localAccountUtils.rootFolder.createLocalSubfolder("MoveFolder");

  gTestArray.forEach(x => add_task(x));

  run_next_test();
}
