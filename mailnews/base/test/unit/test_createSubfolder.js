/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(async function testLocal() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;
  localRoot.createSubfolder("exists", null);

  await checkSucceeds(localRoot, "test Ϟ");
  await checkFails(localRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  await checkFails(localRoot, "exists", /NS_MSG_FOLDER_EXISTS/);

  // Check the deprecated sync function.
  await checkSucceedsSync(localRoot, "test ϰ");
  await checkThrowsSync(localRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  await checkThrowsSync(localRoot, "exists", /NS_MSG_FOLDER_EXISTS/);

  Assert.deepEqual(
    localRoot.subFolders.map(f => f.name).toSorted(),
    ["Trash", "Unsent Messages", "exists", "test Ϟ", "test ϰ"],
    "these folders should exist on the local account after the test"
  );
});

add_task(async function testIMAP() {
  const mockServer = await ServerTestUtils.createServer({ type: "imap" });

  const imapAccount = MailServices.accounts.createAccount();
  const imapServer = (imapAccount.incomingServer =
    MailServices.accounts.createIncomingServer("user", "localhost", "imap"));
  imapServer.port = mockServer.port;
  imapServer.password = "password";
  const imapRoot = imapServer.rootFolder;

  const testFolder = await checkSucceeds(imapRoot, "test Ϟ", "test &A94-");
  await checkFails(imapRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  mockServer.daemon.createMailbox("exists");
  await checkFails(imapRoot, "exists", /NS_MSG_ERROR_IMAP_COMMAND_FAILED/);

  // IMAP-only checks.
  // These return early instead of going to the server.
  await checkFails(imapRoot, "inBOx", /NS_MSG_FOLDER_EXISTS/); // Case-insensitive.
  await checkFails(imapRoot, "Trash", /NS_MSG_FOLDER_EXISTS/); // Case-sensitive.

  // These are the same but not on the root, so they should succeed.
  await checkSucceeds(testFolder, "INBOX");
  // FIXME: This doesn't actually work. Bug 2060425.
  // await checkSucceeds(testFolder, "Trash");

  // Check we get an error while offline.
  imapServer.closeCachedConnections();
  Services.io.offline = true;
  await checkFails(imapRoot, "offline", /NS_MSG_ERROR_OFFLINE/);
  Services.io.offline = false;

  // Check the deprecated sync function.
  await checkSucceedsSync(imapRoot, "test ϰ", "test &A,A-");
  await checkThrowsSync(imapRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  await checkFailsSync(imapRoot, "exists");

  Assert.deepEqual(
    mockServer.daemon.root.allChildren.map(m => m.fullName).toSorted(),
    [
      "INBOX",
      "Trash",
      "exists",
      "test Ϟ",
      "test Ϟ/INBOX",
      // "test Ϟ/Trash",
      "test ϰ",
    ],
    "these mailboxes should exist on the IMAP server after the test"
  );
});

add_task(async function testEWS() {
  const mockServer = await ServerTestUtils.createServer({ type: "ews" });
  mockServer.setRemoteFolders(mockServer.getWellKnownFolders());

  const ewsAccount = MailServices.accounts.createAccount();
  const ewsServer = (ewsAccount.incomingServer =
    MailServices.accounts.createIncomingServer("user", "localhost", "ews"));
  ewsServer.port = mockServer.port;
  ewsServer.password = "password";
  ewsServer.setStringValue(
    "ews_url",
    `http://localhost:${mockServer.port}/EWS/Exchange.asmx`
  );
  ewsServer.performExpand(null);
  await TestUtils.waitForCondition(
    () => ewsServer.rootFolder.getChildNamed("Drafts"),
    "waiting for folder sync to finish"
  );
  const ewsRoot = ewsServer.rootFolder;

  await checkSucceeds(ewsRoot, "test Ϟ");
  await checkFails(ewsRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  mockServer.appendRemoteFolder(new RemoteFolder("exists", "root"));
  await checkFails(ewsRoot, "exists", /NS_ERROR_UNEXPECTED/);

  // Check we get an error while offline.
  ewsServer.closeCachedConnections();
  Services.io.offline = true;
  await checkFails(ewsRoot, "offline", /NS_MSG_ERROR_OFFLINE/);
  Services.io.offline = false;

  // Check the deprecated sync function.
  await checkSucceedsSync(ewsRoot, "test ϰ");
  await checkThrowsSync(ewsRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  // FIXME: No event is fired. Bug 2060426.
  // await checkFailsSync(ewsRoot, "exists");

  Assert.deepEqual(
    mockServer.folders.map(f => f.displayName).toSorted(),
    [
      "Archives",
      "Deleted Items",
      "Drafts",
      "Inbox",
      "Junk",
      "Outbox",
      "Root",
      "Sent",
      "exists",
      "test Ϟ",
      "test ϰ",
    ],
    "these folders should exist on the EWS server after the test"
  );
});

add_task(async function testGraph() {
  const mockServer = await ServerTestUtils.createServer({ type: "graph" });
  mockServer.setRemoteFolders(mockServer.getWellKnownFolders());

  const graphAccount = MailServices.accounts.createAccount();
  const graphServer = (graphAccount.incomingServer =
    MailServices.accounts.createIncomingServer("user", "localhost", "graph"));
  graphServer.port = mockServer.port;
  graphServer.password = "password";
  graphServer.setStringValue("ews_url", `http://localhost:${mockServer.port}/`);
  graphServer.performExpand(null);
  await TestUtils.waitForCondition(
    () => graphServer.rootFolder.getChildNamed("Drafts"),
    "waiting for folder sync to finish"
  );
  const graphRoot = graphServer.rootFolder;

  await checkSucceeds(graphRoot, "test Ϟ");
  await checkFails(graphRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  // FIXME: There should be no alert here! It comes from the HTTP error response.
  // Bug 2056552.
  mockServer.appendRemoteFolder(new RemoteFolder("exists", "root"));
  Services.prefs.setBoolPref("mail.suppressAlertsForTests", true);
  await checkFails(graphRoot, "exists", /NS_ERROR_NET_ERROR_RESPONSE/);
  Services.prefs.clearUserPref("mail.suppressAlertsForTests");

  // Check we get an error while offline.
  graphServer.closeCachedConnections();
  Services.io.offline = true;
  await checkFails(graphRoot, "offline", /NS_MSG_ERROR_OFFLINE/);
  Services.io.offline = false;

  // Check the deprecated sync function.
  await checkSucceedsSync(graphRoot, "test ϰ");
  await checkThrowsSync(graphRoot, "", /NS_MSG_ERROR_INVALID_FOLDER_NAME/);
  // FIXME: No event is fired. Bug 2060426.
  // await checkFailsSync(graphRoot, "exists");

  Assert.deepEqual(
    mockServer.folders.map(f => f.displayName).toSorted(),
    [
      "Archives",
      "Deleted Items",
      "Drafts",
      "Inbox",
      "Junk",
      "Outbox",
      "Root",
      "Sent",
      "exists",
      "test Ϟ",
      "test ϰ",
    ],
    "these folders should exist on the Graph server after the test"
  );
});

/**
 * Check createSubfolderAsync succeeds and resolves with the created folder.
 *
 * @param {nsIMsgFolder} parent
 * @param {string} name
 * @param {string} [uriFrag]
 * @returns {nsIMsgFolder}
 */
async function checkSucceeds(parent, name, uriFrag = encodeURIComponent(name)) {
  info(`asynchronously creating "${name}" as a child of ${parent.URI}`);

  const folderAddedPromise = PromiseTestUtils.promiseFolderAdded(name);
  const testFolder = await parent.createSubfolderAsync(name);
  Assert.ok(testFolder, "the call should return the created folder");
  Assert.equal(
    testFolder.parent,
    parent,
    "the created folder should have the right parent"
  );
  Assert.equal(
    testFolder.URI,
    `${parent.URI}/${uriFrag}`,
    "the created folder should have the right URI"
  );
  await folderAddedPromise;

  return testFolder;
}

/**
 * Check createSubfolderAsync fails and rejects with the expected status.
 *
 * @param {nsIMsgFolder} parent
 * @param {string} name
 * @param {RegExp} errorRegExp
 */
async function checkFails(parent, name, errorRegExp) {
  info(`asynchronously creating "${name}" as a child of ${parent.URI}`);

  await Assert.rejects(
    parent.createSubfolderAsync(name),
    errorRegExp,
    errorRegExp.source
  );
}

/**
 * Check createSubfolder succeeds.
 *
 * @param {nsIMsgFolder} parent
 * @param {string} name
 * @param {string} [uriFrag]
 * @returns {nsIMsgFolder}
 */
async function checkSucceedsSync(
  parent,
  name,
  uriFrag = encodeURIComponent(name)
) {
  info(`synchronously creating "${name}" as a child of ${parent.URI}`);

  const folderAddedPromise = PromiseTestUtils.promiseFolderAdded(name);
  parent.createSubfolder(name, null);
  const testFolder = await folderAddedPromise;
  Assert.ok(testFolder, "the call should return the created folder");
  Assert.equal(
    testFolder.parent,
    parent,
    "the created folder should have the right parent"
  );
  Assert.equal(
    testFolder.URI,
    `${parent.URI}/${uriFrag}`,
    "the created folder should have the right URI"
  );

  return testFolder;
}

/**
 * Check createSubfolder throws the expected status.
 *
 * @param {nsIMsgFolder} parent
 * @param {string} name
 * @param {RegExp} errorRegExp
 */
async function checkThrowsSync(parent, name, errorRegExp) {
  info(`synchronously creating "${name}" as a child of ${parent.URI}`);

  Assert.throws(
    () => parent.createSubfolder(name, null),
    errorRegExp,
    errorRegExp.source
  );
}

/**
 * Check createSubfolder fails and emits the "FolderCreateFailed" event.
 *
 * @param {nsIMsgFolder} parent
 * @param {string} name
 */
async function checkFailsSync(parent, name) {
  info(`synchronously creating "${name}" as a child of ${parent.URI}`);

  const folderEventPromise = PromiseTestUtils.promiseFolderEvent(
    parent,
    "FolderCreateFailed"
  );
  parent.createSubfolder(name, null);
  await folderEventPromise;
}
