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

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var server;
var sentFolder;
var originalData;
var finished = false;

var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";

function msl() {}

msl.prototype = {
  // nsIMsgSendListener
  onStartSending(aMsgID, aMsgSize) {},
  onProgress(aMsgID, aProgress, aProgressMax) {},
  onStatus(aMsgID, aMsg) {},
  onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    try {
      Assert.equal(aStatus, 0);

      do_check_transaction(server.playTransaction(), [
        "EHLO test",
        "MAIL FROM:<" + kSender + "> BODY=8BITMIME SIZE=" + originalData.length,
        "RCPT TO:<" + kTo + ">",
        "DATA",
      ]);

      // Compare data file to what the server received
      Assert.equal(originalData, server._daemon.post);
    } catch (e) {
      do_throw(e);
    } finally {
      server.stop();

      var thread = Services.tm.currentThread;
      while (thread.hasPendingEvents()) {
        thread.processNextEvent(false);
      }
    }
  },
  onGetDraftFolderURI(aMsgID, aFolderURI) {},
  onSendNotPerformed(aMsgID, aStatus) {},
  onTransportSecurityError(msgID, status, secInfo, location) {},

  // nsIMsgCopyServiceListener
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {},
  GetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    Assert.equal(aStatus, 0);
    try {
      // Now do a comparison of what is in the sent mail folder
      let msgData = mailTestUtils.loadMessageToString(
        sentFolder,
        mailTestUtils.firstMsgHdr(sentFolder)
      );

      // Skip the headers etc that mailnews adds
      var pos = msgData.indexOf("From:");
      Assert.notEqual(pos, -1);

      msgData = msgData.substr(pos);

      Assert.equal(originalData, msgData);
    } catch (e) {
      do_throw(e);
    } finally {
      finished = true;
      do_test_finished();
    }
  },

  // QueryInterface
  QueryInterface: ChromeUtils.generateQI([
    "nsIMsgSendListener",
    "nsIMsgCopyServiceListener",
  ]),
};

add_task(async function run_the_test() {
  server = setupServerDaemon();

  // Test file - for bug 429891
  var testFile = do_get_file("data/429891_testcase.eml");
  originalData = await IOUtils.readUTF8(testFile.path);

  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();

  MailServices.accounts.setSpecialFolders();

  server.start();
  var smtpServer = getBasicSmtpServer(server.port);
  var identity = getSmtpIdentity(kSender, smtpServer);

  sentFolder = localAccountUtils.rootFolder.createLocalSubfolder("Sent");

  Assert.equal(identity.doFcc, true);

  var msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    // A test to check that we are sending files correctly, including checking
    // what the server receives and what we output.
    test = "sendMessageFile";

    // Msg Comp Fields

    var compFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);

    compFields.from = identity.email;
    compFields.to = kTo;

    var messageListener = new msl();

    msgSend.sendMessageFile(
      identity,
      "",
      compFields,
      testFile,
      false,
      false,
      Ci.nsIMsgSend.nsMsgDeliverNow,
      null,
      messageListener,
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
