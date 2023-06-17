"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deviceKeysToDeviceMap = deviceKeysToDeviceMap;
exports.downloadDeviceToJsDevice = downloadDeviceToJsDevice;
exports.rustDeviceToJsDevice = rustDeviceToJsDevice;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-js"));
var _device = require("../models/device");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
    displayName: device.displayName
  });
}

/**
 * Convert {@link DeviceKeys}  from `/keys/query` request to a `Map<string, Device>`
 * @param deviceKeys - Device keys object to convert
 */
function deviceKeysToDeviceMap(deviceKeys) {
  return new Map(Object.entries(deviceKeys).map(([deviceId, device]) => [deviceId, downloadDeviceToJsDevice(device)]));
}

// Device from `/keys/query` request

/**
 * Convert `/keys/query` {@link QueryDevice} device to {@link Device}
 * @param device - Device from `/keys/query` request
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