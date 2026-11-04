/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that concurrent offline downloads into one folder store each message
 * under its own header, with EWS and Graph, and with both message stores.
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
 * needed. Rejects if the fetch fails.
 *
 * Adapted from `getMessageText()` in test_syncMessagesForFolder.js, with a
 * check of the request's status.
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
    (stream, status) => {
      if (!Components.isSuccessCode(status)) {
        deferred.reject(
          new Error(`fetching message ${header.messageKey} failed: ${status}`)
        );
        return;
      }
      deferred.resolve(
        NetUtil.readInputStreamToString(stream, stream.available())
      );
    }
  );
  return deferred.promise;
}

/**
 * Helper to read a stream until EOF, returning the contents as a string.
 *
 * Copied from mailnews/local/test/unit/test_nsIMsgPluggableStore.js.
 *
 * @param {nsIInputStream} inStream
 * @returns {string}
 */
function readAll(inStream) {
  const sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sstream.init(inStream);
  let data = "";
  let str = sstream.read(1024 * 16);
  while (str.length) {
    data += str;
    str = sstream.read(1024 * 16);
  }
  sstream.close();
  return data;
}

/**
 * Extract the Message-ID from a raw message, without angle brackets.
 *
 * @param {string} rawMessage
 * @returns {?string}
 */
function messageIdOf(rawMessage) {
  const match = rawMessage.match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
  return match ? match[1] : null;
}

/**
 * Run the test against a new account of the given protocol, using the given
 * message store.
 *
 * @param {"ews"|"graph"} protocol
 * @param {string} storeContractID
 */
async function runConcurrentFetchTest(protocol, storeContractID) {
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

  const folderName = `concurrent_fetch_${protocol}_${storeType}`;
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
  await syncFolder(incomingServer, folder);

  const keys = [...folder.messages].map(header => header.messageKey);
  Assert.equal(
    keys.length,
    MESSAGE_COUNT,
    "all the messages should have been synced"
  );
  for (const key of keys) {
    Assert.ok(
      !folder.hasMsgOffline(key),
      "no message should be available offline before fetching it"
    );
  }

  // Start all the downloads at once, without waiting for any of them, and
  // fetch the first message three times. Each asyncFetch() opens its channel
  // synchronously, so none of the messages is offline yet when the channels
  // start and they all go to the server.
  const fetchedKeys = [...keys, keys[0], keys[0]];
  const texts = await Promise.all(
    fetchedKeys.map(key =>
      getMessageText(folder.msgDatabase.getMsgHdrForKey(key))
    )
  );

  for (let i = 0; i < fetchedKeys.length; i++) {
    const header = folder.msgDatabase.getMsgHdrForKey(fetchedKeys[i]);
    Assert.equal(
      messageIdOf(texts[i]),
      header.messageId,
      `fetch #${i} should return the content of the requested message`
    );
  }

  // Each header should now be linked to its own content in the offline store.
  const storeTokens = new Set();
  for (const key of keys) {
    Assert.ok(
      folder.hasMsgOffline(key),
      "the message should be available offline"
    );
    const header = folder.msgDatabase.getMsgHdrForKey(key);
    Assert.ok(header.storeToken, "the message should have a storeToken");
    storeTokens.add(header.storeToken);

    const stored = readAll(folder.getMsgInputStream(header));
    Assert.equal(
      messageIdOf(stored),
      header.messageId,
      "the stored content should belong to the message it is linked to"
    );
  }
  Assert.equal(
    storeTokens.size,
    keys.length,
    "each message should have its own storeToken"
  );
}

for (const protocol of ["ews", "graph"]) {
  for (const store of [
    "@mozilla.org/msgstore/berkeleystore;1",
    "@mozilla.org/msgstore/maildirstore;1",
  ]) {
    add_task(async function test_concurrentOfflineFetch() {
      await runConcurrentFetchTest(protocol, store);
    });
  }
}
