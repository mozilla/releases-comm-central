"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  UserVerificationStatus: true,
  DeviceVerificationStatus: true,
  CrossSigningKey: true,
  EventShieldColour: true,
  EventShieldReason: true
};
exports.UserVerificationStatus = exports.EventShieldReason = exports.EventShieldColour = exports.DeviceVerificationStatus = exports.CrossSigningKey = void 0;
var _verification = require("./crypto-api/verification");
Object.keys(_verification).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _verification[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _verification[key];
    }
  });
});
var _keybackup = require("./crypto-api/keybackup");
Object.keys(_keybackup).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _keybackup[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _keybackup[key];
    }
  });
});
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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

/**
 * Public interface to the cryptography parts of the js-sdk
 *
 * @remarks Currently, this is a work-in-progress. In time, more methods will be added here.
 */

/**
 * Options object for `CryptoApi.bootstrapCrossSigning`.
 */

/**
 * Represents the ways in which we trust a user
 */
class UserVerificationStatus {
  constructor(crossSigningVerified, crossSigningVerifiedBefore, tofu) {
    this.crossSigningVerified = crossSigningVerified;
    this.crossSigningVerifiedBefore = crossSigningVerifiedBefore;
    this.tofu = tofu;
  }

  /**
   * @returns true if this user is verified via any means
   */
  isVerified() {
    return this.isCrossSigningVerified();
  }

  /**
   * @returns true if this user is verified via cross signing
   */
  isCrossSigningVerified() {
    return this.crossSigningVerified;
  }

  /**
   * @returns true if we ever verified this user before (at least for
   * the history of verifications observed by this device).
   */
  wasCrossSigningVerified() {
    return this.crossSigningVerifiedBefore;
  }

  /**
   * @returns true if this user's key is trusted on first use
   */
  isTofu() {
    return this.tofu;
  }
}
exports.UserVerificationStatus = UserVerificationStatus;
class DeviceVerificationStatus {
  constructor(opts) {
    /**
     * True if this device has been signed by its owner (and that signature verified).
     *
     * This doesn't necessarily mean that we have verified the device, since we may not have verified the
     * owner's cross-signing key.
     */
    _defineProperty(this, "signedByOwner", void 0);
    /**
     * True if this device has been verified via cross signing.
     *
     * This does *not* take into account `trustCrossSignedDevices`.
     */
    _defineProperty(this, "crossSigningVerified", void 0);
    /**
     * TODO: tofu magic wtf does this do?
     */
    _defineProperty(this, "tofu", void 0);
    /**
     * True if the device has been marked as locally verified.
     */
    _defineProperty(this, "localVerified", void 0);
    /**
     * True if the client has been configured to trust cross-signed devices via {@link CryptoApi#setTrustCrossSignedDevices}.
     */
    _defineProperty(this, "trustCrossSignedDevices", void 0);
    this.signedByOwner = opts.signedByOwner ?? false;
    this.crossSigningVerified = opts.crossSigningVerified ?? false;
    this.tofu = opts.tofu ?? false;
    this.localVerified = opts.localVerified ?? false;
    this.trustCrossSignedDevices = opts.trustCrossSignedDevices ?? false;
  }

  /**
   * Check if we should consider this device "verified".
   *
   * A device is "verified" if either:
   *  * it has been manually marked as such via {@link MatrixClient#setDeviceVerified}.
   *  * it has been cross-signed with a verified signing key, **and** the client has been configured to trust
   *    cross-signed devices via {@link Crypto.CryptoApi#setTrustCrossSignedDevices}.
   *
   * @returns true if this device is verified via any means.
   */
  isVerified() {
    return this.localVerified || this.trustCrossSignedDevices && this.crossSigningVerified;
  }
}

/**
 * Room key import progress report.
 * Used when calling {@link CryptoApi#importRoomKeys} or
 * {@link CryptoApi#importRoomKeysAsJson} as the parameter of
 * the progressCallback. Used to display feedback.
 */

/**
 * Options object for {@link CryptoApi#importRoomKeys} and
 * {@link CryptoApi#importRoomKeysAsJson}.
 */

/**
 * The result of a call to {@link CryptoApi.getCrossSigningStatus}.
 */

/**
 * Crypto callbacks provided by the application
 */

/**
 * Parameter of {@link CryptoApi#bootstrapSecretStorage}
 */
exports.DeviceVerificationStatus = DeviceVerificationStatus;
/** Types of cross-signing key */
let CrossSigningKey = exports.CrossSigningKey = /*#__PURE__*/function (CrossSigningKey) {
  CrossSigningKey["Master"] = "master";
  CrossSigningKey["SelfSigning"] = "self_signing";
  CrossSigningKey["UserSigning"] = "user_signing";
  return CrossSigningKey;
}({});
/**
 * Information on one of the cross-signing keys.
 * @see https://spec.matrix.org/v1.7/client-server-api/#post_matrixclientv3keysdevice_signingupload
 */
/**
 * Recovery key created by {@link CryptoApi#createRecoveryKeyFromPassphrase} or {@link CreateSecretStorageOpts#createSecretStorageKey}.
 */
/**
 *  Result type of {@link CryptoApi#getEncryptionInfoForEvent}.
 */
/**
 * Types of shield to be shown for {@link EventEncryptionInfo#shieldColour}.
 */
let EventShieldColour = exports.EventShieldColour = /*#__PURE__*/function (EventShieldColour) {
  EventShieldColour[EventShieldColour["NONE"] = 0] = "NONE";
  EventShieldColour[EventShieldColour["GREY"] = 1] = "GREY";
  EventShieldColour[EventShieldColour["RED"] = 2] = "RED";
  return EventShieldColour;
}({});
/**
 * Reason codes for {@link EventEncryptionInfo#shieldReason}.
 */
let EventShieldReason = exports.EventShieldReason = /*#__PURE__*/function (EventShieldReason) {
  EventShieldReason[EventShieldReason["UNKNOWN"] = 0] = "UNKNOWN";
  EventShieldReason[EventShieldReason["UNVERIFIED_IDENTITY"] = 1] = "UNVERIFIED_IDENTITY";
  EventShieldReason[EventShieldReason["UNSIGNED_DEVICE"] = 2] = "UNSIGNED_DEVICE";
  EventShieldReason[EventShieldReason["UNKNOWN_DEVICE"] = 3] = "UNKNOWN_DEVICE";
  EventShieldReason[EventShieldReason["AUTHENTICITY_NOT_GUARANTEED"] = 4] = "AUTHENTICITY_NOT_GUARANTEED";
  EventShieldReason[EventShieldReason["MISMATCHED_SENDER_KEY"] = 5] = "MISMATCHED_SENDER_KEY";
  return EventShieldReason;
}({});
/** The result of a call to {@link CryptoApi.getOwnDeviceKeys} */