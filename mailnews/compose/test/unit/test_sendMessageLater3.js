/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Protocol tests for SMTP.
 *
 * For trying to send a message later with no server connected, this test
 * verifies:
 *   - A correct status response.
 *   - A correct state at the end of attempting to send.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var originalData;
var identity = null;
var testFile = do_get_file("data/429891_testcase.eml");

var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";

// for alertTestUtils.js
function alertPS(parent, aDialogTitle, aText) {
  dump("Hiding Alert {\n" + aText + "\n} End Alert\n");
}

add_task(async function run_the_test() {
  const msgSendLater = Cc[
    "@mozilla.org/messengercompose/sendlater;1"
  ].getService(Ci.nsIMsgSendLater);
  const sendLaterListener = new PromiseTestUtils.PromiseSendLaterListener();
  msgSendLater.addListener(sendLaterListener);

  registerAlertTestUtils();

  // Test file - for bug 429891
  originalData = await IOUtils.readUTF8(testFile.path);

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

  var smtpServer = getBasicSmtpServer();
  identity = getSmtpIdentity(kSender, smtpServer);

  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;
  MailServices.accounts.defaultAccount = account;

  localAccountUtils.rootFolder.createLocalSubfolder("Sent");

  identity.doFcc = false;

  // Now prepare to actually "send" the message later, i.e. dump it in the
  // unsent messages folder.

  var compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  compFields.from = identity.email;
  compFields.to = kTo;

  const msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  const sendListener = new PromiseTestUtils.PromiseCopySendListener();
  msgSend.sendMessageFile(
    identity,
    "",
    compFields,
    testFile,
    false,
    false,
    Ci.nsIMsgSend.nsMsgQueueForLater,
    null,
    sendListener,
    null
  );

  // Now we wait till we get copy notification of completion.
  await sendListener.promise;

  Assert.equal(msgSendLater.sendingMessages, false);
  const folder = msgSendLater.getUnsentMessagesFolder(identity);
  Assert.equal(msgSendLater.hasUnsentMessages(identity), true);
  Assert.equal(
    folder.getTotalMessages(false),
    1,
    "should have a a message in the outbox"
  );

  // Now do a comparison of what is in the unsent mail folder
  let msgData = mailTestUtils.loadMessageToString(
    folder,
    mailTestUtils.firstMsgHdr(folder)
  );

  // Skip the headers etc that mailnews adds
  const pos = msgData.indexOf("From:");
  Assert.notEqual(pos, -1);

  msgData = msgData.substr(pos);

  // Check the data is matching.
  Assert.equal(originalData, msgData);

  // Send the unsent message
  msgSendLater.sendUnsentMessages(identity);
  try {
    await sendLaterListener.promise;
    Assert.ok(false, "sending should fail");
  } catch (e) {
    Assert.ok(true, "sending should fail");
  }

  Assert.equal(
    msgSendLater.sendingMessages,
    false,
    "the nsIMsgSendLater instance should have stopped sending messages"
  );

  Assert.ok(
    msgSendLater.hasUnsentMessages(identity),
    "should still have messages to send"
  );
});
