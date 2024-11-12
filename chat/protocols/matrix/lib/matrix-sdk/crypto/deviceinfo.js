"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DeviceInfo = void 0;
var _device = require("../models/device.js");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2016 - 2021 The Matrix.org Foundation C.I.C.

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
 * Information about a user's device
 *
 * Superceded by {@link Device}.
 */
class DeviceInfo {
  /**
   * rehydrate a DeviceInfo from the session store
   *
   * @param obj -  raw object from session store
   * @param deviceId - id of the device
   *
   * @returns new DeviceInfo
   */
  static fromStorage(obj, deviceId) {
    const res = new DeviceInfo(deviceId);
    for (const prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        // @ts-ignore - this is messy and typescript doesn't like it
        res[prop] = obj[prop];
      }
    }
    return res;
  }
  /**
   * @param deviceId - id of the device
   */
  constructor(deviceId) {
    this.deviceId = deviceId;
    /** list of algorithms supported by this device */
    _defineProperty(this, "algorithms", []);
    /** a map from `<key type>:<id> -> <base64-encoded key>` */
    _defineProperty(this, "keys", {});
    /** whether the device has been verified/blocked by the user */
    _defineProperty(this, "verified", _device.DeviceVerification.Unverified);
    /**
     * whether the user knows of this device's existence
     * (useful when warning the user that a user has added new devices)
     */
    _defineProperty(this, "known", false);
    /** additional data from the homeserver */
    _defineProperty(this, "unsigned", {});
    _defineProperty(this, "signatures", {});
  }

  /**
   * Prepare a DeviceInfo for JSON serialisation in the session store
   *
   * @returns deviceinfo with non-serialised members removed
   */
  toStorage() {
    return {
      algorithms: this.algorithms,
      keys: this.keys,
      verified: this.verified,
      known: this.known,
      unsigned: this.unsigned,
      signatures: this.signatures
    };
  }

  /**
   * Get the fingerprint for this device (ie, the Ed25519 key)
   *
   * @returns base64-encoded fingerprint of this device
   */
  getFingerprint() {
    return this.keys["ed25519:" + this.deviceId];
  }

  /**
   * Get the identity key for this device (ie, the Curve25519 key)
   *
   * @returns base64-encoded identity key of this device
   */
  getIdentityKey() {
    return this.keys["curve25519:" + this.deviceId];
  }

  /**
   * Get the configured display name for this device, if any
   *
   * @returns displayname
   */
  getDisplayName() {
    return this.unsigned.device_display_name || null;
  }

  /**
   * Returns true if this device is blocked
   *
   * @returns true if blocked
   */
  isBlocked() {
    return this.verified == _device.DeviceVerification.Blocked;
  }

  /**
   * Returns true if this device is verified
   *
   * @returns true if verified
   */
  isVerified() {
    return this.verified == _device.DeviceVerification.Verified;
  }

  /**
   * Returns true if this device is unverified
   *
   * @returns true if unverified
   */
  isUnverified() {
    return this.verified == _device.DeviceVerification.Unverified;
  }

  /**
   * Returns true if the user knows about this device's existence
   *
   * @returns true if known
   */
  isKnown() {
    return this.known === true;
  }
}
exports.DeviceInfo = DeviceInfo;
_defineProperty(DeviceInfo, "DeviceVerification", {
  VERIFIED: _device.DeviceVerification.Verified,
  UNVERIFIED: _device.DeviceVerification.Unverified,
  BLOCKED: _device.DeviceVerification.Blocked
});