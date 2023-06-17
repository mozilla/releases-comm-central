"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DeviceVerification = exports.Device = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/*
Copyright 2023 The Matrix.org Foundation C.I.C.

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
/** State of the verification of the device. */
let DeviceVerification = /*#__PURE__*/function (DeviceVerification) {
  DeviceVerification[DeviceVerification["Blocked"] = -1] = "Blocked";
  DeviceVerification[DeviceVerification["Unverified"] = 0] = "Unverified";
  DeviceVerification[DeviceVerification["Verified"] = 1] = "Verified";
  return DeviceVerification;
}({});
/** A map from user ID to device ID to Device */
exports.DeviceVerification = DeviceVerification;
/**
 *  Information on a user's device, as returned by {@link Crypto.CryptoApi.getUserDeviceInfo}.
 */
class Device {
  constructor(opts) {
    /** id of the device */
    _defineProperty(this, "deviceId", void 0);
    /** id of the user that owns the device */
    _defineProperty(this, "userId", void 0);
    /** list of algorithms supported by this device */
    _defineProperty(this, "algorithms", void 0);
    /** a map from `<key type>:<id> -> <base64-encoded key>` */
    _defineProperty(this, "keys", void 0);
    /** whether the device has been verified/blocked by the user */
    _defineProperty(this, "verified", void 0);
    /** a map `<userId, map<algorithm:device_id, signature>>` */
    _defineProperty(this, "signatures", void 0);
    /** display name of the device */
    _defineProperty(this, "displayName", void 0);
    this.deviceId = opts.deviceId;
    this.userId = opts.userId;
    this.algorithms = opts.algorithms;
    this.keys = opts.keys;
    this.verified = opts.verified || DeviceVerification.Unverified;
    this.signatures = opts.signatures || new Map();
    this.displayName = opts.displayName;
  }

  /**
   * Get the fingerprint for this device (ie, the Ed25519 key)
   *
   * @returns base64-encoded fingerprint of this device
   */
  getFingerprint() {
    return this.keys.get(`ed25519:${this.deviceId}`);
  }

  /**
   * Get the identity key for this device (ie, the Curve25519 key)
   *
   * @returns base64-encoded identity key of this device
   */
  getIdentityKey() {
    return this.keys.get(`curve25519:${this.deviceId}`);
  }
}
exports.Device = Device;