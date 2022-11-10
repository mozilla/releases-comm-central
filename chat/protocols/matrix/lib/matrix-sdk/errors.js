"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KeySignatureUploadError = exports.InvalidStoreState = exports.InvalidStoreError = exports.InvalidCryptoStoreState = exports.InvalidCryptoStoreError = void 0;
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
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
let InvalidStoreState;
exports.InvalidStoreState = InvalidStoreState;
(function (InvalidStoreState) {
  InvalidStoreState[InvalidStoreState["ToggledLazyLoading"] = 0] = "ToggledLazyLoading";
})(InvalidStoreState || (exports.InvalidStoreState = InvalidStoreState = {}));
class InvalidStoreError extends Error {
  constructor(reason, value) {
    const message = `Store is invalid because ${reason}, ` + `please stop the client, delete all data and start the client again`;
    super(message);
    this.reason = reason;
    this.value = value;
    this.name = "InvalidStoreError";
  }
}
exports.InvalidStoreError = InvalidStoreError;
_defineProperty(InvalidStoreError, "TOGGLED_LAZY_LOADING", InvalidStoreState.ToggledLazyLoading);
let InvalidCryptoStoreState;
exports.InvalidCryptoStoreState = InvalidCryptoStoreState;
(function (InvalidCryptoStoreState) {
  InvalidCryptoStoreState["TooNew"] = "TOO_NEW";
})(InvalidCryptoStoreState || (exports.InvalidCryptoStoreState = InvalidCryptoStoreState = {}));
class InvalidCryptoStoreError extends Error {
  constructor(reason) {
    const message = `Crypto store is invalid because ${reason}, ` + `please stop the client, delete all data and start the client again`;
    super(message);
    this.reason = reason;
    this.name = 'InvalidCryptoStoreError';
  }
}
exports.InvalidCryptoStoreError = InvalidCryptoStoreError;
_defineProperty(InvalidCryptoStoreError, "TOO_NEW", InvalidCryptoStoreState.TooNew);
class KeySignatureUploadError extends Error {
  constructor(message, value) {
    super(message);
    this.value = value;
  }
}
exports.KeySignatureUploadError = KeySignatureUploadError;