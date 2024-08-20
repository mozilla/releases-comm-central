"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DecryptionAlgorithm = exports.DECRYPTION_CLASSES = void 0;
Object.defineProperty(exports, "DecryptionError", {
  enumerable: true,
  get: function () {
    return _CryptoBackend.DecryptionError;
  }
});
exports.UnknownDeviceError = exports.EncryptionAlgorithm = exports.ENCRYPTION_CLASSES = void 0;
exports.registerAlgorithm = registerAlgorithm;
var _CryptoBackend = require("../../common-crypto/CryptoBackend");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/*
Copyright 2016 - 2021 The Matrix.org Foundation C.I.C.

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
 * Internal module. Defines the base classes of the encryption implementations
 */

/**
 * Map of registered encryption algorithm classes. A map from string to {@link EncryptionAlgorithm} class
 */
const ENCRYPTION_CLASSES = exports.ENCRYPTION_CLASSES = new Map();
/**
 * map of registered encryption algorithm classes. Map from string to {@link DecryptionAlgorithm} class
 */
const DECRYPTION_CLASSES = exports.DECRYPTION_CLASSES = new Map();
/**
 * base type for encryption implementations
 */
class EncryptionAlgorithm {
  /**
   * @param params - parameters
   */
  constructor(params) {
    _defineProperty(this, "userId", void 0);
    _defineProperty(this, "deviceId", void 0);
    _defineProperty(this, "crypto", void 0);
    _defineProperty(this, "olmDevice", void 0);
    _defineProperty(this, "baseApis", void 0);
    this.userId = params.userId;
    this.deviceId = params.deviceId;
    this.crypto = params.crypto;
    this.olmDevice = params.olmDevice;
    this.baseApis = params.baseApis;
  }

  /**
   * Perform any background tasks that can be done before a message is ready to
   * send, in order to speed up sending of the message.
   *
   * @param room - the room the event is in
   */
  prepareToEncrypt(room) {}

  /**
   * Encrypt a message event
   *
   * @public
   *
   * @param content - event content
   *
   * @returns Promise which resolves to the new event body
   */

  /**
   * Called when the membership of a member of the room changes.
   *
   * @param event -  event causing the change
   * @param member -  user whose membership changed
   * @param oldMembership -  previous membership
   * @public
   */
  onRoomMembership(event, member, oldMembership) {}
}

/**
 * base type for decryption implementations
 */
exports.EncryptionAlgorithm = EncryptionAlgorithm;
class DecryptionAlgorithm {
  constructor(params) {
    _defineProperty(this, "userId", void 0);
    _defineProperty(this, "crypto", void 0);
    _defineProperty(this, "olmDevice", void 0);
    _defineProperty(this, "baseApis", void 0);
    this.userId = params.userId;
    this.crypto = params.crypto;
    this.olmDevice = params.olmDevice;
    this.baseApis = params.baseApis;
  }

  /**
   * Decrypt an event
   *
   * @param event - undecrypted event
   *
   * @returns promise which
   * resolves once we have finished decrypting. Rejects with an
   * `algorithms.DecryptionError` if there is a problem decrypting the event.
   */

  /**
   * Handle a key event
   *
   * @param params - event key event
   */
  async onRoomKeyEvent(params) {
    // ignore by default
  }

  /**
   * Import a room key
   *
   * @param opts - object
   */
  async importRoomKey(session, opts) {
    // ignore by default
  }

  /**
   * Determine if we have the keys necessary to respond to a room key request
   *
   * @returns true if we have the keys and could (theoretically) share
   *  them; else false.
   */
  hasKeysForKeyRequest(keyRequest) {
    return Promise.resolve(false);
  }

  /**
   * Send the response to a room key request
   *
   */
  shareKeysWithDevice(keyRequest) {
    throw new Error("shareKeysWithDevice not supported for this DecryptionAlgorithm");
  }

  /**
   * Retry decrypting all the events from a sender that haven't been
   * decrypted yet.
   *
   * @param senderKey - the sender's key
   */
  async retryDecryptionFromSender(senderKey) {
    // ignore by default
    return false;
  }
}
exports.DecryptionAlgorithm = DecryptionAlgorithm;
class UnknownDeviceError extends Error {
  /**
   * Exception thrown specifically when we want to warn the user to consider
   * the security of their conversation before continuing
   *
   * @param msg - message describing the problem
   * @param devices - set of unknown devices per user we're warning about
   */
  constructor(msg, devices, event) {
    super(msg);
    this.devices = devices;
    this.event = event;
    this.name = "UnknownDeviceError";
    this.devices = devices;
  }
}

/**
 * Registers an encryption/decryption class for a particular algorithm
 *
 * @param algorithm - algorithm tag to register for
 *
 * @param encryptor - {@link EncryptionAlgorithm} implementation
 *
 * @param decryptor - {@link DecryptionAlgorithm} implementation
 */
exports.UnknownDeviceError = UnknownDeviceError;
function registerAlgorithm(algorithm, encryptor, decryptor) {
  ENCRYPTION_CLASSES.set(algorithm, encryptor);
  DECRYPTION_CLASSES.set(algorithm, decryptor);
}

/* Re-export for backwards compatibility. Deprecated: this is an internal class. */