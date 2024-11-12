"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UnstablePrefix = exports.DehydratedDeviceManager = void 0;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-wasm"));
var _utils = require("../utils.js");
var _index = require("../http-api/index.js");
var _base = require("../base64.js");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2024 The Matrix.org Foundation C.I.C.

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
/**
 * The response body of `GET /_matrix/client/unstable/org.matrix.msc3814.v1/dehydrated_device`.
 */

/**
 * The response body of `POST /_matrix/client/unstable/org.matrix.msc3814.v1/dehydrated_device/events`.
 */

/**
 * The unstable URL prefix for dehydrated device endpoints
 */
const UnstablePrefix = exports.UnstablePrefix = "/_matrix/client/unstable/org.matrix.msc3814.v1";
/**
 * The name used for the dehydration key in Secret Storage
 */
const SECRET_STORAGE_NAME = "org.matrix.msc3814";

/**
 * The interval between creating dehydrated devices. (one week)
 */
const DEHYDRATION_INTERVAL = 7 * 24 * 60 * 60 * 1000;

/**
 * Manages dehydrated devices
 *
 * We have one of these per `RustCrypto`.  It's responsible for
 *
 * * determining server support for dehydrated devices
 * * creating new dehydrated devices when requested, including periodically
 *   replacing the dehydrated device with a new one
 * * rehydrating a device when requested, and when present
 *
 * @internal
 */
class DehydratedDeviceManager {
  constructor(logger, olmMachine, http, outgoingRequestProcessor, secretStorage) {
    this.logger = logger;
    this.olmMachine = olmMachine;
    this.http = http;
    this.outgoingRequestProcessor = outgoingRequestProcessor;
    this.secretStorage = secretStorage;
    /** the secret key used for dehydrating and rehydrating */
    _defineProperty(this, "key", void 0);
    /** the ID of the interval for periodically replacing the dehydrated device */
    _defineProperty(this, "intervalId", void 0);
  }

  /**
   * Return whether the server supports dehydrated devices.
   */
  async isSupported() {
    // call the endpoint to get a dehydrated device.  If it returns an
    // M_UNRECOGNIZED error, then dehydration is unsupported.  If it returns
    // a successful response, or an M_NOT_FOUND, then dehydration is supported.
    // Any other exceptions are passed through.
    try {
      await this.http.authedRequest(_index.Method.Get, "/dehydrated_device", undefined, undefined, {
        prefix: UnstablePrefix
      });
    } catch (error) {
      const err = error;
      if (err.errcode === "M_UNRECOGNIZED") {
        return false;
      } else if (err.errcode === "M_NOT_FOUND") {
        return true;
      }
      throw error;
    }
    return true;
  }

  /**
   * Start using device dehydration.
   *
   * - Rehydrates a dehydrated device, if one is available.
   * - Creates a new dehydration key, if necessary, and stores it in Secret
   *   Storage.
   *   - If `createNewKey` is set to true, always creates a new key.
   *   - If a dehydration key is not available, creates a new one.
   * - Creates a new dehydrated device, and schedules periodically creating
   *   new dehydrated devices.
   *
   * @param createNewKey - whether to force creation of a new dehydration key.
   *   This can be used, for example, if Secret Storage is being reset.
   */
  async start(createNewKey) {
    this.stop();
    try {
      await this.rehydrateDeviceIfAvailable();
    } catch (e) {
      // If rehydration fails, there isn't much we can do about it.  Log
      // the error, and create a new device.
      this.logger.info("dehydration: Error rehydrating device:", e);
    }
    if (createNewKey) {
      await this.resetKey();
    }
    await this.scheduleDeviceDehydration();
  }

  /**
   * Return whether the dehydration key is stored in Secret Storage.
   */
  async isKeyStored() {
    return Boolean(await this.secretStorage.isStored(SECRET_STORAGE_NAME));
  }

  /**
   * Reset the dehydration key.
   *
   * Creates a new key and stores it in secret storage.
   */
  async resetKey() {
    const key = new Uint8Array(32);
    globalThis.crypto.getRandomValues(key);
    await this.secretStorage.store(SECRET_STORAGE_NAME, (0, _base.encodeUnpaddedBase64)(key));
    this.key = key;
  }

  /**
   * Get and cache the encryption key from secret storage.
   *
   * If `create` is `true`, creates a new key if no existing key is present.
   *
   * @returns the key, if available, or `null` if no key is available
   */
  async getKey(create) {
    if (this.key === undefined) {
      const keyB64 = await this.secretStorage.get(SECRET_STORAGE_NAME);
      if (keyB64 === undefined) {
        if (!create) {
          return null;
        }
        await this.resetKey();
      } else {
        this.key = (0, _base.decodeBase64)(keyB64);
      }
    }
    return this.key;
  }

  /**
   * Rehydrate the dehydrated device stored on the server.
   *
   * Checks if there is a dehydrated device on the server.  If so, rehydrates
   * the device and processes the to-device events.
   *
   * Returns whether or not a dehydrated device was found.
   */
  async rehydrateDeviceIfAvailable() {
    const key = await this.getKey(false);
    if (!key) {
      return false;
    }
    let dehydratedDeviceResp;
    try {
      dehydratedDeviceResp = await this.http.authedRequest(_index.Method.Get, "/dehydrated_device", undefined, undefined, {
        prefix: UnstablePrefix
      });
    } catch (error) {
      const err = error;
      // We ignore M_NOT_FOUND (there is no dehydrated device, so nothing
      // us to do) and M_UNRECOGNIZED (the server does not understand the
      // endpoint).  We pass through any other errors.
      if (err.errcode === "M_NOT_FOUND" || err.errcode === "M_UNRECOGNIZED") {
        this.logger.info("dehydration: No dehydrated device");
        return false;
      }
      throw err;
    }
    this.logger.info("dehydration: dehydrated device found");
    const rehydratedDevice = await this.olmMachine.dehydratedDevices().rehydrate(key, new RustSdkCryptoJs.DeviceId(dehydratedDeviceResp.device_id), JSON.stringify(dehydratedDeviceResp.device_data));
    this.logger.info("dehydration: device rehydrated");
    let nextBatch = undefined;
    let toDeviceCount = 0;
    let roomKeyCount = 0;
    const path = (0, _utils.encodeUri)("/dehydrated_device/$device_id/events", {
      $device_id: dehydratedDeviceResp.device_id
    });
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const eventResp = await this.http.authedRequest(_index.Method.Post, path, undefined, nextBatch ? {
        next_batch: nextBatch
      } : {}, {
        prefix: UnstablePrefix
      });
      if (eventResp.events.length === 0) {
        break;
      }
      toDeviceCount += eventResp.events.length;
      nextBatch = eventResp.next_batch;
      const roomKeyInfos = await rehydratedDevice.receiveEvents(JSON.stringify(eventResp.events));
      roomKeyCount += roomKeyInfos.length;
    }
    this.logger.info(`dehydration: received ${roomKeyCount} room keys from ${toDeviceCount} to-device events`);
    return true;
  }

  /**
   * Creates and uploads a new dehydrated device.
   *
   * Creates and stores a new key in secret storage if none is available.
   */
  async createAndUploadDehydratedDevice() {
    const key = await this.getKey(true);
    const dehydratedDevice = await this.olmMachine.dehydratedDevices().create();
    const request = await dehydratedDevice.keysForUpload("Dehydrated device", key);
    await this.outgoingRequestProcessor.makeOutgoingRequest(request);
    this.logger.info("dehydration: uploaded device");
  }

  /**
   * Schedule periodic creation of dehydrated devices.
   */
  async scheduleDeviceDehydration() {
    // cancel any previously-scheduled tasks
    this.stop();
    await this.createAndUploadDehydratedDevice();
    this.intervalId = setInterval(() => {
      this.createAndUploadDehydratedDevice().catch(error => {
        this.logger.error("Error creating dehydrated device:", error);
      });
    }, DEHYDRATION_INTERVAL);
  }

  /**
   * Stop the dehydrated device manager.
   *
   * Cancels any scheduled dehydration tasks.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
exports.DehydratedDeviceManager = DehydratedDeviceManager;