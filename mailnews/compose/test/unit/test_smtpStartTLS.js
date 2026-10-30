/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests connecting with STARTTLS, and that what the server sent in plaintext
 * before the TLS handshake, which could have been injected, is not used.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const { STARTTLS } = SMTP_RFC2821_handler.prototype;

let smtpServer, outgoingServer, identity;

add_setup(async function () {
  smtpServer = await ServerTestUtils.createServer({
    type: "smtp",
    baseOptions: {
      username: "user",
      password: "password",
      startTLS: true,
      tlsCertFile: "valid",
    },
    hostname: "test.test",
    port: 587,
  });

  localAccountUtils.loadLocalMailAccount();
  outgoingServer = getBasicSmtpServer(587, "test.test");
  outgoingServer.username = "user";
  outgoingServer.password = "password";
  outgoingServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
  outgoingServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;
  identity = getSmtpIdentity("identity@foo.invalid", outgoingServer);

  registerCleanupFunction(() => {
    SMTP_RFC2821_handler.prototype.STARTTLS = STARTTLS;
    outgoingServer.closeCachedConnections();
  });
});

async function sendMessage() {
  smtpServer.server.resetTest();
  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);
  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
  outgoingServer.sendMailMessage(
    do_get_file("data/message1.eml"),
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
  outgoingServer.closeCachedConnections();
  return [smtpServer.server.playTransaction()].flat().at(-1).them;
}

add_task(async function testStartTLS() {
  const commands = await sendMessage();
  Assert.deepEqual(
    commands.slice(0, 4),
    ["EHLO test", "STARTTLS", "EHLO test", "AUTH CRAM-MD5"],
    "the client should authenticate with CRAM-MD5 after STARTTLS"
  );
});

add_task(async function testInjectedResponse() {
  SMTP_RFC2821_handler.prototype.STARTTLS = function () {
    return STARTTLS.call(this) + "\n250-fakeserver greets you\n250 AUTH PLAIN";
  };
  const commands = await sendMessage();
  Assert.deepEqual(
    commands.slice(0, 4),
    ["EHLO test", "STARTTLS", "EHLO test", "AUTH CRAM-MD5"],
    "the capabilities injected before the TLS handshake should not be used"
  );
  SMTP_RFC2821_handler.prototype.STARTTLS = STARTTLS;
});
