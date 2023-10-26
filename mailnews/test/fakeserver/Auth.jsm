/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file implements the authentication mechanisms
 * - AUTH LOGIN
 * - AUTH PLAIN
 * - AUTH CRAM-MD5
 * for all the server implementations, i.e. in a generic way.
 * In fact, you could use this to implement a real server in JS :-) .
 *
 * @author Ben Bucksch <ben.bucksch beonex.com>
 */

var EXPORTED_SYMBOLS = ["AuthPLAIN", "AuthLOGIN", "AuthCRAM"];

/**
 * Implements AUTH PLAIN
 *
 * @see RFC 4616
 */
var AuthPLAIN = {
  /**
   * Takes full PLAIN auth line, and decodes it.
   *
   * @param line {string}
   * @returns {Object { username : value, password : value } }
   * @throws {string}   error to return to client
   */
  decodeLine(line) {
    dump("AUTH PLAIN line -" + line + "-\n");
    line = atob(line); // base64 decode
    const aap = line.split("\u0000"); // 0-charater is delimiter
    if (aap.length != 3) {
      throw new Error("Expected three parts");
    }
    /* aap is: authorize-id, authenticate-id, password.
       Generally, authorize-id = authenticate-id = username.
       authorize-id may thus be empty and then defaults to authenticate-id. */
    var result = {};
    var authzid = aap[0];
    result.username = aap[1];
    result.password = aap[2];
    dump(
      "authorize-id: -" +
        authzid +
        "-, username: -" +
        result.username +
        "-, password: -" +
        result.password +
        "-\n"
    );
    if (authzid && authzid != result.username) {
      throw new Error(
        "Expecting a authorize-id that's either the same as authenticate-id or empty"
      );
    }
    return result;
  },

  /**
   * Create an AUTH PLAIN line, to allow a client to authenticate to a server.
   * Useful for tests.
   */
  encodeLine(username, password) {
    username = username.substring(0, 255);
    password = password.substring(0, 255);
    return btoa("\u0000" + username + "\u0000" + password); // base64 encode
  },
};

var AuthLOGIN = {
  /**
   * Takes full LOGIN auth line, and decodes it.
   * It may contain either username or password,
   * depending on state/step (first username, then pw).
   *
   * @param line {string}
   * @returns {string} username or password
   * @throws {string}   error to return to client
   */
  decodeLine(line) {
    dump("AUTH LOGIN -" + atob(line) + "-\n");
    return atob(line); // base64 decode
  },
};

/**
 * Implements AUTH CRAM-MD5
 *
 * @see RFC 2195, RFC 2104
 */
var AuthCRAM = {
  /**
   * First part of CRAM exchange is that the server sends
   * a challenge to the client. The client response depends on
   * the challenge. (This prevents replay attacks, I think.)
   * This function generates the challenge.
   *
   * You need to store it, you'll need it to check the client response.
   *
   * @param domain {string} - Your hostname or domain,
   *    e.g. "example.com", "mx.example.com" or just "localhost".
   * @returns {string} The challenge.
   *   It's already base64-encoded. Send it as-is to the client.
   */
  createChallenge(domain) {
    var timestamp = new Date().getTime(); // unixtime
    var challenge = "<" + timestamp + "@" + domain + ">";
    dump("CRAM challenge unencoded: " + challenge + "\n");
    return btoa(challenge);
  },
  /**
   * Takes full CRAM-MD5 auth line, and decodes it.
   *
   * Compare the returned |digest| to the result of
   * encodeCRAMMD5(). If they match, the |username|
   * returned here is authenticated.
   *
   * @param line {string}
   * @returns {Object { username : value, digest : value } }
   * @throws {string}   error to return to client
   */
  decodeLine(line) {
    dump("AUTH CRAM-MD5 line -" + line + "-\n");
    line = atob(line);
    dump("base64 decoded -" + line + "-\n");
    var sp = line.split(" ");
    if (sp.length != 2) {
      throw new Error("Expected one space");
    }
    var result = {};
    result.username = sp[0];
    result.digest = sp[1];
    return result;
  },
  /**
   * @param text {string} - server challenge (base64-encoded)
   * @param key {string} - user's password
   * @returns {string} digest as hex string
   */
  encodeCRAMMD5(text, key) {
    text = atob(text); // createChallenge() returns it already encoded
    dump("encodeCRAMMD5(text: -" + text + "-, key: -" + key + "-)\n");
    const kInputLen = 64;
    // const kHashLen = 16;
    const kInnerPad = 0x36; // per spec
    const kOuterPad = 0x5c;

    key = this.textToNumberArray(key);
    text = this.textToNumberArray(text);
    // Make sure key is exactly kDigestLen bytes long. Algo per spec.
    if (key.length > kInputLen) {
      // (results in kHashLen)
      key = this.md5(key);
    }
    while (key.length < kInputLen) {
      // Fill up with zeros.
      key.push(0);
    }

    // MD5((key XOR outerpad) + MD5((key XOR innerpad) + text)) , per spec
    var digest = this.md5(
      this.xor(key, kOuterPad).concat(
        this.md5(this.xor(key, kInnerPad).concat(text))
      )
    );
    return this.arrayToHexString(digest);
  },
  // Utils
  xor(binary, value) {
    var result = [];
    for (var i = 0; i < binary.length; i++) {
      result.push(binary[i] ^ value);
    }
    return result;
  },
  md5(binary) {
    var md5 = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    md5.init(Ci.nsICryptoHash.MD5);
    md5.update(binary, binary.length);
    return this.textToNumberArray(md5.finish(false));
  },
  textToNumberArray(text) {
    var array = [];
    for (var i = 0; i < text.length; i++) {
      // Convert string (only lower byte) to array.
      array.push(text.charCodeAt(i) & 0xff);
    }
    return array;
  },
  arrayToHexString(binary) {
    var result = "";
    for (var i = 0; i < binary.length; i++) {
      if (binary[i] > 255) {
        throw new Error("unexpected that value > 255");
      }
      let hex = binary[i].toString(16);
      if (hex.length < 2) {
        hex = "0" + hex;
      }
      result += hex;
    }
    return result;
  },
};
