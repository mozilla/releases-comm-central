/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests AUTH NTLM for POP3: the auth module should get the server password,
 * and the login should fail, rather than stall, if the auth module can't be
 * initialized.
 */

var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// The kStateTransaction state of the fake server, i.e. authenticated.
const kStateTransaction = 3;

var gServer;
var gIncomingServer;

// The arguments the auth module was initialized with.
var gInitArgs;
var gInitShouldFail = false;

/**
 * A stand-in for the real NTLM auth module, which records how it was
 * initialized and hands out canned tokens.
 *
 * @implements {nsIMailAuthModule}
 */
const gMockAuthModule = {
  QueryInterface: ChromeUtils.generateQI(["nsIMailAuthModule"]),

  init(type, serviceName, serviceFlags, domain, username, password) {
    gInitArgs = { type, username, password };
    if (gInitShouldFail) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
  },

  getNextToken() {
    return btoa("client-token");
  },
};

add_setup(function () {
  gServer = new nsMailServer(daemon => {
    const handler = new POP3_RFC5034_handler(daemon);
    handler.kAuthSchemes = ["NTLM"];
    handler._kAuthSchemeStartFunction.NTLM = function () {
      this._multiline = true;
      this._nextAuthFunction = () => {
        this._multiline = true;
        this._nextAuthFunction = () => {
          this._state = kStateTransaction;
          return "+OK Hello friend!";
        };
        return `+ ${btoa("server-challenge")}`;
      };
      return "+";
    };
    return handler;
  }, new Pop3Daemon());
  gServer.start();

  gIncomingServer = createPop3ServerAndLocalFolders(gServer.port);
  gIncomingServer.authMethod = Ci.nsMsgAuthMethod.NTLM;

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
 * Gets new mail.
 *
 * @returns {Promise} Resolves or rejects with the result of getting mail.
 */
function getNewMail() {
  gInitArgs = null;
  gServer.resetTest();

  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    gIncomingServer
  );
  return urlListener.promise;
}

add_task(async function testPassword() {
  await getNewMail();

  Assert.deepEqual(
    gInitArgs,
    { type: "ntlm", username: "fred", password: "wilma" },
    "the auth module should be initialized with the server password"
  );
  do_check_transaction(gServer.playTransaction(), [
    "AUTH",
    "CAPA",
    "AUTH NTLM",
    "STAT",
  ]);
});

add_task(async function testInitFailure() {
  gInitShouldFail = true;
  try {
    await Assert.rejects(
      getNewMail(),
      /./,
      "getting mail should fail when the auth module fails"
    );
    do_check_transaction(gServer.playTransaction(), ["AUTH", "CAPA"]);
  } finally {
    gInitShouldFail = false;
  }
});
