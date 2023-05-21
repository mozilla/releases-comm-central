/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that imap flag changes made from a different profile/machine
 * are stored in db.
 */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var gMessage;
var gSecondFolder;
var gSynthMessage;

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );

  setupIMAPPump();

  IMAPPump.daemon.createMailbox("secondFolder", { subscribed: true });

  // build up a diverse list of messages
  let messages = [];
  let gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());
  gSynthMessage = messages[0];

  let msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(gSynthMessage.toMessageString())
  );
  gMessage = new ImapMessage(msgURI.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(gMessage);

  // update folder to download header.
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function switchAwayFromInbox() {
  let rootFolder = IMAPPump.incomingServer.rootFolder;
  gSecondFolder = rootFolder
    .getChildNamed("secondFolder")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  // Selecting the second folder will close the cached connection
  // on the inbox because fake server only supports one connection at a time.
  //  Then, we can poke at the message on the imap server directly, which
  // simulates the user changing the message from a different machine,
  // and Thunderbird discovering the change when it does a flag sync
  // upon reselecting the Inbox.
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function simulateForwardFlagSet() {
  gMessage.setFlag("$Forwarded");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkForwardedFlagSet() {
  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(
    msgHdr.flags & Ci.nsMsgMessageFlags.Forwarded,
    Ci.nsMsgMessageFlags.Forwarded
  );
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function clearForwardedFlag() {
  gMessage.clearFlag("$Forwarded");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkForwardedFlagCleared() {
  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(msgHdr.flags & Ci.nsMsgMessageFlags.Forwarded, 0);
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function setSeenFlag() {
  gMessage.setFlag("\\Seen");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkSeenFlagSet() {
  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(
    msgHdr.flags & Ci.nsMsgMessageFlags.Read,
    Ci.nsMsgMessageFlags.Read
  );
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function simulateRepliedFlagSet() {
  gMessage.setFlag("\\Answered");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkRepliedFlagSet() {
  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(
    msgHdr.flags & Ci.nsMsgMessageFlags.Replied,
    Ci.nsMsgMessageFlags.Replied
  );
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function simulateTagAdded() {
  gMessage.setFlag("randomtag");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkTagSet() {
  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  let keywords = msgHdr.getStringProperty("keywords");
  Assert.ok(keywords.includes("randomtag"));
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

/** Test that the NonJunk tag from the server is noticed. */
add_task(async function checkNonJunkTagSet() {
  gMessage.clearFlag("NotJunk");
  gMessage.setFlag("NonJunk");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  let junkScore = msgHdr.getStringProperty("junkscore");
  Assert.equal(
    junkScore,
    Ci.nsIJunkMailPlugin.IS_HAM_SCORE,
    "NonJunk flag on server should mark as ham"
  );
});

/** Test that the NotJunk tag from the server is noticed. */
add_task(async function checkNotJunkTagSet() {
  gMessage.clearFlag("NonJunk");
  gMessage.setFlag("NotJunk");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  let junkScore = msgHdr.getStringProperty("junkscore");
  Assert.equal(
    junkScore,
    Ci.nsIJunkMailPlugin.IS_HAM_SCORE,
    "NotJunk flag on server should mark as ham"
  );
});

add_task(async function clearTag() {
  gMessage.clearFlag("randomtag");
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function checkTagCleared() {
  let msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  let keywords = msgHdr.getStringProperty("keywords");
  Assert.ok(!keywords.includes("randomtag"));
});

add_task(function endTest() {
  teardownIMAPPump();
});
