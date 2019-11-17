/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["EnigmailAddrbook"];

/*
 * Functionality related to the Thunderbird address book
 *
 */





const ABMANAGER = "@mozilla.org/abmanager;1";

var EnigmailAddrbook = {
  /**
   * Look up the address book card for a given email address
   *
   * @param emailAddr: String - email address to find
   *
   * @return if found: Object:
   *           - card: nsIAbCard for found email address
   *           - directory: nsIAbDirectory of found card
   *         NULL if not found
   */
  lookupEmailAddress: function(emailAddr) {
    let abm = Cc[ABMANAGER].getService(Ci.nsIAbManager);
    let enumerator = abm.directories;

    while (enumerator.hasMoreElements()) {
      let abd = enumerator.getNext().QueryInterface(Ci.nsIAbDirectory);
      try {
        let crd = abd.cardForEmailAddress(emailAddr);
        if (crd) return {
          directory: abd,
          card: crd
        };
      }
      catch (x) {}
    }

    return null;
  }
};
