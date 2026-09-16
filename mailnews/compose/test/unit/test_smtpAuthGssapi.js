/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests AUTH GSSAPI for SMTP, in particular that any text a server appends to
 * the first "334 " continuation response is ignored. In GSSAPI the client
 * speaks first, so that challenge never carries a token, but Exchange puts a
 * human readable string there which is not valid base64.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { SMTP_GSSAPI_handler } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Smtpd.sys.mjs"
);

const kSecondChallenge = btoa("server-token");

// The challenges passed to nsIMailAuthModule.getNextToken, in order.
const gChallenges = [];
// Text the server appends to the first "334 " response.
var gFirstChallengeText = "";

var gServer;
var gSmtpServer;
var gIdentity;

/**
 * A stand-in for the real GSSAPI auth module, which would need a Kerberos
 * ticket. It records the challenges it is fed and hands out canned tokens.
 *
 * @implements {nsIMailAuthModule}
 */
const gMockAuthModule = {
  QueryInterface: ChromeUtils.generateQI(["nsIMailAuthModule"]),

  init(type, serviceName) {
    Assert.equal(type, "sasl-gssapi", "auth module type should be sasl-gssapi");
    Assert.equal(
      serviceName,
      "smtp@localhost",
      "auth module service name should be the smtp service"
    );
  },

  getNextToken(inToken) {
    gChallenges.push(inToken);
    return btoa(`client-token-${gChallenges.length}`);
  },
};

add_setup(async function () {
  gServer = setupServerDaemon(daemon => {
    const handler = new SMTP_GSSAPI_handler(daemon);
    handler.kFirstChallengeText = gFirstChallengeText;
    handler.kSecondChallenge = kSecondChallenge;
    return handler;
  });
  gServer.start();

  localAccountUtils.loadLocalMailAccount();
  gSmtpServer = getBasicSmtpServer(gServer.port);
  gSmtpServer.authMethod = Ci.nsMsgAuthMethod.GSSAPI;
  gIdentity = getSmtpIdentity("identity@foo.invalid", gSmtpServer);

  const mockCid = MockRegistrar.register(
    "@mozilla.org/mail/auth-module;1",
    gMockAuthModule
  );

  registerCleanupFunction(() => {
    MockRegistrar.unregister(mockCid);
    gServer.stop();
  });
});

/**
 * Sends a message, and returns the commands the server saw. Note that the
 * fake server does not record SASL continuation lines, so the tokens the
 * client sent are not part of it.
 *
 * @returns {string[]}
 */
async function sendMessage() {
  gChallenges.length = 0;
  gServer.resetTest();

  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(gIdentity, null);
  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
  gSmtpServer.sendMailMessage(
    do_get_file("data/message1.eml"),
    MailServices.headerParser.parseEncodedHeaderW("to@foo.invalid"),
    [],
    gIdentity,
    "from@foo.invalid",
    null,
    null,
    false,
    messageId,
    listener
  );
  await listener.promise;

  gSmtpServer.closeCachedConnections();
  let transaction = gServer.playTransaction();
  if (Array.isArray(transaction)) {
    transaction = transaction.at(-1);
  }
  return transaction.them;
}

/**
 * A server which follows RFC 4954 and sends a bare "334 ".
 */
add_task(async function testEmptyFirstChallenge() {
  gFirstChallengeText = "";

  const them = await sendMessage();

  Assert.deepEqual(
    gChallenges,
    ["", kSecondChallenge],
    "the challenges fed to the auth module should be the empty first challenge, then the server token"
  );
  Assert.ok(
    them.includes("AUTH GSSAPI"),
    "the client should have authenticated with GSSAPI"
  );
});

/**
 * Exchange appends text to the first "334 ". It is not base64 and must be
 * ignored rather than passed to the auth module.
 */
add_task(async function testTextAfterFirstChallenge() {
  gFirstChallengeText = "GSSAPI supported";

  const them = await sendMessage();

  Assert.deepEqual(
    gChallenges,
    ["", kSecondChallenge],
    "the text following the first 334 response should be ignored"
  );
  Assert.ok(
    them.includes("AUTH GSSAPI"),
    "the client should have authenticated with GSSAPI"
  );
});
