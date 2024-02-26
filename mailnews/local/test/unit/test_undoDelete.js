/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests undoing of an local folder message deleted to the trash.
//
// Original Author: David Bienvenu <dbienvenu@mozilla.com>

// Globals
let gMsg1;
let gMessages = [];
let gMsgWindow;
let gCurTestNum;
let gMsgId1;
let gTestFolder;

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var messageInjection = new MessageInjection({ mode: "local" });

add_setup(async function () {
  gMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );

  var messageGenerator = new MessageGenerator();
  gMsg1 = messageGenerator.makeMessage();
  const msg2 = messageGenerator.makeMessage({ inReplyTo: gMsg1 });

  let messages = [];
  messages = messages.concat([gMsg1, msg2]);
  const msgSet = new SyntheticMessageSet(messages);
  gTestFolder = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([gTestFolder], [msgSet]);
});

add_task(async function deleteMessage() {
  const msgToDelete = mailTestUtils.firstMsgHdr(gTestFolder);
  gMsgId1 = msgToDelete.messageId;
  gMessages.push(msgToDelete);
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  gTestFolder.deleteMessages(
    gMessages,
    gMsgWindow,
    false,
    true,
    copyListener,
    true
  );
  await copyListener.promise;
});

add_task(async function undoDelete() {
  gMsgWindow.transactionManager.undoTransaction();
  // There's no listener for this, so we'll just have to wait a little.
  await PromiseTestUtils.promiseDelay(1500);
});

add_task(function verifyFolders() {
  const msgRestored = gTestFolder.msgDatabase.getMsgHdrForMessageID(gMsgId1);
  const msg = mailTestUtils.loadMessageToString(gTestFolder, msgRestored);
  Assert.equal(msg, gMsg1.toMessageString());
});

add_task(function endTest() {
  // Cleanup, null out everything.
  gMessages = [];
  gMsgWindow.closeWindow();
  gMsgWindow = null;
  localAccountUtils.inboxFolder = null;
  localAccountUtils.incomingServer = null;
});
