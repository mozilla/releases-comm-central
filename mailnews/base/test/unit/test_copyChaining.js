/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test of chaining copies between the same folders

var { addMessagesToFolder, MessageGenerator, MessageScenarioFactory } =
  ChromeUtils.importESModule(
    "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
  );

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gCopySource;
var gCopyDest;
var gMessages;
var gCurTestNum = 1;

// main test

var gTestArray = [
  function copyMsg1() {
    gMessages = [...gCopySource.msgDatabase.enumerateMessages()];
    CopyNextMessage();
  },
  function copyMsg2() {
    CopyNextMessage();
  },
  function copyMsg3() {
    CopyNextMessage();
  },
  function copyMsg4() {
    CopyNextMessage();
  },
];

function CopyNextMessage() {
  if (gMessages.length > 0) {
    const msgHdr = gMessages.shift();
    MailServices.copy.copyMessages(
      gCopySource,
      [msgHdr],
      gCopyDest,
      true,
      copyListener,
      null,
      false
    );
  } else {
    do_throw("TEST FAILED - out of messages");
  }
}

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  const messageGenerator = new MessageGenerator();
  const scenarioFactory = new MessageScenarioFactory(messageGenerator);

  // "Master" do_test_pending(), paired with a do_test_finished() at the end of
  // all the operations.
  do_test_pending();

  gCopyDest = localAccountUtils.inboxFolder.createLocalSubfolder("copyDest");
  // build up a diverse list of messages
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(10));
  gCopySource = localAccountUtils.rootFolder.createLocalSubfolder("copySource");
  addMessagesToFolder(messages, gCopySource);

  mailTestUtils.updateFolderAndNotify(gCopySource, doTest);
  return true;
}

function doTest() {
  var test = gCurTestNum;
  if (test <= gTestArray.length) {
    var testFn = gTestArray[test - 1];
    dump("Doing test " + test + " " + testFn.name + "\n");

    try {
      testFn();
    } catch (ex) {
      do_throw("TEST FAILED " + ex);
    }
  } else {
    endTest();
  }
}

function endTest() {
  // Cleanup, null out everything
  dump(" Exiting mail tests\n");
  gMessages = null;
  do_test_finished(); // for the one in run_test()
}

// nsIMsgCopyServiceListener implementation
var copyListener = {
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {},
  SetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
    ++gCurTestNum;
    doTest();
  },
};
