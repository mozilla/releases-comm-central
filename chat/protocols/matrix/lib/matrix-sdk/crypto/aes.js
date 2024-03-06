"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.calculateKeyCheck = calculateKeyCheck;
exports.decryptAES = decryptAES;
exports.encryptAES = encryptAES;
var _base = require("../base64");
var _crypto = require("./crypto");
/*
Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.

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

// salt for HKDF, with 8 bytes of zeros
const zeroSalt = new Uint8Array(8);
/**
 * encrypt a string
 *
 * @param data - the plaintext to encrypt
 * @param key - the encryption key to use
 * @param name - the name of the secret
 * @param ivStr - the initialization vector to use
 */
async function encryptAES(data, key, name, ivStr) {
  let iv;
  if (ivStr) {
    iv = (0, _base.decodeBase64)(ivStr);
  } else {
    iv = new Uint8Array(16);
    _crypto.crypto.getRandomValues(iv);

    // clear bit 63 of the IV to stop us hitting the 64-bit counter boundary
    // (which would mean we wouldn't be able to decrypt on Android). The loss
    // of a single bit of iv is a price we have to pay.
    iv[8] &= 0x7f;
  }
  const [aesKey, hmacKey] = await deriveKeys(key, name);
  const encodedData = new _crypto.TextEncoder().encode(data);
  const ciphertext = await _crypto.subtleCrypto.encrypt({
    name: "AES-CTR",
    counter: iv,
    length: 64
  }, aesKey, encodedData);
  const hmac = await _crypto.subtleCrypto.sign({
    name: "HMAC"
  }, hmacKey, ciphertext);
  return {
    iv: (0, _base.encodeBase64)(iv),
    ciphertext: (0, _base.encodeBase64)(ciphertext),
    mac: (0, _base.encodeBase64)(hmac)
  };
}

/**
 * decrypt a string
 *
 * @param data - the encrypted data
 * @param key - the encryption key to use
 * @param name - the name of the secret
 */
async function decryptAES(data, key, name) {
  const [aesKey, hmacKey] = await deriveKeys(key, name);
  const ciphertext = (0, _base.decodeBase64)(data.ciphertext);
  if (!(await _crypto.subtleCrypto.verify({
    name: "HMAC"
  }, hmacKey, (0, _base.decodeBase64)(data.mac), ciphertext))) {
    throw new Error(`Error decrypting secret ${name}: bad MAC`);
  }
  const plaintext = await _crypto.subtleCrypto.decrypt({
    name: "AES-CTR",
    counter: (0, _base.decodeBase64)(data.iv),
    length: 64
  }, aesKey, ciphertext);
  return new TextDecoder().decode(new Uint8Array(plaintext));
}
async function deriveKeys(key, name) {
  const hkdfkey = await _crypto.subtleCrypto.importKey("raw", key, {
    name: "HKDF"
  }, false, ["deriveBits"]);
  const keybits = await _crypto.subtleCrypto.deriveBits({
    name: "HKDF",
    salt: zeroSalt,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/879
    info: new _crypto.TextEncoder().encode(name),
    hash: "SHA-256"
  }, hkdfkey, 512);
  const aesKey = keybits.slice(0, 32);
  const hmacKey = keybits.slice(32);
  const aesProm = _crypto.subtleCrypto.importKey("raw", aesKey, {
    name: "AES-CTR"
  }, false, ["encrypt", "decrypt"]);
  const hmacProm = _crypto.subtleCrypto.importKey("raw", hmacKey, {
    name: "HMAC",
    hash: {
      name: "SHA-256"
    }
  }, false, ["sign", "verify"]);
  return Promise.all([aesProm, hmacProm]);
}

// string of zeroes, for calculating the key check
const ZERO_STR = "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";

/** Calculate the MAC for checking the key.
 *
 * @param key - the key to use
 * @param iv - The initialization vector as a base64-encoded string.
 *     If omitted, a random initialization vector will be created.
 * @returns An object that contains, `mac` and `iv` properties.
 */
function calculateKeyCheck(key, iv) {
  return encryptAES(ZERO_STR, key, "", iv);
}