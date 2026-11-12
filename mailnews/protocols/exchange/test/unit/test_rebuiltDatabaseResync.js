/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that an Exchange folder whose database has to be rebuilt gets all of
 * its messages back, and keeps them, with EWS and Graph, and with both message
 * stores.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

const generator = new MessageGenerator();

const MESSAGE_COUNT = 3;

/**
 * Fetch the full text of a message, downloading it into the offline store if
 * needed.
 *
 * Copied from `getMessageText()` in test_syncMessagesForFolder.js.
 *
 * @param {nsIMsgDBHdr} header
 * @returns {Promise<string>}
 */
async function getMessageText(header) {
  const uri = header.folder.generateMessageURI(header.messageKey);
  const service = MailServices.messageServiceFromURI(uri);

  const deferred = Promise.withResolvers();
  NetUtil.asyncFetch(
    {
      uri: service.getUrlForUri(uri),
      loadUsingSystemPrincipal: true,
    },
    stream => {
      deferred.resolve(
        NetUtil.readInputStreamToString(stream, stream.available())
      );
    }
  );
  return deferred.promise;
}

/**
 * Count the headers in the folder's database. This opens the database if it
 * isn't open yet (going through ExchangeFolder::GetDatabase()).
 *
 * @param {nsIMsgFolder} folder
 * @returns {integer}
 */
function countHeaders(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}

/**
 * Run the test against a new account of the given protocol, using the given
 * message store.
 *
 * @param {"ews"|"graph"} protocol
 * @param {string} storeContractID
 */
async function runRebuiltDatabaseTest(protocol, storeContractID) {
  // The store is chosen when the server is created.
  Services.prefs.setCharPref(
    "mail.serverDefaultStoreContractID",
    storeContractID
  );
  const isMaildir = storeContractID == "@mozilla.org/msgstore/maildirstore;1";
  const storeType = isMaildir ? "maildir" : "mbox";

  // Use a different username for each test, so that the accounts don't share
  // folder URIs.
  const setupServer =
    protocol == "ews" ? setupBasicEwsTestServer : setupBasicGraphTestServer;
  const [mockServer, incomingServer] = setupServer({
    username: `${protocol}${storeType}user`,
  });
  Assert.equal(
    incomingServer.msgStore.storeType,
    storeType,
    "the server should use the expected message store"
  );

  const folderName = `rebuilt_db_${protocol}_${storeType}`;
  mockServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, folderName)
  );

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);
  const folder = rootFolder.getChildNamed(folderName);
  Assert.ok(folder, "the test folder should have been created locally");

  mockServer.addMessages(
    folderName,
    generator.makeMessages({ count: MESSAGE_COUNT })
  );

  // Initial sync.

  await syncFolder(incomingServer, folder);
  Assert.equal(
    countHeaders(folder),
    MESSAGE_COUNT,
    "all the messages should have been synced"
  );
  const initialSyncState = folder.getStringProperty("ewsSyncStateToken");
  Assert.ok(initialSyncState, "the sync state should have been saved");

  // Download the messages into the offline store. For maildir, this creates
  // the folder's "cur/" directory, after which the database is only valid if
  // its "maildirValid" flag is set.
  for (const header of [...folder.messages]) {
    await getMessageText(header);
  }
  for (const header of [...folder.messages]) {
    Assert.ok(header.storeToken, "the message should have been stored");
  }
  if (isMaildir) {
    Assert.ok(
      await IOUtils.exists(PathUtils.join(folder.filePath.path, "cur")),
      "the maildir folder should have a cur/ directory"
    );
  }

  // Force the database to be rebuilt: close it and remove its summary file.
  // Don't let the event loop spin in between, so nothing can reopen it.
  folder.ForceDBClosed();
  const summaryFile = folder.summaryFile;
  Assert.ok(summaryFile.exists(), "the summary file should exist");
  summaryFile.remove(false);

  // Reopen the database. This must happen before reading the sync state: the
  // folder cache is read first, and only the rebuild resets it.
  Assert.equal(countHeaders(folder), 0, "the rebuilt database should be empty");
  Assert.equal(
    folder.getStringProperty("ewsSyncStateToken"),
    "",
    "the sync state should have been reset along with the database"
  );
  Assert.ok(
    folder.msgDatabase.summaryValid,
    "the rebuilt database should be valid"
  );
  if (isMaildir) {
    Assert.ok(
      folder.msgDatabase.dBFolderInfo.getBooleanProperty("maildirValid", false),
      "the rebuilt maildir database should be marked valid"
    );
  }

  // Sync again: since the sync state was reset, everything should come back.

  await syncFolder(incomingServer, folder);
  Assert.equal(
    countHeaders(folder),
    MESSAGE_COUNT,
    "all the messages should be back after syncing the rebuilt database"
  );
  Assert.ok(
    folder.getStringProperty("ewsSyncStateToken"),
    "a new sync state should have been saved"
  );

  // Close and reopen the database (as happens on restart). It must not be
  // considered out of date and thrown away again.

  folder.ForceDBClosed();
  Assert.equal(
    countHeaders(folder),
    MESSAGE_COUNT,
    "the rebuilt database should still be populated after being reopened"
  );
  Assert.ok(
    folder.getStringProperty("ewsSyncStateToken"),
    "the sync state should have survived reopening the database"
  );
  if (isMaildir) {
    Assert.ok(
      folder.msgDatabase.dBFolderInfo.getBooleanProperty("maildirValid", false),
      "the reopened maildir database should still be marked valid"
    );
  }
}

for (const protocol of ["ews", "graph"]) {
  for (const store of [
    "@mozilla.org/msgstore/berkeleystore;1",
    "@mozilla.org/msgstore/maildirstore;1",
  ]) {
    add_task(async function test_rebuiltDatabaseResync() {
      await runRebuiltDatabaseTest(protocol, store);
    });
  }
}
