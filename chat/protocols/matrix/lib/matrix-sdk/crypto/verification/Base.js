"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VerificationEvent = exports.VerificationBase = exports.SwitchStartEventError = void 0;
var _event = require("../../models/event");
var _event2 = require("../../@types/event");
var _logger = require("../../logger");
var _deviceinfo = require("../deviceinfo");
var _Error = require("./Error");
var _CrossSigning = require("../CrossSigning");
var _typedEventEmitter = require("../../models/typed-event-emitter");
var _verification = require("../../crypto-api/verification");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2018 New Vector Ltd
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/ /**
 * Base class for verification methods.
 */
const timeoutException = new Error("Verification timed out");
class SwitchStartEventError extends Error {
  constructor(startEvent) {
    super();
    this.startEvent = startEvent;
  }
}

/** @deprecated use VerifierEvent */
exports.SwitchStartEventError = SwitchStartEventError;
/** @deprecated use VerifierEvent */
const VerificationEvent = exports.VerificationEvent = _verification.VerifierEvent;

/** @deprecated use VerifierEventHandlerMap */

/** @deprecated Avoid referencing this class directly; instead use {@link Crypto.Verifier}. */
// The type parameters of VerificationBase are no longer used, but we need some placeholders to maintain
// backwards compatibility with applications that reference the class.
class VerificationBase extends _typedEventEmitter.TypedEventEmitter {
  /**
   * Base class for verification methods.
   *
   * <p>Once a verifier object is created, the verification can be started by
   * calling the verify() method, which will return a promise that will
   * resolve when the verification is completed, or reject if it could not
   * complete.</p>
   *
   * <p>Subclasses must have a NAME class property.</p>
   *
   * @param channel - the verification channel to send verification messages over.
   * TODO: Channel types
   *
   * @param baseApis - base matrix api interface
   *
   * @param userId - the user ID that is being verified
   *
   * @param deviceId - the device ID that is being verified
   *
   * @param startEvent - the m.key.verification.start event that
   * initiated this verification, if any
   *
   * @param request - the key verification request object related to
   * this verification, if any
   */
  constructor(channel, baseApis, userId, deviceId, startEvent, request) {
    super();
    this.channel = channel;
    this.baseApis = baseApis;
    this.userId = userId;
    this.deviceId = deviceId;
    this.startEvent = startEvent;
    this.request = request;
    _defineProperty(this, "cancelled", false);
    _defineProperty(this, "_done", false);
    _defineProperty(this, "promise", null);
    _defineProperty(this, "transactionTimeoutTimer", null);
    _defineProperty(this, "expectedEvent", void 0);
    _defineProperty(this, "resolve", void 0);
    _defineProperty(this, "reject", void 0);
    _defineProperty(this, "resolveEvent", void 0);
    _defineProperty(this, "rejectEvent", void 0);
    _defineProperty(this, "started", void 0);
    _defineProperty(this, "doVerification", void 0);
  }
  get initiatedByMe() {
    // if there is no start event yet,
    // we probably want to send it,
    // which happens if we initiate
    if (!this.startEvent) {
      return true;
    }
    const sender = this.startEvent.getSender();
    const content = this.startEvent.getContent();
    return sender === this.baseApis.getUserId() && content.from_device === this.baseApis.getDeviceId();
  }
  get hasBeenCancelled() {
    return this.cancelled;
  }
  resetTimer() {
    _logger.logger.info("Refreshing/starting the verification transaction timeout timer");
    if (this.transactionTimeoutTimer !== null) {
      clearTimeout(this.transactionTimeoutTimer);
    }
    this.transactionTimeoutTimer = setTimeout(() => {
      if (!this._done && !this.cancelled) {
        _logger.logger.info("Triggering verification timeout");
        this.cancel(timeoutException);
      }
    }, 10 * 60 * 1000); // 10 minutes
  }
  endTimer() {
    if (this.transactionTimeoutTimer !== null) {
      clearTimeout(this.transactionTimeoutTimer);
      this.transactionTimeoutTimer = null;
    }
  }
  send(type, uncompletedContent) {
    return this.channel.send(type, uncompletedContent);
  }
  waitForEvent(type) {
    if (this._done) {
      return Promise.reject(new Error("Verification is already done"));
    }
    const existingEvent = this.request.getEventFromOtherParty(type);
    if (existingEvent) {
      return Promise.resolve(existingEvent);
    }
    this.expectedEvent = type;
    return new Promise((resolve, reject) => {
      this.resolveEvent = resolve;
      this.rejectEvent = reject;
    });
  }
  canSwitchStartEvent(event) {
    return false;
  }
  switchStartEvent(event) {
    if (this.canSwitchStartEvent(event)) {
      _logger.logger.log("Verification Base: switching verification start event", {
        restartingFlow: !!this.rejectEvent
      });
      if (this.rejectEvent) {
        const reject = this.rejectEvent;
        this.rejectEvent = undefined;
        reject(new SwitchStartEventError(event));
      } else {
        this.startEvent = event;
      }
    }
  }
  handleEvent(e) {
    if (this._done) {
      return;
    } else if (e.getType() === this.expectedEvent) {
      // if we receive an expected m.key.verification.done, then just
      // ignore it, since we don't need to do anything about it
      if (this.expectedEvent !== _event2.EventType.KeyVerificationDone) {
        this.expectedEvent = undefined;
        this.rejectEvent = undefined;
        this.resetTimer();
        this.resolveEvent?.(e);
      }
    } else if (e.getType() === _event2.EventType.KeyVerificationCancel) {
      const reject = this.reject;
      this.reject = undefined;
      // there is only promise to reject if verify has been called
      if (reject) {
        const content = e.getContent();
        const {
          reason,
          code
        } = content;
        reject(new Error(`Other side cancelled verification ` + `because ${reason} (${code})`));
      }
    } else if (this.expectedEvent) {
      // only cancel if there is an event expected.
      // if there is no event expected, it means verify() wasn't called
      // and we're just replaying the timeline events when syncing
      // after a refresh when the events haven't been stored in the cache yet.
      const exception = new Error("Unexpected message: expecting " + this.expectedEvent + " but got " + e.getType());
      this.expectedEvent = undefined;
      if (this.rejectEvent) {
        const reject = this.rejectEvent;
        this.rejectEvent = undefined;
        reject(exception);
      }
      this.cancel(exception);
    }
  }
  async done() {
    this.endTimer(); // always kill the activity timer
    if (!this._done) {
      this.request.onVerifierFinished();
      this.resolve?.();
      return (0, _CrossSigning.requestKeysDuringVerification)(this.baseApis, this.userId, this.deviceId);
    }
  }
  cancel(e) {
    this.endTimer(); // always kill the activity timer
    if (!this._done) {
      this.cancelled = true;
      this.request.onVerifierCancelled();
      if (this.userId && this.deviceId) {
        // send a cancellation to the other user (if it wasn't
        // cancelled by the other user)
        if (e === timeoutException) {
          const timeoutEvent = (0, _Error.newTimeoutError)();
          this.send(timeoutEvent.getType(), timeoutEvent.getContent());
        } else if (e instanceof _event.MatrixEvent) {
          const sender = e.getSender();
          if (sender !== this.userId) {
            const content = e.getContent();
            if (e.getType() === _event2.EventType.KeyVerificationCancel) {
              content.code = content.code || "m.unknown";
              content.reason = content.reason || content.body || "Unknown reason";
              this.send(_event2.EventType.KeyVerificationCancel, content);
            } else {
              this.send(_event2.EventType.KeyVerificationCancel, {
                code: "m.unknown",
                reason: content.body || "Unknown reason"
              });
            }
          }
        } else {
          this.send(_event2.EventType.KeyVerificationCancel, {
            code: "m.unknown",
            reason: e.toString()
          });
        }
      }
      if (this.promise !== null) {
        // when we cancel without a promise, we end up with a promise
        // but no reject function. If cancel is called again, we'd error.
        if (this.reject) this.reject(e);
      } else {
        // FIXME: this causes an "Uncaught promise" console message
        // if nothing ends up chaining this promise.
        this.promise = Promise.reject(e);
      }
      // Also emit a 'cancel' event that the app can listen for to detect cancellation
      // before calling verify()
      this.emit(VerificationEvent.Cancel, e);
    }
  }

  /**
   * Begin the key verification
   *
   * @returns Promise which resolves when the verification has
   *     completed.
   */
  verify() {
    if (this.promise) return this.promise;
    this.promise = new Promise((resolve, reject) => {
      this.resolve = (...args) => {
        this._done = true;
        this.endTimer();
        resolve(...args);
      };
      this.reject = e => {
        this._done = true;
        this.endTimer();
        reject(e);
      };
    });
    if (this.doVerification && !this.started) {
      this.started = true;
      this.resetTimer(); // restart the timeout
      new Promise((resolve, reject) => {
        const crossSignId = this.baseApis.crypto.deviceList.getStoredCrossSigningForUser(this.userId)?.getId();
        if (crossSignId === this.deviceId) {
          reject(new Error("Device ID is the same as the cross-signing ID"));
        }
        resolve();
      }).then(() => this.doVerification()).then(this.done.bind(this), this.cancel.bind(this));
    }
    return this.promise;
  }
  async verifyKeys(userId, keys, verifier) {
    // we try to verify all the keys that we're told about, but we might
    // not know about all of them, so keep track of the keys that we know
    // about, and ignore the rest
    const verifiedDevices = [];
    for (const [keyId, keyInfo] of Object.entries(keys)) {
      const deviceId = keyId.split(":", 2)[1];
      const device = this.baseApis.getStoredDevice(userId, deviceId);
      if (device) {
        verifier(keyId, device, keyInfo);
        verifiedDevices.push([deviceId, keyId, device.keys[keyId]]);
      } else {
        const crossSigningInfo = this.baseApis.crypto.deviceList.getStoredCrossSigningForUser(userId);
        if (crossSigningInfo && crossSigningInfo.getId() === deviceId) {
          verifier(keyId, _deviceinfo.DeviceInfo.fromStorage({
            keys: {
              [keyId]: deviceId
            }
          }, deviceId), keyInfo);
          verifiedDevices.push([deviceId, keyId, deviceId]);
        } else {
          _logger.logger.warn(`verification: Could not find device ${deviceId} to verify`);
        }
      }
    }

    // if none of the keys could be verified, then error because the app
    // should be informed about that
    if (!verifiedDevices.length) {
      throw new Error("No devices could be verified");
    }
    _logger.logger.info("Verification completed! Marking devices verified: ", verifiedDevices);
    // TODO: There should probably be a batch version of this, otherwise it's going
    // to upload each signature in a separate API call which is silly because the
    // API supports as many signatures as you like.
    for (const [deviceId, keyId, key] of verifiedDevices) {
      await this.baseApis.crypto.setDeviceVerification(userId, deviceId, true, null, null, {
        [keyId]: key
      });
    }

    // if one of the user's own devices is being marked as verified / unverified,
    // check the key backup status, since whether or not we use this depends on
    // whether it has a signature from a verified device
    if (userId == this.baseApis.credentials.userId) {
      await this.baseApis.checkKeyBackup();
    }
  }
  get events() {
    return undefined;
  }

  /**
   * Get the details for an SAS verification, if one is in progress
   *
   * Returns `null`, unless this verifier is for a SAS-based verification and we are waiting for the user to confirm
   * the SAS matches.
   */
  getShowSasCallbacks() {
    return null;
  }

  /**
   * Get the details for reciprocating QR code verification, if one is in progress
   *
   * Returns `null`, unless this verifier is for reciprocating a QR-code-based verification (ie, the other user has
   * already scanned our QR code), and we are waiting for the user to confirm.
   */
  getReciprocateQrCodeCallbacks() {
    return null;
  }
}
exports.VerificationBase = VerificationBase;