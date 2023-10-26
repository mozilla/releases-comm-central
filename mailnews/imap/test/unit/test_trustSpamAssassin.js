/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file tests recognizing a message as junk due to
 *  SpamAssassin headers, and marking that as good
 *  without having the message return to the junk folder,
 *  as discussed in bug 540385.
 *
 * adapted from test_filterNeedsBody.js
 */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// Globals
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gMessage = "SpamAssassinYes"; // message file used as the test message
var gJunkFolder;

add_setup(function () {
  setupIMAPPump();
  const server = IMAPPump.incomingServer;
  const spamSettings = server.spamSettings;
  server.setBoolValue("useServerFilter", true);
  server.setCharValue("serverFilterName", "SpamAssassin");
  server.setIntValue(
    "serverFilterTrustFlags",
    Ci.nsISpamSettings.TRUST_POSITIVES
  );
  server.setBoolValue("moveOnSpam", true);
  server.setIntValue(
    "moveTargetMode",
    Ci.nsISpamSettings.MOVE_TARGET_MODE_ACCOUNT
  );
  server.setCharValue("spamActionTargetAccount", server.serverURI);

  spamSettings.initialize(server);
});

add_task(async function createJunkFolder() {
  IMAPPump.incomingServer.rootFolder.createSubfolder("Junk", null);
  await PromiseTestUtils.promiseFolderAdded("Junk");
  gJunkFolder = IMAPPump.incomingServer.rootFolder.getChildNamed("Junk");
  Assert.ok(gJunkFolder instanceof Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gJunkFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

/*
 * Load and update a message in the imap fake server, should move
 *  SpamAssassin-marked junk message to junk folder
 */
add_task(async function loadImapMessage() {
  IMAPPump.mailbox.addMessage(
    new ImapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
  );
  /*
   * The message matched the SpamAssassin header, so it moved
   *  to the junk folder
   */
  IMAPPump.inbox.updateFolder(null);
  await PromiseTestUtils.promiseFolderNotification(
    gJunkFolder,
    "msgsMoveCopyCompleted"
  );
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gJunkFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function testMessageInJunk() {
  Assert.equal(0, IMAPPump.inbox.getTotalMessages(false));
  Assert.equal(1, gJunkFolder.getTotalMessages(false));
});

add_task(async function markMessageAsGood() {
  /*
   * This is done in the application in nsMsgDBView, which is difficult
   *  to test in xpcshell tests. We aren't really trying to test that here
   *  though, since the point of this test is working with the server-based
   *  filters. So I will simply simulate the operations that would typically
   *  be done by a manual marking of the messages.
   */
  const msgHdr = mailTestUtils.firstMsgHdr(gJunkFolder);
  msgHdr.setStringProperty("junkscoreorigin", "user");
  msgHdr.setStringProperty("junkpercent", "0"); // good percent
  msgHdr.setStringProperty("junkscore", "0"); // good score

  /*
   * Now move this message to the inbox. In bug 540385, the message just
   *  gets moved back to the junk folder again. We'll test that we
   *  are now preventing that.
   */
  MailServices.copy.copyMessages(
    gJunkFolder, // srcFolder
    [msgHdr], // messages
    IMAPPump.inbox, // dstFolder
    true, // isMove
    null, // listener
    null, // msgWindow
    false // allowUndo
  );
  await PromiseTestUtils.promiseFolderNotification(
    IMAPPump.inbox,
    "msgsMoveCopyCompleted"
  );
});

add_task(async function updateFoldersAndCheck() {
  const inboxUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, inboxUrlListener);
  await inboxUrlListener.promise;
  const junkUrlListener = new PromiseTestUtils.PromiseUrlListener();
  gJunkFolder.updateFolderWithListener(null, junkUrlListener);
  await junkUrlListener.promise;
  // bug 540385 causes this test to fail
  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
  Assert.equal(0, gJunkFolder.getTotalMessages(false));
});

add_task(function endTest() {
  teardownIMAPPump();
});

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file("../../../data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}

// quick shorthand for output of a line of text.
function dl(text) {
  dump(text + "\n");
}
