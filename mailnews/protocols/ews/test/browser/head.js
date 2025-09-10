/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Set up an incoming server connected to an EWS test server.
 *
 * @param {object} serverConfig - The configuration for the mock server. See the
 *   constructor for `EwsServer` for the documentation of each available option.
 * @returns {[EwsServer, nsIMsgIncomingServer]}
 */
function setupEwsTestServer(serverConfig = {}) {
  const ewsServer = new EwsServer(serverConfig);
  ewsServer.start();
  const incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "127.0.0.1",
    "ews"
  );
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  incomingServer.prettyName = "EWS Account";
  incomingServer.password = "password";

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = incomingServer;

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(ewsAccount, false);
  });

  return [ewsServer, incomingServer];
}
