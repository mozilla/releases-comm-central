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

  const listener = {
    onSendStart() {},
    onSendStop(serverUri, status) {
      Assert.equal(status, Cr.NS_ERROR_FAILURE);
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
    MailServices.headerParser.parseEncodedHeaderW("to@foo.invalid"),
    [],
    identity,
    "from@foo.invalid",
    null,
    null,
    false,
    messageId,
    listener
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

  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
  const testFile = do_get_file("data/message1.eml");
  smtpServer.sendMailMessage(
    testFile,
    MailServices.headerParser.parseEncodedHeaderW("to@foo.invalid"),
    [],
    identity,
    "from@foo.invalid",
    null,
    null,
    false,
    messageId,
    listener
  );

  await listener.promise;

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

  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
  const testFile = do_get_file("data/message1.eml");
  smtpServer.sendMailMessage(
    testFile,
    MailServices.headerParser.parseEncodedHeaderW(
      "to1@foo.invalid,to2@foo.invalid,to1@foo.invalid"
    ),
    [],
    identity,
    "from@foo.invalid",
    null,
    null,
    false,
    messageId,
    listener
  );

  await listener.promise;

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

/**
 * Test that each queued send receives its own terminal status on connection
 * failure.
 */
add_task(async function testQueuedSendErrors() {
  const failedServer = setupServerDaemon();
  failedServer.start();
  registerCleanupFunction(() => failedServer.stop());

  const smtpServer = getBasicSmtpServer(failedServer.port);
  const identity = getSmtpIdentity("sender@example.invalid", smtpServer);

  // One client makes the second send wait. Limiting each connection to a
  // single message makes the client QUIT and release its connection as part
  // of completing the first send, so the later sends deterministically open
  // fresh connections to the stopped server instead of reusing a pooled
  // connection or racing a delayed QUIT timer.
  Services.prefs.setIntPref(
    "mail.smtpserver.default.max_cached_connections",
    1
  );
  Services.prefs.setIntPref(
    "mail.smtpserver.default.max_messages_per_connection",
    1
  );

  const send = label => {
    let resolveSendStop;
    const sendStopPromise = new Promise(resolve => {
      resolveSendStop = resolve;
    });
    const listener = {
      onSendStart() {},
      onSendStop(uri, status) {
        resolveSendStop({ label, status });
      },
    };
    smtpServer.sendMailMessage(
      do_get_file("data/message1.eml"),
      MailServices.headerParser.parseEncodedHeaderW(
        "recipient@example.invalid"
      ),
      [],
      identity,
      "sender@example.invalid",
      null,
      null,
      false,
      `<${label}@example.invalid>`,
      listener
    );
    return sendStopPromise;
  };

  const { status: firstStatus } = await send("first");
  Assert.equal(firstStatus, Cr.NS_OK, "first send should succeed");

  failedServer.stop();

  const results = await Promise.all([send("second"), send("third")]);
  Assert.deepEqual(
    results.map(({ label }) => label).sort(),
    ["second", "third"],
    "each queued send should receive a terminal status"
  );
  for (const { label, status } of results) {
    Assert.equal(
      status,
      Cr.NS_ERROR_CONNECTION_REFUSED,
      `${label} send should fail with a connection error`
    );
  }
});

/**
 * A failed 4xx retry must not disable retry for later messages on the client.
 */
add_task(async function testTransientFailureRetryPerMessage() {
  let mailAttempts = 0;
  const transientServer = setupServerDaemon(d => {
    /**
     *
     */
    class Handler extends SMTP_RFC2821_handler {
      MAIL() {
        mailAttempts++;
        return "451 Requested action aborted: local error in processing";
      }
    }
    return new Handler(d);
  });
  transientServer.start();
  registerCleanupFunction(() => transientServer.stop());

  const smtpServer = getBasicSmtpServer(transientServer.port);
  const identity = getSmtpIdentity("sender@example.invalid", smtpServer);

  const send = () => {
    const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
    smtpServer.sendMailMessage(
      do_get_file("data/message1.eml"),
      MailServices.headerParser.parseEncodedHeaderW(
        "recipient@example.invalid"
      ),
      [],
      identity,
      "sender@example.invalid",
      null,
      null,
      false,
      `<msg-${mailAttempts}@example.invalid>`,
      listener
    );
    return listener.promise.catch(() => {});
  };

  await send();
  const afterFirst = mailAttempts;
  Assert.equal(afterFirst, 2, "first message is tried twice");

  await send();
  Assert.equal(
    mailAttempts - afterFirst,
    2,
    "second message gets its own retry"
  );
});
