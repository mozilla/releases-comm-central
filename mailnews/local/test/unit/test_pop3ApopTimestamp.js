/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests parsing of the APOP timestamp from the POP3 greeting. With an
 * encrypted password and no SASL methods advertised, the client sends APOP if
 * it found a timestamp, and AUTH CRAM-MD5 otherwise.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// The kStateTransaction state of the fake server, i.e. authenticated.
const kStateTransaction = 3;

var gServer;
var gIncomingServer;
var gGreeting;

add_setup(function () {
  gServer = new nsMailServer(daemon => {
    const handler = new POP3_RFC5034_handler(daemon);
    // Accept CRAM-MD5 without advertising any SASL methods in CAPA.
    handler.kAuthSchemes = ["CRAM-MD5"];
    handler.capaAdditions = () => "";
    handler.APOP = function () {
      this._state = kStateTransaction;
      return "+OK";
    };
    const onStartup = handler.onStartup;
    handler.onStartup = function () {
      onStartup.call(this);
      return gGreeting;
    };
    return handler;
  }, new Pop3Daemon());
  gServer.start();

  gIncomingServer = createPop3ServerAndLocalFolders(gServer.port);
  gIncomingServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;

  registerCleanupFunction(() => {
    gServer.stop();
  });
});

/**
 * Connect with the given greeting and check the authentication command sent.
 *
 * @param {string} greeting - The greeting the server sends.
 * @param {string} expectedAuth - The authentication command expected.
 */
async function checkAuthCommand(greeting, expectedAuth) {
  gGreeting = greeting;
  gServer.resetTest();
  gIncomingServer.closeCachedConnections();

  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    gIncomingServer
  );
  await urlListener.promise;

  do_check_transaction(gServer.playTransaction(), [
    "CAPA",
    expectedAuth,
    "STAT",
  ]);
}

add_task(async function testTimestamp() {
  // MD5 of "<1896.697170952@dbc.mtview.ca.us>wilma".
  await checkAuthCommand(
    "+OK POP3 server ready <1896.697170952@dbc.mtview.ca.us>",
    "APOP fred 4a25ddaca298245cfadd76aa64bb2407"
  );
});

add_task(async function testTimestampFollowedByAngleBrackets() {
  // MD5 of "<1@a.b>wilma".
  await checkAuthCommand(
    "+OK hi <1@a.b> (see <http://x>)",
    "APOP fred 643842af5929c053d71b5abf11aab6f4"
  );
});

add_task(async function testNonAsciiTimestamp() {
  // MD5 of "<1@a.b>wilma".
  await checkAuthCommand(
    "+OK hi <\xFC@x> <1@a.b>",
    "APOP fred 643842af5929c053d71b5abf11aab6f4"
  );
});

add_task(async function testNoTimestamp() {
  await checkAuthCommand("+OK Fake POP3 server ready", "AUTH CRAM-MD5");
});

add_task(async function testUnterminatedTimestamps() {
  for (const greeting of [
    "+OK <" + "@".repeat(200000),
    "+OK <" + "a@".repeat(100000),
    "+OK " + "<".repeat(200000) + "a@b",
  ]) {
    await checkAuthCommand(greeting, "AUTH CRAM-MD5");
  }
});
