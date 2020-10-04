/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailLocale"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

var gEnigStringBundle = null;

var EnigmailLocale = {
  /**
   * Retrieve a localized string from the enigmail.properties stringbundle
   *
   * @param aStr:       String                     - properties key
   * @param subPhrases: String or Array of Strings - [Optional] additional input to be embedded
   *                                                  in the resulting localized text
   *
   * @return String: the localized string
   */
  getString(aStr, subPhrases) {
    if (!gEnigStringBundle) {
      try {
        let bundlePath = "chrome://openpgp/content/strings/enigmail.properties";
        EnigmailLog.DEBUG(
          "locale.jsm: loading stringBundle " + bundlePath + "\n"
        );
        let strBundleService = Services.strings;
        gEnigStringBundle = strBundleService.createBundle(bundlePath);
      } catch (ex) {
        EnigmailLog.ERROR(
          "locale.jsm: Error in instantiating stringBundleService\n"
        );
      }
    }

    if (gEnigStringBundle) {
      try {
        let rv;
        if (subPhrases) {
          if (typeof subPhrases == "string") {
            rv = gEnigStringBundle.formatStringFromName(aStr, [subPhrases], 1);
          } else {
            rv = gEnigStringBundle.formatStringFromName(
              aStr,
              subPhrases,
              subPhrases.length
            );
          }
        } else {
          rv = gEnigStringBundle.GetStringFromName(aStr);
        }
        EnigmailLog.DEBUG("locale.jsm: successfully loaded " + aStr + "\n");
        return rv;
      } catch (ex) {
        EnigmailLog.ERROR(
          "locale.jsm: Error in querying stringBundleService for string '" +
            aStr +
            "', " +
            ex +
            "\n"
        );
      }
    }
    return aStr;
  },

  /**
   * Get the locale for the User Interface
   *
   * @return String  Locale (xx-YY)
   */
  getUILocale() {
    return Services.locale.appLocalesAsBCP47[0];
  },
};
