/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that cancelling the POP3 password prompt ends the session, for every
 * auth method that needs a password, and that the password is only asked for
 * once per auth attempt.
 */

var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var gPasswordPrompts = 0;
var gAuthFailedPrompts = 0;

/* exported alert, confirmExPS, promptPasswordPS */
// for alertTestUtils.js
function alert() {}

function confirmExPS() {
  gAuthFailedPrompts++;
  // Cancel.
  return 1;
}

// The password to enter at the prompt, or null to cancel it.
var gPromptPassword = null;

function promptPasswordPS(parent, title, text, password) {
  gPasswordPrompts++;
  if (gPromptPassword == null) {
    return false;
  }
  password.value = gPromptPassword;
  return true;
}

add_setup(function () {
  registerAlertTestUtils();
  localAccountUtils.loadLocalMailAccount();

  // The NTLM auth module is not what is tested here.
  const mockCid = MockRegistrar.register("@mozilla.org/mail/auth-module;1", {
    QueryInterface: ChromeUtils.generateQI(["nsIMailAuthModule"]),
    init() {},
    getNextToken() {
      return btoa("client-token");
    },
  });
  registerCleanupFunction(() => MockRegistrar.unregister(mockCid));
});

/**
 * Gets new mail with no saved password, cancels the password prompt, and
 * checks that the session ended without trying to log in.
 *
 * @param {string} name - The auth method expected to be used.
 * @param {nsMsgAuthMethod} authMethod - The auth method to configure.
 * @param {string[]} authSchemes - The AUTH mechanisms the server offers.
 * @param {string} [greeting] - The server greeting.
 */
async function checkCancel(name, authMethod, authSchemes, greeting) {
  const [, server, handler] = setupServerDaemon();
  handler.kAuthSchemes = authSchemes;
  if (greeting) {
    handler.onStartup = function () {
      this.closing = false;
      return greeting;
    };
  }
  server.start();

  const incomingServer = localAccountUtils.create_incoming_server(
    "pop3",
    server.port,
    "fred",
    ""
  );
  incomingServer.authMethod = authMethod;
  gPasswordPrompts = 0;
  gAuthFailedPrompts = 0;

  try {
    const urlListener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.pop3.GetNewMail(
      null,
      urlListener,
      localAccountUtils.inboxFolder,
      incomingServer
    );
    await Assert.rejects(
      urlListener.promise,
      e => e.message == Cr.NS_ERROR_ABORT,
      `${name}: getting mail should be aborted`
    );

    Assert.equal(gPasswordPrompts, 1, `${name}: password should be asked for`);
    Assert.equal(
      gAuthFailedPrompts,
      0,
      `${name}: the user should not be asked what to do after cancelling`
    );
    const loginCommands = server
      .playTransaction()
      .them.filter(command => /^(USER|AUTH \S|APOP)/.test(command));
    Assert.deepEqual(
      loginCommands,
      [],
      `${name}: no login should be attempted after cancelling`
    );
  } finally {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
    server.stop();
  }
}

add_task(async function testUserPass() {
  await checkCancel("USERPASS", Ci.nsMsgAuthMethod.passwordCleartext, []);
});

add_task(async function testPlain() {
  await checkCancel("PLAIN", Ci.nsMsgAuthMethod.passwordCleartext, ["PLAIN"]);
});

add_task(async function testLogin() {
  await checkCancel("LOGIN", Ci.nsMsgAuthMethod.passwordCleartext, ["LOGIN"]);
});

add_task(async function testCramMd5() {
  await checkCancel("CRAM-MD5", Ci.nsMsgAuthMethod.passwordEncrypted, [
    "CRAM-MD5",
  ]);
});

add_task(async function testApop() {
  await checkCancel(
    "APOP",
    Ci.nsMsgAuthMethod.passwordEncrypted,
    [],
    "+OK Fake POP3 server ready <1896.697170952@dbc.mtview.ca.us>"
  );
});

add_task(async function testNtlm() {
  await checkCancel("NTLM", Ci.nsMsgAuthMethod.NTLM, ["NTLM"]);
});

add_task(async function testEmptyPasswordAskedOnce() {
  const [, server, handler] = setupServerDaemon();
  handler.kAuthSchemes = ["CRAM-MD5"];
  server.start();

  const incomingServer = localAccountUtils.create_incoming_server(
    "pop3",
    server.port,
    "fred",
    ""
  );
  incomingServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;
  gPasswordPrompts = 0;
  gAuthFailedPrompts = 0;
  gPromptPassword = "";

  try {
    const urlListener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.pop3.GetNewMail(
      null,
      urlListener,
      localAccountUtils.inboxFolder,
      incomingServer
    );
    // The wrong password fails the login, and cancelling the dialog about
    // that ends the session.
    await Assert.rejects(urlListener.promise, /./, "getting mail should fail");
    Assert.equal(
      gPasswordPrompts,
      1,
      "an empty password should only be asked for once"
    );
    Assert.equal(gAuthFailedPrompts, 1, "the login should have failed");
  } finally {
    gPromptPassword = null;
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
    server.stop();
  }
});
