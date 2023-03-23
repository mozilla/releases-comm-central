"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IndexedDBStore = void 0;
var _memory = require("./memory");
var _indexeddbLocalBackend = require("./indexeddb-local-backend");
var _indexeddbRemoteBackend = require("./indexeddb-remote-backend");
var _user = require("../models/user");
var _event = require("../models/event");
var _logger = require("../logger");
var _typedEventEmitter = require("../models/typed-event-emitter");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/**
 * This is an internal module. See {@link IndexedDBStore} for the public class.
 */

// If this value is too small we'll be writing very often which will cause
// noticeable stop-the-world pauses. If this value is too big we'll be writing
// so infrequently that the /sync size gets bigger on reload. Writing more
// often does not affect the length of the pause since the entire /sync
// response is persisted each time.
const WRITE_DELAY_MS = 1000 * 60 * 5; // once every 5 minutes

class IndexedDBStore extends _memory.MemoryStore {
  static exists(indexedDB, dbName) {
    return _indexeddbLocalBackend.LocalIndexedDBStoreBackend.exists(indexedDB, dbName);
  }

  /**
   * The backend instance.
   * Call through to this API if you need to perform specific indexeddb actions like deleting the database.
   */

  /**
   * Construct a new Indexed Database store, which extends MemoryStore.
   *
   * This store functions like a MemoryStore except it periodically persists
   * the contents of the store to an IndexedDB backend.
   *
   * All data is still kept in-memory but can be loaded from disk by calling
   * `startup()`. This can make startup times quicker as a complete
   * sync from the server is not required. This does not reduce memory usage as all
   * the data is eagerly fetched when `startup()` is called.
   * ```
   * let opts = { indexedDB: window.indexedDB, localStorage: window.localStorage };
   * let store = new IndexedDBStore(opts);
   * await store.startup(); // load from indexed db
   * let client = sdk.createClient({
   *     store: store,
   * });
   * client.startClient();
   * client.on("sync", function(state, prevState, data) {
   *     if (state === "PREPARED") {
   *         console.log("Started up, now with go faster stripes!");
   *     }
   * });
   * ```
   *
   * @param opts - Options object.
   */
  constructor(opts) {
    super(opts);
    _defineProperty(this, "backend", void 0);
    _defineProperty(this, "startedUp", false);
    _defineProperty(this, "syncTs", 0);
    _defineProperty(this, "userModifiedMap", {});
    _defineProperty(this, "emitter", new _typedEventEmitter.TypedEventEmitter());
    _defineProperty(this, "on", this.emitter.on.bind(this.emitter));
    _defineProperty(this, "getSavedSync", this.degradable(() => {
      return this.backend.getSavedSync();
    }, "getSavedSync"));
    _defineProperty(this, "isNewlyCreated", this.degradable(() => {
      return this.backend.isNewlyCreated();
    }, "isNewlyCreated"));
    _defineProperty(this, "getSavedSyncToken", this.degradable(() => {
      return this.backend.getNextBatchToken();
    }, "getSavedSyncToken"));
    _defineProperty(this, "deleteAllData", this.degradable(() => {
      super.deleteAllData();
      return this.backend.clearDatabase().then(() => {
        _logger.logger.log("Deleted indexeddb data.");
      }, err => {
        _logger.logger.error(`Failed to delete indexeddb data: ${err}`);
        throw err;
      });
    }));
    _defineProperty(this, "reallySave", this.degradable(() => {
      this.syncTs = Date.now(); // set now to guard against multi-writes

      // work out changed users (this doesn't handle deletions but you
      // can't 'delete' users as they are just presence events).
      const userTuples = [];
      for (const u of this.getUsers()) {
        if (this.userModifiedMap[u.userId] === u.getLastModifiedTime()) continue;
        if (!u.events.presence) continue;
        userTuples.push([u.userId, u.events.presence.event]);

        // note that we've saved this version of the user
        this.userModifiedMap[u.userId] = u.getLastModifiedTime();
      }
      return this.backend.syncToDatabase(userTuples);
    }));
    _defineProperty(this, "setSyncData", this.degradable(syncData => {
      return this.backend.setSyncData(syncData);
    }, "setSyncData"));
    _defineProperty(this, "getOutOfBandMembers", this.degradable(roomId => {
      return this.backend.getOutOfBandMembers(roomId);
    }, "getOutOfBandMembers"));
    _defineProperty(this, "setOutOfBandMembers", this.degradable((roomId, membershipEvents) => {
      super.setOutOfBandMembers(roomId, membershipEvents);
      return this.backend.setOutOfBandMembers(roomId, membershipEvents);
    }, "setOutOfBandMembers"));
    _defineProperty(this, "clearOutOfBandMembers", this.degradable(roomId => {
      super.clearOutOfBandMembers(roomId);
      return this.backend.clearOutOfBandMembers(roomId);
    }, "clearOutOfBandMembers"));
    _defineProperty(this, "getClientOptions", this.degradable(() => {
      return this.backend.getClientOptions();
    }, "getClientOptions"));
    _defineProperty(this, "storeClientOptions", this.degradable(options => {
      super.storeClientOptions(options);
      return this.backend.storeClientOptions(options);
    }, "storeClientOptions"));
    if (!opts.indexedDB) {
      throw new Error("Missing required option: indexedDB");
    }
    if (opts.workerFactory) {
      this.backend = new _indexeddbRemoteBackend.RemoteIndexedDBStoreBackend(opts.workerFactory, opts.dbName);
    } else {
      this.backend = new _indexeddbLocalBackend.LocalIndexedDBStoreBackend(opts.indexedDB, opts.dbName);
    }
  }
  /**
   * @returns Resolved when loaded from indexed db.
   */
  startup() {
    if (this.startedUp) {
      _logger.logger.log(`IndexedDBStore.startup: already started`);
      return Promise.resolve();
    }
    _logger.logger.log(`IndexedDBStore.startup: connecting to backend`);
    return this.backend.connect().then(() => {
      _logger.logger.log(`IndexedDBStore.startup: loading presence events`);
      return this.backend.getUserPresenceEvents();
    }).then(userPresenceEvents => {
      _logger.logger.log(`IndexedDBStore.startup: processing presence events`);
      userPresenceEvents.forEach(([userId, rawEvent]) => {
        const u = new _user.User(userId);
        if (rawEvent) {
          u.setPresenceEvent(new _event.MatrixEvent(rawEvent));
        }
        this.userModifiedMap[u.userId] = u.getLastModifiedTime();
        this.storeUser(u);
      });
    });
  }

  /**
   * @returns Promise which resolves with a sync response to restore the
   * client state to where it was at the last save, or null if there
   * is no saved sync data.
   */

  /**
   * Whether this store would like to save its data
   * Note that obviously whether the store wants to save or
   * not could change between calling this function and calling
   * save().
   *
   * @returns True if calling save() will actually save
   *     (at the time this function is called).
   */
  wantsSave() {
    const now = Date.now();
    return now - this.syncTs > WRITE_DELAY_MS;
  }

  /**
   * Possibly write data to the database.
   *
   * @param force - True to force a save to happen
   * @returns Promise resolves after the write completes
   *     (or immediately if no write is performed)
   */
  save(force = false) {
    if (force || this.wantsSave()) {
      return this.reallySave();
    }
    return Promise.resolve();
  }
  /**
   * All member functions of `IndexedDBStore` that access the backend use this wrapper to
   * watch for failures after initial store startup, including `QuotaExceededError` as
   * free disk space changes, etc.
   *
   * When IndexedDB fails via any of these paths, we degrade this back to a `MemoryStore`
   * in place so that the current operation and all future ones are in-memory only.
   *
   * @param func - The degradable work to do.
   * @param fallback - The method name for fallback.
   * @returns A wrapped member function.
   */
  degradable(func, fallback) {
    const fallbackFn = fallback ? super[fallback] : null;
    return async (...args) => {
      try {
        return await func.call(this, ...args);
      } catch (e) {
        _logger.logger.error("IndexedDBStore failure, degrading to MemoryStore", e);
        this.emitter.emit("degraded", e);
        try {
          // We try to delete IndexedDB after degrading since this store is only a
          // cache (the app will still function correctly without the data).
          // It's possible that deleting repair IndexedDB for the next app load,
          // potentially by making a little more space available.
          _logger.logger.log("IndexedDBStore trying to delete degraded data");
          await this.backend.clearDatabase();
          _logger.logger.log("IndexedDBStore delete after degrading succeeded");
        } catch (e) {
          _logger.logger.warn("IndexedDBStore delete after degrading failed", e);
        }
        // Degrade the store from being an instance of `IndexedDBStore` to instead be
        // an instance of `MemoryStore` so that future API calls use the memory path
        // directly and skip IndexedDB entirely. This should be safe as
        // `IndexedDBStore` already extends from `MemoryStore`, so we are making the
        // store become its parent type in a way. The mutator methods of
        // `IndexedDBStore` also maintain the state that `MemoryStore` uses (many are
        // not overridden at all).
        if (fallbackFn) {
          return fallbackFn.call(this, ...args);
        }
      }
    };
  }

  // XXX: ideally these would be stored in indexeddb as part of the room but,
  // we don't store rooms as such and instead accumulate entire sync responses atm.
  async getPendingEvents(roomId) {
    if (!this.localStorage) return super.getPendingEvents(roomId);
    const serialized = this.localStorage.getItem(pendingEventsKey(roomId));
    if (serialized) {
      try {
        return JSON.parse(serialized);
      } catch (e) {
        _logger.logger.error("Could not parse persisted pending events", e);
      }
    }
    return [];
  }
  async setPendingEvents(roomId, events) {
    if (!this.localStorage) return super.setPendingEvents(roomId, events);
    if (events.length > 0) {
      this.localStorage.setItem(pendingEventsKey(roomId), JSON.stringify(events));
    } else {
      this.localStorage.removeItem(pendingEventsKey(roomId));
    }
  }
  saveToDeviceBatches(batches) {
    return this.backend.saveToDeviceBatches(batches);
  }
  getOldestToDeviceBatch() {
    return this.backend.getOldestToDeviceBatch();
  }
  removeToDeviceBatch(id) {
    return this.backend.removeToDeviceBatch(id);
  }
}

/**
 * @param roomId - ID of the current room
 * @returns Storage key to retrieve pending events
 */
exports.IndexedDBStore = IndexedDBStore;
function pendingEventsKey(roomId) {
  return `mx_pending_events_${roomId}`;
}