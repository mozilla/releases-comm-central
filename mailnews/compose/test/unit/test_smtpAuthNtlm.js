/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that AUTH NTLM for SMTP fails the login, rather than stalling, when the
 * server sends a challenge the NTLM auth module rejects, when the auth module
 * can't be initialized, or when the user cancels the password prompt.
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

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

// The challenge the server sends in response to AUTH NTLM.
var gChallenge;
var gAuthFailedPrompts = 0;
var gPasswordPrompts = 0;

var gServer;
var gSmtpServer;
var gIdentity;

/* exported alert, confirmExPS, promptPasswordPS */
// for alertTestUtils.js
function alert() {}

function confirmExPS() {
  gAuthFailedPrompts++;
  // Cancel.
  return 1;
}

function promptPasswordPS() {
  gPasswordPrompts++;
  // Cancel.
  return false;
}

add_setup(function () {
  gServer = setupServerDaemon(daemon => {
    const handler = new SMTP_RFC2821_handler(daemon);
    handler.kAuthRequired = true;
    handler.kAuthSchemes = ["NTLM"];
    handler._kAuthSchemeStartFunction.NTLM = function () {
      this._nextAuthFunction = () => "535 Unexpected NTLM response";
      this._multiline = true;
      return `334 ${gChallenge}`;
    };
    handler.resetTest();
    return handler;
  });
  gServer.start();

  registerAlertTestUtils();

  localAccountUtils.loadLocalMailAccount();
  gSmtpServer = getBasicSmtpServer(gServer.port);
  gSmtpServer.authMethod = Ci.nsMsgAuthMethod.NTLM;
  gSmtpServer.username = "testsmtp";
  gSmtpServer.password = "smtptest";
  gIdentity = getSmtpIdentity("identity@foo.invalid", gSmtpServer);

  registerCleanupFunction(() => gServer.stop());
});

/**
 * Sends a message, which should fail.
 *
 * @param {string} description - What the test is about.
 * @returns {string[]} The commands the server received.
 */
async function sendMessageAndFail(description) {
  gAuthFailedPrompts = 0;
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
  await Assert.rejects(
    listener.promise,
    /./,
    `sending should fail ${description}`
  );

  gSmtpServer.closeCachedConnections();
  let transaction = gServer.playTransaction();
  if (Array.isArray(transaction)) {
    transaction = transaction.at(-1);
  }
  return transaction.them;
}

/**
 * Sends a message and checks that the login failed.
 *
 * @param {string} challenge - The challenge the server should send.
 */
async function checkLoginFails(challenge) {
  gChallenge = challenge;
  await sendMessageAndFail(`for challenge ${challenge}`);
  Assert.equal(
    gAuthFailedPrompts,
    1,
    `the user should be asked once what to do for challenge ${challenge}`
  );
}

add_task(async function testPaddingOnlyChallenge() {
  await checkLoginFails("====");
});

add_task(async function testInvalidChallenge() {
  await checkLoginFails("!!!!");
});

add_task(async function testInitFailure() {
  const mockCid = MockRegistrar.register("@mozilla.org/mail/auth-module;1", {
    QueryInterface: ChromeUtils.generateQI(["nsIMailAuthModule"]),
    init() {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    },
  });

  try {
    const them = await sendMessageAndFail("when the auth module fails");
    Assert.equal(
      gAuthFailedPrompts,
      1,
      "the user should be asked once what to do when the auth module fails"
    );
    Assert.ok(
      !them.some(command => command.startsWith("AUTH NTLM")),
      "AUTH NTLM should not be sent when the auth module fails"
    );
  } finally {
    MockRegistrar.unregister(mockCid);
  }
});

add_task(async function testPasswordPromptCancelled() {
  gSmtpServer.password = "";
  gPasswordPrompts = 0;

  try {
    const them = await sendMessageAndFail(
      "when the password prompt is cancelled"
    );
    Assert.equal(gPasswordPrompts, 1, "the password should be asked for");
    Assert.equal(
      gAuthFailedPrompts,
      0,
      "the user should not be asked what to do after cancelling"
    );
    Assert.ok(
      !them.some(command => command.startsWith("AUTH NTLM")),
      "AUTH NTLM should not be sent after cancelling"
    );
  } finally {
    gSmtpServer.password = "smtptest";
  }
});
