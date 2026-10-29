/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that AUTH LOGIN for SMTP sends no password when the user cancels the
 * password prompt.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var gPasswordPrompts = 0;
// The continuation lines the server received during AUTH.
var gAuthLines = [];

var gServer;
var gSmtpServer;
var gIdentity;

/* exported alert, promptPasswordPS */
// for alertTestUtils.js
function alert() {}

function promptPasswordPS() {
  gPasswordPrompts++;
  // Cancel.
  return false;
}

add_setup(function () {
  gServer = setupServerDaemon(daemon => {
    const handler = new SMTP_RFC2821_handler(daemon);
    handler.kAuthRequired = true;
    handler.kAuthSchemes = ["LOGIN"];
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
  gSmtpServer.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  gSmtpServer.username = "testsmtp";
  gIdentity = getSmtpIdentity("identity@foo.invalid", gSmtpServer);

  registerCleanupFunction(() => gServer.stop());
});

add_task(async function testPasswordPromptCancelled() {
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
    "sending should fail when the password prompt is cancelled"
  );

  Assert.equal(gPasswordPrompts, 1, "the password should be asked for");

  // The server reads everything the client sent before seeing it disconnect,
  // which the client only does once the QUIT close timeout expires.
  await TestUtils.waitForCondition(
    () => !gServer._readers.some(reader => reader.isRunning),
    "waiting for the client to disconnect",
    100,
    100
  );
  // The server is still waiting for the password, so it takes QUIT for it.
  Assert.deepEqual(
    gAuthLines,
    [btoa("testsmtp"), "QUIT"],
    "only the user name and QUIT should be sent during AUTH LOGIN"
  );
  Assert.deepEqual(
    gServer.playTransaction().them,
    ["EHLO test", "AUTH LOGIN"],
    "no password should be sent after QUIT"
  );
});
