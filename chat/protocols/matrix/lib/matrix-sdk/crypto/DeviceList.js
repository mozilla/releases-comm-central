"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TrackingStatus = exports.DeviceList = void 0;
var _logger = require("../logger");
var _deviceinfo = require("./deviceinfo");
var _CrossSigning = require("./CrossSigning");
var olmlib = _interopRequireWildcard(require("./olmlib"));
var _indexeddbCryptoStore = require("./store/indexeddb-crypto-store");
var _utils = require("../utils");
var _typedEventEmitter = require("../models/typed-event-emitter");
var _index = require("./index");
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
*/ /**
 * Manages the list of other users' devices
 */
/* State transition diagram for DeviceList.deviceTrackingStatus
 *
 *                                |
 *     stopTrackingDeviceList     V
 *   +---------------------> NOT_TRACKED
 *   |                            |
 *   +<--------------------+      | startTrackingDeviceList
 *   |                     |      V
 *   |   +-------------> PENDING_DOWNLOAD <--------------------+-+
 *   |   |                      ^ |                            | |
 *   |   | restart     download | |  start download            | | invalidateUserDeviceList
 *   |   | client        failed | |                            | |
 *   |   |                      | V                            | |
 *   |   +------------ DOWNLOAD_IN_PROGRESS -------------------+ |
 *   |                    |       |                              |
 *   +<-------------------+       |  download successful         |
 *   ^                            V                              |
 *   +----------------------- UP_TO_DATE ------------------------+
 */
// constants for DeviceList.deviceTrackingStatus
let TrackingStatus = exports.TrackingStatus = /*#__PURE__*/function (TrackingStatus) {
  TrackingStatus[TrackingStatus["NotTracked"] = 0] = "NotTracked";
  TrackingStatus[TrackingStatus["PendingDownload"] = 1] = "PendingDownload";
  TrackingStatus[TrackingStatus["DownloadInProgress"] = 2] = "DownloadInProgress";
  TrackingStatus[TrackingStatus["UpToDate"] = 3] = "UpToDate";
  return TrackingStatus;
}({}); // user-Id → device-Id → DeviceInfo
class DeviceList extends _typedEventEmitter.TypedEventEmitter {
  constructor(baseApis, cryptoStore, olmDevice,
  // Maximum number of user IDs per request to prevent server overload (#1619)
  keyDownloadChunkSize = 250) {
    super();
    this.cryptoStore = cryptoStore;
    this.keyDownloadChunkSize = keyDownloadChunkSize;
    _defineProperty(this, "devices", {});
    _defineProperty(this, "crossSigningInfo", {});
    // map of identity keys to the user who owns it
    _defineProperty(this, "userByIdentityKey", {});
    // which users we are tracking device status for.
    _defineProperty(this, "deviceTrackingStatus", {});
    // loaded from storage in load()
    // The 'next_batch' sync token at the point the data was written,
    // ie. a token representing the point immediately after the
    // moment represented by the snapshot in the db.
    _defineProperty(this, "syncToken", null);
    _defineProperty(this, "keyDownloadsInProgressByUser", new Map());
    // Set whenever changes are made other than setting the sync token
    _defineProperty(this, "dirty", false);
    // Promise resolved when device data is saved
    _defineProperty(this, "savePromise", null);
    // Function that resolves the save promise
    _defineProperty(this, "resolveSavePromise", null);
    // The time the save is scheduled for
    _defineProperty(this, "savePromiseTime", null);
    // The timer used to delay the save
    _defineProperty(this, "saveTimer", null);
    // True if we have fetched data from the server or loaded a non-empty
    // set of device data from the store
    _defineProperty(this, "hasFetched", null);
    _defineProperty(this, "serialiser", void 0);
    this.serialiser = new DeviceListUpdateSerialiser(baseApis, olmDevice, this);
  }

  /**
   * Load the device tracking state from storage
   */
  async load() {
    await this.cryptoStore.doTxn("readonly", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_DEVICE_DATA], txn => {
      this.cryptoStore.getEndToEndDeviceData(txn, deviceData => {
        this.hasFetched = Boolean(deviceData?.devices);
        this.devices = deviceData ? deviceData.devices : {};
        this.crossSigningInfo = deviceData ? deviceData.crossSigningInfo || {} : {};
        this.deviceTrackingStatus = deviceData ? deviceData.trackingStatus : {};
        this.syncToken = deviceData?.syncToken ?? null;
        this.userByIdentityKey = {};
        for (const user of Object.keys(this.devices)) {
          const userDevices = this.devices[user];
          for (const device of Object.keys(userDevices)) {
            const idKey = userDevices[device].keys["curve25519:" + device];
            if (idKey !== undefined) {
              this.userByIdentityKey[idKey] = user;
            }
          }
        }
      });
    });
    for (const u of Object.keys(this.deviceTrackingStatus)) {
      // if a download was in progress when we got shut down, it isn't any more.
      if (this.deviceTrackingStatus[u] == TrackingStatus.DownloadInProgress) {
        this.deviceTrackingStatus[u] = TrackingStatus.PendingDownload;
      }
    }
  }
  stop() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
  }

  /**
   * Save the device tracking state to storage, if any changes are
   * pending other than updating the sync token
   *
   * The actual save will be delayed by a short amount of time to
   * aggregate multiple writes to the database.
   *
   * @param delay - Time in ms before which the save actually happens.
   *     By default, the save is delayed for a short period in order to batch
   *     multiple writes, but this behaviour can be disabled by passing 0.
   *
   * @returns true if the data was saved, false if
   *     it was not (eg. because no changes were pending). The promise
   *     will only resolve once the data is saved, so may take some time
   *     to resolve.
   */
  async saveIfDirty(delay = 500) {
    if (!this.dirty) return Promise.resolve(false);
    // Delay saves for a bit so we can aggregate multiple saves that happen
    // in quick succession (eg. when a whole room's devices are marked as known)

    const targetTime = Date.now() + delay;
    if (this.savePromiseTime && targetTime < this.savePromiseTime) {
      // There's a save scheduled but for after we would like: cancel
      // it & schedule one for the time we want
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.savePromiseTime = null;
      // (but keep the save promise since whatever called save before
      // will still want to know when the save is done)
    }
    let savePromise = this.savePromise;
    if (savePromise === null) {
      savePromise = new Promise(resolve => {
        this.resolveSavePromise = resolve;
      });
      this.savePromise = savePromise;
    }
    if (this.saveTimer === null) {
      const resolveSavePromise = this.resolveSavePromise;
      this.savePromiseTime = targetTime;
      this.saveTimer = setTimeout(() => {
        _logger.logger.log("Saving device tracking data", this.syncToken);

        // null out savePromise now (after the delay but before the write),
        // otherwise we could return the existing promise when the save has
        // actually already happened.
        this.savePromiseTime = null;
        this.saveTimer = null;
        this.savePromise = null;
        this.resolveSavePromise = null;
        this.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_DEVICE_DATA], txn => {
          this.cryptoStore.storeEndToEndDeviceData({
            devices: this.devices,
            crossSigningInfo: this.crossSigningInfo,
            trackingStatus: this.deviceTrackingStatus,
            syncToken: this.syncToken ?? undefined
          }, txn);
        }).then(() => {
          // The device list is considered dirty until the write completes.
          this.dirty = false;
          resolveSavePromise?.(true);
        }, err => {
          _logger.logger.error("Failed to save device tracking data", this.syncToken);
          _logger.logger.error(err);
        });
      }, delay);
    }
    return savePromise;
  }

  /**
   * Gets the sync token last set with setSyncToken
   *
   * @returns The sync token
   */
  getSyncToken() {
    return this.syncToken;
  }

  /**
   * Sets the sync token that the app will pass as the 'since' to the /sync
   * endpoint next time it syncs.
   * The sync token must always be set after any changes made as a result of
   * data in that sync since setting the sync token to a newer one will mean
   * those changed will not be synced from the server if a new client starts
   * up with that data.
   *
   * @param st - The sync token
   */
  setSyncToken(st) {
    this.syncToken = st;
  }

  /**
   * Ensures up to date keys for a list of users are stored in the session store,
   * downloading and storing them if they're not (or if forceDownload is
   * true).
   * @param userIds - The users to fetch.
   * @param forceDownload - Always download the keys even if cached.
   *
   * @returns A promise which resolves to a map userId-\>deviceId-\>{@link DeviceInfo}.
   */
  downloadKeys(userIds, forceDownload) {
    const usersToDownload = [];
    const promises = [];
    userIds.forEach(u => {
      const trackingStatus = this.deviceTrackingStatus[u];
      if (this.keyDownloadsInProgressByUser.has(u)) {
        // already a key download in progress/queued for this user; its results
        // will be good enough for us.
        _logger.logger.log(`downloadKeys: already have a download in progress for ` + `${u}: awaiting its result`);
        promises.push(this.keyDownloadsInProgressByUser.get(u));
      } else if (forceDownload || trackingStatus != TrackingStatus.UpToDate) {
        usersToDownload.push(u);
      }
    });
    if (usersToDownload.length != 0) {
      _logger.logger.log("downloadKeys: downloading for", usersToDownload);
      const downloadPromise = this.doKeyDownload(usersToDownload);
      promises.push(downloadPromise);
    }
    if (promises.length === 0) {
      _logger.logger.log("downloadKeys: already have all necessary keys");
    }
    return Promise.all(promises).then(() => {
      return this.getDevicesFromStore(userIds);
    });
  }

  /**
   * Get the stored device keys for a list of user ids
   *
   * @param userIds - the list of users to list keys for.
   *
   * @returns userId-\>deviceId-\>{@link DeviceInfo}.
   */
  getDevicesFromStore(userIds) {
    const stored = new Map();
    userIds.forEach(userId => {
      const deviceMap = new Map();
      this.getStoredDevicesForUser(userId)?.forEach(function (device) {
        deviceMap.set(device.deviceId, device);
      });
      stored.set(userId, deviceMap);
    });
    return stored;
  }

  /**
   * Returns a list of all user IDs the DeviceList knows about
   *
   * @returns All known user IDs
   */
  getKnownUserIds() {
    return Object.keys(this.devices);
  }

  /**
   * Get the stored device keys for a user id
   *
   * @param userId - the user to list keys for.
   *
   * @returns list of devices, or null if we haven't
   * managed to get a list of devices for this user yet.
   */
  getStoredDevicesForUser(userId) {
    const devs = this.devices[userId];
    if (!devs) {
      return null;
    }
    const res = [];
    for (const deviceId in devs) {
      if (devs.hasOwnProperty(deviceId)) {
        res.push(_deviceinfo.DeviceInfo.fromStorage(devs[deviceId], deviceId));
      }
    }
    return res;
  }

  /**
   * Get the stored device data for a user, in raw object form
   *
   * @param userId - the user to get data for
   *
   * @returns `deviceId->{object}` devices, or undefined if
   * there is no data for this user.
   */
  getRawStoredDevicesForUser(userId) {
    return this.devices[userId];
  }
  getStoredCrossSigningForUser(userId) {
    if (!this.crossSigningInfo[userId]) return null;
    return _CrossSigning.CrossSigningInfo.fromStorage(this.crossSigningInfo[userId], userId);
  }
  storeCrossSigningForUser(userId, info) {
    this.crossSigningInfo[userId] = info;
    this.dirty = true;
  }

  /**
   * Get the stored keys for a single device
   *
   *
   * @returns device, or undefined
   * if we don't know about this device
   */
  getStoredDevice(userId, deviceId) {
    const devs = this.devices[userId];
    if (!devs?.[deviceId]) {
      return undefined;
    }
    return _deviceinfo.DeviceInfo.fromStorage(devs[deviceId], deviceId);
  }

  /**
   * Get a user ID by one of their device's curve25519 identity key
   *
   * @param algorithm -  encryption algorithm
   * @param senderKey -  curve25519 key to match
   *
   * @returns user ID
   */
  getUserByIdentityKey(algorithm, senderKey) {
    if (algorithm !== olmlib.OLM_ALGORITHM && algorithm !== olmlib.MEGOLM_ALGORITHM) {
      // we only deal in olm keys
      return null;
    }
    return this.userByIdentityKey[senderKey];
  }

  /**
   * Find a device by curve25519 identity key
   *
   * @param algorithm -  encryption algorithm
   * @param senderKey -  curve25519 key to match
   */
  getDeviceByIdentityKey(algorithm, senderKey) {
    const userId = this.getUserByIdentityKey(algorithm, senderKey);
    if (!userId) {
      return null;
    }
    const devices = this.devices[userId];
    if (!devices) {
      return null;
    }
    for (const deviceId in devices) {
      if (!devices.hasOwnProperty(deviceId)) {
        continue;
      }
      const device = devices[deviceId];
      for (const keyId in device.keys) {
        if (!device.keys.hasOwnProperty(keyId)) {
          continue;
        }
        if (keyId.indexOf("curve25519:") !== 0) {
          continue;
        }
        const deviceKey = device.keys[keyId];
        if (deviceKey == senderKey) {
          return _deviceinfo.DeviceInfo.fromStorage(device, deviceId);
        }
      }
    }

    // doesn't match a known device
    return null;
  }

  /**
   * Replaces the list of devices for a user with the given device list
   *
   * @param userId - The user ID
   * @param devices - New device info for user
   */
  storeDevicesForUser(userId, devices) {
    this.setRawStoredDevicesForUser(userId, devices);
    this.dirty = true;
  }

  /**
   * flag the given user for device-list tracking, if they are not already.
   *
   * This will mean that a subsequent call to refreshOutdatedDeviceLists()
   * will download the device list for the user, and that subsequent calls to
   * invalidateUserDeviceList will trigger more updates.
   *
   */
  startTrackingDeviceList(userId) {
    // sanity-check the userId. This is mostly paranoia, but if synapse
    // can't parse the userId we give it as an mxid, it 500s the whole
    // request and we can never update the device lists again (because
    // the broken userId is always 'invalid' and always included in any
    // refresh request).
    // By checking it is at least a string, we can eliminate a class of
    // silly errors.
    if (typeof userId !== "string") {
      throw new Error("userId must be a string; was " + userId);
    }
    if (!this.deviceTrackingStatus[userId]) {
      _logger.logger.log("Now tracking device list for " + userId);
      this.deviceTrackingStatus[userId] = TrackingStatus.PendingDownload;
      // we don't yet persist the tracking status, since there may be a lot
      // of calls; we save all data together once the sync is done
      this.dirty = true;
    }
  }

  /**
   * Mark the given user as no longer being tracked for device-list updates.
   *
   * This won't affect any in-progress downloads, which will still go on to
   * complete; it will just mean that we don't think that we have an up-to-date
   * list for future calls to downloadKeys.
   *
   */
  stopTrackingDeviceList(userId) {
    if (this.deviceTrackingStatus[userId]) {
      _logger.logger.log("No longer tracking device list for " + userId);
      this.deviceTrackingStatus[userId] = TrackingStatus.NotTracked;

      // we don't yet persist the tracking status, since there may be a lot
      // of calls; we save all data together once the sync is done
      this.dirty = true;
    }
  }

  /**
   * Set all users we're currently tracking to untracked
   *
   * This will flag each user whose devices we are tracking as in need of an
   * update.
   */
  stopTrackingAllDeviceLists() {
    for (const userId of Object.keys(this.deviceTrackingStatus)) {
      this.deviceTrackingStatus[userId] = TrackingStatus.NotTracked;
    }
    this.dirty = true;
  }

  /**
   * Mark the cached device list for the given user outdated.
   *
   * If we are not tracking this user's devices, we'll do nothing. Otherwise
   * we flag the user as needing an update.
   *
   * This doesn't actually set off an update, so that several users can be
   * batched together. Call refreshOutdatedDeviceLists() for that.
   *
   */
  invalidateUserDeviceList(userId) {
    if (this.deviceTrackingStatus[userId]) {
      _logger.logger.log("Marking device list outdated for", userId);
      this.deviceTrackingStatus[userId] = TrackingStatus.PendingDownload;

      // we don't yet persist the tracking status, since there may be a lot
      // of calls; we save all data together once the sync is done
      this.dirty = true;
    }
  }

  /**
   * If we have users who have outdated device lists, start key downloads for them
   *
   * @returns which completes when the download completes; normally there
   *    is no need to wait for this (it's mostly for the unit tests).
   */
  refreshOutdatedDeviceLists() {
    this.saveIfDirty();
    const usersToDownload = [];
    for (const userId of Object.keys(this.deviceTrackingStatus)) {
      const stat = this.deviceTrackingStatus[userId];
      if (stat == TrackingStatus.PendingDownload) {
        usersToDownload.push(userId);
      }
    }
    return this.doKeyDownload(usersToDownload);
  }

  /**
   * Set the stored device data for a user, in raw object form
   * Used only by internal class DeviceListUpdateSerialiser
   *
   * @param userId - the user to get data for
   *
   * @param devices - `deviceId->{object}` the new devices
   */
  setRawStoredDevicesForUser(userId, devices) {
    // remove old devices from userByIdentityKey
    if (this.devices[userId] !== undefined) {
      for (const [deviceId, dev] of Object.entries(this.devices[userId])) {
        const identityKey = dev.keys["curve25519:" + deviceId];
        delete this.userByIdentityKey[identityKey];
      }
    }
    this.devices[userId] = devices;

    // add new devices into userByIdentityKey
    for (const [deviceId, dev] of Object.entries(devices)) {
      const identityKey = dev.keys["curve25519:" + deviceId];
      this.userByIdentityKey[identityKey] = userId;
    }
  }
  setRawStoredCrossSigningForUser(userId, info) {
    this.crossSigningInfo[userId] = info;
  }

  /**
   * Fire off download update requests for the given users, and update the
   * device list tracking status for them, and the
   * keyDownloadsInProgressByUser map for them.
   *
   * @param users -  list of userIds
   *
   * @returns resolves when all the users listed have
   *     been updated. rejects if there was a problem updating any of the
   *     users.
   */
  doKeyDownload(users) {
    if (users.length === 0) {
      // nothing to do
      return Promise.resolve();
    }
    const prom = this.serialiser.updateDevicesForUsers(users, this.syncToken).then(() => {
      finished(true);
    }, e => {
      _logger.logger.error("Error downloading keys for " + users + ":", e);
      finished(false);
      throw e;
    });
    users.forEach(u => {
      this.keyDownloadsInProgressByUser.set(u, prom);
      const stat = this.deviceTrackingStatus[u];
      if (stat == TrackingStatus.PendingDownload) {
        this.deviceTrackingStatus[u] = TrackingStatus.DownloadInProgress;
      }
    });
    const finished = success => {
      this.emit(_index.CryptoEvent.WillUpdateDevices, users, !this.hasFetched);
      users.forEach(u => {
        this.dirty = true;

        // we may have queued up another download request for this user
        // since we started this request. If that happens, we should
        // ignore the completion of the first one.
        if (this.keyDownloadsInProgressByUser.get(u) !== prom) {
          _logger.logger.log("Another update in the queue for", u, "- not marking up-to-date");
          return;
        }
        this.keyDownloadsInProgressByUser.delete(u);
        const stat = this.deviceTrackingStatus[u];
        if (stat == TrackingStatus.DownloadInProgress) {
          if (success) {
            // we didn't get any new invalidations since this download started:
            // this user's device list is now up to date.
            this.deviceTrackingStatus[u] = TrackingStatus.UpToDate;
            _logger.logger.log("Device list for", u, "now up to date");
          } else {
            this.deviceTrackingStatus[u] = TrackingStatus.PendingDownload;
          }
        }
      });
      this.saveIfDirty();
      this.emit(_index.CryptoEvent.DevicesUpdated, users, !this.hasFetched);
      this.hasFetched = true;
    };
    return prom;
  }
}

/**
 * Serialises updates to device lists
 *
 * Ensures that results from /keys/query are not overwritten if a second call
 * completes *before* an earlier one.
 *
 * It currently does this by ensuring only one call to /keys/query happens at a
 * time (and queuing other requests up).
 */
exports.DeviceList = DeviceList;
class DeviceListUpdateSerialiser {
  // The sync token we send with the requests

  /*
   * @param baseApis - Base API object
   * @param olmDevice - The Olm Device
   * @param deviceList - The device list object, the device list to be updated
   */
  constructor(baseApis, olmDevice, deviceList) {
    this.baseApis = baseApis;
    this.olmDevice = olmDevice;
    this.deviceList = deviceList;
    _defineProperty(this, "downloadInProgress", false);
    // users which are queued for download
    // userId -> true
    _defineProperty(this, "keyDownloadsQueuedByUser", {});
    // deferred which is resolved when the queued users are downloaded.
    // non-null indicates that we have users queued for download.
    _defineProperty(this, "queuedQueryDeferred", void 0);
    _defineProperty(this, "syncToken", void 0);
  }

  /**
   * Make a key query request for the given users
   *
   * @param users - list of user ids
   *
   * @param syncToken - sync token to pass in the query request, to
   *     help the HS give the most recent results
   *
   * @returns resolves when all the users listed have
   *     been updated. rejects if there was a problem updating any of the
   *     users.
   */
  updateDevicesForUsers(users, syncToken) {
    users.forEach(u => {
      this.keyDownloadsQueuedByUser[u] = true;
    });
    if (!this.queuedQueryDeferred) {
      this.queuedQueryDeferred = (0, _utils.defer)();
    }

    // We always take the new sync token and just use the latest one we've
    // been given, since it just needs to be at least as recent as the
    // sync response the device invalidation message arrived in
    this.syncToken = syncToken;
    if (this.downloadInProgress) {
      // just queue up these users
      _logger.logger.log("Queued key download for", users);
      return this.queuedQueryDeferred.promise;
    }

    // start a new download.
    return this.doQueuedQueries();
  }
  doQueuedQueries() {
    if (this.downloadInProgress) {
      throw new Error("DeviceListUpdateSerialiser.doQueuedQueries called with request active");
    }
    const downloadUsers = Object.keys(this.keyDownloadsQueuedByUser);
    this.keyDownloadsQueuedByUser = {};
    const deferred = this.queuedQueryDeferred;
    this.queuedQueryDeferred = undefined;
    _logger.logger.log("Starting key download for", downloadUsers);
    this.downloadInProgress = true;
    const opts = {};
    if (this.syncToken) {
      opts.token = this.syncToken;
    }
    const factories = [];
    for (let i = 0; i < downloadUsers.length; i += this.deviceList.keyDownloadChunkSize) {
      const userSlice = downloadUsers.slice(i, i + this.deviceList.keyDownloadChunkSize);
      factories.push(() => this.baseApis.downloadKeysForUsers(userSlice, opts));
    }
    (0, _utils.chunkPromises)(factories, 3).then(async responses => {
      const dk = Object.assign({}, ...responses.map(res => res.device_keys || {}));
      const masterKeys = Object.assign({}, ...responses.map(res => res.master_keys || {}));
      const ssks = Object.assign({}, ...responses.map(res => res.self_signing_keys || {}));
      const usks = Object.assign({}, ...responses.map(res => res.user_signing_keys || {}));

      // yield to other things that want to execute in between users, to
      // avoid wedging the CPU
      // (https://github.com/vector-im/element-web/issues/3158)
      //
      // of course we ought to do this in a web worker or similar, but
      // this serves as an easy solution for now.
      for (const userId of downloadUsers) {
        await (0, _utils.sleep)(5);
        try {
          await this.processQueryResponseForUser(userId, dk[userId], {
            master: masterKeys?.[userId],
            self_signing: ssks?.[userId],
            user_signing: usks?.[userId]
          });
        } catch (e) {
          // log the error but continue, so that one bad key
          // doesn't kill the whole process
          _logger.logger.error(`Error processing keys for ${userId}:`, e);
        }
      }
    }).then(() => {
      _logger.logger.log("Completed key download for " + downloadUsers);
      this.downloadInProgress = false;
      deferred?.resolve();

      // if we have queued users, fire off another request.
      if (this.queuedQueryDeferred) {
        this.doQueuedQueries();
      }
    }, e => {
      _logger.logger.warn("Error downloading keys for " + downloadUsers + ":", e);
      this.downloadInProgress = false;
      deferred?.reject(e);
    });
    return deferred.promise;
  }
  async processQueryResponseForUser(userId, dkResponse, crossSigningResponse) {
    _logger.logger.log("got device keys for " + userId + ":", dkResponse);
    _logger.logger.log("got cross-signing keys for " + userId + ":", crossSigningResponse);
    {
      // map from deviceid -> deviceinfo for this user
      const userStore = {};
      const devs = this.deviceList.getRawStoredDevicesForUser(userId);
      if (devs) {
        Object.keys(devs).forEach(deviceId => {
          const d = _deviceinfo.DeviceInfo.fromStorage(devs[deviceId], deviceId);
          userStore[deviceId] = d;
        });
      }
      await updateStoredDeviceKeysForUser(this.olmDevice, userId, userStore, dkResponse || {}, this.baseApis.getUserId(), this.baseApis.deviceId);

      // put the updates into the object that will be returned as our results
      const storage = {};
      Object.keys(userStore).forEach(deviceId => {
        storage[deviceId] = userStore[deviceId].toStorage();
      });
      this.deviceList.setRawStoredDevicesForUser(userId, storage);
    }

    // now do the same for the cross-signing keys
    {
      // FIXME: should we be ignoring empty cross-signing responses, or
      // should we be dropping the keys?
      if (crossSigningResponse && (crossSigningResponse.master || crossSigningResponse.self_signing || crossSigningResponse.user_signing)) {
        const crossSigning = this.deviceList.getStoredCrossSigningForUser(userId) || new _CrossSigning.CrossSigningInfo(userId);
        crossSigning.setKeys(crossSigningResponse);
        this.deviceList.setRawStoredCrossSigningForUser(userId, crossSigning.toStorage());

        // NB. Unlike most events in the js-sdk, this one is internal to the
        // js-sdk and is not re-emitted
        this.deviceList.emit(_index.CryptoEvent.UserCrossSigningUpdated, userId);
      }
    }
  }
}
async function updateStoredDeviceKeysForUser(olmDevice, userId, userStore, userResult, localUserId, localDeviceId) {
  let updated = false;

  // remove any devices in the store which aren't in the response
  for (const deviceId in userStore) {
    if (!userStore.hasOwnProperty(deviceId)) {
      continue;
    }
    if (!(deviceId in userResult)) {
      if (userId === localUserId && deviceId === localDeviceId) {
        _logger.logger.warn(`Local device ${deviceId} missing from sync, skipping removal`);
        continue;
      }
      _logger.logger.log("Device " + userId + ":" + deviceId + " has been removed");
      delete userStore[deviceId];
      updated = true;
    }
  }
  for (const deviceId in userResult) {
    if (!userResult.hasOwnProperty(deviceId)) {
      continue;
    }
    const deviceResult = userResult[deviceId];

    // check that the user_id and device_id in the response object are
    // correct
    if (deviceResult.user_id !== userId) {
      _logger.logger.warn("Mismatched user_id " + deviceResult.user_id + " in keys from " + userId + ":" + deviceId);
      continue;
    }
    if (deviceResult.device_id !== deviceId) {
      _logger.logger.warn("Mismatched device_id " + deviceResult.device_id + " in keys from " + userId + ":" + deviceId);
      continue;
    }
    if (await storeDeviceKeys(olmDevice, userStore, deviceResult)) {
      updated = true;
    }
  }
  return updated;
}

/*
 * Process a device in a /query response, and add it to the userStore
 *
 * returns (a promise for) true if a change was made, else false
 */
async function storeDeviceKeys(olmDevice, userStore, deviceResult) {
  if (!deviceResult.keys) {
    // no keys?
    return false;
  }
  const deviceId = deviceResult.device_id;
  const userId = deviceResult.user_id;
  const signKeyId = "ed25519:" + deviceId;
  const signKey = deviceResult.keys[signKeyId];
  if (!signKey) {
    _logger.logger.warn("Device " + userId + ":" + deviceId + " has no ed25519 key");
    return false;
  }
  const unsigned = deviceResult.unsigned || {};
  const signatures = deviceResult.signatures || {};
  try {
    await olmlib.verifySignature(olmDevice, deviceResult, userId, deviceId, signKey);
  } catch (e) {
    _logger.logger.warn("Unable to verify signature on device " + userId + ":" + deviceId + ":" + e);
    return false;
  }

  // DeviceInfo
  let deviceStore;
  if (deviceId in userStore) {
    // already have this device.
    deviceStore = userStore[deviceId];
    if (deviceStore.getFingerprint() != signKey) {
      // this should only happen if the list has been MITMed; we are
      // best off sticking with the original keys.
      //
      // Should we warn the user about it somehow?
      _logger.logger.warn("Ed25519 key for device " + userId + ":" + deviceId + " has changed");
      return false;
    }
  } else {
    userStore[deviceId] = deviceStore = new _deviceinfo.DeviceInfo(deviceId);
  }
  deviceStore.keys = deviceResult.keys || {};
  deviceStore.algorithms = deviceResult.algorithms || [];
  deviceStore.unsigned = unsigned;
  deviceStore.signatures = signatures;
  return true;
}