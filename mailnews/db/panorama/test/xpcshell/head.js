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
      tags TEXT,
      priority INTEGER
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
    CREATE INDEX message_properties_name_value ON message_properties(name, value);
    CREATE TABLE virtualFolder_folders (
      virtualFolderId INTEGER REFERENCES folders(id),
      searchFolderId INTEGER REFERENCES folders(id)
    );
    CREATE TABLE search_folder_hits (
      folder_id INTEGER REFERENCES folders(id),
      message_id INTEGER REFERENCES messages(id),
      PRIMARY KEY(folder_id, message_id)
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

/**
 * Select the row in `table` with `id`, and check the column values.
 *
 * @param {string} table - The name of the table to select from.
 * @param {integer} id - The id of the row to check.
 * @param {{[key: string]: number}} expected - The columns to select and their
 *   expected values.
 */
function checkRow(table, id, expected) {
  const stmt = database.connectionForTests.createStatement(
    `SELECT ${Object.keys(expected).join(", ")} FROM ${table} WHERE id = :id`
  );
  stmt.params.id = id;
  stmt.executeStep();
  for (const [name, value] of Object.entries(expected)) {
    Assert.equal(stmt.row[name], value, `row ${name}`);
  }
  stmt.reset();
  stmt.finalize();
}

/**
 * Check that there is no row in `table` with `id`.
 *
 * @param {string} table - The name of the table to select from.
 * @param {integer} id - The id of the row to check.
 */
function checkNoRow(table, id) {
  const stmt = database.connectionForTests.createStatement(
    `SELECT id FROM ${table} WHERE id = :id`
  );
  stmt.params.id = id;
  Assert.ok(!stmt.executeStep(), `row ${id} should not exist`);
  stmt.reset();
  stmt.finalize();
}

/**
 * Select the rows matching `id` from `table`, and check the names and values.
 * This works for the folder_properties and message_properties tables.
 *
 * @param {string} table - The name of the table to select from.
 * @param {integer} id - The id of the object to check.
 * @param {{[key: string]: number}} expected - The expected names and values.
 * @param {boolean} [lenient=false] - If true, properties that aren't in
 *   `expected` are allowed.
 */
function checkPropertyRows(table, id, expected, lenient = false) {
  const stmt = database.connectionForTests.createStatement(
    `SELECT name, value FROM ${table} WHERE id = :id`
  );
  stmt.params.id = id;

  const properties = {};
  const uncheckedProperties = {};
  while (stmt.executeStep()) {
    if (!lenient || stmt.row.name in expected) {
      properties[stmt.row.name] = stmt.row.value;
    } else {
      uncheckedProperties[stmt.row.name] = stmt.row.value;
    }
  }
  stmt.reset();
  stmt.finalize();

  if (Object.keys(uncheckedProperties).length) {
    info("These properties exist but weren't checked:");
    for (const [key, value] of Object.entries(uncheckedProperties)) {
      info(`  ${key} = ${value}`);
    }
  }
  Assert.deepEqual(properties, expected, `properties of ${id}`);
}

/**
 * Add a new message to the database. See the other messages in db/messages.sql
 * for appropriate values.
 *
 * @param {object} message - Details of the new message to add.
 * @param {integer} [message.folderId=1]
 * @param {string} [message.messageId="messageId"]
 * @param {string[]} [message.references=[]]
 * @param {string} [message.date="2025-01-22"] - Any string which can be
 *   parsed by the Date constructor.
 * @param {string} [message.sender="sender"]
 * @param {string} [message.recipients="recipients"]
 * @param {string} [message.ccList="cc list"]
 * @param {string} [message.bccList="bcc list"]
 * @param {string} [message.subject="subject"]
 * @param {integer} [message.flags=0]
 * @param {string} [message.tags=""]
 * @param {integer} [message.priority=Ci.nsMsgPriority.notSet]
 * @returns {integer} - The database ID of the new message.
 */
function addMessage({
  folderId = 1,
  messageId = "messageId",
  references = [],
  date = "2025-01-22",
  sender = "sender",
  recipients = "recipients",
  ccList = "cc list",
  bccList = "bcc list",
  subject = "subject",
  flags = Ci.nsMsgMessageFlags.New,
  tags = "",
  priority = Ci.nsMsgPriority.notSet,
}) {
  return messageDB.addMessage(
    folderId,
    messageId,
    references,
    new Date(date).valueOf() * 1000,
    sender,
    recipients,
    ccList,
    bccList,
    subject,
    flags,
    tags,
    priority
  );
}

/**
 * Convert the message cache of `adapter` to an array of message IDs.
 *
 * @param {LiveViewDataAdapter} adapter
 * @returns {integer[]}
 */
function listMessages(adapter) {
  const ids = [];
  for (let i = 0; i < adapter.rowCount; i++) {
    ids.push(adapter.rowAt(i).message.id);
  }
  return ids;
}

/**
 * Check the files in the profile.
 *
 * @param {string} filePath - Absolute path to the folder on disk.
 * @param {string[]} expectedStoreTokens - Tokens of the messages expected to
 *   be found at `filePath`.
 */
async function checkStore(filePath, expectedStoreTokens) {
  const STORE_TYPE = Services.prefs.getStringPref("test.storeType", "mbox");
  Assert.ok(filePath.exists(), `${filePath.path} exists`);
  if (STORE_TYPE == "maildir") {
    Assert.ok(filePath.isDirectory(), `${filePath.leafName} is a directory`);
    Assert.deepEqual(
      Array.from(filePath.directoryEntries, f => f.leafName).toSorted(),
      ["cur", "tmp"],
      `${filePath.leafName} contains cur and tmp directories`
    );
    const cur = filePath.clone();
    cur.append("cur");
    Assert.deepEqual(
      Array.from(cur.directoryEntries, f => f.leafName).toSorted(),
      expectedStoreTokens.toSorted(),
      "cur directory contains expected files"
    );
  } else {
    Assert.ok(filePath.isFile(), `${filePath.leafName} is a file`);
    if (expectedStoreTokens.length == 0) {
      Assert.equal(filePath.fileSize, 0, `${filePath.leafName} has no content`);
    } else {
      Assert.greater(filePath.fileSize, 0, `${filePath.leafName} has content`);
    }

    const mboxContent = await IOUtils.readUTF8(filePath.path);
    for (let storeToken of expectedStoreTokens) {
      storeToken = parseInt(storeToken, 10);
      Assert.equal(
        mboxContent.slice(storeToken, storeToken + 7),
        "From - ",
        `${filePath.leafName} has a message starting at ${storeToken}`
      );
    }
  }
}

class ListenerTree {
  rowCountChanged(index, delta) {
    info(`rowCountChanged(${index}, ${delta})`);
    Assert.strictEqual(this._index, undefined);
    Assert.strictEqual(this._start, undefined);
    this._index = index;
    this._delta = delta;
    this._rowCountDeferred?.resolve();
  }
  invalidateRow(index) {
    info(`invalidateRow(${index})`);
    // `invalidateRow` immediately after `rowCountChanged` is allowed.
    if (this._start) {
      // Two `invalidateRow` calls are allowed.
      Assert.equal(this._start, this._end);
    } else {
      Assert.strictEqual(this._start, undefined);
    }
    this._start = index;
    this._end = index;
    this._invalidateDeferred?.resolve();
  }
  invalidateRange(start, end) {
    info(`invalidateRange(${start}, ${end})`);
    Assert.strictEqual(this._index, undefined);
    Assert.strictEqual(this._start, undefined);
    this._start = start;
    this._end = end;
    this._invalidateDeferred?.resolve();
  }
  reset() {
    info(`reset()`);
    Assert.ok(false, "reset() should not be called in this test");
  }

  async promiseRowCountChanged(expectedIndex, expectedDelta) {
    Assert.ok(!this._rowCountDeferred);
    Assert.ok(!this._invalidateDeferred);
    if (this._index === undefined) {
      this._rowCountDeferred = Promise.withResolvers();
      await this._rowCountDeferred.promise;
      delete this._rowCountDeferred;
    }
    this.assertRowCountChanged(expectedIndex, expectedDelta);
  }
  async promiseInvalidated(expectedStart, expectedEnd) {
    Assert.ok(!this._rowCountDeferred);
    Assert.ok(!this._invalidateDeferred);
    if (this._start === undefined) {
      this._invalidateDeferred = Promise.withResolvers();
      await this._invalidateDeferred.promise;
      delete this._invalidateDeferred;
    }
    this.assertInvalidated(expectedStart, expectedEnd);
  }
  assertRowCountChanged(expectedIndex, expectedDelta) {
    Assert.equal(this._index, expectedIndex);
    Assert.equal(this._delta, expectedDelta);
    delete this._index;
    delete this._delta;
  }
  assertInvalidated(expectedStart, expectedEnd) {
    Assert.equal(this._start, expectedStart);
    Assert.equal(this._end, expectedEnd);
    delete this._start;
    delete this._end;
  }
}
