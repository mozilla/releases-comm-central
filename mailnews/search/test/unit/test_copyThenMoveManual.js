/*
 * This file tests copy followed by a move in a single filter.
 * Tests fix from bug 448337.
 *
 * Original author: Kent James <kent@caspia.com>
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gFiles = ["../../../data/bugmail1"];
var gCopyFolder;
var gMoveFolder;
var gFilter; // the test filter
var gFilterList;

add_setup(async function () {
  localAccountUtils.loadLocalMailAccount();

  gCopyFolder = localAccountUtils.rootFolder.createLocalSubfolder("CopyFolder");
  gMoveFolder = localAccountUtils.rootFolder.createLocalSubfolder("MoveFolder");

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

  registerCleanupFunction(() => {
    if (gPOP3Pump._server) {
      gPOP3Pump._server.stop();
    }
    gPOP3Pump = null;
  });
});

add_task(async function getLocalMessages1() {
  // just get a message into the local folder
  gPOP3Pump.files = gFiles;
  await gPOP3Pump.run();

  // test applying filters to a message header

  const filterListener = new PromiseTestUtils.PromiseMsgOperationListener();
  MailServices.filters.applyFilters(
    Ci.nsMsgFilterType.Manual,
    [localAccountUtils.inboxFolder.firstNewMessage],
    [],
    localAccountUtils.inboxFolder,
    null,
    filterListener
  );
  await filterListener.promise;

  // Copy and Move should each now have 1 message in them.
  Assert.equal(folderCount(gCopyFolder), 1, "gCopyFolder should have one msg");
  Assert.equal(folderCount(gMoveFolder), 1, "gMoveFolder should have one msg");
  // the local inbox folder should now be empty, since the second
  // operation was a move
  Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);
});

add_task(async function getLocalMessages2() {
  // just get a message into the local folder
  gPOP3Pump.files = gFiles;
  await gPOP3Pump.run();

  // use the alternate call into the filter service

  const folders = [localAccountUtils.inboxFolder];

  const filterListener = new PromiseTestUtils.PromiseMsgOperationListener();
  MailServices.filters.applyFiltersToFolders(
    gFilterList,
    folders,
    null,
    filterListener
  );
  await filterListener.promise;

  // Copy and Move should each now have 2 message in them.
  Assert.equal(folderCount(gCopyFolder), 2, "gCopyFolder should have 2 msgs");
  Assert.equal(folderCount(gMoveFolder), 2, "gMoveFolder should have 2 msgs");
  // the local inbox folder should now be empty, since the second
  // operation was a move
  Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);
});

function folderCount(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}
