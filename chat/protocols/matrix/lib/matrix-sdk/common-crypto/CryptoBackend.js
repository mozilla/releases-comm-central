"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DecryptionError = void 0;
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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
 * Common interface for the crypto implementations
 *
 * @internal
 */

/** The methods which crypto implementations should expose to the Sync api
 *
 * @internal
 */

/**
 * @internal
 */

/**
 * Options object for {@link CryptoBackend#checkOwnCrossSigningTrust}.
 */

/**
 * The result of a (successful) call to {@link CryptoBackend.decryptEvent}
 */

/**
 * Responsible for decrypting megolm session data retrieved from a remote backup.
 * The result of {@link CryptoBackend#getBackupDecryptor}.
 */

/**
 * Exception thrown when decryption fails
 *
 * @param code - Reason code for the failure.
 *
 * @param msg - user-visible message describing the problem
 *
 * @param details - key/value pairs reported in the logs but not shown
 *   to the user.
 */
class DecryptionError extends Error {
  constructor(code, msg, details) {
    super(msg);
    this.code = code;
    _defineProperty(this, "detailedString", void 0);
    this.name = "DecryptionError";
    this.detailedString = detailedStringForDecryptionError(this, details);
  }
}
exports.DecryptionError = DecryptionError;
function detailedStringForDecryptionError(err, details) {
  let result = err.name + "[msg: " + err.message;
  if (details) {
    result += ", " + Object.keys(details).map(k => k + ": " + details[k]).join(", ");
  }
  result += "]";
  return result;
}