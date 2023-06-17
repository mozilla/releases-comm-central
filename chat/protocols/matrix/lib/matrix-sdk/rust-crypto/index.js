"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.initRustCrypto = initRustCrypto;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-js"));
var _rustCrypto = require("./rust-crypto");
var _logger = require("../logger");
var _constants = require("./constants");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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
 * Create a new `RustCrypto` implementation
 *
 * @param http - Low-level HTTP interface: used to make outgoing requests required by the rust SDK.
 *     We expect it to set the access token, etc.
 * @param userId - The local user's User ID.
 * @param deviceId - The local user's Device ID.
 * @param secretStorage - Interface to server-side secret storage.
 */
async function initRustCrypto(http, userId, deviceId, secretStorage) {
  // initialise the rust matrix-sdk-crypto-js, if it hasn't already been done
  await RustSdkCryptoJs.initAsync();

  // enable tracing in the rust-sdk
  new RustSdkCryptoJs.Tracing(RustSdkCryptoJs.LoggerLevel.Trace).turnOn();
  const u = new RustSdkCryptoJs.UserId(userId);
  const d = new RustSdkCryptoJs.DeviceId(deviceId);
  _logger.logger.info("Init OlmMachine");

  // TODO: use the pickle key for the passphrase
  const olmMachine = await RustSdkCryptoJs.OlmMachine.initialize(u, d, _constants.RUST_SDK_STORE_PREFIX, "test pass");
  const rustCrypto = new _rustCrypto.RustCrypto(olmMachine, http, userId, deviceId, secretStorage);
  await olmMachine.registerRoomKeyUpdatedCallback(sessions => rustCrypto.onRoomKeysUpdated(sessions));
  _logger.logger.info("Completed rust crypto-sdk setup");
  return rustCrypto;
}