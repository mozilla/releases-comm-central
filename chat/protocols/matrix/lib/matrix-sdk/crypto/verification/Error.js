"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.newVerificationError = newVerificationError;
exports.errorFactory = errorFactory;
exports.errorFromEvent = errorFromEvent;
exports.newInvalidMessageError = exports.newUserMismatchError = exports.newKeyMismatchError = exports.newUnexpectedMessageError = exports.newUnknownMethodError = exports.newUnknownTransactionError = exports.newTimeoutError = exports.newUserCancelledError = void 0;

var _event = require("../../models/event");

/*
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
function newVerificationError(code, reason, extradata) {
  const content = Object.assign({}, {
    code,
    reason
  }, extradata);
  return new _event.MatrixEvent({
    type: "m.key.verification.cancel",
    content
  });
}

function errorFactory(code, reason) {
  return function (extradata) {
    return newVerificationError(code, reason, extradata);
  };
}
/**
 * The verification was cancelled by the user.
 */


const newUserCancelledError = errorFactory("m.user", "Cancelled by user");
/**
 * The verification timed out.
 */

exports.newUserCancelledError = newUserCancelledError;
const newTimeoutError = errorFactory("m.timeout", "Timed out");
/**
 * The transaction is unknown.
 */

exports.newTimeoutError = newTimeoutError;
const newUnknownTransactionError = errorFactory("m.unknown_transaction", "Unknown transaction");
/**
 * An unknown method was selected.
 */

exports.newUnknownTransactionError = newUnknownTransactionError;
const newUnknownMethodError = errorFactory("m.unknown_method", "Unknown method");
/**
 * An unexpected message was sent.
 */

exports.newUnknownMethodError = newUnknownMethodError;
const newUnexpectedMessageError = errorFactory("m.unexpected_message", "Unexpected message");
/**
 * The key does not match.
 */

exports.newUnexpectedMessageError = newUnexpectedMessageError;
const newKeyMismatchError = errorFactory("m.key_mismatch", "Key mismatch");
/**
 * The user does not match.
 */

exports.newKeyMismatchError = newKeyMismatchError;
const newUserMismatchError = errorFactory("m.user_error", "User mismatch");
/**
 * An invalid message was sent.
 */

exports.newUserMismatchError = newUserMismatchError;
const newInvalidMessageError = errorFactory("m.invalid_message", "Invalid message");
exports.newInvalidMessageError = newInvalidMessageError;

function errorFromEvent(event) {
  const content = event.getContent();

  if (content) {
    const {
      code,
      reason
    } = content;
    return {
      code,
      reason
    };
  } else {
    return {
      code: "Unknown error",
      reason: "m.unknown"
    };
  }
}