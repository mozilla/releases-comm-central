/* eslint no-invalid-this: 0 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailZBase32"];

const ZBase32Alphabet = "ybndrfg8ejkmcpqxot1uwisza345h769";

var EnigmailZBase32 = {
  a: ZBase32Alphabet,
  pad: "=",

  /**
   * Encode a string in Z-Base-32 encoding
   *
   * @param {string} str - Input string
   *
   * @returns {string} the encoded string.
   */
  encode(str) {
    const a = this.a;
    const pad = this.pad;
    const len = str.length;
    let o = "";
    let w,
      c,
      r = 0,
      sh = 0;

    for (let i = 0; i < len; i += 5) {
      // mask top 5 bits
      c = str.charCodeAt(i);
      w = 0xf8 & c;
      o += a.charAt(w >> 3);
      r = 0x07 & c;
      sh = 2;

      if (i + 1 < len) {
        c = str.charCodeAt(i + 1);
        // mask top 2 bits
        w = 0xc0 & c;
        o += a.charAt((r << 2) + (w >> 6));
        o += a.charAt((0x3e & c) >> 1);
        r = c & 0x01;
        sh = 4;
      }

      if (i + 2 < len) {
        c = str.charCodeAt(i + 2);
        // mask top 4 bits
        w = 0xf0 & c;
        o += a.charAt((r << 4) + (w >> 4));
        r = 0x0f & c;
        sh = 1;
      }

      if (i + 3 < len) {
        c = str.charCodeAt(i + 3);
        // mask top 1 bit
        w = 0x80 & c;
        o += a.charAt((r << 1) + (w >> 7));
        o += a.charAt((0x7c & c) >> 2);
        r = 0x03 & c;
        sh = 3;
      }

      if (i + 4 < len) {
        c = str.charCodeAt(i + 4);
        // mask top 3 bits
        w = 0xe0 & c;
        o += a.charAt((r << 3) + (w >> 5));
        o += a.charAt(0x1f & c);
        r = 0;
        sh = 0;
      }
    }
    // Calculate length of pad by getting the
    // number of words to reach an 8th octet.
    if (r != 0) {
      o += a.charAt(r << sh);
    }
    var padlen = 8 - (o.length % 8);

    if (padlen === 8) {
      return o;
    }

    if (padlen === 1 || padlen === 3 || padlen === 4 || padlen === 6) {
      return o + pad.repeat(padlen);
    }

    throw new Error(
      "there was some kind of error:\npadlen:" +
        padlen +
        " ,r:" +
        r +
        " ,sh:" +
        sh +
        ", w:" +
        w
    );
  },
};
