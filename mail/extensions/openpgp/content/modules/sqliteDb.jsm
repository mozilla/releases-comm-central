/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  Module that provides generic functions for the Enigmail SQLite database
 */

var EXPORTED_SYMBOLS = ["EnigmailSqliteDb"];

const { Sqlite } = ChromeUtils.import("resource://gre/modules/Sqlite.jsm");
const { EnigmailTimer } = ChromeUtils.import(
  "chrome://openpgp/content/modules/timer.jsm"
);
const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);

var EnigmailSqliteDb = {
  /**
   * Provide an sqlite conection object asynchronously, retrying if needed
   *
   * @return {Promise<Sqlite Connection>}: the Sqlite database object
   */

  openDatabase() {
    EnigmailLog.DEBUG("sqliteDb.jsm: openDatabase()\n");
    return new Promise((resolve, reject) => {
      openDatabaseConn(resolve, reject, 100, Date.now() + 10000);
    });
  },

  async checkDatabaseStructure() {
    EnigmailLog.DEBUG(`sqliteDb.jsm: checkDatabaseStructure()\n`);
    let conn;
    try {
      conn = await this.openDatabase();
      await checkAutocryptTable(conn);
      await checkWkdTable(conn);
      conn.close();
      EnigmailLog.DEBUG(`sqliteDb.jsm: checkDatabaseStructure - success\n`);
    } catch (ex) {
      EnigmailLog.ERROR(`sqliteDb.jsm: checkDatabaseStructure: ERROR: ${ex}\n`);
      if (conn) {
        conn.close();
      }
    }
  },
};

/**
 * use a promise to open the Enigmail database.
 *
 * it's possible that there will be an NS_ERROR_STORAGE_BUSY
 * so we're willing to retry for a little while.
 *
 * @param {function} resolve: function to call when promise succeeds
 * @param {function} reject:  function to call when promise fails
 * @param {Number}   waitms:  Integer - number of milliseconds to wait before trying again in case of NS_ERROR_STORAGE_BUSY
 * @param {Number}   maxtime: Integer - unix epoch (in milliseconds) of the point at which we should give up.
 */
function openDatabaseConn(resolve, reject, waitms, maxtime) {
  EnigmailLog.DEBUG("sqliteDb.jsm: openDatabaseConn()\n");
  Sqlite.openConnection({
    path: "enigmail.sqlite",
    sharedMemoryCache: false,
  })
    .then(connection => {
      resolve(connection);
    })
    .catch(error => {
      let now = Date.now();
      if (now > maxtime) {
        reject(error);
        return;
      }
      EnigmailTimer.setTimeout(function() {
        openDatabaseConn(resolve, reject, waitms, maxtime);
      }, waitms);
    });
}

/**
 * Ensure that the database structure matches the latest version
 * (table is available)
 *
 * @param connection: Object - SQLite connection
 *
 * @return {Promise<Boolean>}
 */
async function checkAutocryptTable(connection) {
  try {
    let exists = await connection.tableExists("autocrypt_keydata");
    EnigmailLog.DEBUG("sqliteDB.jsm: checkAutocryptTable - success\n");
    if (!exists) {
      await createAutocryptTable(connection);
    } else {
      let hasKeyRingInserted = false;
      await connection.execute(
        "pragma table_info('autocrypt_keydata');",
        {},
        function(row) {
          let colname = row.getResultByName("name");
          if (colname === "keyring_inserted") {
            hasKeyRingInserted = true;
          }
        }
      );
      if (hasKeyRingInserted) {
        return true;
      }

      await connection.execute(
        "alter table autocrypt_keydata add keyring_inserted text default '0';",
        {},
        function(row) {}
      );
      let { EnigmailAutocrypt } = ChromeUtils.import(
        "chrome://openpgp/content/modules/autocrypt.jsm"
      );
      EnigmailAutocrypt.updateAllImportedKeys();
    }
  } catch (error) {
    EnigmailLog.DEBUG(`sqliteDB.jsm: checkAutocryptTable - error ${error}\n`);
    throw error;
  }

  return true;
}
/**
 * Create the "autocrypt_keydata" table and the corresponding index
 *
 * @param connection: Object - SQLite connection
 *
 * @return {Promise}
 */
async function createAutocryptTable(connection) {
  EnigmailLog.DEBUG("sqliteDB.jsm: createAutocryptTable()\n");

  await connection.execute(
    "create table autocrypt_keydata (" +
    "email text not null, " + // email address of correspondent
    "keydata text not null, " + // base64-encoded key as received
    "fpr text, " + // fingerprint of key
    "type text not null, " + // key type (1==OpenPGP, regular key. 1g == OpenPGP gossip)
    "last_seen_autocrypt text, " +
    "last_seen text not null, " +
    "state text not null," + // timestamp of last mail received for the email/type combination
      "keyring_inserted text default '0');"
  );

  EnigmailLog.DEBUG("sqliteDB.jsm: createAutocryptTable - index\n");
  await connection.execute(
    "create unique index autocrypt_keydata_i1 on autocrypt_keydata(email, type)"
  );

  return null;
}

/**
 * Ensure that the database has the wkd_lookup_timestamp table.
 *
 * @param connection: Object - SQLite connection
 *
 * @return Promise
 */
async function checkWkdTable(connection) {
  EnigmailLog.DEBUG("sqliteDB.jsm: checkWkdTable()\n");

  try {
    let exists = await connection.tableExists("wkd_lookup_timestamp");
    EnigmailLog.DEBUG("sqliteDB.jsm: checkWkdTable - success\n");
    if (!exists) {
      await createWkdTable(connection);
    }
  } catch (error) {
    EnigmailLog.DEBUG("sqliteDB.jsm: checkWkdTable - error\n");
    throw error;
  }
}

/**
 * Create the "wkd_lookup_timestamp" table.
 *
 * @param connection: Object - SQLite connection
 *
 * @return Promise
 */
function createWkdTable(connection) {
  EnigmailLog.DEBUG("sqliteDB.jsm: createWkdTable()\n");

  return connection.execute(
    "create table wkd_lookup_timestamp (" +
    "email text not null primary key, " + // email address of correspondent
      "last_seen integer);"
  ); // timestamp of last mail received for the email/type combination
}
