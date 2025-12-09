/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

/**
 * Sync the messages for the specified folder.
 *
 * @param {nsIMsgIncomingServer} incomingServer
 * @param {nsIMsgFolder} folder
 */
async function syncFolder(incomingServer, folder) {
  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.getNewMessages(folder, null, asyncUrlListener);
  return asyncUrlListener.promise;
}

/**
 * Set up an incoming server connected to an EWS test server.
 *
 * @returns {[EwsServer, nsIMsgIncomingServer]}
 */
function setupBasicEwsTestServer({ version = "Exchange2013" }) {
  // Ensure we have an on-disk profile.
  do_get_profile();

  // Create a new mock EWS server, and start it.
  const ewsServer = new EwsServer({ version });
  ewsServer.start();

  // Create and configure the EWS incoming server.
  const incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  registerCleanupFunction(async () => {
    incomingServer.shutdown();
    incomingServer.QueryInterface(Ci.IEwsIncomingServer);
    await TestUtils.waitForCondition(
      () => !incomingServer.protocolClientRunning,
      "waiting for the EWS client to shut down"
    );

    ewsServer.stop();
  });

  return [ewsServer, incomingServer];
}
