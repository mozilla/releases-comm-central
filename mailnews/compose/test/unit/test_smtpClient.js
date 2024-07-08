/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const server = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Test sending is aborted when alwaysSTARTTLS is set, but the server doesn't
 * support STARTTLS.
 */
add_task(async function testAbort() {
  server.resetTest();
  const smtpServer = getBasicSmtpServer(server.port);
  const identity = getSmtpIdentity("identity@foo.invalid", smtpServer);
  // Set to always use STARTTLS.
  smtpServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;

  do_test_pending();

  const requestObserver = {
    onStartRequest() {},
    onStopRequest(request, status) {
      // Test sending is aborted with NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS.
      Assert.equal(status, 0x80553126);
      do_test_finished();
    },
  };

  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);

  // Send a message.
  const testFile = do_get_file("data/message1.eml");
  smtpServer.sendMailMessage(
    testFile,
    "to@foo.invalid",
    identity,
    "from@foo.invalid",
    null,
    null,
    false,
    messageId,
    requestObserver
  );
  server.performTest();
});

/**
 * Test client identity extension works.
 */
add_task(async function testClientIdentityExtension() {
  server.resetTest();
  const smtpServer = getBasicSmtpServer(server.port);
  const identity = getSmtpIdentity("identity@foo.invalid", smtpServer);
  // Enable and set clientid to the smtp server.
  Services.prefs.setBoolPref(
    `mail.smtpserver.${smtpServer.key}.clientidEnabled`,
    true
  );
  smtpServer.QueryInterface(Ci.nsISmtpServer).clientid = "uuid-111";

  // Send a message.
  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);

  const requestObserver = new PromiseTestUtils.PromiseRequestObserver();
  const testFile = do_get_file("data/message1.eml");
  smtpServer.sendMailMessage(
    testFile,
    "to@foo.invalid",
    identity,
    "from@foo.invalid",
    null,
    null,
    false,
    messageId,
    requestObserver
  );

  await requestObserver.promise;

  // Check CLIENTID command is sent.
  const transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "EHLO test",
    "CLIENTID UUID uuid-111",
    "MAIL FROM:<from@foo.invalid> BODY=8BITMIME SIZE=159",
    "RCPT TO:<to@foo.invalid>",
    "DATA",
  ]);
});

/**
 * Test that when To and Cc/Bcc contain the same address, should send only
 * one RCPT TO per address.
 */
add_task(async function testDeduplicateRecipients() {
  server.resetTest();
  const smtpServer = getBasicSmtpServer(server.port);
  const identity = getSmtpIdentity("identity@foo.invalid", smtpServer);

  // Send a message, notice to1 appears twice in the recipients argument.
  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);

  const requestObserver = new PromiseTestUtils.PromiseRequestObserver();
  const testFile = do_get_file("data/message1.eml");
  smtpServer.sendMailMessage(
    testFile,
    "to1@foo.invalid,to2@foo.invalid,to1@foo.invalid",
    identity,
    "from@foo.invalid",
    null,
    null,
    false,
    messageId,
    requestObserver
  );

  await requestObserver.promise;

  // Check only one RCPT TO is sent for to1.
  const transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "EHLO test",
    "MAIL FROM:<from@foo.invalid> BODY=8BITMIME SIZE=159",
    "RCPT TO:<to1@foo.invalid>",
    "RCPT TO:<to2@foo.invalid>",
    "DATA",
  ]);
});
