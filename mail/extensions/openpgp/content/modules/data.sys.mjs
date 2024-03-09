/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export var EnigmailData = {
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

  convertFromUnicode(text, charset) {
    if (!text) {
      return "";
    }

    const converter = Cc[
      "@mozilla.org/intl/scriptableunicodeconverter"
    ].getService(Ci.nsIScriptableUnicodeConverter);
    converter.charset = charset || "utf-8";
    return converter.ConvertFromUnicode(text) + converter.Finish();
  },
};
