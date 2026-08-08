/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that we close the connection ourselves when the server answers QUIT but
 * never closes the connection, which is what a server we can no longer reach
 * looks like.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

/**
 * Answers QUIT with 221 but leaves the connection open, like a server we can
 * no longer reach.
 */
class SMTP_no_close_on_quit_handler extends SMTP_RFC2821_handler {
  QUIT() {
    return "221 done";
  }
}

const server = setupServerDaemon(d => new SMTP_no_close_on_quit_handler(d));
server.start();
registerCleanupFunction(() => {
  server.stop();
});

add_task(async function testCloseAfterUnansweredQuit() {
  server.resetTest();
  const smtpServer = getBasicSmtpServer(server.port);
  const identity = getSmtpIdentity("sender@example.invalid", smtpServer);

  // Send QUIT right after the message instead of keeping the connection for a
  // second message.
  Services.prefs.setIntPref(
    "mail.smtpserver.default.max_messages_per_connection",
    1
  );

  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);

  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
  const testFile = do_get_file("data/message1.eml");
  smtpServer.sendMailMessage(
    testFile,
    MailServices.headerParser.parseEncodedHeaderW("recipient@example.invalid"),
    [],
    identity,
    "sender@example.invalid",
    null,
    null,
    false,
    messageId,
    listener
  );

  await listener.promise;

  const pool = smtpServer.wrappedJSObject;
  await TestUtils.waitForCondition(
    () => pool._freeConnections.length == 1,
    "the client should be back in the pool after sending"
  );
  const client = pool._freeConnections[0];

  // The current timer is 5 seconds, but we are a bit more leniant here.
  await TestUtils.waitForCondition(
    () => client.socket.readyState != "open",
    "the client should close a connection the server left open after QUIT",
    250,
    40
  );
});
