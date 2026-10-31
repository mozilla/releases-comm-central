/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that AUTH CRAM-MD5 for POP3 cancels the exchange and fails the login,
 * rather than stalling, when the server sends a challenge which isn't base64.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var gAuthFailedPrompts = 0;
// The continuation lines the server received during AUTH.
var gAuthLines = [];

var gServer;
var gIncomingServer;

/* exported alert, confirmExPS */
// for alertTestUtils.js
function alert() {}

function confirmExPS() {
  gAuthFailedPrompts++;
  // Cancel.
  return 1;
}

add_setup(function () {
  gServer = new nsMailServer(daemon => {
    const handler = new POP3_RFC5034_handler(daemon);
    handler.kAuthSchemes = ["CRAM-MD5"];
    handler._kAuthSchemeStartFunction["CRAM-MD5"] = function () {
      this._nextAuthFunction = () => "-ERR Unexpected CRAM-MD5 response";
      this._multiline = true;
      return "+ !!!!";
    };
    const onMultiline = handler.onMultiline;
    handler.onMultiline = function (line) {
      gAuthLines.push(line);
      return onMultiline.call(this, line);
    };
    return handler;
  }, new Pop3Daemon());
  gServer.start();

  registerAlertTestUtils();

  gIncomingServer = createPop3ServerAndLocalFolders(gServer.port);
  gIncomingServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;

  registerCleanupFunction(() => gServer.stop());
});

add_task(async function testInvalidChallenge() {
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    false,
    urlListener,
    localAccountUtils.inboxFolder,
    gIncomingServer
  );
  await Assert.rejects(
    urlListener.promise,
    /./,
    "getting mail should fail for an invalid challenge"
  );

  do_check_transaction(gServer.playTransaction(), [
    "AUTH",
    "CAPA",
    "AUTH CRAM-MD5",
  ]);
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
