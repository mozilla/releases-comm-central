"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  CrossSigningKey: true,
  DeviceVerificationStatus: true
};
exports.DeviceVerificationStatus = exports.CrossSigningKey = void 0;
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
/** Types of cross-signing key */
let CrossSigningKey = /*#__PURE__*/function (CrossSigningKey) {
  CrossSigningKey["Master"] = "master";
  CrossSigningKey["SelfSigning"] = "self_signing";
  CrossSigningKey["UserSigning"] = "user_signing";
  return CrossSigningKey;
}({});
/**
 * Public interface to the cryptography parts of the js-sdk
 *
 * @remarks Currently, this is a work-in-progress. In time, more methods will be added here.
 */
/**
 * Options object for `CryptoApi.bootstrapCrossSigning`.
 */
exports.CrossSigningKey = CrossSigningKey;
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
exports.DeviceVerificationStatus = DeviceVerificationStatus;