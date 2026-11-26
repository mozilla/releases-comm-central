/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from head.js */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

const { MailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const STORE_TYPE = Services.prefs.getStringPref("test.storeType", "mbox");
const STORE_CONTRACTS = {
  mbox: "@mozilla.org/msgstore/berkeleystore;1",
  maildir: "@mozilla.org/msgstore/maildirstore;1",
};

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  STORE_CONTRACTS[STORE_TYPE]
);

const IS_WINDOWS = AppConstants.platform == "win";
const LINE_ENDING = IS_WINDOWS ? "\r\n" : "\n";
const MAILDIR_EML_REGEXP = /^\d{10}\.M\d{1,6}P\d+Q\d+\.[\w-]+\.eml$/;

let mockServer, synMessages, profileDir;
// These variables are used here but set in the test files.
let size0, size1, storeToken0, storeToken1;

const folderListener = {
  foldersAdded: [],
  foldersDeleted: [],
  messagesAdded: [],
  folderAdded(folder) {
    info(`Folder added: ${folder.path}`);
    this.foldersAdded.push(folder.path);
  },
  folderDeleted(folder) {
    info(`Folder deleted: ${folder.path}`);
    this.foldersDeleted.push(folder.path);
  },
  msgAdded(message) {
    info(`Message added: ${message.messageId}`);
    this.messagesAdded.push(message.messageId);
  },
};

/**
 * Set up folders and messages on the server.
 */
add_setup(async function initMockServer() {
  const generator = new MessageGenerator();
  mockServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.pop3.plain
  );
  synMessages = generator.makeMessages({ count: 2 });
  await mockServer.addMessages(synMessages);

  Assert.equal(synMessages[0].toMessageString().length, 256, "sanity check");
  Assert.equal(synMessages[1].toMessageString().length, 272, "sanity check");

  // Listen for folders coming and going.
  MailServices.mfn.addListener(
    folderListener,
    Ci.nsIMsgFolderNotificationService.folderAdded |
      Ci.nsIMsgFolderNotificationService.folderDeleted |
      Ci.nsIMsgFolderNotificationService.msgAdded
  );
});

/**
 * Check the server is configured correctly.
 *
 * @param {string[]} expectedDescendants - Paths of the folders that should
 *   exists on the server.
 */
async function checkServer(expectedDescendants) {
  const account = MailServices.accounts.accounts[0];
  const server = account.incomingServer;
  const root = server.rootFolder;

  Assert.equal(server.key, "server1", "server key sanity check");
  Assert.equal(
    server.getStringValue("storeContractID"),
    STORE_CONTRACTS[STORE_TYPE],
    "server store contract ID"
  );
  Assert.equal(server.msgStore.storeType, STORE_TYPE, "server store type");
  Assert.equal(
    server.localPath.path,
    PathUtils.join(profileDir, "Mail", "test.test"),
    "server store location"
  );
  Assert.ok(server.localPath.isDirectory(), "server store is a directory");
  Assert.equal(
    root.filePath.path,
    server.localPath.path,
    "root filePath points to server localPath"
  );

  checkRow("folders", root.id, {
    id: root.id,
    parent: 0,
    name: server.key,
    flags: 0,
  });

  Assert.deepEqual(
    root.descendants.map(f => f.path).toSorted(),
    expectedDescendants,
    "expected descendants"
  );
}

/**
 * Checks the inbox is configured correctly.
 *
 * @param {string[]} expectedStoreTokens - Tokens of the messages expected
 *   to be found in the inbox.
 */
async function checkInbox(expectedStoreTokens) {
  const account = MailServices.accounts.accounts[0];
  const server = account.incomingServer;
  const root = server.rootFolder;
  const inbox = root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);

  Assert.equal(
    inbox.flags,
    Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Inbox,
    "inbox flags"
  );
  Assert.equal(inbox.msgStore.storeType, STORE_TYPE, "inbox store type");
  Assert.equal(
    inbox.filePath.path,
    PathUtils.join(profileDir, "Mail", "test.test", "Inbox"),
    "inbox store location"
  );
  Assert.equal(
    inbox.getTotalMessages(false),
    expectedStoreTokens.length,
    "inbox message count"
  );
  const existingMessages = [...inbox.messages];
  for (let i = 0; i < expectedStoreTokens.length; i++) {
    Assert.equal(
      existingMessages[i].storeToken,
      expectedStoreTokens[i],
      `message ${i} store token`
    );
  }
  await checkStore(inbox.filePath, expectedStoreTokens);

  checkRow("folders", inbox.id, {
    id: inbox.id,
    parent: root.id,
    name: "Inbox",
    flags: Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Inbox,
  });
  checkPropertyRows("folder_properties", inbox.id, {}, true);
}

/**
 * Tests connecting to the server and downloading messages.
 */
async function downloadMessagesFromServer() {
  const account = MailServices.accounts.accounts[0];
  const server = account.incomingServer;
  const root = server.rootFolder;
  const inbox = root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);

  server.password = "password";

  // Update the inbox from the server.

  const listener = new PromiseTestUtils.PromiseUrlListener();
  server.getNewMessages(inbox, false, listener);
  await listener.promise;

  Assert.equal(
    inbox.getTotalMessages(false),
    2,
    "two messages should have been downloaded"
  );
  const messages = [...inbox.messages];

  // Check we have the messages in the database.

  await checkMessage(messages[0], inbox, synMessages[0], size0, storeToken0);
  await checkMessage(messages[1], inbox, synMessages[1], size1, storeToken1);

  // Check the messages were stored in the profile.

  await checkStore(
    inbox.filePath,
    messages.map(m => m.storeToken)
  );

  const datFileContent = await IOUtils.readUTF8(
    PathUtils.join(server.localPath.path, "popstate.dat")
  );
  Assert.stringContains(
    datFileContent,
    "*test.test user",
    "popstate.dat contains server info"
  );
  Assert.stringMatches(
    datFileContent,
    /^k UIDL1 \d{10}$/m,
    "popstate.dat contains message 0 UIDL"
  );
  Assert.stringMatches(
    datFileContent,
    /^k UIDL2 \d{10}$/m,
    "popstate.dat contains message 1 UIDL"
  );
}

/**
 * Checks a message has the expected properties, and that the properties are
 * stored in the database, and that the message text is saved to the profile.
 *
 * @param {nsIMsgDBHdr} message
 * @param {nsIMsgFolder} folder
 * @param {SyntheticMessage} synMessage
 * @param {integer} size
 * @param {string} storeToken
 */
function checkMessage(message, folder, synMessage, size, storeToken) {
  // Check message properties.

  Assert.equal(message.flags, Ci.nsMsgMessageFlags.New, "message flags");
  Assert.strictEqual(
    message.getUint32Property("dateReceived"),
    synMessage.date.valueOf() / 1000,
    "message dateReceived"
  );
  Assert.strictEqual(message.lineCount, 3, "message lineCount");
  Assert.strictEqual(message.messageSize, size, "message messageSize");
  if (STORE_TYPE == "maildir") {
    Assert.stringMatches(
      message.storeToken,
      MAILDIR_EML_REGEXP,
      "message storeToken"
    );
  } else if (storeToken) {
    Assert.strictEqual(message.storeToken, storeToken, "message storeToken");
  } else {
    // We don't know what it should be, but it should exist.
    Assert.ok(message.storeToken, "message storeToken should exist");
  }

  // Check message properties are stored in the database.

  checkRow("messages", message.messageKey, {
    messageId: synMessage.messageId,
    folderId: folder.id,
    date: synMessage.date.valueOf() * 1000,
    subject: synMessage.subject,
    flags: Ci.nsMsgMessageFlags.New,
  });
  checkPropertyRows("message_properties", message.messageKey, {
    dateReceived: synMessage.date.valueOf() / 1000,
    lineCount: 3,
    messageSize: size,
    storeToken: message.storeToken,
  });

  // Check message content stored in the profile.

  const stream = folder.getMsgInputStream(message);
  const content = NetUtil.readInputStreamToString(stream, size);
  Assert.stringContains(
    content,
    `${LINE_ENDING}Subject: ${synMessage.subject}${LINE_ENDING}`,
    "message content contains the right subject"
  );
  Assert.equal(content.slice(-1), "\n", "message content ends with a newline");
}
