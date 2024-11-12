"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = encryptAESSecretStorageItem;
var _base = require("../base64.js");
var _deriveKeys = require("./internal/deriveKeys.js");
/*
 * Copyright 2024 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Encrypt a string as a secret storage item, using AES-CTR.
 *
 * @param data - the plaintext to encrypt
 * @param key - the encryption key to use as an input to the HKDF function which is used to derive the AES key for
 *    encryption. Obviously, the same key must be provided when decrypting.
 * @param name - the name of the secret. Used as an input to the HKDF operation which is used to derive the AES key,
 *    so again the same value must be provided when decrypting.
 * @param ivStr - the base64-encoded initialization vector to use. If not supplied, a random one will be generated.
 *
 * @returns The encrypted result, including the ciphertext itself, the initialization vector (as supplied in `ivStr`,
 *   or generated), and an HMAC on the ciphertext — all base64-encoded.
 */
async function encryptAESSecretStorageItem(data, key, name, ivStr) {
  let iv;
  if (ivStr) {
    iv = (0, _base.decodeBase64)(ivStr);
  } else {
    iv = new Uint8Array(16);
    globalThis.crypto.getRandomValues(iv);

    // clear bit 63 of the IV to stop us hitting the 64-bit counter boundary
    // (which would mean we wouldn't be able to decrypt on Android). The loss
    // of a single bit of iv is a price we have to pay.
    iv[8] &= 0x7f;
  }
  const [aesKey, hmacKey] = await (0, _deriveKeys.deriveKeys)(key, name);
  const encodedData = new TextEncoder().encode(data);
  const ciphertext = await globalThis.crypto.subtle.encrypt({
    name: "AES-CTR",
    counter: iv,
    length: 64
  }, aesKey, encodedData);
  const hmac = await globalThis.crypto.subtle.sign({
    name: "HMAC"
  }, hmacKey, ciphertext);
  return {
    iv: (0, _base.encodeBase64)(iv),
    ciphertext: (0, _base.encodeBase64)(ciphertext),
    mac: (0, _base.encodeBase64)(hmac)
  };
}