/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Going back online with queued offline operations has to be able to ask for a
 * password. Each folder is lite selected before its operations are played
 * back, so if that select cannot prompt it fails, the folder is skipped, and
 * the queued operations never run.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var gSecondFolder;
var gSynthMessage;
var gPasswordPrompts = 0;

function promptPasswordPS(
  parent,
  dialogTitle,
  text,
  password,
  checkMsg,
  checkState
) {
  gPasswordPrompts++;
  password.value = "password";
  checkState.value = false;
  return true;
}

add_setup(async function () {
  registerAlertTestUtils();
  setupIMAPPump();

  IMAPPump.daemon.createMailbox("secondFolder", { subscribed: true });
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  // Don't prompt about offline download when going offline.
  Services.prefs.setIntPref("offline.download.download_messages", 2);

  gSynthMessage = new MessageGenerator().makeMessage();
  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(gSynthMessage.toMessageString())
  );
  const imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  imapInbox.addMessage(
    new ImapMessage(msgURI.spec, imapInbox.uidnext++, ["\\Seen"])
  );

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(false, listener);
  await listener.promise;

  gSecondFolder = IMAPPump.incomingServer.rootFolder
    .getChildNamed("secondFolder")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  IMAPPump.incomingServer.closeCachedConnections();
});

add_task(async function queueAnOfflineMove() {
  IMAPPump.server.stop();
  Services.io.offline = true;

  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    IMAPPump.inbox,
    [msgHdr],
    gSecondFolder,
    true,
    copyListener,
    false,
    true
  );
  await copyListener.promise;
});

add_task(async function goOnlineWithoutAPassword() {
  // Nothing remembered anywhere, so the playback has to ask for it.
  IMAPPump.incomingServer.forgetPassword();
  IMAPPump.incomingServer.forgetSessionPassword(false);
  Assert.equal(
    gPasswordPrompts,
    0,
    "no password should have been asked for yet"
  );

  IMAPPump.daemon.closing = false;
  Services.io.offline = false;
  IMAPPump.server.start();

  const offlineManager = Cc[
    "@mozilla.org/messenger/offline-manager;1"
  ].getService(Ci.nsIMsgOfflineManager);
  offlineManager.goOnline(false, true, true);

  // The destination folder already holds a pseudo header for the message, put
  // there when the move was queued, so ask the server rather than the database.
  await TestUtils.waitForCondition(
    () => serverMessages("secondFolder").length == 1,
    "the queued move should have been played back to the server",
    100,
    100
  );

  Assert.greater(
    gPasswordPrompts,
    0,
    "the playback should have asked for a password"
  );
});

add_task(function endTest() {
  teardownIMAPPump();
});
