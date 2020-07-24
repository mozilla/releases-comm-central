/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["uidHelper"];

/* Parse a OpenPGP user ID string and split it into its parts.
 * The expected syntax is:
 *    Name (comment) <email>
 * Each part is allowed to be empty.
 */

var uidHelper = {
  // Does the whole name look roughly like an email address?
  // Domain part after @ must not contain space.
  // Local part in front of @ must either be quoted (allows space),
  // or must not contain space.
  // If that condition is true, then conclude it's probably an
  // email address that wasn't enclosed in <>.
  looksLikeEmail(str) {
    return str.match(/^(".+"|[^ ]+)@[^ @]+$/);
  },

  getPartsFromUidStr(uid, resultObj) {
    resultObj.name = "";
    resultObj.comment = "";
    resultObj.email = "";

    if (!uid) {
      return false;
    }

    // RegExp strategy:
    // Search until the first ( or < character, use that as Name.
    // Then search for the () characters, allow any characters until ).
    // Do the same for <>.
    // No characters are allowed between a closing ) and opening <.
    // All characters after a trailing > are ignored.
    let result = uid.match(/^ *([^(<]*)? *(\([^)]*\))? *(<[^>]*>)?/);
    if (result.length != 4) {
      return false;
    }

    if (result[1]) {
      resultObj.name = result[1].trim();
    }

    if (result[1] && !result[2] && !result[3]) {
      if (this.looksLikeEmail(resultObj.name)) {
        resultObj.email = resultObj.name;
        resultObj.name = "";
      }
    } else {
      if (result[2]) {
        resultObj.comment = result[2].substring(1, result[2].length - 1).trim();
      }
      if (result[3]) {
        resultObj.email = result[3].substring(1, result[3].length - 1).trim();
      }
    }

    return true;
  },
};
