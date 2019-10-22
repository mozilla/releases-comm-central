"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.newInvalidMessageError = exports.newUserMismatchError = exports.newKeyMismatchError = exports.newUnexpectedMessageError = exports.newUnknownMethodError = exports.newUnknownTransactionError = exports.newTimeoutError = exports.newUserCancelledError = undefined;
exports.newVerificationError = newVerificationError;
exports.errorFactory = errorFactory;

var _event = require("../../models/event");

function newVerificationError(code, reason, extradata) {
  extradata = extradata || {};
  extradata.code = code;
  extradata.reason = reason;
  return new _event.MatrixEvent({
    type: "m.key.verification.cancel",
    content: extradata
  });
} /*
  Copyright 2018 New Vector Ltd
  
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
 * Error messages.
 *
 * @module crypto/verification/Error
 */

function errorFactory(code, reason) {
  return function (extradata) {
    return newVerificationError(code, reason, extradata);
  };
}

/**
 * The verification was cancelled by the user.
 */
const newUserCancelledError = exports.newUserCancelledError = errorFactory("m.user", "Cancelled by user");

/**
 * The verification timed out.
 */
const newTimeoutError = exports.newTimeoutError = errorFactory("m.timeout", "Timed out");

/**
 * The transaction is unknown.
 */
const newUnknownTransactionError = exports.newUnknownTransactionError = errorFactory("m.unknown_transaction", "Unknown transaction");

/**
 * An unknown method was selected.
 */
const newUnknownMethodError = exports.newUnknownMethodError = errorFactory("m.unknown_method", "Unknown method");

/**
 * An unexpected message was sent.
 */
const newUnexpectedMessageError = exports.newUnexpectedMessageError = errorFactory("m.unexpected_message", "Unexpected message");

/**
 * The key does not match.
 */
const newKeyMismatchError = exports.newKeyMismatchError = errorFactory("m.key_mismatch", "Key mismatch");

/**
 * The user does not match.
 */
const newUserMismatchError = exports.newUserMismatchError = errorFactory("m.user_error", "User mismatch");

/**
 * An invalid message was sent.
 */
const newInvalidMessageError = exports.newInvalidMessageError = errorFactory("m.invalid_message", "Invalid message");