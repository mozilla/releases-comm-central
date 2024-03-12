/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var MailCryptoUtils = {
  /**
   * Converts a binary string into a Uint8Array.
   *
   * @param {BinaryString} str - The string to convert.
   * @returns {Uint8Array}.
   */
  binaryStringToTypedArray(str) {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  },

  /**
   * The HMAC-MD5 transform works like:
   *
   * MD5(K XOR opad, MD5(K XOR ipad, m))
   *
   * where
   *  K is an n byte key
   *  ipad is the byte 0x36 repeated 64 times
   *  opad is the byte 0x5c repeated 64 times
   *  m is the message being processed

   * @param {Uint8Array} key
   * @param {Uint8Array} data
   * @returns {Uint8Array}
   */
  hmacMd5(key, data) {
    const hasher = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    let digest;

    // If key is longer than 64 bytes, reset it to MD5(key).
    if (key.length > 64) {
      hasher.init(Ci.nsICryptoHash.MD5);
      hasher.update(key, key.length);
      digest = hasher.finish(false);
      key = this.binaryStringToTypedArray(digest);
    }

    // Generate innerPad and outerPad.
    const innerPad = new Uint8Array(64);
    const outerPad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      const base = key[i] || 0;
      innerPad[i] = base ^ 0x36;
      outerPad[i] = base ^ 0x5c;
    }

    // Perform inner MD5.
    hasher.init(Ci.nsICryptoHash.MD5);
    hasher.update(innerPad, 64);
    hasher.update(data, data.length);
    digest = hasher.finish(false);

    const result = this.binaryStringToTypedArray(digest);

    // Perform outer MD5.
    hasher.init(Ci.nsICryptoHash.MD5);
    hasher.update(outerPad, 64);
    hasher.update(result, result.length);
    digest = hasher.finish(false);

    return this.binaryStringToTypedArray(digest);
  },
};
