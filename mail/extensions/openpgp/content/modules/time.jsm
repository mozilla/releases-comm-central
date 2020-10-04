/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailTime"];

ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);

const DATE_2DIGIT = "2-digit";
const DATE_4DIGIT = "numeric";

var EnigmailTime = {
  /**
   * Transform a Unix-Timestamp to a human-readable date/time string
   *
   * @dateNum:  Number  - Unix timestamp
   * @withDate: Boolean - if true, include the date in the output
   * @withTime: Boolean - if true, include the time in the output
   *
   * @return: String - formatted date/time string
   */

  loc: null,

  initLocaleInfo() {
    let useOsLocale = Services.prefs.getBoolPref(
      "intl.regional_prefs.use_os_locales",
      false
    );
    if (useOsLocale) {
      this.loc = Cc["@mozilla.org/intl/ospreferences;1"].getService(
        Ci.mozIOSPreferences
      ).regionalPrefsLocales[0];
    } else {
      this.loc = Services.locale.appLocalesAsBCP47[0];
    }
  },

  getDateTime(dateNum, withDate, withTime) {
    if (!this.loc) {
      this.initLocaleInfo();
    }

    if (dateNum && dateNum !== 0) {
      let dat = new Date(dateNum * 1000);

      var options = {};

      if (withDate) {
        options.day = DATE_2DIGIT;
        options.month = DATE_2DIGIT;
        options.year = DATE_4DIGIT;
      }
      if (withTime) {
        options.hour = DATE_2DIGIT;
        options.minute = DATE_2DIGIT;
      }

      return new Intl.DateTimeFormat(this.loc, options).format(dat);
    }
    return "";
  },
};
