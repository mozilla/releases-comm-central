/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Tests sending a message in the background (checks auto-send works).
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var server;
var originalData;
var finished = false;
var identity = null;
var testFile1 = do_get_file("data/429891_testcase.eml");
var testFile2 = do_get_file("data/message1.eml");

var kTestFile1Sender = "from_A@foo.invalid";
var kTestFile1Recipient = "to_A@foo.invalid";

var kIdentityMail = "identity@foo.invalid";

var gMsgSendLater;

// This listener handles the post-sending of the actual message and checks the
// sequence and ensures the data is correct.
function msll() {}

msll.prototype = {
  _initialTotal: 0,

  // nsIMsgSendLaterListener
  onStartSending(aTotal) {
    this._initialTotal = 1;
    Assert.equal(gMsgSendLater.sendingMessages, true);
    Assert.equal(aTotal, 1);
  },
  onMessageStartSending() {},
  onMessageSendProgress() {},
  onMessageSendError(aCurrentMessage, aMessageHeader, aStatus) {
    do_throw(
      "onMessageSendError should not have been called, status: " + aStatus
    );
  },
  onStopSending(aStatus, aMsg, aTotalTried, aSuccessful) {
    do_test_finished();
    print("msll onStopSending\n");
    try {
      Assert.equal(aStatus, 0);
      Assert.equal(aTotalTried, 1);
      Assert.equal(aSuccessful, 1);
      Assert.equal(this._initialTotal, 1);
      Assert.equal(gMsgSendLater.sendingMessages, false);

      do_check_transaction(server.playTransaction(), [
        "EHLO test",
        "MAIL FROM:<" +
          kTestFile1Sender +
          "> BODY=8BITMIME SIZE=" +
          originalData.length,
        "RCPT TO:<" + kTestFile1Recipient + ">",
        "DATA",
      ]);

      // Compare data file to what the server received
      Assert.equal(originalData, server._daemon.post);

      // check there's still one message left in the folder
      Assert.equal(
        gMsgSendLater.getUnsentMessagesFolder(null).getTotalMessages(false),
        1
      );

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

add_task(async function run_the_test() {
  // The point of this test - send in background.
  Services.prefs.setBoolPref("mailnews.sendInBackground", true);

  // Ensure we have a local mail account, an normal account and appropriate
  // servers and identities.
  localAccountUtils.loadLocalMailAccount();

  // Now load (and internally initialize) the send later service
  gMsgSendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );

  // Test file - for bug 429891
  originalData = await IOUtils.readUTF8(testFile1.path);

  // Check that the send later service thinks we don't have messages to send
  Assert.equal(gMsgSendLater.hasUnsentMessages(identity), false);

  MailServices.accounts.setSpecialFolders();

  const account = MailServices.accounts.createAccount();
  const incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "localhost",
    "pop3"
  );

  // Start the fake SMTP server
  server = setupServerDaemon();
  server.start();
  var smtpServer = getBasicSmtpServer(server.port);
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
  var msgSend2 = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    // A test to check that we are sending files correctly, including checking
    // what the server receives and what we output.
    test = "sendMessageLater";

    var messageListener = new msll();

    gMsgSendLater.addListener(messageListener);

    // Send this message later - it shouldn't get sent
    msgSend.sendMessageFile(
      identity,
      "",
      compFields,
      testFile2,
      false,
      false,
      Ci.nsIMsgSend.nsMsgQueueForLater,
      null,
      null,
      null,
      null
    );

    // Send the unsent message in the background, because we have
    // mailnews.sendInBackground set, nsMsgSendLater should just send it for
    // us.
    msgSend2.sendMessageFile(
      identity,
      "",
      compFields,
      testFile1,
      false,
      false,
      Ci.nsIMsgSend.nsMsgDeliverBackground,
      null,
      null,
      null,
      null
    );

    server.performTest();

    do_timeout(10000, function () {
      if (!finished) {
        do_throw("Notifications of message send/copy not received");
      }
    });

    do_test_pending();
  } catch (e) {
    do_throw(e);
  } finally {
    server.stop();

    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  }
});
