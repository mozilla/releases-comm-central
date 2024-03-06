"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LocalIndexedDBStoreBackend = void 0;
var _syncAccumulator = require("../sync-accumulator");
var _utils = require("../utils");
var _indexeddbHelpers = require("../indexeddb-helpers");
var _logger = require("../logger");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2017 - 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const DB_MIGRATIONS = [db => {
  // Make user store, clobber based on user ID. (userId property of User objects)
  db.createObjectStore("users", {
    keyPath: ["userId"]
  });

  // Make account data store, clobber based on event type.
  // (event.type property of MatrixEvent objects)
  db.createObjectStore("accountData", {
    keyPath: ["type"]
  });

  // Make /sync store (sync tokens, room data, etc), always clobber (const key).
  db.createObjectStore("sync", {
    keyPath: ["clobber"]
  });
}, db => {
  const oobMembersStore = db.createObjectStore("oob_membership_events", {
    keyPath: ["room_id", "state_key"]
  });
  oobMembersStore.createIndex("room", "room_id");
}, db => {
  db.createObjectStore("client_options", {
    keyPath: ["clobber"]
  });
}, db => {
  db.createObjectStore("to_device_queue", {
    autoIncrement: true
  });
}
// Expand as needed.
];
const VERSION = DB_MIGRATIONS.length;

/**
 * Helper method to collect results from a Cursor and promiseify it.
 * @param store - The store to perform openCursor on.
 * @param keyRange - Optional key range to apply on the cursor.
 * @param resultMapper - A function which is repeatedly called with a
 * Cursor.
 * Return the data you want to keep.
 * @returns Promise which resolves to an array of whatever you returned from
 * resultMapper.
 */
function selectQuery(store, keyRange, resultMapper) {
  const query = store.openCursor(keyRange);
  return new Promise((resolve, reject) => {
    const results = [];
    query.onerror = () => {
      reject(new Error("Query failed: " + query.error));
    };
    // collect results
    query.onsuccess = () => {
      const cursor = query.result;
      if (!cursor) {
        resolve(results);
        return; // end of results
      }
      results.push(resultMapper(cursor));
      cursor.continue();
    };
  });
}
function txnAsPromise(txn) {
  return new Promise((resolve, reject) => {
    txn.oncomplete = function (event) {
      resolve(event);
    };
    txn.onerror = function () {
      reject(txn.error);
    };
  });
}
function reqAsEventPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = function (event) {
      resolve(event);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}
function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req);
    req.onerror = err => reject(err);
  });
}
function reqAsCursorPromise(req) {
  return reqAsEventPromise(req).then(event => req.result);
}
class LocalIndexedDBStoreBackend {
  static exists(indexedDB, dbName) {
    dbName = "matrix-js-sdk:" + (dbName || "default");
    return (0, _indexeddbHelpers.exists)(indexedDB, dbName);
  }
  /**
   * Does the actual reading from and writing to the indexeddb
   *
   * Construct a new Indexed Database store backend. This requires a call to
   * `connect()` before this store can be used.
   * @param indexedDB - The Indexed DB interface e.g
   * `window.indexedDB`
   * @param dbName - Optional database name. The same name must be used
   * to open the same database.
   */
  constructor(indexedDB, dbName = "default") {
    this.indexedDB = indexedDB;
    _defineProperty(this, "dbName", void 0);
    _defineProperty(this, "syncAccumulator", void 0);
    _defineProperty(this, "db", void 0);
    _defineProperty(this, "disconnected", true);
    _defineProperty(this, "_isNewlyCreated", false);
    _defineProperty(this, "syncToDatabasePromise", void 0);
    _defineProperty(this, "pendingUserPresenceData", []);
    this.dbName = "matrix-js-sdk:" + dbName;
    this.syncAccumulator = new _syncAccumulator.SyncAccumulator();
  }

  /**
   * Attempt to connect to the database. This can fail if the user does not
   * grant permission.
   * @returns Promise which resolves if successfully connected.
   */
  connect(onClose) {
    if (!this.disconnected) {
      _logger.logger.log(`LocalIndexedDBStoreBackend.connect: already connected or connecting`);
      return Promise.resolve();
    }
    this.disconnected = false;
    _logger.logger.log(`LocalIndexedDBStoreBackend.connect: connecting...`);
    const req = this.indexedDB.open(this.dbName, VERSION);
    req.onupgradeneeded = ev => {
      const db = req.result;
      const oldVersion = ev.oldVersion;
      _logger.logger.log(`LocalIndexedDBStoreBackend.connect: upgrading from ${oldVersion}`);
      if (oldVersion < 1) {
        // The database did not previously exist
        this._isNewlyCreated = true;
      }
      DB_MIGRATIONS.forEach((migration, index) => {
        if (oldVersion <= index) migration(db);
      });
    };
    req.onblocked = () => {
      _logger.logger.log(`can't yet open LocalIndexedDBStoreBackend because it is open elsewhere`);
    };
    _logger.logger.log(`LocalIndexedDBStoreBackend.connect: awaiting connection...`);
    return reqAsEventPromise(req).then(async () => {
      _logger.logger.log(`LocalIndexedDBStoreBackend.connect: connected`);
      this.db = req.result;

      // add a poorly-named listener for when deleteDatabase is called
      // so we can close our db connections.
      this.db.onversionchange = () => {
        this.db?.close(); // this does not call onclose
        this.disconnected = true;
        this.db = undefined;
      };
      this.db.onclose = () => {
        this.disconnected = true;
        this.db = undefined;
        onClose?.();
      };
      await this.init();
    });
  }

  /** @returns whether or not the database was newly created in this session. */
  isNewlyCreated() {
    return Promise.resolve(this._isNewlyCreated);
  }

  /**
   * Having connected, load initial data from the database and prepare for use
   * @returns Promise which resolves on success
   */
  init() {
    return Promise.all([this.loadAccountData(), this.loadSyncData()]).then(([accountData, syncData]) => {
      _logger.logger.log(`LocalIndexedDBStoreBackend: loaded initial data`);
      this.syncAccumulator.accumulate({
        next_batch: syncData.nextBatch,
        rooms: syncData.roomsData,
        account_data: {
          events: accountData
        }
      }, true);
    });
  }

  /**
   * Returns the out-of-band membership events for this room that
   * were previously loaded.
   * @returns the events, potentially an empty array if OOB loading didn't yield any new members
   * @returns in case the members for this room haven't been stored yet
   */
  getOutOfBandMembers(roomId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(["oob_membership_events"], "readonly");
      const store = tx.objectStore("oob_membership_events");
      const roomIndex = store.index("room");
      const range = IDBKeyRange.only(roomId);
      const request = roomIndex.openCursor(range);
      const membershipEvents = [];
      // did we encounter the oob_written marker object
      // amongst the results? That means OOB member
      // loading already happened for this room
      // but there were no members to persist as they
      // were all known already
      let oobWritten = false;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          // Unknown room
          if (!membershipEvents.length && !oobWritten) {
            return resolve(null);
          }
          return resolve(membershipEvents);
        }
        const record = cursor.value;
        if (record.oob_written) {
          oobWritten = true;
        } else {
          membershipEvents.push(record);
        }
        cursor.continue();
      };
      request.onerror = err => {
        reject(err);
      };
    }).then(events => {
      _logger.logger.log(`LL: got ${events?.length} membershipEvents from storage for room ${roomId} ...`);
      return events;
    });
  }

  /**
   * Stores the out-of-band membership events for this room. Note that
   * it still makes sense to store an empty array as the OOB status for the room is
   * marked as fetched, and getOutOfBandMembers will return an empty array instead of null
   * @param membershipEvents - the membership events to store
   */
  async setOutOfBandMembers(roomId, membershipEvents) {
    _logger.logger.log(`LL: backend about to store ${membershipEvents.length}` + ` members for ${roomId}`);
    const tx = this.db.transaction(["oob_membership_events"], "readwrite");
    const store = tx.objectStore("oob_membership_events");
    membershipEvents.forEach(e => {
      store.put(e);
    });
    // aside from all the events, we also write a marker object to the store
    // to mark the fact that OOB members have been written for this room.
    // It's possible that 0 members need to be written as all where previously know
    // but we still need to know whether to return null or [] from getOutOfBandMembers
    // where null means out of band members haven't been stored yet for this room
    const markerObject = {
      room_id: roomId,
      oob_written: true,
      state_key: 0
    };
    store.put(markerObject);
    await txnAsPromise(tx);
    _logger.logger.log(`LL: backend done storing for ${roomId}!`);
  }
  async clearOutOfBandMembers(roomId) {
    // the approach to delete all members for a room
    // is to get the min and max state key from the index
    // for that room, and then delete between those
    // keys in the store.
    // this should be way faster than deleting every member
    // individually for a large room.
    const readTx = this.db.transaction(["oob_membership_events"], "readonly");
    const store = readTx.objectStore("oob_membership_events");
    const roomIndex = store.index("room");
    const roomRange = IDBKeyRange.only(roomId);
    const minStateKeyProm = reqAsCursorPromise(roomIndex.openKeyCursor(roomRange, "next")).then(cursor => (cursor?.primaryKey)[1]);
    const maxStateKeyProm = reqAsCursorPromise(roomIndex.openKeyCursor(roomRange, "prev")).then(cursor => (cursor?.primaryKey)[1]);
    const [minStateKey, maxStateKey] = await Promise.all([minStateKeyProm, maxStateKeyProm]);
    const writeTx = this.db.transaction(["oob_membership_events"], "readwrite");
    const writeStore = writeTx.objectStore("oob_membership_events");
    const membersKeyRange = IDBKeyRange.bound([roomId, minStateKey], [roomId, maxStateKey]);
    _logger.logger.log(`LL: Deleting all users + marker in storage for room ${roomId}, with key range:`, [roomId, minStateKey], [roomId, maxStateKey]);
    await reqAsPromise(writeStore.delete(membersKeyRange));
  }

  /**
   * Clear the entire database. This should be used when logging out of a client
   * to prevent mixing data between accounts. Closes the database.
   * @returns Resolved when the database is cleared.
   */
  clearDatabase() {
    return new Promise(resolve => {
      _logger.logger.log(`Removing indexeddb instance: ${this.dbName}`);

      // Close the database first to avoid firing unexpected close events
      this.db?.close();
      const req = this.indexedDB.deleteDatabase(this.dbName);
      req.onblocked = () => {
        _logger.logger.log(`can't yet delete indexeddb ${this.dbName} because it is open elsewhere`);
      };
      req.onerror = () => {
        // in firefox, with indexedDB disabled, this fails with a
        // DOMError. We treat this as non-fatal, so that we can still
        // use the app.
        _logger.logger.warn(`unable to delete js-sdk store indexeddb: ${req.error}`);
        resolve();
      };
      req.onsuccess = () => {
        _logger.logger.log(`Removed indexeddb instance: ${this.dbName}`);
        resolve();
      };
    });
  }

  /**
   * @param copy - If false, the data returned is from internal
   * buffers and must not be mutated. Otherwise, a copy is made before
   * returning such that the data can be safely mutated. Default: true.
   *
   * @returns Promise which resolves with a sync response to restore the
   * client state to where it was at the last save, or null if there
   * is no saved sync data.
   */
  getSavedSync(copy = true) {
    const data = this.syncAccumulator.getJSON();
    if (!data.nextBatch) return Promise.resolve(null);
    if (copy) {
      // We must deep copy the stored data so that the /sync processing code doesn't
      // corrupt the internal state of the sync accumulator (it adds non-clonable keys)
      return Promise.resolve((0, _utils.deepCopy)(data));
    } else {
      return Promise.resolve(data);
    }
  }
  getNextBatchToken() {
    return Promise.resolve(this.syncAccumulator.getNextBatchToken());
  }
  setSyncData(syncData) {
    return Promise.resolve().then(() => {
      this.syncAccumulator.accumulate(syncData);
    });
  }

  /**
   * Sync users and all accumulated sync data to the database.
   * If a previous sync is in flight, the new data will be added to the
   * next sync and the current sync's promise will be returned.
   * @param userTuples - The user tuples
   * @returns Promise which resolves if the data was persisted.
   */
  async syncToDatabase(userTuples) {
    if (this.syncToDatabasePromise) {
      _logger.logger.warn("Skipping syncToDatabase() as persist already in flight");
      this.pendingUserPresenceData.push(...userTuples);
      return this.syncToDatabasePromise;
    }
    userTuples.unshift(...this.pendingUserPresenceData);
    this.syncToDatabasePromise = this.doSyncToDatabase(userTuples);
    return this.syncToDatabasePromise;
  }
  async doSyncToDatabase(userTuples) {
    try {
      const syncData = this.syncAccumulator.getJSON(true);
      await Promise.all([this.persistUserPresenceEvents(userTuples), this.persistAccountData(syncData.accountData), this.persistSyncData(syncData.nextBatch, syncData.roomsData)]);
    } finally {
      this.syncToDatabasePromise = undefined;
    }
  }

  /**
   * Persist rooms /sync data along with the next batch token.
   * @param nextBatch - The next_batch /sync value.
   * @param roomsData - The 'rooms' /sync data from a SyncAccumulator
   * @returns Promise which resolves if the data was persisted.
   */
  persistSyncData(nextBatch, roomsData) {
    _logger.logger.log("Persisting sync data up to", nextBatch);
    return (0, _utils.promiseTry)(() => {
      const txn = this.db.transaction(["sync"], "readwrite");
      const store = txn.objectStore("sync");
      store.put({
        clobber: "-",
        // constant key so will always clobber
        nextBatch,
        roomsData
      }); // put == UPSERT
      return txnAsPromise(txn).then(() => {
        _logger.logger.log("Persisted sync data up to", nextBatch);
      });
    });
  }

  /**
   * Persist a list of account data events. Events with the same 'type' will
   * be replaced.
   * @param accountData - An array of raw user-scoped account data events
   * @returns Promise which resolves if the events were persisted.
   */
  persistAccountData(accountData) {
    return (0, _utils.promiseTry)(() => {
      const txn = this.db.transaction(["accountData"], "readwrite");
      const store = txn.objectStore("accountData");
      for (const event of accountData) {
        store.put(event); // put == UPSERT
      }
      return txnAsPromise(txn).then();
    });
  }

  /**
   * Persist a list of [user id, presence event] they are for.
   * Users with the same 'userId' will be replaced.
   * Presence events should be the event in its raw form (not the Event
   * object)
   * @param tuples - An array of [userid, event] tuples
   * @returns Promise which resolves if the users were persisted.
   */
  persistUserPresenceEvents(tuples) {
    return (0, _utils.promiseTry)(() => {
      const txn = this.db.transaction(["users"], "readwrite");
      const store = txn.objectStore("users");
      for (const tuple of tuples) {
        store.put({
          userId: tuple[0],
          event: tuple[1]
        }); // put == UPSERT
      }
      return txnAsPromise(txn).then();
    });
  }

  /**
   * Load all user presence events from the database. This is not cached.
   * FIXME: It would probably be more sensible to store the events in the
   * sync.
   * @returns A list of presence events in their raw form.
   */
  getUserPresenceEvents() {
    return (0, _utils.promiseTry)(() => {
      const txn = this.db.transaction(["users"], "readonly");
      const store = txn.objectStore("users");
      return selectQuery(store, undefined, cursor => {
        return [cursor.value.userId, cursor.value.event];
      });
    });
  }

  /**
   * Load all the account data events from the database. This is not cached.
   * @returns A list of raw global account events.
   */
  loadAccountData() {
    _logger.logger.log(`LocalIndexedDBStoreBackend: loading account data...`);
    return (0, _utils.promiseTry)(() => {
      const txn = this.db.transaction(["accountData"], "readonly");
      const store = txn.objectStore("accountData");
      return selectQuery(store, undefined, cursor => {
        return cursor.value;
      }).then(result => {
        _logger.logger.log(`LocalIndexedDBStoreBackend: loaded account data`);
        return result;
      });
    });
  }

  /**
   * Load the sync data from the database.
   * @returns An object with "roomsData" and "nextBatch" keys.
   */
  loadSyncData() {
    _logger.logger.log(`LocalIndexedDBStoreBackend: loading sync data...`);
    return (0, _utils.promiseTry)(() => {
      const txn = this.db.transaction(["sync"], "readonly");
      const store = txn.objectStore("sync");
      return selectQuery(store, undefined, cursor => {
        return cursor.value;
      }).then(results => {
        _logger.logger.log(`LocalIndexedDBStoreBackend: loaded sync data`);
        if (results.length > 1) {
          _logger.logger.warn("loadSyncData: More than 1 sync row found.");
        }
        return results.length > 0 ? results[0] : {};
      });
    });
  }
  getClientOptions() {
    return Promise.resolve().then(() => {
      const txn = this.db.transaction(["client_options"], "readonly");
      const store = txn.objectStore("client_options");
      return selectQuery(store, undefined, cursor => {
        return cursor.value?.options;
      }).then(results => results[0]);
    });
  }
  async storeClientOptions(options) {
    const txn = this.db.transaction(["client_options"], "readwrite");
    const store = txn.objectStore("client_options");
    store.put({
      clobber: "-",
      // constant key so will always clobber
      options: options
    }); // put == UPSERT
    await txnAsPromise(txn);
  }
  async saveToDeviceBatches(batches) {
    const txn = this.db.transaction(["to_device_queue"], "readwrite");
    const store = txn.objectStore("to_device_queue");
    for (const batch of batches) {
      store.add(batch);
    }
    await txnAsPromise(txn);
  }
  async getOldestToDeviceBatch() {
    const txn = this.db.transaction(["to_device_queue"], "readonly");
    const store = txn.objectStore("to_device_queue");
    const cursor = await reqAsCursorPromise(store.openCursor());
    if (!cursor) return null;
    const resultBatch = cursor.value;
    return {
      id: cursor.key,
      txnId: resultBatch.txnId,
      eventType: resultBatch.eventType,
      batch: resultBatch.batch
    };
  }
  async removeToDeviceBatch(id) {
    const txn = this.db.transaction(["to_device_queue"], "readwrite");
    const store = txn.objectStore("to_device_queue");
    store.delete(id);
    await txnAsPromise(txn);
  }

  /*
   * Close the database
   */
  async destroy() {
    this.db?.close();
  }
}
exports.LocalIndexedDBStoreBackend = LocalIndexedDBStoreBackend;