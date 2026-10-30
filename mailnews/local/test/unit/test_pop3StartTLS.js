/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests connecting with STLS, and that what the server sent in plaintext
 * before the TLS handshake, which could have been injected, is not used.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const { STLS } = POP3_RFC5034_handler.prototype;

let pop3Server, incomingServer;

add_setup(async function () {
  pop3Server = await ServerTestUtils.createServer({
    type: "pop3",
    baseOptions: {
      username: "user",
      password: "password",
      startTLS: true,
      tlsCertFile: "valid",
    },
    hostname: "test.test",
    port: 110,
  });

  localAccountUtils.loadLocalMailAccount();
  incomingServer = localAccountUtils.create_incoming_server(
    "pop3",
    110,
    "user",
    "password",
    "test.test"
  );
  incomingServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
  incomingServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;

  registerCleanupFunction(() => {
    POP3_RFC5034_handler.prototype.STLS = STLS;
    incomingServer.closeCachedConnections();
  });
});

async function getMail() {
  pop3Server.server.resetTest();
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  await urlListener.promise;
  return [pop3Server.server.playTransaction()].flat().at(-1).them;
}

add_task(async function testStartTLS() {
  const commands = await getMail();
  Assert.deepEqual(
    commands.slice(0, 4),
    ["CAPA", "STLS", "CAPA", "AUTH CRAM-MD5"],
    "the client should authenticate with CRAM-MD5 after STLS"
  );
});

add_task(async function testInjectedResponse() {
  POP3_RFC5034_handler.prototype.STLS = function () {
    return (
      STLS.call(this) +
      "\r\n+OK Capability list follows\r\nUSER\r\nSASL PLAIN\r\n."
    );
  };
  const commands = await getMail();
  Assert.deepEqual(
    commands.slice(0, 4),
    ["CAPA", "STLS", "CAPA", "AUTH CRAM-MD5"],
    "the capabilities injected before the TLS handshake should not be used"
  );
  POP3_RFC5034_handler.prototype.STLS = STLS;
});
