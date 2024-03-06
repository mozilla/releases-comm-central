"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MSC3903ECDHv2RendezvousChannel = void 0;
var _ = require("..");
var _base = require("../../base64");
var _crypto = require("../../crypto/crypto");
var _SASDecimal = require("../../crypto/verification/SASDecimal");
var _NamespacedValue = require("../../NamespacedValue");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2023 The Matrix.org Foundation C.I.C.

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
const ECDH_V2 = new _NamespacedValue.UnstableValue("m.rendezvous.v2.curve25519-aes-sha256", "org.matrix.msc3903.rendezvous.v2.curve25519-aes-sha256");
async function importKey(key) {
  if (!_crypto.subtleCrypto) {
    throw new Error("Web Crypto is not available");
  }
  const imported = _crypto.subtleCrypto.importKey("raw", key, {
    name: "AES-GCM"
  }, false, ["encrypt", "decrypt"]);
  return imported;
}

/**
 * Implementation of the unstable [MSC3903](https://github.com/matrix-org/matrix-spec-proposals/pull/3903)
 * X25519/ECDH key agreement based secure rendezvous channel.
 * Note that this is UNSTABLE and may have breaking changes without notice.
 */
class MSC3903ECDHv2RendezvousChannel {
  constructor(transport, theirPublicKey, onFailure) {
    this.transport = transport;
    this.theirPublicKey = theirPublicKey;
    this.onFailure = onFailure;
    _defineProperty(this, "olmSAS", void 0);
    _defineProperty(this, "ourPublicKey", void 0);
    _defineProperty(this, "aesKey", void 0);
    _defineProperty(this, "connected", false);
    this.olmSAS = new global.Olm.SAS();
    this.ourPublicKey = (0, _base.decodeBase64)(this.olmSAS.get_pubkey());
  }
  async generateCode(intent) {
    if (this.transport.ready) {
      throw new Error("Code already generated");
    }
    await this.transport.send({
      algorithm: ECDH_V2.name
    });
    const rendezvous = {
      rendezvous: {
        algorithm: ECDH_V2.name,
        key: (0, _base.encodeUnpaddedBase64)(this.ourPublicKey),
        transport: await this.transport.details()
      },
      intent
    };
    return rendezvous;
  }
  async connect() {
    if (this.connected) {
      throw new Error("Channel already connected");
    }
    if (!this.olmSAS) {
      throw new Error("Channel closed");
    }
    const isInitiator = !this.theirPublicKey;
    if (isInitiator) {
      // wait for the other side to send us their public key
      const rawRes = await this.transport.receive();
      if (!rawRes) {
        throw new Error("No response from other device");
      }
      const res = rawRes;
      const {
        key,
        algorithm
      } = res;
      if (!algorithm || !ECDH_V2.matches(algorithm) || !key) {
        throw new _.RendezvousError("Unsupported algorithm: " + algorithm, _.RendezvousFailureReason.UnsupportedAlgorithm);
      }
      this.theirPublicKey = (0, _base.decodeBase64)(key);
    } else {
      // send our public key unencrypted
      await this.transport.send({
        algorithm: ECDH_V2.name,
        key: (0, _base.encodeUnpaddedBase64)(this.ourPublicKey)
      });
    }
    this.connected = true;
    this.olmSAS.set_their_key((0, _base.encodeUnpaddedBase64)(this.theirPublicKey));
    const initiatorKey = isInitiator ? this.ourPublicKey : this.theirPublicKey;
    const recipientKey = isInitiator ? this.theirPublicKey : this.ourPublicKey;
    let aesInfo = ECDH_V2.name;
    aesInfo += `|${(0, _base.encodeUnpaddedBase64)(initiatorKey)}`;
    aesInfo += `|${(0, _base.encodeUnpaddedBase64)(recipientKey)}`;
    const aesKeyBytes = this.olmSAS.generate_bytes(aesInfo, 32);
    this.aesKey = await importKey(aesKeyBytes);

    // blank the bytes out to make sure not kept in memory
    aesKeyBytes.fill(0);
    const rawChecksum = this.olmSAS.generate_bytes(aesInfo, 5);
    return (0, _SASDecimal.generateDecimalSas)(Array.from(rawChecksum)).join("-");
  }
  async encrypt(data) {
    if (!_crypto.subtleCrypto) {
      throw new Error("Web Crypto is not available");
    }
    const iv = new Uint8Array(32);
    _crypto.crypto.getRandomValues(iv);
    const encodedData = new _crypto.TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await _crypto.subtleCrypto.encrypt({
      name: "AES-GCM",
      iv,
      tagLength: 128
    }, this.aesKey, encodedData);
    return {
      iv: (0, _base.encodeUnpaddedBase64)(iv),
      ciphertext: (0, _base.encodeUnpaddedBase64)(ciphertext)
    };
  }
  async send(payload) {
    if (!this.olmSAS) {
      throw new Error("Channel closed");
    }
    if (!this.aesKey) {
      throw new Error("Shared secret not set up");
    }
    return this.transport.send(await this.encrypt(payload));
  }
  async decrypt({
    iv,
    ciphertext
  }) {
    if (!ciphertext || !iv) {
      throw new Error("Missing ciphertext and/or iv");
    }
    const ciphertextBytes = (0, _base.decodeBase64)(ciphertext);
    if (!_crypto.subtleCrypto) {
      throw new Error("Web Crypto is not available");
    }
    const plaintext = await _crypto.subtleCrypto.decrypt({
      name: "AES-GCM",
      iv: (0, _base.decodeBase64)(iv),
      tagLength: 128
    }, this.aesKey, ciphertextBytes);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext)));
  }
  async receive() {
    if (!this.olmSAS) {
      throw new Error("Channel closed");
    }
    if (!this.aesKey) {
      throw new Error("Shared secret not set up");
    }
    const rawData = await this.transport.receive();
    if (!rawData) {
      return undefined;
    }
    const data = rawData;
    if (data.ciphertext && data.iv) {
      return this.decrypt(data);
    }
    throw new Error("Data received but no ciphertext");
  }
  async close() {
    if (this.olmSAS) {
      this.olmSAS.free();
      this.olmSAS = undefined;
    }
  }
  async cancel(reason) {
    try {
      await this.transport.cancel(reason);
    } finally {
      await this.close();
    }
  }
}
exports.MSC3903ECDHv2RendezvousChannel = MSC3903ECDHv2RendezvousChannel;