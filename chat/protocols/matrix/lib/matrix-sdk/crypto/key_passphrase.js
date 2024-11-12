"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "deriveKey", {
  enumerable: true,
  get: function () {
    return _index.deriveRecoveryKeyFromPassphrase;
  }
});
Object.defineProperty(exports, "keyFromAuthData", {
  enumerable: true,
  get: function () {
    return _keyPassphrase.keyFromAuthData;
  }
});
exports.keyFromPassphrase = keyFromPassphrase;
var _randomstring = require("../randomstring.js");
var _index = require("../crypto-api/index.js");
var _keyPassphrase = require("../common-crypto/key-passphrase.js");
/*
Copyright 2018 - 2021 The Matrix.org Foundation C.I.C.

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

const DEFAULT_ITERATIONS = 500000;
/**
 * Generate a new recovery key, based on a passphrase.
 * @param passphrase - The passphrase to generate the key from
 */
async function keyFromPassphrase(passphrase) {
  const salt = (0, _randomstring.randomString)(32);
  const key = await (0, _index.deriveRecoveryKeyFromPassphrase)(passphrase, salt, DEFAULT_ITERATIONS);
  return {
    key,
    salt,
    iterations: DEFAULT_ITERATIONS
  };
}

// Re-export the key passphrase functions to avoid breaking changes