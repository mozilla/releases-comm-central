/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for msg database functions.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var dbService;
var gTestFolder;
var gCurTestNum = 0;
var kNumTestMessages = 10;

var gTestArray = [
  function test_db_open() {
    dbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
      Ci.nsIMsgDBService
    );
    // Get the root folder
    const root = localAccountUtils.incomingServer.rootFolder;
    root.createSubfolder("dbTest", null);
    gTestFolder = root.getChildNamed("dbTest");
    let db = dbService.openFolderDB(gTestFolder, true);
    Assert.notEqual(db, null);
    db.dBFolderInfo.highWater = 10;
    db.close(true);
    db = dbService.openFolderDB(gTestFolder, true);
    Assert.notEqual(db, null);
    Assert.equal(db.dBFolderInfo.highWater, 10);
    db.dBFolderInfo.onKeyAdded(15);
    Assert.equal(db.dBFolderInfo.highWater, 15);
    db.close(true);
    db.forceClosed();
    db = null;
    doTest(++gCurTestNum);
  },
];

function doTest(test) {
  if (test <= gTestArray.length) {
    dump("Doing test " + test + "\n");
    gCurTestNum = test;

    var testFn = gTestArray[test - 1];
    // Set a limit of 10 seconds; if the notifications haven't arrived by then there's a problem.
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
      do_throw(ex);
    }
  } else {
    do_test_finished(); // for the one in run_test()
  }
}

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  do_test_pending();
  doTest(1);
}
