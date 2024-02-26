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
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
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
  const gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());
  gSynthMessage = messages[0];

  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(gSynthMessage.toMessageString())
  );
  gMessage = new ImapMessage(msgURI.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(gMessage);

  // update folder to download header.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function switchAwayFromInbox() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  gSecondFolder = rootFolder
    .getChildNamed("secondFolder")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  // Selecting the second folder will close the cached connection
  // on the inbox because fake server only supports one connection at a time.
  //  Then, we can poke at the message on the imap server directly, which
  // simulates the user changing the message from a different machine,
  // and Thunderbird discovering the change when it does a flag sync
  // upon reselecting the Inbox.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function simulateForwardFlagSet() {
  gMessage.setFlag("$Forwarded");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkForwardedFlagSet() {
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(
    msgHdr.flags & Ci.nsMsgMessageFlags.Forwarded,
    Ci.nsMsgMessageFlags.Forwarded
  );
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function clearForwardedFlag() {
  gMessage.clearFlag("$Forwarded");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkForwardedFlagCleared() {
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(msgHdr.flags & Ci.nsMsgMessageFlags.Forwarded, 0);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function setSeenFlag() {
  gMessage.setFlag("\\Seen");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkSeenFlagSet() {
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(
    msgHdr.flags & Ci.nsMsgMessageFlags.Read,
    Ci.nsMsgMessageFlags.Read
  );
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function simulateRepliedFlagSet() {
  gMessage.setFlag("\\Answered");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkRepliedFlagSet() {
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  Assert.equal(
    msgHdr.flags & Ci.nsMsgMessageFlags.Replied,
    Ci.nsMsgMessageFlags.Replied
  );
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function simulateTagAdded() {
  gMessage.setFlag("randomtag");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function checkTagSet() {
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  const keywords = msgHdr.getStringProperty("keywords");
  Assert.ok(keywords.includes("randomtag"));
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSecondFolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

/** Test that the NonJunk tag from the server is noticed. */
add_task(async function checkNonJunkTagSet() {
  gMessage.clearFlag("NotJunk");
  gMessage.setFlag("NonJunk");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  const junkScore = msgHdr.getStringProperty("junkscore");
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
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  const junkScore = msgHdr.getStringProperty("junkscore");
  Assert.equal(
    junkScore,
    Ci.nsIJunkMailPlugin.IS_HAM_SCORE,
    "NotJunk flag on server should mark as ham"
  );
});

add_task(async function clearTag() {
  gMessage.clearFlag("randomtag");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function checkTagCleared() {
  const msgHdr = IMAPPump.inbox.msgDatabase.getMsgHdrForMessageID(
    gSynthMessage.messageId
  );
  const keywords = msgHdr.getStringProperty("keywords");
  Assert.ok(!keywords.includes("randomtag"));
});

add_task(function endTest() {
  teardownIMAPPump();
});
