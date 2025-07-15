/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let database, folderDB, messageDB;

/**
 * Create and populate a database using data from an external file.
 *
 * @param {string} path - Relative path to the external file.
 */
async function installDBFromFile(path) {
  installDB(await IOUtils.readUTF8(do_get_file(path).path));
}

/**
 * Create and populate a database using raw SQL.
 *
 * @param {string} [sql]
 */
function installDB(sql) {
  const profileDir = do_get_profile();
  const dbFile = profileDir.clone();
  dbFile.append("panorama.sqlite");

  const dbConnection = Services.storage.openDatabase(dbFile);
  dbConnection.executeSimpleSQL(`
    PRAGMA journal_mode=WAL;
    PRAGMA cache_size=-200000;
    CREATE TABLE folders (
      id INTEGER PRIMARY KEY,
      parent INTEGER REFERENCES folders(id),
      ordinal INTEGER DEFAULT NULL,
      name TEXT,
      flags INTEGER DEFAULT 0,
      UNIQUE(parent, name)
    );
    CREATE TABLE folder_properties (
      id INTEGER REFERENCES folders(id),
      name TEXT,
      value ANY,
      PRIMARY KEY(id, name)
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      folderId INTEGER REFERENCES folders(id),
      threadId INTEGER REFERENCES messages(id),
      threadParent INTEGER REFERENCES messages(id),
      messageId TEXT,
      date INTEGER,
      sender TEXT,
      recipients TEXT,
      ccList TEXT,
      bccList TEXT,
      subject TEXT,
      flags INTEGER,
      tags TEXT
    );
    CREATE INDEX messages_folderId ON messages(folderId);
    CREATE INDEX messages_date ON messages(date);
    CREATE INDEX messages_flags ON messages(flags);
    CREATE TABLE message_properties (
      id INTEGER REFERENCES messages(id),
      name TEXT,
      value ANY,
      PRIMARY KEY(id, name)
    );
    CREATE TABLE virtualFolder_folders (
      virtualFolderId INTEGER REFERENCES folders(id),
      searchFolderId INTEGER REFERENCES folders(id)
    );
  `);
  if (sql) {
    dbConnection.executeSimpleSQL(sql);
  }
  dbConnection.close();

  loadExistingDB();
}

/**
 * Ensure the database is ready to use. This starts the account manager, so
 * any preferences or existing database should be set up before calling this.
 */
function loadExistingDB() {
  // Register DatabaseCore as the message DB service with XPCOM.
  MailServices.accounts;

  database = Cc["@mozilla.org/mailnews/database-core;1"].getService(
    Ci.nsIDatabaseCore
  );
  folderDB = database.folderDB;
  messageDB = database.messageDB;
}

registerCleanupFunction(function () {
  folderDB = null;
  messageDB = null;
  database = null;

  // Make sure destructors run, to finalize statements even if the test fails.
  Cu.forceGC();
});

function drawTree(root, level = 0) {
  console.log("  ".repeat(level) + folderDB.getFolderName(root));
  for (const child of folderDB.getFolderChildren(root)) {
    drawTree(child, level + 1);
  }
}

function checkRow(id, expected) {
  const stmt = database.connectionForTests.createStatement(
    "SELECT id, parent, ordinal, name, flags FROM folders WHERE id = :id"
  );
  stmt.params.id = id;
  stmt.executeStep();
  Assert.equal(stmt.row.id, expected.id, "row id");
  Assert.equal(stmt.row.parent, expected.parent, "row parent");
  Assert.equal(stmt.row.ordinal, expected.ordinal, "row ordinal");
  Assert.equal(stmt.row.name, expected.name, "row name");
  Assert.equal(stmt.row.flags, expected.flags, "row flags");
  stmt.reset();
  stmt.finalize();
}

function checkNoRow(id) {
  const stmt = database.connectionForTests.createStatement(
    "SELECT id, parent, ordinal, name, flags FROM folders WHERE id = :id"
  );
  stmt.params.id = id;
  Assert.ok(!stmt.executeStep(), `row ${id} should not exist`);
  stmt.reset();
  stmt.finalize();
}

function checkOrdinals(expected) {
  const stmt = database.connectionForTests.createStatement(
    "SELECT parent, ordinal FROM folders WHERE id=:id"
  );
  for (const [folder, parent, ordinal] of expected) {
    stmt.params.id = folder;
    stmt.executeStep();
    Assert.deepEqual(
      [stmt.row.parent, stmt.row.ordinal],
      [parent, ordinal],
      `parent and ordinal of '${folderDB.getFolderName(folder)}'`
    );
    stmt.reset();
  }
  stmt.finalize();
}

/**
 * Add a new message to the database. See the other messages in db/messages.sql
 * for appropriate values.
 *
 * @param {object} message - Details of the new message to add.
 * @param {integer} [message.folderId=1]
 * @param {string} [message.messageId="messageId"]
 * @param {string} [message.date="2025-01-22"] - Any string which can be
 *   parsed by the Date constructor.
 * @param {string} [message.sender="sender"]
 * @param {string} [message.recipients="recipients"]
 * @param {string} [message.ccList="cc list"]
 * @param {string} [message.bccList="bcc list"]
 * @param {string} [message.subject="subject"]
 * @param {integer} [message.flags=0]
 * @param {string} [message.tags=""]
 * @returns {integer} - The database ID of the new message.
 */
function addMessage({
  folderId = 1,
  messageId = "messageId",
  date = "2025-01-22",
  sender = "sender",
  recipients = "recipients",
  ccList = "cc list",
  bccList = "bcc list",
  subject = "subject",
  flags = 0,
  tags = "",
}) {
  return messageDB.addMessage(
    folderId,
    messageId,
    new Date(date).valueOf() * 1000,
    sender,
    recipients,
    ccList,
    bccList,
    subject,
    flags,
    tags
  );
}
