/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Complex test for the send message later function - including sending multiple
 * times in the same session.
 *
 * XXX: This test is intended to additionally test sending of multiple messages
 * from one send later instance, however due to the fact we use one connection
 * per message sent, it is very difficult to consistently get the fake server
 * reconnected in time for the next connection. Thus, sending of multiple
 * messages is currently disabled (but commented out for local testing if
 * required), when we fix bug 136871 we should be able to enable the multiple
 * messages option.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var server = null;
var smtpServer;
var gSentFolder;
var identity = null;
var gMsgFile = [
  do_get_file("data/message1.eml"),
  do_get_file("data/429891_testcase.eml"),
];
var kTestFileSender = ["from_B@foo.invalid", "from_A@foo.invalid"];
var kTestFileRecipient = ["to_B@foo.invalid", "to_A@foo.invalid"];

var gMsgFileData = [];
var gMsgOrder = [];
var gLastSentMessage = 0;

var kIdentityMail = "identity@foo.invalid";

var msgSendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
  Ci.nsIMsgSendLater
);

var messageListener;
var onStopCopyPromise = Promise.withResolvers();

/* exported OnStopCopy */
// for head_compose.js
// This function is used to find out when the copying of the message to the
// unsent message folder is completed, and hence can fire off the actual
// sending of the message.
function OnStopCopy(aStatus) {
  Assert.equal(aStatus, 0);

  // Check this is false before we start sending.
  Assert.equal(msgSendLater.sendingMessages, false);

  // Check that the send later service thinks we have messages to send.
  Assert.equal(msgSendLater.hasUnsentMessages(identity), true);

  // Check we have a message in the unsent message folder.
  Assert.equal(gSentFolder.getTotalMessages(false), gMsgOrder.length);

  // Start the next step after a brief time so that functions can finish
  // properly.
  onStopCopyPromise.resolve();
}

add_setup(async function () {
  // Load in the test files so we have a record of length and their data.
  for (var i = 0; i < gMsgFile.length; ++i) {
    gMsgFileData[i] = await IOUtils.readUTF8(gMsgFile[i].path);
  }

  // Ensure we have a local mail account, an normal account and appropriate
  // servers and identities.
  localAccountUtils.loadLocalMailAccount();

  // Check that the send later service thinks we don't have messages to send.
  Assert.equal(msgSendLater.hasUnsentMessages(identity), false);

  MailServices.accounts.setSpecialFolders();

  const account = MailServices.accounts.createAccount();
  const incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "localhost",
    "pop3"
  );

  smtpServer = getBasicSmtpServer(1);
  identity = getSmtpIdentity(kIdentityMail, smtpServer);

  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;
  MailServices.accounts.defaultAccount = account;

  localAccountUtils.rootFolder.createLocalSubfolder("Sent");

  gSentFolder = msgSendLater.getUnsentMessagesFolder(identity);

  // Don't copy messages to sent folder for this test.
  identity.doFcc = false;

  // Create and add a listener.
  messageListener = new MsgSendLaterListener();

  msgSendLater.addListener(messageListener);

  // Set up the server.
  server = setupServerDaemon();
  server.setDebugLevel(nsMailServer.debugRecv);
});

add_task(async function test_sendMessageLater2_message1() {
  // Copy Message from file to folder.
  await sendMessageLater(0);

  // Send unsent message.
  await sendUnsentMessages();

  // Check sent folder is now empty.
  Assert.equal(gSentFolder.getTotalMessages(false), 0);

  // Reset the server.
  server.stop();
  server.resetTest();

  // Reset counts.
  resetCounts();
});

add_task(async function test_sendMessageLater2_429891_testcase() {
  // Copy more messages.
  await sendMessageLater(1);

  // XXX Only do one the second time round, as described at the start of the
  // file.
  // await sendMessageLater(0);

  // Test send again.
  await sendUnsentMessages();
});

async function sendMessageLater(aTestFileIndex) {
  gMsgOrder.push(aTestFileIndex);

  // Prepare to actually "send" the message later, i.e. dump it in the
  // unsent messages folder.

  var compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  // Setting the compFields sender and recipient to any value is required to
  // survive mime_sanity_check_fields in nsMsgCompUtils.cpp.
  // Sender and recipient are required for sendMessageFile but SMTP
  // transaction values will be used directly from mail body.
  compFields.from = "irrelevant@foo.invalid";
  compFields.to = "irrelevant@foo.invalid";

  var msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );

  msgSend.sendMessageFile(
    identity,
    "",
    compFields,
    gMsgFile[aTestFileIndex],
    false,
    false,
    Ci.nsIMsgSend.nsMsgQueueForLater,
    null,
    copyListener,
    null,
    null
  );
  await onStopCopyPromise.promise;
  // Reset onStopCopyPromise.
  onStopCopyPromise = Promise.withResolvers();
}

function resetCounts() {
  gMsgOrder = [];
  gLastSentMessage = 0;
}

// This function does the actual send later.
async function sendUnsentMessages() {
  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    // Start the fake SMTP server.
    server.start();
    smtpServer.QueryInterface(Ci.nsISmtpServer).port = server.port;

    // Send the unsent message.
    msgSendLater.sendUnsentMessages(identity);
  } catch (e) {
    throw new Error(e);
  }
  await messageListener.promise;
  messageListener.deferPromise();
}

// This listener handles the post-sending of the actual message and checks the
// sequence and ensures the data is correct.
class MsgSendLaterListener {
  constructor() {
    this._deferredPromise = Promise.withResolvers();
  }

  checkMessageSend(aCurrentMessage) {
    do_check_transaction(server.playTransaction(), [
      "EHLO test",
      "MAIL FROM:<" +
        kTestFileSender[gMsgOrder[aCurrentMessage - 1]] +
        "> BODY=8BITMIME SIZE=" +
        gMsgFileData[gMsgOrder[aCurrentMessage - 1]].length,
      "RCPT TO:<" + kTestFileRecipient[gMsgOrder[aCurrentMessage - 1]] + ">",
      "DATA",
    ]);

    // Compare data file to what the server received.
    Assert.equal(
      gMsgFileData[gMsgOrder[aCurrentMessage - 1]],
      server._daemon.post
    );
  }

  // nsIMsgSendLaterListener
  onStartSending(aTotalMessageCount) {
    Assert.equal(aTotalMessageCount, gMsgOrder.length);
    Assert.equal(msgSendLater.sendingMessages, true);
  }
  onMessageStartSending(aCurrentMessage) {
    if (gLastSentMessage > 0) {
      this.checkMessageSend(aCurrentMessage);
    }
    Assert.equal(gLastSentMessage + 1, aCurrentMessage);
    gLastSentMessage = aCurrentMessage;
  }
  onMessageSendProgress(aCurrentMessage, aTotalMessageCount) {
    Assert.equal(aTotalMessageCount, gMsgOrder.length);
    Assert.equal(gLastSentMessage, aCurrentMessage);
    Assert.equal(msgSendLater.sendingMessages, true);
  }
  onMessageSendError(aCurrentMessage, aMessageHeader, aStatus) {
    throw new Error(
      "onMessageSendError should not have been called, status: " + aStatus
    );
  }
  onStopSending(aStatus, aMsg, aTotalTried, aSuccessful) {
    try {
      Assert.equal(aStatus, 0);
      Assert.equal(aTotalTried, aSuccessful);
      Assert.equal(msgSendLater.sendingMessages, false);

      // Check that the send later service now thinks we don't have messages to
      // send.
      Assert.equal(msgSendLater.hasUnsentMessages(identity), false);

      this.checkMessageSend(gLastSentMessage);
    } catch (e) {
      throw new Error(e);
    }
    // The extra timeout here is to work around an issue where sometimes
    // the sendUnsentMessages is completely synchronous up until onStopSending
    // and sometimes it isn't. This protects us for the synchronous case to
    // allow the sendUnsentMessages function to complete and exit before we
    // resolve the promise.
    PromiseTestUtils.promiseDelay(0).then(() => {
      this._deferredPromise.resolve(true);
    });
  }

  deferPromise() {
    this._deferredPromise = Promise.withResolvers();
  }

  get promise() {
    return this._deferredPromise.promise;
  }
}
