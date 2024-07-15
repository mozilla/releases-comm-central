"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MSC4108SecureChannel = void 0;
var _matrixSdkCryptoWasm = require("@matrix-org/matrix-sdk-crypto-wasm");
var _ = require("..");
var _logger = require("../../logger");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
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
 * Prototype of the unstable [MSC4108](https://github.com/matrix-org/matrix-spec-proposals/pull/4108)
 * secure rendezvous session protocol.
 * @experimental Note that this is UNSTABLE and may have breaking changes without notice.
 * Imports @matrix-org/matrix-sdk-crypto-wasm so should be async-imported to avoid bundling the WASM into the main bundle.
 */
class MSC4108SecureChannel {
  constructor(rendezvousSession, theirPublicKey, onFailure) {
    this.rendezvousSession = rendezvousSession;
    this.theirPublicKey = theirPublicKey;
    this.onFailure = onFailure;
    _defineProperty(this, "secureChannel", void 0);
    _defineProperty(this, "establishedChannel", void 0);
    _defineProperty(this, "connected", false);
    this.secureChannel = new _matrixSdkCryptoWasm.Ecies();
  }

  /**
   * Generate a QR code for the current session.
   * @param mode the mode to generate the QR code in, either `Login` or `Reciprocate`.
   * @param homeserverBaseUrl the base URL of the homeserver to connect to, required for `Reciprocate` mode.
   */

  async generateCode(mode, homeserverBaseUrl) {
    const {
      url
    } = this.rendezvousSession;
    if (!url) {
      throw new Error("No rendezvous session URL");
    }
    return new _matrixSdkCryptoWasm.QrCodeData(this.secureChannel.public_key(), url, mode === _matrixSdkCryptoWasm.QrCodeMode.Reciprocate ? homeserverBaseUrl : undefined).to_bytes();
  }

  /**
   * Returns the check code for the secure channel or undefined if not generated yet.
   */
  getCheckCode() {
    const x = this.establishedChannel?.check_code();
    if (!x) {
      return undefined;
    }
    return Array.from(x.as_bytes()).map(b => `${b % 10}`).join("");
  }

  /**
   * Connects and establishes a secure channel with the other device.
   */
  async connect() {
    if (this.connected) {
      throw new Error("Channel already connected");
    }
    if (this.theirPublicKey) {
      // We are the scanning device
      const result = this.secureChannel.establish_outbound_channel(this.theirPublicKey, "MATRIX_QR_CODE_LOGIN_INITIATE");
      this.establishedChannel = result.channel;

      /*
       Secure Channel step 4. Device S sends the initial message
        Nonce := 0
       SH := ECDH(Ss, Gp)
       EncKey := HKDF_SHA256(SH, "MATRIX_QR_CODE_LOGIN|" || Gp || "|" || Sp, 0, 32)
       TaggedCiphertext := ChaCha20Poly1305_Encrypt(EncKey, Nonce, "MATRIX_QR_CODE_LOGIN_INITIATE")
       Nonce := Nonce + 2
       LoginInitiateMessage := UnpaddedBase64(TaggedCiphertext) || "|" || UnpaddedBase64(Sp)
       */
      {
        _logger.logger.info("Sending LoginInitiateMessage");
        await this.rendezvousSession.send(result.initial_message);
      }

      /*
      Secure Channel step 6. Verification by Device S
       Nonce_G := 1
      (TaggedCiphertext, Sp) := Unpack(Message)
      Plaintext := ChaCha20Poly1305_Decrypt(EncKey, Nonce_G, TaggedCiphertext)
      Nonce_G := Nonce_G + 2
       unless Plaintext == "MATRIX_QR_CODE_LOGIN_OK":
          FAIL
       */
      {
        _logger.logger.info("Waiting for LoginOkMessage");
        const ciphertext = await this.rendezvousSession.receive();
        if (!ciphertext) {
          throw new _.RendezvousError("No response from other device", _.MSC4108FailureReason.UnexpectedMessageReceived);
        }
        const candidateLoginOkMessage = await this.decrypt(ciphertext);
        if (candidateLoginOkMessage !== "MATRIX_QR_CODE_LOGIN_OK") {
          throw new _.RendezvousError("Invalid response from other device", _.ClientRendezvousFailureReason.InsecureChannelDetected);
        }

        // Step 6 is now complete. We trust the channel
      }
    } else {
      /*
      Secure Channel step 5. Device G confirms
       Nonce_S := 0
      (TaggedCiphertext, Sp) := Unpack(LoginInitiateMessage)
      SH := ECDH(Gs, Sp)
      EncKey := HKDF_SHA256(SH, "MATRIX_QR_CODE_LOGIN|" || Gp || "|" || Sp, 0, 32)
      Plaintext := ChaCha20Poly1305_Decrypt(EncKey, Nonce_S, TaggedCiphertext)
      Nonce_S := Nonce_S + 2
       */
      // wait for the other side to send us their public key
      _logger.logger.info("Waiting for LoginInitiateMessage");
      const loginInitiateMessage = await this.rendezvousSession.receive();
      if (!loginInitiateMessage) {
        throw new Error("No response from other device");
      }
      const {
        channel,
        message: candidateLoginInitiateMessage
      } = this.secureChannel.establish_inbound_channel(loginInitiateMessage);
      this.establishedChannel = channel;
      if (candidateLoginInitiateMessage !== "MATRIX_QR_CODE_LOGIN_INITIATE") {
        throw new _.RendezvousError("Invalid response from other device", _.ClientRendezvousFailureReason.InsecureChannelDetected);
      }
      _logger.logger.info("LoginInitiateMessage received");
      _logger.logger.info("Sending LoginOkMessage");
      const loginOkMessage = await this.encrypt("MATRIX_QR_CODE_LOGIN_OK");
      await this.rendezvousSession.send(loginOkMessage);

      // Step 5 is complete. We don't yet trust the channel

      // next step will be for the user to confirm the check code on the other device
    }
    this.connected = true;
  }
  async decrypt(ciphertext) {
    if (!this.establishedChannel) {
      throw new Error("Channel closed");
    }
    return this.establishedChannel.decrypt(ciphertext);
  }
  async encrypt(plaintext) {
    if (!this.establishedChannel) {
      throw new Error("Channel closed");
    }
    return this.establishedChannel.encrypt(plaintext);
  }

  /**
   * Sends a payload securely to the other device.
   * @param payload the payload to encrypt and send
   */
  async secureSend(payload) {
    if (!this.connected) {
      throw new Error("Channel closed");
    }
    const stringifiedPayload = JSON.stringify(payload);
    _logger.logger.debug(`=> {"type": ${JSON.stringify(payload.type)}, ...}`);
    await this.rendezvousSession.send(await this.encrypt(stringifiedPayload));
  }

  /**
   * Receives an encrypted payload from the other device and decrypts it.
   */
  async secureReceive() {
    if (!this.establishedChannel) {
      throw new Error("Channel closed");
    }
    const ciphertext = await this.rendezvousSession.receive();
    if (!ciphertext) {
      return undefined;
    }
    const plaintext = await this.decrypt(ciphertext);
    const json = JSON.parse(plaintext);
    _logger.logger.debug(`<= {"type": ${JSON.stringify(json.type)}, ...}`);
    return json;
  }

  /**
   * Closes the secure channel.
   */
  async close() {
    await this.rendezvousSession.close();
  }

  /**
   * Cancels the secure channel.
   * @param reason the reason for the cancellation
   */
  async cancel(reason) {
    try {
      await this.rendezvousSession.cancel(reason);
      this.onFailure?.(reason);
    } finally {
      await this.close();
    }
  }

  /**
   * Returns whether the rendezvous session has been cancelled.
   */
  get cancelled() {
    return this.rendezvousSession.cancelled;
  }
}
exports.MSC4108SecureChannel = MSC4108SecureChannel;