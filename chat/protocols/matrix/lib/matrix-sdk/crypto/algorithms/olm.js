"use strict";

var _logger = require("../../logger");
var olmlib = _interopRequireWildcard(require("../olmlib"));
var _deviceinfo = require("../deviceinfo");
var _base = require("./base");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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
                                                                                                                                                                                                                                                                                                                                                                                          */ /**
                                                                                                                                                                                                                                                                                                                                                                                              * Defines m.olm encryption/decryption
                                                                                                                                                                                                                                                                                                                                                                                              */
const DeviceVerification = _deviceinfo.DeviceInfo.DeviceVerification;
/**
 * Olm encryption implementation
 *
 * @param params - parameters, as per {@link EncryptionAlgorithm}
 */
class OlmEncryption extends _base.EncryptionAlgorithm {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "sessionPrepared", false);
    _defineProperty(this, "prepPromise", null);
  }
  /**
   * @internal
    * @param roomMembers - list of currently-joined users in the room
   * @returns Promise which resolves when setup is complete
   */
  ensureSession(roomMembers) {
    if (this.prepPromise) {
      // prep already in progress
      return this.prepPromise;
    }
    if (this.sessionPrepared) {
      // prep already done
      return Promise.resolve();
    }
    this.prepPromise = this.crypto.downloadKeys(roomMembers).then(() => {
      return this.crypto.ensureOlmSessionsForUsers(roomMembers);
    }).then(() => {
      this.sessionPrepared = true;
    }).finally(() => {
      this.prepPromise = null;
    });
    return this.prepPromise;
  }

  /**
   * @param content - plaintext event content
   *
   * @returns Promise which resolves to the new event body
   */
  async encryptMessage(room, eventType, content) {
    // pick the list of recipients based on the membership list.
    //
    // TODO: there is a race condition here! What if a new user turns up
    // just as you are sending a secret message?

    const members = await room.getEncryptionTargetMembers();
    const users = members.map(function (u) {
      return u.userId;
    });
    await this.ensureSession(users);
    const payloadFields = {
      room_id: room.roomId,
      type: eventType,
      content: content
    };
    const encryptedContent = {
      algorithm: olmlib.OLM_ALGORITHM,
      sender_key: this.olmDevice.deviceCurve25519Key,
      ciphertext: {}
    };
    const promises = [];
    for (const userId of users) {
      const devices = this.crypto.getStoredDevicesForUser(userId) || [];
      for (const deviceInfo of devices) {
        const key = deviceInfo.getIdentityKey();
        if (key == this.olmDevice.deviceCurve25519Key) {
          // don't bother sending to ourself
          continue;
        }
        if (deviceInfo.verified == DeviceVerification.BLOCKED) {
          // don't bother setting up sessions with blocked users
          continue;
        }
        promises.push(olmlib.encryptMessageForDevice(encryptedContent.ciphertext, this.userId, this.deviceId, this.olmDevice, userId, deviceInfo, payloadFields));
      }
    }
    return Promise.all(promises).then(() => encryptedContent);
  }
}

/**
 * Olm decryption implementation
 *
 * @param params - parameters, as per {@link DecryptionAlgorithm}
 */
class OlmDecryption extends _base.DecryptionAlgorithm {
  /**
   * returns a promise which resolves to a
   * {@link EventDecryptionResult} once we have finished
   * decrypting. Rejects with an `algorithms.DecryptionError` if there is a
   * problem decrypting the event.
   */
  async decryptEvent(event) {
    const content = event.getWireContent();
    const deviceKey = content.sender_key;
    const ciphertext = content.ciphertext;
    if (!ciphertext) {
      throw new _base.DecryptionError("OLM_MISSING_CIPHERTEXT", "Missing ciphertext");
    }
    if (!(this.olmDevice.deviceCurve25519Key in ciphertext)) {
      throw new _base.DecryptionError("OLM_NOT_INCLUDED_IN_RECIPIENTS", "Not included in recipients");
    }
    const message = ciphertext[this.olmDevice.deviceCurve25519Key];
    let payloadString;
    try {
      payloadString = await this.decryptMessage(deviceKey, message);
    } catch (e) {
      throw new _base.DecryptionError("OLM_BAD_ENCRYPTED_MESSAGE", "Bad Encrypted Message", {
        sender: deviceKey,
        err: e
      });
    }
    const payload = JSON.parse(payloadString);

    // check that we were the intended recipient, to avoid unknown-key attack
    // https://github.com/vector-im/vector-web/issues/2483
    if (payload.recipient != this.userId) {
      throw new _base.DecryptionError("OLM_BAD_RECIPIENT", "Message was intented for " + payload.recipient);
    }
    if (payload.recipient_keys.ed25519 != this.olmDevice.deviceEd25519Key) {
      throw new _base.DecryptionError("OLM_BAD_RECIPIENT_KEY", "Message not intended for this device", {
        intended: payload.recipient_keys.ed25519,
        our_key: this.olmDevice.deviceEd25519Key
      });
    }

    // check that the device that encrypted the event belongs to the user that the event claims it's from.
    //
    // To do this, we need to make sure that our device list is up-to-date. If the device is unknown, we can only
    // assume that the device logged out and accept it anyway. Some event handlers, such as secret sharing, may be
    // more strict and reject events that come from unknown devices.
    //
    // This is a defence against the following scenario:
    //
    //   * Alice has verified Bob and Mallory.
    //   * Mallory gets control of Alice's server, and sends a megolm session to Alice using her (Mallory's)
    //     senderkey, but claiming to be from Bob.
    //   * Mallory sends more events using that session, claiming to be from Bob.
    //   * Alice sees that the senderkey is verified (since she verified Mallory) so marks events those
    //     events as verified even though the sender is forged.
    //
    // In practice, it's not clear that the js-sdk would behave that way, so this may be only a defence in depth.

    await this.crypto.deviceList.downloadKeys([event.getSender()], false);
    const senderKeyUser = this.crypto.deviceList.getUserByIdentityKey(olmlib.OLM_ALGORITHM, deviceKey);
    if (senderKeyUser !== event.getSender() && senderKeyUser != undefined) {
      throw new _base.DecryptionError("OLM_BAD_SENDER", "Message claimed to be from " + event.getSender(), {
        real_sender: senderKeyUser
      });
    }

    // check that the original sender matches what the homeserver told us, to
    // avoid people masquerading as others.
    // (this check is also provided via the sender's embedded ed25519 key,
    // which is checked elsewhere).
    if (payload.sender != event.getSender()) {
      throw new _base.DecryptionError("OLM_FORWARDED_MESSAGE", "Message forwarded from " + payload.sender, {
        reported_sender: event.getSender()
      });
    }

    // Olm events intended for a room have a room_id.
    if (payload.room_id !== event.getRoomId()) {
      throw new _base.DecryptionError("OLM_BAD_ROOM", "Message intended for room " + payload.room_id, {
        reported_room: event.getRoomId() || "ROOM_ID_UNDEFINED"
      });
    }
    const claimedKeys = payload.keys || {};
    return {
      clearEvent: payload,
      senderCurve25519Key: deviceKey,
      claimedEd25519Key: claimedKeys.ed25519 || null
    };
  }

  /**
   * Attempt to decrypt an Olm message
   *
   * @param theirDeviceIdentityKey -  Curve25519 identity key of the sender
   * @param message -  message object, with 'type' and 'body' fields
   *
   * @returns payload, if decrypted successfully.
   */
  decryptMessage(theirDeviceIdentityKey, message) {
    // This is a wrapper that serialises decryptions of prekey messages, because
    // otherwise we race between deciding we have no active sessions for the message
    // and creating a new one, which we can only do once because it removes the OTK.
    if (message.type !== 0) {
      // not a prekey message: we can safely just try & decrypt it
      return this.reallyDecryptMessage(theirDeviceIdentityKey, message);
    } else {
      const myPromise = this.olmDevice.olmPrekeyPromise.then(() => {
        return this.reallyDecryptMessage(theirDeviceIdentityKey, message);
      });
      // we want the error, but don't propagate it to the next decryption
      this.olmDevice.olmPrekeyPromise = myPromise.catch(() => {});
      return myPromise;
    }
  }
  async reallyDecryptMessage(theirDeviceIdentityKey, message) {
    const sessionIds = await this.olmDevice.getSessionIdsForDevice(theirDeviceIdentityKey);

    // try each session in turn.
    const decryptionErrors = {};
    for (const sessionId of sessionIds) {
      try {
        const payload = await this.olmDevice.decryptMessage(theirDeviceIdentityKey, sessionId, message.type, message.body);
        _logger.logger.log("Decrypted Olm message from " + theirDeviceIdentityKey + " with session " + sessionId);
        return payload;
      } catch (e) {
        const foundSession = await this.olmDevice.matchesSession(theirDeviceIdentityKey, sessionId, message.type, message.body);
        if (foundSession) {
          // decryption failed, but it was a prekey message matching this
          // session, so it should have worked.
          throw new Error("Error decrypting prekey message with existing session id " + sessionId + ": " + e.message);
        }

        // otherwise it's probably a message for another session; carry on, but
        // keep a record of the error
        decryptionErrors[sessionId] = e.message;
      }
    }
    if (message.type !== 0) {
      // not a prekey message, so it should have matched an existing session, but it
      // didn't work.

      if (sessionIds.length === 0) {
        throw new Error("No existing sessions");
      }
      throw new Error("Error decrypting non-prekey message with existing sessions: " + JSON.stringify(decryptionErrors));
    }

    // prekey message which doesn't match any existing sessions: make a new
    // session.

    let res;
    try {
      res = await this.olmDevice.createInboundSession(theirDeviceIdentityKey, message.type, message.body);
    } catch (e) {
      decryptionErrors["(new)"] = e.message;
      throw new Error("Error decrypting prekey message: " + JSON.stringify(decryptionErrors));
    }
    _logger.logger.log("created new inbound Olm session ID " + res.session_id + " with " + theirDeviceIdentityKey);
    return res.payload;
  }
}
(0, _base.registerAlgorithm)(olmlib.OLM_ALGORITHM, OlmEncryption, OlmDecryption);