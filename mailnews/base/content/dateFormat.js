/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Utilities to show and parse user-entered date values used in filter and search rules. */

"use strict";

const formatYMD = 1;
const formatYDM = 2;
const formatMDY = 3;
const formatMYD = 4;
const formatDMY = 5;
const formatDYM = 6;
const formatMIN = 1;
const formatMAX = 6;

var gSearchDateFormat = 0;
var gSearchDateSeparator;
var gSearchDateLeadingZeros;

/**
 * Get the short date format option of the current locale.
 * This supports the common case which the date separator is
 * either '/', '-', '.' and using Christian year.
 */
function initLocaleShortDateFormat() {
  try {
    const dateFormatter = new Services.intl.DateTimeFormat(undefined, {
      dateStyle: "short",
    });
    var aDate = new Date(1999, 11, 2);
    // Short formats can be space-separated, like 02 Dec 1999.
    var dateString = dateFormatter
      .format(aDate)
      .replace(" 2", "2")
      .replace(/ /g, "/");

    // find out the separator
    var possibleSeparators = "/-.";
    var arrayOfStrings;
    for (let i = 0; i < possibleSeparators.length; ++i) {
      arrayOfStrings = dateString.split(possibleSeparators[i]);
      if (arrayOfStrings.length == 3) {
        gSearchDateSeparator = possibleSeparators[i];
        break;
      }
    }

    // check the format option
    if (arrayOfStrings.length != 3) {
      // no successful split
      console.error(
        `initLocaleShortDateFormat: could not analyze date format of ${dateString}, defaulting to yyyy/mm/dd`
      );
    } else {
      // The date will contain a zero if the system settings include leading zeros.
      gSearchDateLeadingZeros = dateString.includes("0");

      // Match 2 as number, since that will match both "2" and "02".
      // Let's not look for 12 since it could be Dec instead.
      if (arrayOfStrings[0] == 2) {
        // 02.12.1999 or 02.1999.12
        gSearchDateFormat = arrayOfStrings[1] == "1999" ? formatDYM : formatDMY;
      } else if (arrayOfStrings[1] == 2) {
        // 12.02.1999 or 1999.02.12
        gSearchDateFormat = arrayOfStrings[0] == "1999" ? formatYDM : formatMDY;
      } else {
        // implies arrayOfStrings[2] == 2
        // 12.1999.02 or 1999.12.02
        gSearchDateFormat = arrayOfStrings[0] == "1999" ? formatYMD : formatMYD;
      }
    }
  } catch (e) {
    console.error("initLocaleShortDateFormat: caught an exception: ", e);
    gSearchDateFormat = 0;
  }
}

function initializeSearchDateFormat() {
  if (gSearchDateFormat > 0) {
    return;
  }

  // get a search date format option and a separator
  try {
    gSearchDateFormat = Services.prefs.getComplexValue(
      "mailnews.search_date_format",
      Ci.nsIPrefLocalizedString
    ).data;

    gSearchDateFormat = parseInt(gSearchDateFormat);

    // if the option is 0 then try to use the format of the current locale
    if (gSearchDateFormat == 0) {
      initLocaleShortDateFormat();
    } else {
      // initialize the search date format based on preferences
      if (gSearchDateFormat < formatMIN || gSearchDateFormat > formatMAX) {
        gSearchDateFormat = formatYMD;
      }

      gSearchDateSeparator = Services.prefs.getComplexValue(
        "mailnews.search_date_separator",
        Ci.nsIPrefLocalizedString
      ).data;

      gSearchDateLeadingZeros =
        Services.prefs.getComplexValue(
          "mailnews.search_date_leading_zeros",
          Ci.nsIPrefLocalizedString
        ).data == "true";
    }
  } catch (e) {
    console.error("initializeSearchDateFormat: caught an exception: ", e);
    gSearchDateFormat = 0;
  }

  if (gSearchDateFormat == 0) {
    // Set to yyyy/mm/dd in case we couldn't determine in any way.
    gSearchDateFormat = formatYMD;
    gSearchDateSeparator = "/";
    gSearchDateLeadingZeros = true;
  }
}

function convertPRTimeToString(tm) {
  var time = new Date();
  // PRTime is in microseconds, JavaScript time is in milliseconds
  // so divide by 1000 when converting
  time.setTime(tm / 1000);

  return convertDateToString(time);
}

function convertDateToString(time) {
  initializeSearchDateFormat();

  var year = time.getFullYear();
  var month = time.getMonth() + 1; // since js month is 0-11
  if (gSearchDateLeadingZeros && month < 10) {
    month = "0" + month;
  }
  var date = time.getDate(); // day
  if (gSearchDateLeadingZeros && date < 10) {
    date = "0" + date;
  }

  var dateStr;
  var sep = gSearchDateSeparator;

  switch (gSearchDateFormat) {
    case formatYMD:
      dateStr = year + sep + month + sep + date;
      break;
    case formatYDM:
      dateStr = year + sep + date + sep + month;
      break;
    case formatMDY:
      dateStr = month + sep + date + sep + year;
      break;
    case formatMYD:
      dateStr = month + sep + year + sep + date;
      break;
    case formatDMY:
      dateStr = date + sep + month + sep + year;
      break;
    case formatDYM:
      dateStr = date + sep + year + sep + month;
      break;
    default:
      dump("valid search date format option is 1-6\n");
  }

  return dateStr;
}

function convertStringToPRTime(str) {
  initializeSearchDateFormat();

  var arrayOfStrings = str.split(gSearchDateSeparator);
  var year, month, date;

  // set year, month, date based on the format option
  switch (gSearchDateFormat) {
    case formatYMD:
      year = arrayOfStrings[0];
      month = arrayOfStrings[1];
      date = arrayOfStrings[2];
      break;
    case formatYDM:
      year = arrayOfStrings[0];
      month = arrayOfStrings[2];
      date = arrayOfStrings[1];
      break;
    case formatMDY:
      year = arrayOfStrings[2];
      month = arrayOfStrings[0];
      date = arrayOfStrings[1];
      break;
    case formatMYD:
      year = arrayOfStrings[1];
      month = arrayOfStrings[0];
      date = arrayOfStrings[2];
      break;
    case formatDMY:
      year = arrayOfStrings[2];
      month = arrayOfStrings[1];
      date = arrayOfStrings[0];
      break;
    case formatDYM:
      year = arrayOfStrings[1];
      month = arrayOfStrings[2];
      date = arrayOfStrings[0];
      break;
    default:
      dump("valid search date format option is 1-6\n");
  }

  month -= 1; // since js month is 0-11

  var time = new Date(year, month, date);

  // JavaScript time is in milliseconds, PRTime is in microseconds
  // so multiply by 1000 when converting
  return time.getTime() * 1000;
}
