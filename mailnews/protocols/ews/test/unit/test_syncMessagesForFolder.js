/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

// TODO: Figure out inclusion of support files for providing responses to
// requests.

/**
 * An EWS client implementation against which we will test.
 *
 * @type {IEwsClient}
 */
var client;

/**
 * A mock Exchange server instance to provide request/response handling.
 *
 * @type {EwsServer}
 */
var ewsServer;

add_setup(() => {
  ewsServer = new EwsServer();
  ewsServer.start();

  // Create and configure the EWS incoming server.
  const server = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  server.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  client = Cc["@mozilla.org/messenger/ews-client;1"].createInstance(
    Ci.IEwsClient
  );
  client.initialize(server.getStringValue("ews_url"), server);

  registerCleanupFunction(() => {
    // We need to stop the mock server, but the client has no additional
    // teardown needed.
    ewsServer.stop();
  });
});

/**
 * Test sync where the server returns all changes and we don't have to
 * worry about batching.
 */
add_task(async function testSimpleSync() {
  const idsToSync = ewsServer.folders.map(f => f.id).filter(id => id != "root");
  const idsCreated = new Set();
  let foldersCreatedCount = 0;
  await new Promise((resolve, reject) => {
    client.syncFolderHierarchy(
      /** @implements {IEwsFolderCallbacks} */
      {
        recordRootFolder(id) {
          Assert.equal(id, "root", "root folder id should be 'root'");
        },
        create(id, _parentId, _name, _flags) {
          foldersCreatedCount++;
          Assert.ok(
            idsToSync.includes(id),
            `should create existing folder: ${id}`
          );
          Assert.ok(
            !idsCreated.has(id),
            `should not already have created folder: ${id}`
          );
          idsCreated.add(id);
        },
        update(id, _name) {
          Assert.ok(false, `should not update ${id} on initial sync`);
        },
        delete(id) {
          Assert.ok(false, `should not delete pdate ${id} on initial sync`);
        },
        updateSyncState(syncStateToken) {
          Assert.equal(
            foldersCreatedCount,
            idsToSync.length,
            "all folders should have synced"
          );
          Assert.equal(
            syncStateToken,
            "H4sIAAA==",
            "syncStateToken should be correct"
          );
          resolve();
        },
        onError(err, desc) {
          reject(new Error(`syncFolderHierarchy FAILED; ${err} - ${desc}`));
        },
      },
      null
    );
  });
});

/**
 * Test sync where the server tells us that not all changes are included
 * and we have to loop.
 */
add_task(async function testSecondSyncRequired() {}).skip(); // TODO: implement this.

/**
 * Test sync wherein we get more than ten changes in one response and
 * need to batch message header fetch.
 */
add_task(async function testMessageBatching() {}).skip(); // TODO: implement this.

/**
 * Test that we don't crash when the server gives us changes other than
 * Create.
 */
add_task(async function testNonCreateUpdate() {}).skip(); // TODO: implement this.
