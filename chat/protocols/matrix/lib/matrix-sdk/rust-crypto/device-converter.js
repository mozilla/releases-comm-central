"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deviceKeysToDeviceMap = deviceKeysToDeviceMap;
exports.downloadDeviceToJsDevice = downloadDeviceToJsDevice;
exports.rustDeviceToJsDevice = rustDeviceToJsDevice;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-wasm"));
var _device = require("../models/device.js");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
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
 * Convert a {@link RustSdkCryptoJs.Device} to a {@link Device}
 * @param device - Rust Sdk device
 * @param userId - owner of the device
 *
 * @internal
 */
function rustDeviceToJsDevice(device, userId) {
  // Copy rust device keys to Device.keys
  const keys = new Map();
  for (const [keyId, key] of device.keys.entries()) {
    keys.set(keyId.toString(), key.toBase64());
  }

  // Compute verified from device state
  let verified = _device.DeviceVerification.Unverified;
  if (device.isBlacklisted()) {
    verified = _device.DeviceVerification.Blocked;
  } else if (device.isVerified()) {
    verified = _device.DeviceVerification.Verified;
  }

  // Convert rust signatures to Device.signatures
  const signatures = new Map();
  const mayBeSignatureMap = device.signatures.get(userId);
  if (mayBeSignatureMap) {
    const convertedSignatures = new Map();
    // Convert maybeSignatures map to a Map<string, string>
    for (const [key, value] of mayBeSignatureMap.entries()) {
      if (value.isValid() && value.signature) {
        convertedSignatures.set(key, value.signature.toBase64());
      }
    }
    signatures.set(userId.toString(), convertedSignatures);
  }

  // Convert rust algorithms to algorithms
  const rustAlgorithms = device.algorithms;
  // Use set to ensure that algorithms are not duplicated
  const algorithms = new Set();
  rustAlgorithms.forEach(algorithm => {
    switch (algorithm) {
      case RustSdkCryptoJs.EncryptionAlgorithm.MegolmV1AesSha2:
        algorithms.add("m.megolm.v1.aes-sha2");
        break;
      case RustSdkCryptoJs.EncryptionAlgorithm.OlmV1Curve25519AesSha2:
      default:
        algorithms.add("m.olm.v1.curve25519-aes-sha2");
        break;
    }
  });
  return new _device.Device({
    deviceId: device.deviceId.toString(),
    userId: userId.toString(),
    keys,
    algorithms: Array.from(algorithms),
    verified,
    signatures,
    displayName: device.displayName,
    dehydrated: device.isDehydrated
  });
}

/**
 * Convert {@link DeviceKeys}  from `/keys/query` request to a `Map<string, Device>`
 * @param deviceKeys - Device keys object to convert
 *
 * @internal
 */
function deviceKeysToDeviceMap(deviceKeys) {
  return new Map(Object.entries(deviceKeys).map(([deviceId, device]) => [deviceId, downloadDeviceToJsDevice(device)]));
}

// Device from `/keys/query` request

/**
 * Convert `/keys/query` {@link QueryDevice} device to {@link Device}
 * @param device - Device from `/keys/query` request
 *
 * @internal
 */
function downloadDeviceToJsDevice(device) {
  const keys = new Map(Object.entries(device.keys));
  const displayName = device.unsigned?.device_display_name;
  const signatures = new Map();
  if (device.signatures) {
    for (const userId in device.signatures) {
      signatures.set(userId, new Map(Object.entries(device.signatures[userId])));
    }
  }
  return new _device.Device({
    deviceId: device.device_id,
    userId: device.user_id,
    keys,
    algorithms: device.algorithms,
    verified: _device.DeviceVerification.Unverified,
    signatures,
    displayName
  });
}