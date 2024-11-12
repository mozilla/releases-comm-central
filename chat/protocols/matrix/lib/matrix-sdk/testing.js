"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.decryptExistingEvent = decryptExistingEvent;
exports.mkDecryptionFailureMatrixEvent = mkDecryptionFailureMatrixEvent;
exports.mkEncryptedMatrixEvent = mkEncryptedMatrixEvent;
exports.mkMatrixEvent = mkMatrixEvent;
var _event = require("./models/event.js");
var _event2 = require("./@types/event.js");
var _index = require("./crypto/algorithms/index.js");
/*
Copyright 2024 The Matrix.org Foundation C.I.C.

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
 * This file is a secondary entrypoint for the js-sdk library, exposing utilities which might be useful for writing tests.
 *
 * In general, it should not be included in runtime applications.
 *
 * @packageDocumentation
 */

/**
 * Create a {@link MatrixEvent}.
 *
 * @param opts - Values for the event.
 */
function mkMatrixEvent(opts) {
  const event = {
    type: opts.type,
    room_id: opts.roomId,
    sender: opts.sender,
    content: opts.content,
    event_id: opts.eventId ?? "$" + Math.random() + "-" + Math.random(),
    origin_server_ts: opts.ts ?? 0,
    unsigned: opts.unsigned
  };
  if (opts.stateKey !== undefined) {
    event.state_key = opts.stateKey;
  }
  const mxEvent = new _event.MatrixEvent(event);
  mxEvent.sender = {
    userId: opts.sender,
    membership: "join",
    name: opts.sender,
    rawDisplayName: opts.sender,
    roomId: opts.sender,
    getAvatarUrl: () => {},
    getMxcAvatarUrl: () => {}
  };
  return mxEvent;
}

/**
 * Create a `MatrixEvent` representing a successfully-decrypted `m.room.encrypted` event.
 *
 * @param opts - Values for the event.
 */
async function mkEncryptedMatrixEvent(opts) {
  const mxEvent = mkMatrixEvent({
    type: _event2.EventType.RoomMessageEncrypted,
    roomId: opts.roomId,
    sender: opts.sender,
    content: {
      algorithm: "m.megolm.v1.aes-sha2"
    },
    eventId: opts.eventId
  });
  await decryptExistingEvent(mxEvent, {
    plainType: opts.plainType,
    plainContent: opts.plainContent
  });
  return mxEvent;
}

/**
 * Create a `MatrixEvent` representing a `m.room.encrypted` event which could not be decrypted.
 *
 * @param opts - Values for the event.
 */
async function mkDecryptionFailureMatrixEvent(opts) {
  const mxEvent = mkMatrixEvent({
    type: _event2.EventType.RoomMessageEncrypted,
    roomId: opts.roomId,
    sender: opts.sender,
    content: {
      algorithm: "m.megolm.v1.aes-sha2"
    },
    eventId: opts.eventId
  });
  const mockCrypto = {
    decryptEvent: async _ev => {
      throw new _index.DecryptionError(opts.code, opts.msg);
    }
  };
  await mxEvent.attemptDecryption(mockCrypto);
  return mxEvent;
}

/**
 * Given an event previously returned by {@link mkDecryptionFailureMatrixEvent}, simulate a successful re-decryption
 * attempt.
 *
 * @param mxEvent - The event that will be decrypted.
 * @param opts - New data for the successful decryption.
 */
async function decryptExistingEvent(mxEvent, opts) {
  const decryptionResult = {
    claimedEd25519Key: "",
    clearEvent: {
      type: opts.plainType,
      content: opts.plainContent
    },
    forwardingCurve25519KeyChain: [],
    senderCurve25519Key: "",
    untrusted: false
  };
  const mockCrypto = {
    decryptEvent: async _ev => decryptionResult
  };
  await mxEvent.attemptDecryption(mockCrypto);
}