/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailData"];

const SCRIPTABLEUNICODECONVERTER_CONTRACTID =
  "@mozilla.org/intl/scriptableunicodeconverter";

const HEX_TABLE = "0123456789abcdef";

function converter(charset) {
  let unicodeConv = Cc[SCRIPTABLEUNICODECONVERTER_CONTRACTID].getService(
    Ci.nsIScriptableUnicodeConverter
  );
  unicodeConv.charset = charset || "utf-8";
  return unicodeConv;
}

var EnigmailData = {
  getUnicodeData(data) {
    if (!data) {
      throw new Error("EnigmailData.getUnicodeData invalid parameter");
    }
    // convert output to Unicode
    var tmpStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
    tmpStream.setData(data, data.length);
    var inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    inStream.init(tmpStream);
    return inStream.read(tmpStream.available());
  },

  decodeQuotedPrintable(str) {
    return unescape(
      str.replace(/%/g, "=25").replace(new RegExp("=", "g"), "%")
    );
  },

  decodeBase64(str) {
    return atob(str.replace(/[\s\r\n]*/g, ""));
  },

  /***
   * Encode a string in base64, with a max. line length of 72 characters
   */
  encodeBase64(str) {
    return btoa(str).replace(/(.{72})/g, "$1\r\n");
  },

  convertToUnicode(text, charset) {
    if (!text || (charset && charset.toLowerCase() == "iso-8859-1")) {
      return text;
    }

    // Encode plaintext
    let buffer = Uint8Array.from(text, c => c.charCodeAt(0));
    return new TextDecoder(charset).decode(buffer);
  },

  convertFromUnicode(text, charset) {
    if (!text) {
      return "";
    }

    let conv = converter(charset);
    let result = conv.ConvertFromUnicode(text);
    result += conv.Finish();
    return result;
  },

  convertGpgToUnicode(text) {
    if (typeof text === "string") {
      text = text.replace(/\\x3a/gi, "\\e3A");
      var a = text.search(/\\x[0-9a-fA-F]{2}/);
      while (a >= 0) {
        var ch = unescape("%" + text.substr(a + 2, 2));
        var r = new RegExp("\\" + text.substr(a, 4));
        text = text.replace(r, ch);

        a = text.search(/\\x[0-9a-fA-F]{2}/);
      }

      text = EnigmailData.convertToUnicode(text, "utf-8").replace(
        /\\e3A/g,
        ":"
      );
    }

    return text;
  },

  pack(value, bytes) {
    let str = "";
    let mask = 0xff;
    for (let j = 0; j < bytes; j++) {
      str = String.fromCharCode((value & mask) >> (j * 8)) + str;
      mask <<= 8;
    }

    return str;
  },

  unpack(str) {
    let len = str.length;
    let value = 0;

    for (let j = 0; j < len; j++) {
      value <<= 8;
      value |= str.charCodeAt(j);
    }

    return value;
  },

  bytesToHex(str) {
    let len = str.length;

    let hex = "";
    for (let j = 0; j < len; j++) {
      let charCode = str.charCodeAt(j);
      hex +=
        HEX_TABLE.charAt((charCode & 0xf0) >> 4) +
        HEX_TABLE.charAt(charCode & 0x0f);
    }

    return hex;
  },

  /**
   * Convert an ArrayBuffer (or Uint8Array) object into a string
   */
  arrayBufferToString(buffer) {
    const MAXLEN = 102400;

    let uArr = new Uint8Array(buffer);
    let ret = "";
    let len = buffer.byteLength;

    for (let j = 0; j < Math.floor(len / MAXLEN) + 1; j++) {
      ret += String.fromCharCode.apply(
        null,
        uArr.subarray(j * MAXLEN, (j + 1) * MAXLEN)
      );
    }

    return ret;
  },
};
