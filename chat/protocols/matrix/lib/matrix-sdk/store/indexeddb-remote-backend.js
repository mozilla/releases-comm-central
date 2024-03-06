"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RemoteIndexedDBStoreBackend = void 0;
var _logger = require("../logger");
var _utils = require("../utils");
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
class RemoteIndexedDBStoreBackend {
  // Callback for when the IndexedDB gets closed unexpectedly

  /**
   * An IndexedDB store backend where the actual backend sits in a web
   * worker.
   *
   * Construct a new Indexed Database store backend. This requires a call to
   * `connect()` before this store can be used.
   * @param workerFactory - Factory which produces a Worker
   * @param dbName - Optional database name. The same name must be used
   * to open the same database.
   */
  constructor(workerFactory, dbName) {
    this.workerFactory = workerFactory;
    this.dbName = dbName;
    _defineProperty(this, "worker", void 0);
    _defineProperty(this, "nextSeq", 0);
    // The currently in-flight requests to the actual backend
    _defineProperty(this, "inFlight", {});
    // seq: promise
    // Once we start connecting, we keep the promise and re-use it
    // if we try to connect again
    _defineProperty(this, "startPromise", void 0);
    _defineProperty(this, "onWorkerMessage", ev => {
      const msg = ev.data;
      if (msg.command == "closed") {
        this.onClose?.();
      } else if (msg.command == "cmd_success" || msg.command == "cmd_fail") {
        if (msg.seq === undefined) {
          _logger.logger.error("Got reply from worker with no seq");
          return;
        }
        const def = this.inFlight[msg.seq];
        if (def === undefined) {
          _logger.logger.error("Got reply for unknown seq " + msg.seq);
          return;
        }
        delete this.inFlight[msg.seq];
        if (msg.command == "cmd_success") {
          def.resolve(msg.result);
        } else {
          const error = new Error(msg.error.message);
          error.name = msg.error.name;
          def.reject(error);
        }
      } else {
        _logger.logger.warn("Unrecognised message from worker: ", msg);
      }
    });
  }

  /**
   * Attempt to connect to the database. This can fail if the user does not
   * grant permission.
   * @returns Promise which resolves if successfully connected.
   */
  connect(onClose) {
    this.onClose = onClose;
    return this.ensureStarted().then(() => this.doCmd("connect"));
  }

  /**
   * Clear the entire database. This should be used when logging out of a client
   * to prevent mixing data between accounts.
   * @returns Resolved when the database is cleared.
   */
  clearDatabase() {
    return this.ensureStarted().then(() => this.doCmd("clearDatabase"));
  }

  /** @returns whether or not the database was newly created in this session. */
  isNewlyCreated() {
    return this.doCmd("isNewlyCreated");
  }

  /**
   * @returns Promise which resolves with a sync response to restore the
   * client state to where it was at the last save, or null if there
   * is no saved sync data.
   */
  getSavedSync() {
    return this.doCmd("getSavedSync");
  }
  getNextBatchToken() {
    return this.doCmd("getNextBatchToken");
  }
  setSyncData(syncData) {
    return this.doCmd("setSyncData", [syncData]);
  }
  syncToDatabase(userTuples) {
    return this.doCmd("syncToDatabase", [userTuples]);
  }

  /**
   * Returns the out-of-band membership events for this room that
   * were previously loaded.
   * @returns the events, potentially an empty array if OOB loading didn't yield any new members
   * @returns in case the members for this room haven't been stored yet
   */
  getOutOfBandMembers(roomId) {
    return this.doCmd("getOutOfBandMembers", [roomId]);
  }

  /**
   * Stores the out-of-band membership events for this room. Note that
   * it still makes sense to store an empty array as the OOB status for the room is
   * marked as fetched, and getOutOfBandMembers will return an empty array instead of null
   * @param membershipEvents - the membership events to store
   * @returns when all members have been stored
   */
  setOutOfBandMembers(roomId, membershipEvents) {
    return this.doCmd("setOutOfBandMembers", [roomId, membershipEvents]);
  }
  clearOutOfBandMembers(roomId) {
    return this.doCmd("clearOutOfBandMembers", [roomId]);
  }
  getClientOptions() {
    return this.doCmd("getClientOptions");
  }
  storeClientOptions(options) {
    return this.doCmd("storeClientOptions", [options]);
  }

  /**
   * Load all user presence events from the database. This is not cached.
   * @returns A list of presence events in their raw form.
   */
  getUserPresenceEvents() {
    return this.doCmd("getUserPresenceEvents");
  }
  async saveToDeviceBatches(batches) {
    return this.doCmd("saveToDeviceBatches", [batches]);
  }
  async getOldestToDeviceBatch() {
    return this.doCmd("getOldestToDeviceBatch");
  }
  async removeToDeviceBatch(id) {
    return this.doCmd("removeToDeviceBatch", [id]);
  }
  ensureStarted() {
    if (!this.startPromise) {
      this.worker = this.workerFactory();
      this.worker.onmessage = this.onWorkerMessage;

      // tell the worker the db name.
      this.startPromise = this.doCmd("setupWorker", [this.dbName]).then(() => {
        _logger.logger.log("IndexedDB worker is ready");
      });
    }
    return this.startPromise;
  }
  doCmd(command, args) {
    // wrap in a q so if the postMessage throws,
    // the promise automatically gets rejected
    return Promise.resolve().then(() => {
      const seq = this.nextSeq++;
      const def = (0, _utils.defer)();
      this.inFlight[seq] = def;
      this.worker?.postMessage({
        command,
        seq,
        args
      });
      return def.promise;
    });
  }
  /*
   * Destroy the web worker
   */
  async destroy() {
    this.worker?.terminate();
  }
}
exports.RemoteIndexedDBStoreBackend = RemoteIndexedDBStoreBackend;