/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that changes made while offline are played back when we
 * go back online.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var gSecondFolder, gThirdFolder;
var gSynthMessage1, gSynthMessage2;
// the message id of bugmail10
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gOfflineManager;

var tests = [
  setupIMAPPump,
  function serverParms() {
    IMAPPump.server.setDebugLevel(nsMailServer.debugAll);
  },
  setup,

  function prepareToGoOffline() {
    const rootFolder = IMAPPump.incomingServer.rootFolder;
    gSecondFolder = rootFolder
      .getChildNamed("secondFolder")
      .QueryInterface(Ci.nsIMsgImapMailFolder);
    gThirdFolder = rootFolder
      .getChildNamed("thirdFolder")
      .QueryInterface(Ci.nsIMsgImapMailFolder);
    IMAPPump.incomingServer.closeCachedConnections();
  },
  async function doOfflineOps() {
    IMAPPump.server.stop();
    Services.io.offline = true;

    // Flag the two messages, and then copy them to different folders. Since
    // we're offline, these operations are synchronous.
    const msgHdr1 = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
      gSynthMessage1.messageId
    );
    const msgHdr2 = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
      gSynthMessage2.messageId
    );
    const headers1 = [msgHdr1];
    const headers2 = [msgHdr2];
    msgHdr1.folder.markMessagesFlagged(headers1, true);
    msgHdr2.folder.markMessagesFlagged(headers2, true);
    const promiseCopyListener1 = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyMessages(
      IMAPPump.inbox,
      headers1,
      gSecondFolder,
      true,
      promiseCopyListener1,
      null,
      true
    );
    const promiseCopyListener2 = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyMessages(
      IMAPPump.inbox,
      headers2,
      gThirdFolder,
      true,
      promiseCopyListener2,
      null,
      true
    );
    var file = do_get_file("../../../data/bugmail10");
    const promiseCopyListener3 = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyFileMessage(
      file,
      IMAPPump.inbox,
      null,
      false,
      0,
      "",
      promiseCopyListener3,
      null
    );
    await Promise.all([
      promiseCopyListener1.promise,
      promiseCopyListener2.promise,
      promiseCopyListener3.promise,
    ]);
  },
  async function goOnline() {
    gOfflineManager = Cc["@mozilla.org/messenger/offline-manager;1"].getService(
      Ci.nsIMsgOfflineManager
    );
    IMAPPump.daemon.closing = false;
    Services.io.offline = false;

    IMAPPump.server.start();
    gOfflineManager.goOnline(false, true, null);
    await PromiseTestUtils.promiseDelay(2000);
  },
  async function updateSecondFolder() {
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    gSecondFolder.updateFolderWithListener(null, promiseUrlListener);
    await promiseUrlListener.promise;
  },
  async function updateThirdFolder() {
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    gThirdFolder.updateFolderWithListener(null, promiseUrlListener);
    await promiseUrlListener.promise;
  },
  async function updateInbox() {
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
    await promiseUrlListener.promise;
  },
  function checkDone() {
    const msgHdr1 = gSecondFolder.msgDatabase.getMsgHdrForMessageID(
      gSynthMessage1.messageId
    );
    const msgHdr2 = gThirdFolder.msgDatabase.getMsgHdrForMessageID(
      gSynthMessage2.messageId
    );
    const msgHdr3 = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(gMsgId1);
    Assert.notEqual(msgHdr1, null);
    Assert.notEqual(msgHdr2, null);
    Assert.notEqual(msgHdr3, null);
  },
  teardownIMAPPump,
];

async function setup() {
  /*
   * Set up an IMAP server.
   */
  IMAPPump.daemon.createMailbox("secondFolder", { subscribed: true });
  IMAPPump.daemon.createMailbox("thirdFolder", { subscribed: true });
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  // Don't prompt about offline download when going offline
  Services.prefs.setIntPref("offline.download.download_messages", 2);

  // make a couple of messages
  let messages = [];
  const gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());
  messages = messages.concat(gMessageGenerator.makeMessage());
  gSynthMessage1 = messages[0];
  gSynthMessage2 = messages[1];

  let msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  const imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  let message = new ImapMessage(msgURI.spec, imapInbox.uidnext++, ["\\Seen"]);
  imapInbox.addMessage(message);
  msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[1].toMessageString())
  );
  message = new ImapMessage(msgURI.spec, imapInbox.uidnext++, ["\\Seen"]);
  imapInbox.addMessage(message);

  // update folder to download header.
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
}

function run_test() {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  tests.forEach(x => add_task(x));
  run_next_test();
}
