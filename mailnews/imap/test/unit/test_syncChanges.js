/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that changes made from a different profile/machine
 * are synced correctly. In particular, we're checking that emptying out
 * an imap folder on the server makes us delete all the headers from our db.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gMessage;
var gSecondFolder;
var gSynthMessage;

add_setup(async function () {
  /*
   * Set up an IMAP server.
   */
  setupIMAPPump();

  IMAPPump.daemon.createMailbox("secondFolder", { subscribed: true });

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

add_task(async function simulateMailboxEmptied() {
  gMessage.setFlag("\\Deleted");
  const expungeListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.expunge(expungeListener, null);
  await expungeListener.promise;
  const updateListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, updateListener);
  await updateListener.promise;
});

add_task(function checkMailboxEmpty() {
  Assert.equal(IMAPPump.inbox.getTotalMessages(false), 0);
});

add_task(function endTest() {
  teardownIMAPPump();
});
