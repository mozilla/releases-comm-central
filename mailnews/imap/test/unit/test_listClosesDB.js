// This file tests that listing folders on startup because we're not using
// subscription doesn't leave db's open.

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/MessageGenerator.jsm");

var gSub3;

var tests = [setup, updateInbox, checkCachedDBForFolder, teardown];

function* setup() {
  setupIMAPPump();

  IMAPPump.daemon.createMailbox("folder1", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder1/sub1", "", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder1/sub1/sub2", "", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder1/sub1/sub2/sub3", "", {
    subscribed: true,
  });

  IMAPPump.incomingServer.usingSubscription = false;

  let rootFolder = IMAPPump.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgImapMailFolder
  );
  rootFolder.hierarchyDelimiter = "/";
  IMAPPump.inbox.hierarchyDelimiter = "/";
  rootFolder.addSubfolder("folder1");
  rootFolder.addSubfolder("folder1/sub1");
  rootFolder.addSubfolder("folder1/sub1/sub2");
  gSub3 = rootFolder.addSubfolder("folder1/sub1/sub2/sub3");
  IMAPPump.server.performTest("LIST");

  do_timeout(1000, async_driver);
  yield false;
}

function* updateInbox() {
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

function checkCachedDBForFolder() {
  const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
    Ci.nsIMsgDBService
  );
  Assert.equal(gDbService.cachedDBForFolder(gSub3), null);
}

function teardown() {
  teardownIMAPPump();
}

function run_test() {
  async_run_tests(tests);
}
