/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

var { MockEWSServer, RemoteFolder, getWellKnownFolders } =
  ChromeUtils.importESModule(
    "resource://testing-common/mailnews/EwsServer.sys.mjs"
  );

var incomingServer;
var ewsServer;

registerCleanupFunction(() => {
  ewsServer.stop();
  incomingServer.closeCachedConnections();
});

add_setup(async function () {
  // Ensure we have an on-disk profile.
  do_get_profile();

  // Create a new mock EWS server.
  ewsServer = new MockEWSServer();

  // Start the server.
  ewsServer.start();

  // Create and configure the EWS incoming server.
  incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  incomingServer.setUnicharValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
});

/**
 * Tests that triggering a folder hierarchy sync via
 * `nsIMsgFolder::GetNewMessages` correctly populates subfolders.
 */
add_task(async function test_get_new_messages() {
  // Populate the mock EWS server with all base folders.
  const folders = getWellKnownFolders();
  ewsServer.setRemoteFolders(folders);

  const rootFolder = incomingServer.rootFolder;
  rootFolder.getNewMessages(null, null);

  // Wait for the folders list to finish being synchronised.
  await TestUtils.waitForCondition(() => {
    // Folders are created in the order we give them to the EWS server in.
    // Therefore if the last one in the array has been created, we can safely
    // assume all of the folders have been correctly synchronised.
    const lastFolder = folders[folders.length - 1];

    // getChildNamed() throws with NS_ERROR_FAILURE if the child could not be
    // found.
    try {
      rootFolder.getChildNamed(lastFolder.mDisplayName);
      return true;
    } catch (e) {
      return false;
    }
  }, "waiting for subfolders to populate");

  // Check that all of the subfolders have been created.
  folders.forEach(folder => {
    if (folder.mDistinguishedId == "msgfolderroot") {
      // The root folder should not be a subfolder of itself.
      return;
    }

    // getChildNamed() throws with NS_ERROR_FAILURE if the child could not be
    // found.
    let found;
    try {
      rootFolder.getChildNamed(folder.mDisplayName);
      found = true;
    } catch (e) {
      found = false;
    }

    Assert.ok(found, `${folder.mDisplayName} should exists`);
  });
});
