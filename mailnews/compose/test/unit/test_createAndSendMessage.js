/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test createAndSendMessage creates a mail file when not using the editor.
 */

var server;
var sentFolder;
const originalData = "createAndSendMessage utf-8 test åäöÅÄÖ";
// This is the originalData converted to a byte string.
const expectedData = "createAndSendMessage utf-8 test Ã¥Ã¤Ã¶Ã\x85Ã\x84Ã\x96";
const expectedContentTypeHeaders =
  "Content-Type: text/plain; charset=UTF-8; format=flowed\r\nContent-Transfer-Encoding: 8bit\r\n\r\n";
var finished = false;

var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";

function checkData(msgData) {
  // Skip the headers etc that mailnews adds
  var pos = msgData.indexOf("Content-Type:");
  Assert.notEqual(pos, -1);

  msgData = msgData.substr(pos);

  Assert.equal(msgData, expectedContentTypeHeaders + expectedData + "\r\n");
}

function MessageListener() {}

MessageListener.prototype = {
  // nsIMsgSendListener
  onStartSending(aMsgID, aMsgSize) {},
  onProgress(aMsgID, aProgress, aProgressMax) {},
  onStatus(aMsgID, aMsg) {},
  onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    try {
      Assert.equal(aStatus, 0);

      // Compare data file to what the server received
      checkData(server._daemon.post);
    } catch (e) {
      do_throw(e);
    } finally {
      server.stop();

      var thread = gThreadManager.currentThread;
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
      const msgData = mailTestUtils.loadMessageToString(
        sentFolder,
        mailTestUtils.firstMsgHdr(sentFolder)
      );

      checkData(msgData);
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

/**
 * Call createAndSendMessage, expect onStopSending to be called.
 */
add_task(async function testCreateAndSendMessage() {
  server = setupServerDaemon();

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

    var messageListener = new MessageListener();

    msgSend.createAndSendMessage(
      null,
      identity,
      "",
      compFields,
      false,
      false,
      Ci.nsIMsgSend.nsMsgDeliverNow,
      null,
      "text/plain",
      // The following parameter is the message body, test that utf-8 is handled
      // correctly.
      originalData,
      null,
      null,
      messageListener,
      null,
      null,
      Ci.nsIMsgCompType.New
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

    var thread = gThreadManager.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  }
});
