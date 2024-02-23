/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddrBookDirectory } = ChromeUtils.import(
  "resource:///modules/AddrBookDirectory.jsm"
);
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

import { AsyncShutdown } from "resource://gre/modules/AsyncShutdown.sys.mjs";

ChromeUtils.defineESModuleGetters(lazy, {
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  newUID: "resource:///modules/AddrBookUtils.jsm",
});

var log = console.createInstance({
  prefix: "mail.addr_book",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.addr_book.loglevel",
});

// Track all directories by filename, for SQLiteDirectory.forFile.
var directories = new Map();

// Keep track of all database connections, and close them at shutdown, since
// nothing else ever tells us to close them.
var connections = new Map();

/**
 * Opens an SQLite connection to `file`, caches the connection, and upgrades
 * the database schema if necessary.
 */
function openConnectionTo(file) {
  const CURRENT_VERSION = 4;

  let connection = connections.get(file.path);
  if (!connection) {
    connection = Services.storage.openDatabase(file);
    const fileVersion = connection.schemaVersion;

    // If we're upgrading the version, first create a backup.
    if (fileVersion > 0 && fileVersion < CURRENT_VERSION) {
      const backupFile = file.clone();
      backupFile.leafName = backupFile.leafName.replace(
        /\.sqlite$/,
        `.v${fileVersion}.sqlite`
      );
      backupFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

      log.warn(`Backing up ${file.leafName} to ${backupFile.leafName}`);
      file.copyTo(null, backupFile.leafName);
    }

    switch (fileVersion) {
      case 0:
        connection.executeSimpleSQL("PRAGMA journal_mode=WAL");
        connection.executeSimpleSQL(
          "CREATE TABLE properties (card TEXT, name TEXT, value TEXT)"
        );
        connection.executeSimpleSQL(
          "CREATE TABLE lists (uid TEXT PRIMARY KEY, name TEXT, nickName TEXT, description TEXT)"
        );
        connection.executeSimpleSQL(
          "CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card))"
        );
      // Falls through.
      case 1:
        connection.executeSimpleSQL(
          "CREATE INDEX properties_card ON properties(card)"
        );
        connection.executeSimpleSQL(
          "CREATE INDEX properties_name ON properties(name)"
        );
      // Falls through.
      case 2:
        connection.executeSimpleSQL("DROP TABLE IF EXISTS cards");
      // The lists table may have a localId column we no longer use, but
      // since SQLite can't drop columns it's not worth effort to remove it.
      // Falls through.
      case 3:
        // This version exists only to create an automatic backup before cards
        // are transitioned to vCard.
        connection.schemaVersion = CURRENT_VERSION;
        break;
    }
    connections.set(file.path, connection);
  }
  return connection;
}

/**
 * Closes the SQLite connection to `file` and removes it from the cache.
 */
function closeConnectionTo(file) {
  const connection = connections.get(file.path);
  if (connection) {
    return new Promise(resolve => {
      connection.asyncClose({
        complete() {
          resolve();
        },
      });
      connections.delete(file.path);
    });
  }
  return Promise.resolve();
}

// Close all open connections at shut down time.
AsyncShutdown.profileBeforeChange.addBlocker(
  "Address Book: closing databases",
  async () => {
    const promises = [];
    for (const directory of directories.values()) {
      promises.push(directory.cleanUp());
    }
    await Promise.allSettled(promises);
  }
);

// Close a connection on demand. This serves as an escape hatch from C++ code.
Services.obs.addObserver(async file => {
  file.QueryInterface(Ci.nsIFile);
  await closeConnectionTo(file);
  Services.obs.notifyObservers(file, "addrbook-close-ab-complete");
}, "addrbook-close-ab");

/**
 * Adds SQLite storage to AddrBookDirectory.
 */
export class SQLiteDirectory extends AddrBookDirectory {
  init(uri) {
    const uriParts = /^[\w-]+:\/\/([\w\.-]+\.\w+)$/.exec(uri);
    if (!uriParts) {
      throw new Components.Exception(
        `Unexpected uri: ${uri}`,
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    this._uri = uri;
    let fileName = uriParts[1];
    if (fileName.includes("/")) {
      fileName = fileName.substring(0, fileName.indexOf("/"));
    }

    for (const child of Services.prefs.getChildList("ldap_2.servers.")) {
      if (
        child.endsWith(".filename") &&
        Services.prefs.getStringPref(child) == fileName
      ) {
        this._dirPrefId = child.substring(0, child.length - ".filename".length);
        break;
      }
    }
    if (!this._dirPrefId) {
      throw Components.Exception(
        `Couldn't grab dirPrefId for uri=${uri}, fileName=${fileName}`,
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    // Make sure we always have a file. If a file is not created, the
    // filename may be accidentally reused.
    const file = new lazy.FileUtils.File(
      PathUtils.join(PathUtils.profileDir, fileName)
    );
    if (!file.exists()) {
      file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
    }

    this._fileName = fileName;

    super.init(uri);

    directories.set(fileName, this);
    // Create the DB connection here already, to let init() throw on corrupt SQLite files.
    this._dbConnection;
  }
  async cleanUp() {
    await super.cleanUp();

    if (this.hasOwnProperty("_file")) {
      await closeConnectionTo(this._file);
      delete this._file;
    }

    directories.delete(this._fileName);
  }

  get _dbConnection() {
    this._file = new lazy.FileUtils.File(
      PathUtils.join(PathUtils.profileDir, this.fileName)
    );
    const connection = openConnectionTo(this._file);

    // SQLite cache size can be set by the cacheSize preference, in KiB.
    // The default is 5 MiB but this can be lowered to 1 MiB if wanted.
    // There is no maximum size.
    let cacheSize = this.getIntValue("cacheSize", 5120); // 5 MiB
    cacheSize = Math.max(cacheSize, 1024); // 1 MiB
    connection.executeSimpleSQL(`PRAGMA cache_size=-${cacheSize}`);

    Object.defineProperty(this, "_dbConnection", {
      enumerable: true,
      value: connection,
      writable: false,
    });
    return connection;
  }
  get lists() {
    const listCache = new Map();
    const selectStatement = this._dbConnection.createStatement(
      "SELECT uid, name, nickName, description FROM lists"
    );
    while (selectStatement.executeStep()) {
      listCache.set(selectStatement.row.uid, {
        uid: selectStatement.row.uid,
        name: selectStatement.row.name,
        nickName: selectStatement.row.nickName,
        description: selectStatement.row.description,
      });
    }
    selectStatement.finalize();

    Object.defineProperty(this, "lists", {
      enumerable: true,
      value: listCache,
      writable: false,
    });
    return listCache;
  }
  get cards() {
    const cardCache = new Map();
    const propertiesStatement = this._dbConnection.createStatement(
      "SELECT card, name, value FROM properties"
    );
    while (propertiesStatement.executeStep()) {
      const uid = propertiesStatement.row.card;
      if (!cardCache.has(uid)) {
        cardCache.set(uid, new Map());
      }
      const card = cardCache.get(uid);
      if (card) {
        card.set(propertiesStatement.row.name, propertiesStatement.row.value);
      }
    }
    propertiesStatement.finalize();

    Object.defineProperty(this, "cards", {
      enumerable: true,
      value: cardCache,
      writable: false,
    });
    return cardCache;
  }

  loadCardProperties(uid) {
    if (this.hasOwnProperty("cards")) {
      const cachedCard = this.cards.get(uid);
      if (cachedCard) {
        return new Map(cachedCard);
      }
    }
    const properties = new Map();
    const propertyStatement = this._dbConnection.createStatement(
      "SELECT name, value FROM properties WHERE card = :card"
    );
    propertyStatement.params.card = uid;
    while (propertyStatement.executeStep()) {
      properties.set(propertyStatement.row.name, propertyStatement.row.value);
    }
    propertyStatement.finalize();
    return properties;
  }
  saveCardProperties(uid, properties) {
    try {
      this._dbConnection.beginTransaction();
      const deleteStatement = this._dbConnection.createStatement(
        "DELETE FROM properties WHERE card = :card"
      );
      deleteStatement.params.card = uid;
      deleteStatement.execute();
      const insertStatement = this._dbConnection.createStatement(
        "INSERT INTO properties VALUES (:card, :name, :value)"
      );

      for (const [name, value] of properties) {
        if (value !== null && value !== undefined && value !== "") {
          insertStatement.params.card = uid;
          insertStatement.params.name = name;
          insertStatement.params.value = value;
          insertStatement.execute();
          insertStatement.reset();
        }
      }

      this._dbConnection.commitTransaction();
      deleteStatement.finalize();
      insertStatement.finalize();
    } catch (ex) {
      this._dbConnection.rollbackTransaction();
      throw ex;
    }
  }
  deleteCard(uid) {
    const deleteStatement = this._dbConnection.createStatement(
      "DELETE FROM properties WHERE card = :cardUID"
    );
    deleteStatement.params.cardUID = uid;
    deleteStatement.execute();
    deleteStatement.finalize();
  }
  saveList(list) {
    // Ensure list cache exists.
    this.lists;

    const replaceStatement = this._dbConnection.createStatement(
      "REPLACE INTO lists (uid, name, nickName, description) " +
        "VALUES (:uid, :name, :nickName, :description)"
    );
    replaceStatement.params.uid = list._uid;
    replaceStatement.params.name = list._name;
    replaceStatement.params.nickName = list._nickName;
    replaceStatement.params.description = list._description;
    replaceStatement.execute();
    replaceStatement.finalize();

    this.lists.set(list._uid, {
      uid: list._uid,
      name: list._name,
      nickName: list._nickName,
      description: list._description,
    });
  }
  deleteList(uid) {
    const deleteListStatement = this._dbConnection.createStatement(
      "DELETE FROM lists WHERE uid = :uid"
    );
    deleteListStatement.params.uid = uid;
    deleteListStatement.execute();
    deleteListStatement.finalize();

    if (this.hasOwnProperty("lists")) {
      this.lists.delete(uid);
    }

    this._dbConnection.executeSimpleSQL(
      "DELETE FROM list_cards WHERE list NOT IN (SELECT DISTINCT uid FROM lists)"
    );
  }
  async bulkAddCards(cards) {
    if (cards.length == 0) {
      return;
    }

    const usedUIDs = new Set();
    const propertiesStatement = this._dbConnection.createStatement(
      "INSERT INTO properties VALUES (:card, :name, :value)"
    );
    const propertiesArray = propertiesStatement.newBindingParamsArray();
    for (const card of cards) {
      let uid = card.UID;
      if (!uid || usedUIDs.has(uid)) {
        // A card cannot have the same UID as one that already exists.
        // Assign a new UID to avoid losing data.
        uid = lazy.newUID();
      }
      usedUIDs.add(uid);

      let cachedCard;
      if (this.hasOwnProperty("cards")) {
        cachedCard = new Map();
        this.cards.set(uid, cachedCard);
      }

      for (const [name, value] of this.prepareToSaveCard(card)) {
        const propertiesParams = propertiesArray.newBindingParams();
        propertiesParams.bindByName("card", uid);
        propertiesParams.bindByName("name", name);
        propertiesParams.bindByName("value", value);
        propertiesArray.addParams(propertiesParams);

        if (cachedCard) {
          cachedCard.set(name, value);
        }
      }
    }
    try {
      this._dbConnection.beginTransaction();
      if (propertiesArray.length > 0) {
        propertiesStatement.bindParameters(propertiesArray);
        await new Promise((resolve, reject) => {
          propertiesStatement.executeAsync({
            handleError(error) {
              this._error = error;
            },
            handleCompletion(status) {
              if (status == Ci.mozIStorageStatementCallback.REASON_ERROR) {
                reject(
                  Components.Exception(this._error.message, Cr.NS_ERROR_FAILURE)
                );
              } else {
                resolve();
              }
            },
          });
        });
        propertiesStatement.finalize();
      }
      this._dbConnection.commitTransaction();

      Services.obs.notifyObservers(this, "addrbook-directory-invalidated");
    } catch (ex) {
      this._dbConnection.rollbackTransaction();
      throw ex;
    }
  }

  /* nsIAbDirectory */

  get childCardCount() {
    const countStatement = this._dbConnection.createStatement(
      "SELECT COUNT(DISTINCT card) AS card_count FROM properties"
    );
    countStatement.executeStep();
    const count = countStatement.row.card_count;
    countStatement.finalize();
    return count;
  }
  getCardFromProperty(property, value, caseSensitive) {
    const sql = caseSensitive
      ? "SELECT card FROM properties WHERE name = :name AND value = :value LIMIT 1"
      : "SELECT card FROM properties WHERE name = :name AND LOWER(value) = LOWER(:value) LIMIT 1";
    const selectStatement = this._dbConnection.createStatement(sql);
    selectStatement.params.name = property;
    selectStatement.params.value = value;
    let result = null;
    if (selectStatement.executeStep()) {
      result = this.getCard(selectStatement.row.card);
    }
    selectStatement.finalize();
    return result;
  }
  getCardsFromProperty(property, value, caseSensitive) {
    const sql = caseSensitive
      ? "SELECT card FROM properties WHERE name = :name AND value = :value"
      : "SELECT card FROM properties WHERE name = :name AND LOWER(value) = LOWER(:value)";
    const selectStatement = this._dbConnection.createStatement(sql);
    selectStatement.params.name = property;
    selectStatement.params.value = value;
    const results = [];
    while (selectStatement.executeStep()) {
      results.push(this.getCard(selectStatement.row.card));
    }
    selectStatement.finalize();
    return results;
  }

  static forFile(fileName) {
    return directories.get(fileName);
  }
}

SQLiteDirectory.prototype.classID = Components.ID(
  "{e96ee804-0bd3-472f-81a6-8a9d65277ad3}"
);
