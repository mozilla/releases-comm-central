"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IndexedDBCryptoStore = void 0;
var _logger = require("../../logger.js");
var _localStorageCryptoStore = require("./localStorage-crypto-store.js");
var _memoryCryptoStore = require("./memory-crypto-store.js");
var IndexedDBCryptoStoreBackend = _interopRequireWildcard(require("./indexeddb-crypto-store-backend.js"));
var _errors = require("../../errors.js");
var IndexedDBHelpers = _interopRequireWildcard(require("../../indexeddb-helpers.js"));
var _base = require("./base.js");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
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
/*
 * Internal module. indexeddb storage for e2e.
 */

/**
 * An implementation of CryptoStore, which is normally backed by an indexeddb,
 * but with fallback to MemoryCryptoStore.
 */
class IndexedDBCryptoStore {
  static exists(indexedDB, dbName) {
    return IndexedDBHelpers.exists(indexedDB, dbName);
  }

  /**
   * Utility to check if a legacy crypto store exists and has not been migrated.
   * Returns true if the store exists and has not been migrated, false otherwise.
   */
  static existsAndIsNotMigrated(indexedDb, dbName) {
    return new Promise((resolve, reject) => {
      let exists = true;
      const openDBRequest = indexedDb.open(dbName);
      openDBRequest.onupgradeneeded = () => {
        // Since we did not provide an explicit version when opening, this event
        // should only fire if the DB did not exist before at any version.
        exists = false;
      };
      openDBRequest.onblocked = () => reject(openDBRequest.error);
      openDBRequest.onsuccess = () => {
        const db = openDBRequest.result;
        if (!exists) {
          db.close();
          // The DB did not exist before, but has been created as part of this
          // existence check. Delete it now to restore previous state. Delete can
          // actually take a while to complete in some browsers, so don't wait for
          // it. This won't block future open calls that a store might issue next to
          // properly set up the DB.
          indexedDb.deleteDatabase(dbName);
          resolve(false);
        } else {
          const tx = db.transaction([IndexedDBCryptoStore.STORE_ACCOUNT], "readonly");
          const objectStore = tx.objectStore(IndexedDBCryptoStore.STORE_ACCOUNT);
          const getReq = objectStore.get(_base.ACCOUNT_OBJECT_KEY_MIGRATION_STATE);
          getReq.onsuccess = () => {
            const migrationState = getReq.result ?? _base.MigrationState.NOT_STARTED;
            resolve(migrationState === _base.MigrationState.NOT_STARTED);
          };
          getReq.onerror = () => {
            reject(getReq.error);
          };
          db.close();
        }
      };
      openDBRequest.onerror = () => reject(openDBRequest.error);
    });
  }
  /**
   * Create a new IndexedDBCryptoStore
   *
   * @param indexedDB -  global indexedDB instance
   * @param dbName -   name of db to connect to
   */
  constructor(indexedDB, dbName) {
    this.indexedDB = indexedDB;
    this.dbName = dbName;
    _defineProperty(this, "backendPromise", void 0);
    _defineProperty(this, "backend", void 0);
  }

  /**
   * Returns true if this CryptoStore has ever been initialised (ie, it might contain data).
   *
   * Implementation of {@link CryptoStore.containsData}.
   *
   * @internal
   */
  async containsData() {
    return IndexedDBCryptoStore.exists(this.indexedDB, this.dbName);
  }

  /**
   * Ensure the database exists and is up-to-date, or fall back to
   * a local storage or in-memory store.
   *
   * This must be called before the store can be used.
   *
   * @returns resolves to either an IndexedDBCryptoStoreBackend.Backend,
   * or a MemoryCryptoStore
   */
  startup() {
    if (this.backendPromise) {
      return this.backendPromise;
    }
    this.backendPromise = new Promise((resolve, reject) => {
      if (!this.indexedDB) {
        reject(new Error("no indexeddb support available"));
        return;
      }
      _logger.logger.log(`connecting to indexeddb ${this.dbName}`);
      const req = this.indexedDB.open(this.dbName, IndexedDBCryptoStoreBackend.VERSION);
      req.onupgradeneeded = ev => {
        const db = req.result;
        const oldVersion = ev.oldVersion;
        IndexedDBCryptoStoreBackend.upgradeDatabase(db, oldVersion);
      };
      req.onblocked = () => {
        _logger.logger.log(`can't yet open IndexedDBCryptoStore because it is open elsewhere`);
      };
      req.onerror = ev => {
        _logger.logger.log("Error connecting to indexeddb", ev);
        reject(req.error);
      };
      req.onsuccess = () => {
        const db = req.result;
        _logger.logger.log(`connected to indexeddb ${this.dbName}`);
        resolve(new IndexedDBCryptoStoreBackend.Backend(db));
      };
    }).then(backend => {
      // Edge has IndexedDB but doesn't support compund keys which we use fairly extensively.
      // Try a dummy query which will fail if the browser doesn't support compund keys, so
      // we can fall back to a different backend.
      return backend.doTxn("readonly", [IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS, IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS_WITHHELD], txn => {
        backend.getEndToEndInboundGroupSession("", "", txn, () => {});
      }).then(() => backend);
    }).catch(e => {
      if (e.name === "VersionError") {
        _logger.logger.warn("Crypto DB is too new for us to use!", e);
        // don't fall back to a different store: the user has crypto data
        // in this db so we should use it or nothing at all.
        throw new _errors.InvalidCryptoStoreError(_errors.InvalidCryptoStoreState.TooNew);
      }
      _logger.logger.warn(`unable to connect to indexeddb ${this.dbName}` + `: falling back to localStorage store: ${e}`);
      try {
        return new _localStorageCryptoStore.LocalStorageCryptoStore(global.localStorage);
      } catch (e) {
        _logger.logger.warn(`unable to open localStorage: falling back to in-memory store: ${e}`);
        return new _memoryCryptoStore.MemoryCryptoStore();
      }
    }).then(backend => {
      this.backend = backend;
      return backend;
    });
    return this.backendPromise;
  }

  /**
   * Delete all data from this store.
   *
   * @returns resolves when the store has been cleared.
   */
  deleteAllData() {
    return new Promise((resolve, reject) => {
      if (!this.indexedDB) {
        reject(new Error("no indexeddb support available"));
        return;
      }
      _logger.logger.log(`Removing indexeddb instance: ${this.dbName}`);
      const req = this.indexedDB.deleteDatabase(this.dbName);
      req.onblocked = () => {
        _logger.logger.log(`can't yet delete IndexedDBCryptoStore because it is open elsewhere`);
      };
      req.onerror = ev => {
        _logger.logger.log("Error deleting data from indexeddb", ev);
        reject(req.error);
      };
      req.onsuccess = () => {
        _logger.logger.log(`Removed indexeddb instance: ${this.dbName}`);
        resolve();
      };
    }).catch(e => {
      // in firefox, with indexedDB disabled, this fails with a
      // DOMError. We treat this as non-fatal, so that people can
      // still use the app.
      _logger.logger.warn(`unable to delete IndexedDBCryptoStore: ${e}`);
    });
  }

  /**
   * Get data on how much of the libolm to Rust Crypto migration has been done.
   *
   * Implementation of {@link CryptoStore.getMigrationState}.
   *
   * @internal
   */
  getMigrationState() {
    return this.backend.getMigrationState();
  }

  /**
   * Set data on how much of the libolm to Rust Crypto migration has been done.
   *
   * Implementation of {@link CryptoStore.setMigrationState}.
   *
   * @internal
   */
  setMigrationState(migrationState) {
    return this.backend.setMigrationState(migrationState);
  }

  /**
   * Look for an existing outgoing room key request, and if none is found,
   * add a new one
   *
   *
   * @returns resolves to
   *    {@link OutgoingRoomKeyRequest}: either the
   *    same instance as passed in, or the existing one.
   */
  getOrAddOutgoingRoomKeyRequest(request) {
    return this.backend.getOrAddOutgoingRoomKeyRequest(request);
  }

  /**
   * Look for an existing room key request
   *
   * @param requestBody - existing request to look for
   *
   * @returns resolves to the matching
   *    {@link OutgoingRoomKeyRequest}, or null if
   *    not found
   */
  getOutgoingRoomKeyRequest(requestBody) {
    return this.backend.getOutgoingRoomKeyRequest(requestBody);
  }

  /**
   * Look for room key requests by state
   *
   * @param wantedStates - list of acceptable states
   *
   * @returns resolves to the a
   *    {@link OutgoingRoomKeyRequest}, or null if
   *    there are no pending requests in those states. If there are multiple
   *    requests in those states, an arbitrary one is chosen.
   */
  getOutgoingRoomKeyRequestByState(wantedStates) {
    return this.backend.getOutgoingRoomKeyRequestByState(wantedStates);
  }

  /**
   * Look for room key requests by state –
   * unlike above, return a list of all entries in one state.
   *
   * @returns Returns an array of requests in the given state
   */
  getAllOutgoingRoomKeyRequestsByState(wantedState) {
    return this.backend.getAllOutgoingRoomKeyRequestsByState(wantedState);
  }

  /**
   * Look for room key requests by target device and state
   *
   * @param userId - Target user ID
   * @param deviceId - Target device ID
   * @param wantedStates - list of acceptable states
   *
   * @returns resolves to a list of all the
   *    {@link OutgoingRoomKeyRequest}
   */
  getOutgoingRoomKeyRequestsByTarget(userId, deviceId, wantedStates) {
    return this.backend.getOutgoingRoomKeyRequestsByTarget(userId, deviceId, wantedStates);
  }

  /**
   * Look for an existing room key request by id and state, and update it if
   * found
   *
   * @param requestId -      ID of request to update
   * @param expectedState -  state we expect to find the request in
   * @param updates -        name/value map of updates to apply
   *
   * @returns resolves to
   *    {@link OutgoingRoomKeyRequest}
   *    updated request, or null if no matching row was found
   */
  updateOutgoingRoomKeyRequest(requestId, expectedState, updates) {
    return this.backend.updateOutgoingRoomKeyRequest(requestId, expectedState, updates);
  }

  /**
   * Look for an existing room key request by id and state, and delete it if
   * found
   *
   * @param requestId -      ID of request to update
   * @param expectedState -  state we expect to find the request in
   *
   * @returns resolves once the operation is completed
   */
  deleteOutgoingRoomKeyRequest(requestId, expectedState) {
    return this.backend.deleteOutgoingRoomKeyRequest(requestId, expectedState);
  }

  // Olm Account

  /*
   * Get the account pickle from the store.
   * This requires an active transaction. See doTxn().
   *
   * @param txn - An active transaction. See doTxn().
   * @param func - Called with the account pickle
   */
  getAccount(txn, func) {
    this.backend.getAccount(txn, func);
  }

  /**
   * Write the account pickle to the store.
   * This requires an active transaction. See doTxn().
   *
   * @param txn - An active transaction. See doTxn().
   * @param accountPickle - The new account pickle to store.
   */
  storeAccount(txn, accountPickle) {
    this.backend.storeAccount(txn, accountPickle);
  }

  /**
   * Get the public part of the cross-signing keys (eg. self-signing key,
   * user signing key).
   *
   * @param txn - An active transaction. See doTxn().
   * @param func - Called with the account keys object:
   *        `{ key_type: base64 encoded seed }` where key type = user_signing_key_seed or self_signing_key_seed
   */
  getCrossSigningKeys(txn, func) {
    this.backend.getCrossSigningKeys(txn, func);
  }

  /**
   * @param txn - An active transaction. See doTxn().
   * @param func - Called with the private key
   * @param type - A key type
   */
  getSecretStorePrivateKey(txn, func, type) {
    this.backend.getSecretStorePrivateKey(txn, func, type);
  }

  /**
   * Write the cross-signing keys back to the store
   *
   * @param txn - An active transaction. See doTxn().
   * @param keys - keys object as getCrossSigningKeys()
   */
  storeCrossSigningKeys(txn, keys) {
    this.backend.storeCrossSigningKeys(txn, keys);
  }

  /**
   * Write the cross-signing private keys back to the store
   *
   * @param txn - An active transaction. See doTxn().
   * @param type - The type of cross-signing private key to store
   * @param key - keys object as getCrossSigningKeys()
   */
  storeSecretStorePrivateKey(txn, type, key) {
    this.backend.storeSecretStorePrivateKey(txn, type, key);
  }

  // Olm sessions

  /**
   * Returns the number of end-to-end sessions in the store
   * @param txn - An active transaction. See doTxn().
   * @param func - Called with the count of sessions
   */
  countEndToEndSessions(txn, func) {
    this.backend.countEndToEndSessions(txn, func);
  }

  /**
   * Retrieve a specific end-to-end session between the logged-in user
   * and another device.
   * @param deviceKey - The public key of the other device.
   * @param sessionId - The ID of the session to retrieve
   * @param txn - An active transaction. See doTxn().
   * @param func - Called with A map from sessionId
   *     to session information object with 'session' key being the
   *     Base64 end-to-end session and lastReceivedMessageTs being the
   *     timestamp in milliseconds at which the session last received
   *     a message.
   */
  getEndToEndSession(deviceKey, sessionId, txn, func) {
    this.backend.getEndToEndSession(deviceKey, sessionId, txn, func);
  }

  /**
   * Retrieve the end-to-end sessions between the logged-in user and another
   * device.
   * @param deviceKey - The public key of the other device.
   * @param txn - An active transaction. See doTxn().
   * @param func - Called with A map from sessionId
   *     to session information object with 'session' key being the
   *     Base64 end-to-end session and lastReceivedMessageTs being the
   *     timestamp in milliseconds at which the session last received
   *     a message.
   */
  getEndToEndSessions(deviceKey, txn, func) {
    this.backend.getEndToEndSessions(deviceKey, txn, func);
  }

  /**
   * Retrieve all end-to-end sessions
   * @param txn - An active transaction. See doTxn().
   * @param func - Called one for each session with
   *     an object with, deviceKey, lastReceivedMessageTs, sessionId
   *     and session keys.
   */
  getAllEndToEndSessions(txn, func) {
    this.backend.getAllEndToEndSessions(txn, func);
  }

  /**
   * Store a session between the logged-in user and another device
   * @param deviceKey - The public key of the other device.
   * @param sessionId - The ID for this end-to-end session.
   * @param sessionInfo - Session information object
   * @param txn - An active transaction. See doTxn().
   */
  storeEndToEndSession(deviceKey, sessionId, sessionInfo, txn) {
    this.backend.storeEndToEndSession(deviceKey, sessionId, sessionInfo, txn);
  }
  storeEndToEndSessionProblem(deviceKey, type, fixed) {
    return this.backend.storeEndToEndSessionProblem(deviceKey, type, fixed);
  }
  getEndToEndSessionProblem(deviceKey, timestamp) {
    return this.backend.getEndToEndSessionProblem(deviceKey, timestamp);
  }
  filterOutNotifiedErrorDevices(devices) {
    return this.backend.filterOutNotifiedErrorDevices(devices);
  }

  /**
   * Count the number of Megolm sessions in the database.
   *
   * Implementation of {@link CryptoStore.countEndToEndInboundGroupSessions}.
   *
   * @internal
   */
  countEndToEndInboundGroupSessions() {
    return this.backend.countEndToEndInboundGroupSessions();
  }

  /**
   * Fetch a batch of Olm sessions from the database.
   *
   * Implementation of {@link CryptoStore.getEndToEndSessionsBatch}.
   *
   * @internal
   */
  getEndToEndSessionsBatch() {
    return this.backend.getEndToEndSessionsBatch();
  }

  /**
   * Delete a batch of Olm sessions from the database.
   *
   * Implementation of {@link CryptoStore.deleteEndToEndSessionsBatch}.
   *
   * @internal
   */
  deleteEndToEndSessionsBatch(sessions) {
    return this.backend.deleteEndToEndSessionsBatch(sessions);
  }

  // Inbound group sessions

  /**
   * Retrieve the end-to-end inbound group session for a given
   * server key and session ID
   * @param senderCurve25519Key - The sender's curve 25519 key
   * @param sessionId - The ID of the session
   * @param txn - An active transaction. See doTxn().
   * @param func - Called with A map from sessionId
   *     to Base64 end-to-end session.
   */
  getEndToEndInboundGroupSession(senderCurve25519Key, sessionId, txn, func) {
    this.backend.getEndToEndInboundGroupSession(senderCurve25519Key, sessionId, txn, func);
  }

  /**
   * Fetches all inbound group sessions in the store
   * @param txn - An active transaction. See doTxn().
   * @param func - Called once for each group session
   *     in the store with an object having keys `{senderKey, sessionId, sessionData}`,
   *     then once with null to indicate the end of the list.
   */
  getAllEndToEndInboundGroupSessions(txn, func) {
    this.backend.getAllEndToEndInboundGroupSessions(txn, func);
  }

  /**
   * Adds an end-to-end inbound group session to the store.
   * If there already exists an inbound group session with the same
   * senderCurve25519Key and sessionID, the session will not be added.
   * @param senderCurve25519Key - The sender's curve 25519 key
   * @param sessionId - The ID of the session
   * @param sessionData - The session data structure
   * @param txn - An active transaction. See doTxn().
   */
  addEndToEndInboundGroupSession(senderCurve25519Key, sessionId, sessionData, txn) {
    this.backend.addEndToEndInboundGroupSession(senderCurve25519Key, sessionId, sessionData, txn);
  }

  /**
   * Writes an end-to-end inbound group session to the store.
   * If there already exists an inbound group session with the same
   * senderCurve25519Key and sessionID, it will be overwritten.
   * @param senderCurve25519Key - The sender's curve 25519 key
   * @param sessionId - The ID of the session
   * @param sessionData - The session data structure
   * @param txn - An active transaction. See doTxn().
   */
  storeEndToEndInboundGroupSession(senderCurve25519Key, sessionId, sessionData, txn) {
    this.backend.storeEndToEndInboundGroupSession(senderCurve25519Key, sessionId, sessionData, txn);
  }
  storeEndToEndInboundGroupSessionWithheld(senderCurve25519Key, sessionId, sessionData, txn) {
    this.backend.storeEndToEndInboundGroupSessionWithheld(senderCurve25519Key, sessionId, sessionData, txn);
  }

  /**
   * Fetch a batch of Megolm sessions from the database.
   *
   * Implementation of {@link CryptoStore.getEndToEndInboundGroupSessionsBatch}.
   *
   * @internal
   */
  getEndToEndInboundGroupSessionsBatch() {
    return this.backend.getEndToEndInboundGroupSessionsBatch();
  }

  /**
   * Delete a batch of Megolm sessions from the database.
   *
   * Implementation of {@link CryptoStore.deleteEndToEndInboundGroupSessionsBatch}.
   *
   * @internal
   */
  deleteEndToEndInboundGroupSessionsBatch(sessions) {
    return this.backend.deleteEndToEndInboundGroupSessionsBatch(sessions);
  }

  // End-to-end device tracking

  /**
   * Store the state of all tracked devices
   * This contains devices for each user, a tracking state for each user
   * and a sync token matching the point in time the snapshot represents.
   * These all need to be written out in full each time such that the snapshot
   * is always consistent, so they are stored in one object.
   *
   * @param txn - An active transaction. See doTxn().
   */
  storeEndToEndDeviceData(deviceData, txn) {
    this.backend.storeEndToEndDeviceData(deviceData, txn);
  }

  /**
   * Get the state of all tracked devices
   *
   * @param txn - An active transaction. See doTxn().
   * @param func - Function called with the
   *     device data
   */
  getEndToEndDeviceData(txn, func) {
    this.backend.getEndToEndDeviceData(txn, func);
  }

  // End to End Rooms

  /**
   * Store the end-to-end state for a room.
   * @param roomId - The room's ID.
   * @param roomInfo - The end-to-end info for the room.
   * @param txn - An active transaction. See doTxn().
   */
  storeEndToEndRoom(roomId, roomInfo, txn) {
    this.backend.storeEndToEndRoom(roomId, roomInfo, txn);
  }

  /**
   * Get an object of `roomId->roomInfo` for all e2e rooms in the store
   * @param txn - An active transaction. See doTxn().
   * @param func - Function called with the end-to-end encrypted rooms
   */
  getEndToEndRooms(txn, func) {
    this.backend.getEndToEndRooms(txn, func);
  }

  // session backups

  /**
   * Get the inbound group sessions that need to be backed up.
   * @param limit - The maximum number of sessions to retrieve.  0
   * for no limit.
   * @returns resolves to an array of inbound group sessions
   */
  getSessionsNeedingBackup(limit) {
    return this.backend.getSessionsNeedingBackup(limit);
  }

  /**
   * Count the inbound group sessions that need to be backed up.
   * @param txn - An active transaction. See doTxn(). (optional)
   * @returns resolves to the number of sessions
   */
  countSessionsNeedingBackup(txn) {
    return this.backend.countSessionsNeedingBackup(txn);
  }

  /**
   * Unmark sessions as needing to be backed up.
   * @param sessions - The sessions that need to be backed up.
   * @param txn - An active transaction. See doTxn(). (optional)
   * @returns resolves when the sessions are unmarked
   */
  unmarkSessionsNeedingBackup(sessions, txn) {
    return this.backend.unmarkSessionsNeedingBackup(sessions, txn);
  }

  /**
   * Mark sessions as needing to be backed up.
   * @param sessions - The sessions that need to be backed up.
   * @param txn - An active transaction. See doTxn(). (optional)
   * @returns resolves when the sessions are marked
   */
  markSessionsNeedingBackup(sessions, txn) {
    return this.backend.markSessionsNeedingBackup(sessions, txn);
  }

  /**
   * Add a shared-history group session for a room.
   * @param roomId - The room that the key belongs to
   * @param senderKey - The sender's curve 25519 key
   * @param sessionId - The ID of the session
   * @param txn - An active transaction. See doTxn(). (optional)
   */
  addSharedHistoryInboundGroupSession(roomId, senderKey, sessionId, txn) {
    this.backend.addSharedHistoryInboundGroupSession(roomId, senderKey, sessionId, txn);
  }

  /**
   * Get the shared-history group session for a room.
   * @param roomId - The room that the key belongs to
   * @param txn - An active transaction. See doTxn(). (optional)
   * @returns Promise which resolves to an array of [senderKey, sessionId]
   */
  getSharedHistoryInboundGroupSessions(roomId, txn) {
    return this.backend.getSharedHistoryInboundGroupSessions(roomId, txn);
  }

  /**
   * Park a shared-history group session for a room we may be invited to later.
   */
  addParkedSharedHistory(roomId, parkedData, txn) {
    this.backend.addParkedSharedHistory(roomId, parkedData, txn);
  }

  /**
   * Pop out all shared-history group sessions for a room.
   */
  takeParkedSharedHistory(roomId, txn) {
    return this.backend.takeParkedSharedHistory(roomId, txn);
  }

  /**
   * Perform a transaction on the crypto store. Any store methods
   * that require a transaction (txn) object to be passed in may
   * only be called within a callback of either this function or
   * one of the store functions operating on the same transaction.
   *
   * @param mode - 'readwrite' if you need to call setter
   *     functions with this transaction. Otherwise, 'readonly'.
   * @param stores - List IndexedDBCryptoStore.STORE_*
   *     options representing all types of object that will be
   *     accessed or written to with this transaction.
   * @param func - Function called with the
   *     transaction object: an opaque object that should be passed
   *     to store functions.
   * @param log - A possibly customised log
   * @returns Promise that resolves with the result of the `func`
   *     when the transaction is complete. If the backend is
   *     async (ie. the indexeddb backend) any of the callback
   *     functions throwing an exception will cause this promise to
   *     reject with that exception. On synchronous backends, the
   *     exception will propagate to the caller of the getFoo method.
   */
  doTxn(mode, stores, func, log) {
    return this.backend.doTxn(mode, stores, func, log);
  }
}
exports.IndexedDBCryptoStore = IndexedDBCryptoStore;
_defineProperty(IndexedDBCryptoStore, "STORE_ACCOUNT", "account");
_defineProperty(IndexedDBCryptoStore, "STORE_SESSIONS", "sessions");
_defineProperty(IndexedDBCryptoStore, "STORE_INBOUND_GROUP_SESSIONS", "inbound_group_sessions");
_defineProperty(IndexedDBCryptoStore, "STORE_INBOUND_GROUP_SESSIONS_WITHHELD", "inbound_group_sessions_withheld");
_defineProperty(IndexedDBCryptoStore, "STORE_SHARED_HISTORY_INBOUND_GROUP_SESSIONS", "shared_history_inbound_group_sessions");
_defineProperty(IndexedDBCryptoStore, "STORE_PARKED_SHARED_HISTORY", "parked_shared_history");
_defineProperty(IndexedDBCryptoStore, "STORE_DEVICE_DATA", "device_data");
_defineProperty(IndexedDBCryptoStore, "STORE_ROOMS", "rooms");
_defineProperty(IndexedDBCryptoStore, "STORE_BACKUP", "sessions_needing_backup");