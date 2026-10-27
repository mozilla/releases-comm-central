/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that an OAuth2 token is never sent over an unencrypted connection,
// unless the server is on a loopback address.

const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

const LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  Ci.nsILoginInfo,
  "init"
);

const HOSTNAME = "test.test";

let ewsServer, graphServer;

add_setup(async function () {
  do_get_profile();

  ewsServer = new EwsServer();
  ewsServer.start();
  NetworkTestUtils.configureProxy(HOSTNAME, 80, ewsServer.port);

  graphServer = new GraphServer();
  graphServer.start();
  NetworkTestUtils.configureProxy(HOSTNAME, 8080, graphServer.port);

  const oAuth2Server = await OAuth2TestUtils.startServer();
  oAuth2Server.grantedScope = "test_mail";
  await Services.logins.addLoginAsync(
    new LoginInfo(
      `oauth://${HOSTNAME}`,
      null,
      "test_mail",
      "user",
      "refresh_token",
      "",
      ""
    )
  );

  registerCleanupFunction(async () => {
    NetworkTestUtils.clearProxy();
    OAuth2TestUtils.stopServer();
    ewsServer.stop();
    graphServer.stop();
    await Services.logins.removeAllLoginsAsync();
  });
});

/**
 * Creates an OAuth2 account of the given type using the given URL, verifies
 * the logon, then removes the account.
 *
 * @param {"ews"|"graph"} type
 * @param {string} url
 */
async function verifyLogon(type, url) {
  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    HOSTNAME,
    type
  );
  const incomingServer = account.incomingServer;
  incomingServer.setStringValue("ews_url", url);
  incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  try {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    incomingServer.verifyLogon(listener, null);
    await listener.promise;
  } finally {
    incomingServer.shutdown();
    incomingServer.QueryInterface(Ci.IExchangeIncomingServer);
    await TestUtils.waitForCondition(
      () => !incomingServer.protocolClientRunning,
      `waiting for the ${type} client to shut down`
    );
    MailServices.accounts.removeAccount(account, false);
  }
}

add_task(async function test_ews_insecure() {
  await Assert.rejects(
    verifyLogon("ews", `http://${HOSTNAME}/EWS/Exchange.asmx`),
    new RegExp(Cr.NS_ERROR_UNEXPECTED),
    "the request should fail"
  );
  Assert.equal(
    ewsServer.lastAuthorizationValue,
    undefined,
    "the server should not have received any credentials"
  );
});

add_task(async function test_ews_loopback() {
  await verifyLogon(
    "ews",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  Assert.equal(
    ewsServer.lastAuthorizationValue,
    "Bearer access_token",
    "the server should have received the OAuth2 token"
  );
});

add_task(async function test_graph_insecure() {
  await Assert.rejects(
    verifyLogon("graph", `http://${HOSTNAME}:8080/`),
    new RegExp(Cr.NS_ERROR_UNEXPECTED),
    "the request should fail"
  );
});

add_task(async function test_graph_loopback() {
  await verifyLogon("graph", `http://127.0.0.1:${graphServer.port}/`);
});
