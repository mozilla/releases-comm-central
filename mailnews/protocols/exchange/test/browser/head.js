/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Sync the messages for the specified folder.
 *
 * @param {nsIMsgIncomingServer} incomingServer - The incoming server to use for
 *   syncing.
 * @param {nsIMsgFolder} folder - The specific folder to sync on this server.
 */
async function syncFolder(incomingServer, folder) {
  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.getNewMessages(folder, null, asyncUrlListener);
  return asyncUrlListener.promise;
}

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

  registerCleanupFunction(async () => {
    incomingServer.shutdown();
    incomingServer.QueryInterface(Ci.IEwsIncomingServer);
    await TestUtils.waitForCondition(
      () => !incomingServer.protocolClientRunning,
      "waiting for the EWS client to shut down"
    );

    ewsServer.stop();
    MailServices.accounts.removeAccount(ewsAccount, false);
  });

  return [ewsServer, incomingServer];
}

/**
 * Open the folder properties window for a given folder. This function has been
 * largely copied from the one with the same name in
 * mail/base/test/browser/browser_repairFolder.js.
 *
 * @param {nsIMsgFolder} folder - The folder which properties to open.
 * @returns {object} - The window for the folder properties dialog.
 */
async function openFolderProperties(folder) {
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const { folderPane } = about3Pane;

  const folderPaneContext =
    about3Pane.document.getElementById("folderPaneContext");
  const folderPaneContextProperties = about3Pane.document.getElementById(
    "folderPaneContext-properties"
  );

  EventUtils.synthesizeMouseAtCenter(
    folderPane.getRowForFolder(folder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "shown");

  const windowOpenedPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  folderPaneContext.activateItem(folderPaneContextProperties);

  return windowOpenedPromise;
}
