/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Protocol tests for SMTP.
 *
 * This test verifies:
 * - Sending a message to an SMTP server (which is also covered elsewhere).
 * - Correct reception of the message by the SMTP server.
 * - Correct saving of the message to the sent folder.
 *
 * Originally written to test bug 429891 where saving to the sent folder was
 * mangling the message.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var server;
var smtpServer;
var originalData;
var finished = false;
var identity = null;
var testFile = do_get_file("data/429891_testcase.eml");
var kTestFileSender = "from_A@foo.invalid";
var kTestFileRecipient = "to_A@foo.invalid";

var kIdentityMail = "identity@foo.invalid";

var msgSendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
  Ci.nsIMsgSendLater
);

// This listener handles the post-sending of the actual message and checks the
// sequence and ensures the data is correct.
function msll() {}

msll.prototype = {
  _initialTotal: 0,
  _startedSending: false,

  // nsIMsgSendLaterListener
  onStartSending(aTotalMessageCount) {
    this._initialTotal = 1;
    Assert.equal(msgSendLater.sendingMessages, true);
  },
  onMessageStartSending(
    aCurrentMessage,
    aTotalMessageCount,
    aMessageHeader,
    aIdentity
  ) {
    this._startedSending = true;
  },
  onMessageSendProgress(
    aCurrentMessage,
    aTotalMessageCount,
    aMessageSendPercent,
    aMessageCopyPercent
  ) {
    // XXX Enable this function
  },
  onMessageSendError(aCurrentMessage, aMessageHeader, aStatus, aMsg) {
    do_throw(
      "onMessageSendError should not have been called, status: " + aStatus
    );
  },
  onStopSending(aStatus, aMsg, aTotalTried, aSuccessful) {
    do_test_finished();
    print("msll onStopSending\n");
    try {
      Assert.equal(this._startedSending, true);
      Assert.equal(aStatus, 0);
      Assert.equal(aTotalTried, 1);
      Assert.equal(aSuccessful, 1);
      Assert.equal(this._initialTotal, 1);
      Assert.equal(msgSendLater.sendingMessages, false);

      do_check_transaction(server.playTransaction(), [
        "EHLO test",
        "MAIL FROM:<" +
          kTestFileSender +
          "> BODY=8BITMIME SIZE=" +
          originalData.length,
        "RCPT TO:<" + kTestFileRecipient + ">",
        "DATA",
      ]);

      // Compare data file to what the server received
      Assert.equal(originalData, server._daemon.post);

      finished = true;
    } catch (e) {
      do_throw(e);
    } finally {
      server.stop();

      var thread = Services.tm.currentThread;
      while (thread.hasPendingEvents()) {
        thread.processNextEvent(true);
      }
    }
  },
};

/* exported OnStopCopy */
// for head_compose.js
function OnStopCopy(aStatus) {
  dump("OnStopCopy()\n");

  try {
    Assert.equal(aStatus, 0);

    // Check this is false before we start sending
    Assert.equal(msgSendLater.sendingMessages, false);

    const folder = msgSendLater.getUnsentMessagesFolder(identity);

    // Check we have a message in the unsent message folder
    Assert.equal(folder.getTotalMessages(false), 1);

    // Check that the send later service thinks we have messages to send
    Assert.equal(msgSendLater.hasUnsentMessages(identity), true);

    // Now do a comparison of what is in the sent mail folder
    let msgData = mailTestUtils.loadMessageToString(
      folder,
      mailTestUtils.firstMsgHdr(folder)
    );
    // Skip the headers etc that mailnews adds
    var pos = msgData.indexOf("From:");
    Assert.notEqual(pos, -1);

    msgData = msgData.substr(pos);

    // Check the data is matching.
    Assert.equal(originalData, msgData);

    sendMessageLater();
  } catch (e) {
    do_throw(e);
  } finally {
    server.stop();

    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }

    finished = true;
  }
}

// This function does the actual send later
function sendMessageLater() {
  // Set up the SMTP server.
  server = setupServerDaemon();

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    // Start the fake SMTP server
    server.start();
    smtpServer.port = server.port;

    // A test to check that we are sending files correctly, including checking
    // what the server receives and what we output.
    test = "sendMessageLater";

    var messageListener = new msll();

    msgSendLater.addListener(messageListener);

    // Send the unsent message
    msgSendLater.sendUnsentMessages(identity);

    server.performTest();

    do_timeout(10000, function () {
      if (!finished) {
        do_throw("Notifications of message send/copy not received");
      }
    });
  } catch (e) {
    do_throw(e);
  } finally {
    server.stop();

    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  }
}

add_task(async function run_the_test() {
  // Test file - for bug 429891
  originalData = await IOUtils.readUTF8(testFile.path);

  // Ensure we have a local mail account, an normal account and appropriate
  // servers and identities.
  localAccountUtils.loadLocalMailAccount();

  // Check that the send later service thinks we don't have messages to send
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

  Assert.equal(identity.doFcc, true);

  // Now prepare to actually "send" the message later, i.e. dump it in the
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
    testFile,
    false,
    false,
    Ci.nsIMsgSend.nsMsgQueueForLater,
    null,
    copyListener,
    null,
    null
  );

  // Now we wait till we get copy notification of completion.
  do_test_pending();
});
