/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Tests sending messages to addresses with non-ASCII characters.
 */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var test = null;
var server;
var finished = false;

var sentFolder;

var kSender = "from@foo.invalid";
var kToASCII = "to@foo.invalid";
var kToValid = "to@v\u00E4lid.foo.invalid";
var kToValidACE = "to@xn--vlid-loa.foo.invalid";
var kToInvalid = "b\u00F8rken.to@invalid.foo.invalid";
var kToInvalidWithoutDomain = "b\u00F8rken.to";
var NS_ERROR_ILLEGAL_LOCALPART = 0x80553139;

// for alertTestUtils.js
let resolveAlert;
function alertPS(parent, aDialogText, aText) {
  var composeProps = Services.strings.createBundle(
    "chrome://messenger/locale/messengercompose/composeMsgs.properties"
  );
  var expectedAlertMessage =
    composeProps.GetStringFromName("sendFailed") +
    "\n" +
    composeProps
      .GetStringFromName("errorIllegalLocalPart2")
      // Without the domain, we currently don't display any name in the
      // message part.
      .replace("%s", test == kToInvalidWithoutDomain ? "" : test);

  // we should only get here for the kToInvalid test case
  Assert.equal(aText, expectedAlertMessage);
  resolveAlert();
}

// message listener implementations
function MsgSendListener(aRecipient, originalData) {
  this.rcpt = aRecipient;
  this.originalData = originalData;
}

/**
 * @implements {nsIMsgSendListener}
 * @implements {nsIMsgCopyServiceListener}
 */
MsgSendListener.prototype = {
  // nsIMsgSendListener
  onStartSending(aMsgID, aMsgSize) {},
  onProgress(aMsgID, aProgress, aProgressMax) {},
  onStatus(aMsgID, aMsg) {},
  onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    try {
      if (test == kToValid || test == kToASCII) {
        Assert.equal(aStatus, 0);
        do_check_transaction(server.playTransaction(), [
          "EHLO test",
          "MAIL FROM:<" +
            kSender +
            "> BODY=8BITMIME SIZE=" +
            this.originalData.length,
          "RCPT TO:<" + this.rcpt + ">",
          "DATA",
        ]);
        // Compare data file to what the server received
        Assert.equal(this.originalData, server._daemon.post);
      } else {
        Assert.equal(aStatus, NS_ERROR_ILLEGAL_LOCALPART);
        do_check_transaction(server.playTransaction(), ["EHLO test"]);
        // Local address (before the @) has non-ascii char(s) or the @ is
        // missing from the address. An alert is triggered after the EHLO is
        // sent. Nothing else occurs so we "finish" the test to avoid
        // NS_ERROR_ABORT test failure due to timeout waiting for the send
        // (which doesn't occurs) to complete.
      }
    } catch (e) {
      do_throw(e);
    } finally {
      server.stop();
      var thread = gThreadManager.currentThread;
      while (thread.hasPendingEvents()) {
        thread.processNextEvent(false);
      }
      do_test_finished();
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
      Assert.equal(this.originalData, msgData);
    } catch (e) {
      do_throw(e);
    } finally {
      finished = true;
    }
  },

  // QueryInterface
  QueryInterface: ChromeUtils.generateQI([
    "nsIMsgSendListener",
    "nsIMsgCopyServiceListener",
  ]),
};

async function doSendTest(aRecipient, aRecipientExpected, waitForPrompt) {
  info(`Testing send to ${aRecipient} will get sent to ${aRecipientExpected}`);
  const promiseAlertReceived = new Promise(resolve => {
    resolveAlert = resolve;
  });
  test = aRecipient;
  server = setupServerDaemon();
  server.start();
  var smtpServer = getBasicSmtpServer(server.port);
  var identity = getSmtpIdentity(kSender, smtpServer);
  Assert.equal(identity.doFcc, true);

  // Random test file with data we don't actually care about. ;-)
  var testFile = do_get_file("data/message1.eml");
  var originalData = await IOUtils.readUTF8(testFile.path);

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    do_test_pending();
    var compFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);
    compFields.from = identity.email;
    compFields.to = aRecipient;

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
      Ci.nsIMsgSend.nsMsgDeliverNow,
      null,
      new MsgSendListener(aRecipientExpected, originalData),
      null,
      null
    );

    server.performTest();
    do_timeout(10000, function () {
      if (!finished) {
        do_throw("Notifications of message send/copy not received");
      }
    });
    if (waitForPrompt) {
      await promiseAlertReceived;
    }
  } catch (e) {
    Assert.ok(false, "Send fail: " + e);
  } finally {
    server.stop();
    var thread = gThreadManager.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  }
}

add_setup(function () {
  registerAlertTestUtils();

  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  MailServices.accounts.setSpecialFolders();
  sentFolder = localAccountUtils.rootFolder.createLocalSubfolder("Sent");
});

add_task(async function plainASCIIRecipient() {
  // Test 1:
  // Plain ASCII recipient address.
  await doSendTest(kToASCII, kToASCII, false);
});

add_task(async function domainContainsNonAscii() {
  // Test 2:
  // The recipient's domain part contains a non-ASCII character, hence the
  // address needs to be converted to ACE before sending.
  // The old code would just strip the non-ASCII character and try to send
  // the message to the remaining - wrong! - address.
  // The new code will translate the domain part to ACE for the SMTP
  // transaction (only), i.e. the To: header will stay as stated by the sender.
  await doSendTest(kToValid, kToValidACE, false);
});

add_task(async function localContainsNonAscii() {
  // Test 3:
  // The recipient's local part contains a non-ASCII character, which is not
  // allowed with unextended SMTP.
  // The old code would just strip the invalid character and try to send the
  // message to the remaining - wrong! - address.
  // The new code will present an informational message box and deny sending.
  await doSendTest(kToInvalid, kToInvalid, true);
});

add_task(async function invalidCharNoAt() {
  // Test 4:
  // Bug 856506. invalid char without '@' causes crash.
  await doSendTest(kToInvalidWithoutDomain, kToInvalidWithoutDomain, true);
});
