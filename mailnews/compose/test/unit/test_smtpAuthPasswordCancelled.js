/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the password based SMTP auth methods aren't attempted, and the
 * login fails rather than stalls, when the user cancels the password prompt.
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

var gAuthFailedPrompts = 0;
var gPasswordPrompts = 0;
// The auth method the server offers.
var gAuthScheme;

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
    handler.kAuthSchemes = [gAuthScheme];
    handler.resetTest();
    return handler;
  });
  gServer.start();

  registerAlertTestUtils();

  localAccountUtils.loadLocalMailAccount();
  gSmtpServer = getBasicSmtpServer(gServer.port);
  gSmtpServer.username = "testsmtp";
  gIdentity = getSmtpIdentity("identity@foo.invalid", gSmtpServer);

  registerCleanupFunction(() => gServer.stop());
});

/**
 * Sends a message with the password prompt cancelled, and checks that the
 * login failed without trying the auth method.
 *
 * @param {string} authScheme - The auth method the server offers.
 * @param {nsMsgAuthMethodValue} authMethod - The auth method to use.
 */
async function checkPasswordPromptCancelled(authScheme, authMethod) {
  gAuthScheme = authScheme;
  gSmtpServer.authMethod = authMethod;
  gAuthFailedPrompts = 0;
  gPasswordPrompts = 0;
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
    `sending with ${authScheme} should fail when the password prompt is cancelled`
  );
  Assert.equal(
    gPasswordPrompts,
    1,
    `the password should be asked for with ${authScheme}`
  );
  Assert.equal(
    gAuthFailedPrompts,
    0,
    `the user should not be asked what to do after cancelling with ${authScheme}`
  );

  // The server reads everything the client sent before seeing it disconnect.
  await TestUtils.waitForCondition(
    () => !gServer._readers.some(reader => reader.isRunning),
    "waiting for the client to disconnect"
  );
  Assert.deepEqual(
    gServer.playTransaction().them,
    ["EHLO test", "QUIT"],
    `AUTH ${authScheme} should not be sent after cancelling`
  );

  // Clients keep the auth method they were created with, so don't reuse them.
  // Only do so now, since it sends another QUIT if the client hasn't noticed
  // the server closing the connection yet.
  gSmtpServer.closeCachedConnections();
}

add_task(async function testPlain() {
  await checkPasswordPromptCancelled(
    "PLAIN",
    Ci.nsMsgAuthMethod.passwordCleartext
  );
});

add_task(async function testLogin() {
  await checkPasswordPromptCancelled(
    "LOGIN",
    Ci.nsMsgAuthMethod.passwordCleartext
  );
});

add_task(async function testCramMd5() {
  await checkPasswordPromptCancelled(
    "CRAM-MD5",
    Ci.nsMsgAuthMethod.passwordEncrypted
  );
});
