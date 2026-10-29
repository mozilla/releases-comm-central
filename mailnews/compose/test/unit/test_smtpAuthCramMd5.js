/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that AUTH CRAM-MD5 for SMTP cancels the exchange and fails the login,
 * rather than stalling, when the server sends a challenge which isn't base64.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var gAuthFailedPrompts = 0;
// The continuation lines the server received during AUTH.
var gAuthLines = [];

var gServer;
var gSmtpServer;
var gIdentity;

/* exported alert, confirmExPS */
// for alertTestUtils.js
function alert() {}

function confirmExPS() {
  gAuthFailedPrompts++;
  // Cancel.
  return 1;
}

add_setup(function () {
  gServer = setupServerDaemon(daemon => {
    const handler = new SMTP_RFC2821_handler(daemon);
    handler.kAuthRequired = true;
    handler.kAuthSchemes = ["CRAM-MD5"];
    handler._kAuthSchemeStartFunction["CRAM-MD5"] = function () {
      this._nextAuthFunction = () => "535 Unexpected CRAM-MD5 response";
      this._multiline = true;
      return "334 !!!!";
    };
    const onMultiline = handler.onMultiline;
    handler.onMultiline = function (line) {
      gAuthLines.push(line);
      return onMultiline.call(this, line);
    };
    handler.resetTest();
    return handler;
  });
  gServer.start();

  registerAlertTestUtils();

  localAccountUtils.loadLocalMailAccount();
  gSmtpServer = getBasicSmtpServer(gServer.port);
  gSmtpServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;
  gSmtpServer.username = "testsmtp";
  gSmtpServer.password = "smtptest";
  gIdentity = getSmtpIdentity("identity@foo.invalid", gSmtpServer);

  registerCleanupFunction(() => gServer.stop());
});

add_task(async function testInvalidChallenge() {
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
    "sending should fail for an invalid challenge"
  );

  gSmtpServer.closeCachedConnections();
  Assert.deepEqual(
    gAuthLines,
    ["*"],
    "the exchange should be cancelled for an invalid challenge"
  );
  Assert.equal(
    gAuthFailedPrompts,
    1,
    "the user should be asked once what to do for an invalid challenge"
  );
});
