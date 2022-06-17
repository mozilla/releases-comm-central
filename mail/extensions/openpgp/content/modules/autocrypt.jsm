/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  Module for dealing with received Autocrypt headers, level 0
 *  See details at https://github.com/mailencrypt/autocrypt
 */

var EXPORTED_SYMBOLS = ["EnigmailAutocrypt"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
});

var EnigmailAutocrypt = {
  getKeyFromHeader(fromAddr, headerDataArr) {
    // critical parameters: {param: mandatory}
    const CRITICAL = {
      addr: true,
      keydata: true,
      type: false, // That's actually oboslete according to the Level 1 spec.
    };

    try {
      fromAddr = lazy.EnigmailFuncs.stripEmail(fromAddr).toLowerCase();
    } catch (ex) {
      throw new Error("getKeyFromHeader error " + ex);
    }
    let foundTypes = {};
    let paramArr = [];

    for (let hdrNum = 0; hdrNum < headerDataArr.length; hdrNum++) {
      let hdr = headerDataArr[hdrNum].replace(/[\r\n \t]/g, "");
      let k = hdr.search(/keydata=/);
      if (k > 0) {
        let d = hdr.substr(k);
        if (d.search(/"/) < 0) {
          hdr = hdr.replace(/keydata=/, 'keydata="') + '"';
        }
      }

      paramArr = lazy.EnigmailMime.getAllParameters(hdr);

      for (let i in CRITICAL) {
        if (CRITICAL[i]) {
          // found mandatory parameter
          if (!(i in paramArr)) {
            lazy.EnigmailLog.DEBUG(
              "autocrypt.jsm: getKeyFromHeader: cannot find param '" + i + "'\n"
            );
            return null; // do nothing if not all mandatory parts are present
          }
        }
      }

      paramArr.addr = paramArr.addr.toLowerCase();

      if (fromAddr !== paramArr.addr) {
        lazy.EnigmailLog.DEBUG(
          "autocrypt.jsm: getKeyFromHeader: from Addr " +
            fromAddr +
            " != " +
            paramArr.addr.toLowerCase() +
            "\n"
        );

        return null;
      }

      if (!("type" in paramArr)) {
        paramArr.type = "1";
      } else {
        paramArr.type = paramArr.type.toLowerCase();
        if (paramArr.type !== "1") {
          lazy.EnigmailLog.DEBUG(
            "autocrypt.jsm: getKeyFromHeader: unknown type " +
              paramArr.type +
              "\n"
          );
          return null; // we currently only support 1 (=OpenPGP)
        }
      }

      try {
        atob(paramArr.keydata); // don't need result
      } catch (ex) {
        lazy.EnigmailLog.DEBUG(
          "autocrypt.jsm: getKeyFromHeader: key is not base64-encoded\n"
        );
        return null;
      }

      if (paramArr.type in foundTypes) {
        lazy.EnigmailLog.DEBUG(
          "autocrypt.jsm: getKeyFromHeader: duplicate header for type=" +
            paramArr.type +
            "\n"
        );
        return null; // do not process anything if more than one Autocrypt header for the same type is found
      }

      foundTypes[paramArr.type] = 1;
    }

    return paramArr.keydata;
  },
};
