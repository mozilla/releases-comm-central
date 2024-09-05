/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var account;
var server;
var identity;
var smtpServer;
var msgSendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
  Ci.nsIMsgSendLater
);

add_setup(() => {
  // Ensure we have a local mail account, an normal account and appropriate
  // servers and identities.
  account = MailServices.accounts.createAccount();
  const incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "localhost",
    "pop3"
  );

  smtpServer = getBasicSmtpServer(1);
  identity = getSmtpIdentity("identity@foo.invalid", smtpServer);
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;
  MailServices.accounts.defaultAccount = account;

  Assert.equal(identity.doFcc, true);

  localAccountUtils.loadLocalMailAccount();
  localAccountUtils.rootFolder.createLocalSubfolder("Sent");
  MailServices.accounts.setSpecialFolders();

  // Check that the send later service thinks we don't have messages to send
  Assert.equal(msgSendLater.hasUnsentMessages(identity), false);

  registerCleanupFunction(() => {
    server.stop();

    MailServices.accounts.removeAccount(account, false);

    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  });
});

async function test_dsn_message_id(filename, messageIdPattern) {
  // Now prepare to actually "send" the message later, i.e. dump it in the
  // unsent messages folder.

  var compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  // Setting the compFields sender and recipient to any value is required to
  // survive mime_sanity_check_fields in nsMsgCompUtils.cpp. Sender and
  // recipient are required for sendMessageFile but SMTP transaction values will
  // be used directly from mail body. We don't set the DSN flag here, because
  // this is handled by the X-Mozilla-Draft-Info header in the message content.
  compFields.from = "irrelevant@foo.invalid";
  compFields.to = "irrelevant@foo.invalid";

  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  // Method from nsIMsgSendListener that's expected on the listener.
  copyListener.onGetDraftFolderURI = () => {};

  // Queue the message for sending.
  var msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );

  msgSend.sendMessageFile(
    identity,
    account.key,
    compFields,
    do_get_file(filename),
    false,
    false,
    Ci.nsIMsgSend.nsMsgQueueForLater,
    null,
    copyListener,
    null,
    null
  );
  await copyListener.promise;

  // Set up the SMTP server.
  server = setupServerDaemon();

  // Start the fake SMTP server
  server.start();
  smtpServer.QueryInterface(Ci.nsISmtpServer).port = server.port;

  var sendListener = new PromiseTestUtils.PromiseSendLaterListener();

  msgSendLater.addListener(sendListener);

  // Send the unsent message.
  msgSendLater.sendUnsentMessages(identity);
  server.performTest();
  const sendResult = await sendListener.promise;

  // Test that the message has been sent without any issue. We don't need to
  // look at the nsresult passed to onStopSending, because the promise would
  // have been rejected if it wasn't NS_OK.
  Assert.equal(
    sendResult.totalTried,
    1,
    "1 message send should have been attempted"
  );
  Assert.equal(
    sendResult.successful,
    1,
    "the message should have been sent successfully"
  );
  Assert.equal(
    msgSendLater.sendingMessages,
    false,
    "the nsIMsgSendLater instance should have stopped sending messages"
  );

  // Test that we sent a message ID that matches with the expected pattern.
  const mailFromLine = server.playTransaction().them[1];
  const testRegExp = new RegExp(`RET=FULL ENVID=<${messageIdPattern}>`);
  Assert.ok(
    testRegExp.test(mailFromLine),
    "smtp client should send a valid message ID"
  );
}

/**
 * Tests that a delayed send of a message with DSN turned on over SMTP results
 * in an SMTP command that includes a valid message ID, even if the message does
 * not include a Message-ID header.
 */
add_task(async function test_dsn_message_id_without_header() {
  await test_dsn_message_id("data/sendlater_dsn.eml", "[a-z0-9-]+@foo.invalid");
});

/**
 * Tests that a delayed send of a message with DSN turned on over SMTP results
 * in an SMTP command that includes the message ID from the message's Message-ID
 * header.
 */
add_task(async function test_dsn_message_id_with_header() {
  await test_dsn_message_id(
    "data/sendlater_dsn_with_message_id.eml",
    "f30c39e6-b14b-405a-8bf7-2ccc81fd1f6f@foo.invalid"
  );
});
