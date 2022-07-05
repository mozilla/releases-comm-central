/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * tests message moves with filter and quarantine enabled per bug 582918.
 * It then tests that subsequent moves of the filtered messages work.
 *
 * adapted from test_copyThenMoveManual.js
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var gFiles = ["../../../data/bugmail1", "../../../data/bugmail10"];

var gMoveFolder, gMoveFolder2;
var gFilter; // the test filter
var gFilterList;
var gTestArray = [
  function createFilters() {
    gFilterList = gPOP3Pump.fakeServer.getFilterList(null);
    gFilter = gFilterList.createFilter("MoveAll");
    let searchTerm = gFilter.createTerm();
    searchTerm.matchAll = true;
    gFilter.appendTerm(searchTerm);
    let moveAction = gFilter.createAction();
    moveAction.type = Ci.nsMsgFilterAction.MoveToFolder;
    moveAction.targetFolderUri = gMoveFolder.URI;
    gFilter.appendAction(moveAction);
    gFilter.enabled = true;
    gFilter.filterType = Ci.nsMsgFilterType.InboxRule;
    gFilterList.insertFilterAt(0, gFilter);
  },
  // just get a message into the local folder
  async function getLocalMessages1() {
    gPOP3Pump.files = gFiles;
    let promise1 = PromiseTestUtils.promiseFolderNotification(
      gMoveFolder,
      "msgsClassified"
    );
    let promise2 = gPOP3Pump.run();
    await Promise.all([promise1, promise2]);
  },
  function verifyFolders1() {
    Assert.equal(folderCount(gMoveFolder), 2);
    // the local inbox folder should now be empty, since the second
    // operation was a move
    Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);

    let msgs = [...gMoveFolder.msgDatabase.EnumerateMessages()];
    let firstMsgHdr = msgs[0];
    let secondMsgHdr = msgs[1];
    // Check that the messages have content
    let messageContent = getContentFromMessage(firstMsgHdr);
    Assert.ok(
      messageContent.includes("Some User <bugmail@example.org> changed")
    );
    messageContent = getContentFromMessage(secondMsgHdr);
    Assert.ok(
      messageContent.includes(
        "https://bugzilla.mozilla.org/show_bug.cgi?id=436880"
      )
    );
  },
  async function copyMovedMessages() {
    let msgs = [...gMoveFolder.msgDatabase.EnumerateMessages()];
    let firstMsgHdr = msgs[0];
    let secondMsgHdr = msgs[1];
    let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyMessages(
      gMoveFolder,
      [firstMsgHdr, secondMsgHdr],
      gMoveFolder2,
      false,
      promiseCopyListener,
      null,
      false
    );
    let promiseMoveMsg = PromiseTestUtils.promiseFolderEvent(
      gMoveFolder,
      "DeleteOrMoveMsgCompleted"
    );
    await Promise.all([promiseCopyListener.promise, promiseMoveMsg]);
  },
  function verifyFolders2() {
    Assert.equal(folderCount(gMoveFolder2), 2);

    let msgs = [...gMoveFolder2.msgDatabase.EnumerateMessages()];
    let firstMsgHdr = msgs[0];
    let secondMsgHdr = msgs[1];
    // Check that the messages have content
    let messageContent = getContentFromMessage(firstMsgHdr);
    Assert.ok(
      messageContent.includes("Some User <bugmail@example.org> changed")
    );
    messageContent = getContentFromMessage(secondMsgHdr);
    Assert.ok(
      messageContent.includes(
        "https://bugzilla.mozilla.org/show_bug.cgi?id=436880"
      )
    );
  },
  function endTest() {
    dump("Exiting mail tests\n");
    gPOP3Pump = null;
  },
];

function folderCount(folder) {
  return [...folder.msgDatabase.EnumerateMessages()].length;
}

function run_test() {
  /* may not work in Linux */
  // if ("@mozilla.org/gnome-gconf-service;1" in Cc)
  //  return;
  /**/
  // quarantine messages
  Services.prefs.setBoolPref("mailnews.downloadToTempFile", true);
  if (!localAccountUtils.inboxFolder) {
    localAccountUtils.loadLocalMailAccount();
  }

  gMoveFolder = localAccountUtils.rootFolder.createLocalSubfolder("MoveFolder");
  gMoveFolder2 = localAccountUtils.rootFolder.createLocalSubfolder(
    "MoveFolder2"
  );

  gTestArray.forEach(x => add_task(x));
  run_next_test();
}

/*
 * Get the full message content.
 *
 * aMsgHdr: nsIMsgDBHdr object whose text body will be read
 *          returns: string with full message contents
 */
function getContentFromMessage(aMsgHdr) {
  const MAX_MESSAGE_LENGTH = 65536;
  let msgFolder = aMsgHdr.folder;
  let msgUri = msgFolder.getUriForMsg(aMsgHdr);

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let streamListener = Cc[
    "@mozilla.org/network/sync-stream-listener;1"
  ].createInstance(Ci.nsISyncStreamListener);
  messenger
    .messageServiceFromURI(msgUri)
    .streamMessage(msgUri, streamListener, null, null, false, "", false);
  let sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sis.init(streamListener.inputStream);
  let content = sis.read(MAX_MESSAGE_LENGTH);
  sis.close();
  return content;
}
