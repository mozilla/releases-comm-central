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
  getPartsFromUidStr(uid, resultObj) {
    // RegExp strategy:
    // Search until the first ( or < character, use that as Name.
    // Then search for the () characters, allow any characters until ).
    // Do the same for <>.
    // No characters are allowed between a closing ) and opening <.
    // All characters after a trailing > are ignored.

    if (!uid) {
      return false;
    }

    let result = uid.match(/^ *([^(<]*)? *(\([^)]*\))? *(<[^>]*>)?/);
    if (result.length != 4) {
      return false;
    }

    resultObj.name = result[1].trim();

    resultObj.comment = "";
    if (result[2]) {
      resultObj.comment = result[2].substring(1, result[2].length - 1).trim();
    }

    resultObj.email = "";
    if (result[3]) {
      resultObj.email = result[3].substring(1, result[3].length - 1).trim();
    }

    return true;
  },
};
