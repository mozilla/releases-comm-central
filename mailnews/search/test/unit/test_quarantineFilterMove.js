/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * tests message moves with filter and quarantine enabled per bug 582918.
 * It then tests that subsequent moves of the filtered messages work.
 *
 * adapted from test_copyThenMoveManual.js
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
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
    const searchTerm = gFilter.createTerm();
    searchTerm.matchAll = true;
    gFilter.appendTerm(searchTerm);
    const moveAction = gFilter.createAction();
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
    const promise1 = PromiseTestUtils.promiseFolderNotification(
      gMoveFolder,
      "msgsClassified"
    );
    const promise2 = gPOP3Pump.run();
    await Promise.all([promise1, promise2]);
  },
  async function verifyFolders1() {
    Assert.equal(folderCount(gMoveFolder), 2);
    // the local inbox folder should now be empty, since the second
    // operation was a move
    Assert.equal(folderCount(localAccountUtils.inboxFolder), 0);

    const msgs = [...gMoveFolder.msgDatabase.enumerateMessages()];
    const firstMsgHdr = msgs[0];
    const secondMsgHdr = msgs[1];
    // Check that the messages have content
    let messageContent = await getContentFromMessage(firstMsgHdr);
    Assert.ok(
      messageContent.includes("Some User <bugmail@example.org> changed")
    );
    messageContent = await getContentFromMessage(secondMsgHdr);
    Assert.ok(
      messageContent.includes(
        "https://bugzilla.mozilla.org/show_bug.cgi?id=436880"
      )
    );
  },
  async function copyMovedMessages() {
    const msgs = [...gMoveFolder.msgDatabase.enumerateMessages()];
    const firstMsgHdr = msgs[0];
    const secondMsgHdr = msgs[1];
    const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyMessages(
      gMoveFolder,
      [firstMsgHdr, secondMsgHdr],
      gMoveFolder2,
      false,
      promiseCopyListener,
      null,
      false
    );
    const promiseMoveMsg = PromiseTestUtils.promiseFolderEvent(
      gMoveFolder,
      "DeleteOrMoveMsgCompleted"
    );
    await Promise.all([promiseCopyListener.promise, promiseMoveMsg]);
  },
  async function verifyFolders2() {
    Assert.equal(folderCount(gMoveFolder2), 2);

    const msgs = [...gMoveFolder2.msgDatabase.enumerateMessages()];
    const firstMsgHdr = msgs[0];
    const secondMsgHdr = msgs[1];
    // Check that the messages have content
    let messageContent = await getContentFromMessage(firstMsgHdr);
    Assert.ok(
      messageContent.includes("Some User <bugmail@example.org> changed")
    );
    messageContent = await getContentFromMessage(secondMsgHdr);
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
  return [...folder.msgDatabase.enumerateMessages()].length;
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
  gMoveFolder2 =
    localAccountUtils.rootFolder.createLocalSubfolder("MoveFolder2");

  gTestArray.forEach(x => add_task(x));
  run_next_test();
}

/**
 * Get the full message content.
 *
 * @param aMsgHdr - nsIMsgDBHdr object whose text body will be read.
 * @returns {Promise<string>} full message contents.
 */
function getContentFromMessage(aMsgHdr) {
  const msgFolder = aMsgHdr.folder;
  const msgUri = msgFolder.getUriForMsg(aMsgHdr);

  return new Promise((resolve, reject) => {
    const streamListener = {
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      sis: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      ),
      content: "",
      onDataAvailable(request, inputStream, offset, count) {
        this.sis.init(inputStream);
        this.content += this.sis.read(count);
      },
      onStartRequest(request) {},
      onStopRequest(request, statusCode) {
        this.sis.close();
        if (Components.isSuccessCode(statusCode)) {
          resolve(this.content);
        } else {
          reject(new Error(statusCode));
        }
      },
    };
    MailServices.messageServiceFromURI(msgUri).streamMessage(
      msgUri,
      streamListener,
      null,
      null,
      false,
      "",
      false
    );
  });
}
