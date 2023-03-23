"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DeviceInfo = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/*
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
var DeviceVerification;
/**
 * Information about a user's device
 */
(function (DeviceVerification) {
  DeviceVerification[DeviceVerification["Blocked"] = -1] = "Blocked";
  DeviceVerification[DeviceVerification["Unverified"] = 0] = "Unverified";
  DeviceVerification[DeviceVerification["Verified"] = 1] = "Verified";
})(DeviceVerification || (DeviceVerification = {}));
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
    _defineProperty(this, "algorithms", []);
    _defineProperty(this, "keys", {});
    _defineProperty(this, "verified", DeviceVerification.Unverified);
    _defineProperty(this, "known", false);
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
    return this.verified == DeviceVerification.Blocked;
  }

  /**
   * Returns true if this device is verified
   *
   * @returns true if verified
   */
  isVerified() {
    return this.verified == DeviceVerification.Verified;
  }

  /**
   * Returns true if this device is unverified
   *
   * @returns true if unverified
   */
  isUnverified() {
    return this.verified == DeviceVerification.Unverified;
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
  VERIFIED: DeviceVerification.Verified,
  UNVERIFIED: DeviceVerification.Unverified,
  BLOCKED: DeviceVerification.Blocked
});