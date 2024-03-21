/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Localization and locale functions
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.l10n namespace.

/**
 * Gets the value of a string in a .properties file.
 *
 * @param {string} aComponent - Stringbundle component name
 * @param {string} aBundleName - The name of the properties file
 * @param {string} aStringName - The name of the string within the properties file
 * @param {string[]} aParams - (optional) Parameters to format the string
 * @returns {string} The formatted string
 */
function _getString(aComponent, aBundleName, aStringName, aParams = []) {
  const propName = `chrome://${aComponent}/locale/${aBundleName}.properties`;

  try {
    if (!(propName in _getString._bundleCache)) {
      _getString._bundleCache[propName] = Services.strings.createBundle(propName);
    }
    const props = _getString._bundleCache[propName];

    if (aParams && aParams.length) {
      return props.formatStringFromName(aStringName, aParams);
    }
    return props.GetStringFromName(aStringName);
  } catch (ex) {
    const msg = `Failed to read '${aStringName}' from ${propName}.`;
    console.error(`${msg} Error: ${ex}`);
    return aStringName;
  }
}
_getString._bundleCache = {};

/**
 * Provides locale dependent parameters for displaying calendar views
 *
 * @param {string}  aLocale      The locale to get the info for, e.g. "en-US",
 *                                 "de-DE" or null for the current locale
 * @param {Bollean} aResetCache - Whether to reset the internal cache - for test
 *                                 purposes only don't use it otherwise atm
 * @returns {object} The getCalendarInfo object from mozIMozIntl
 */
function _calendarInfo(aLocale = null, aResetCache = false) {
  if (aResetCache) {
    _calendarInfo._startup = {};
  }
  // we cache the result to prevent updates at runtime except for test
  // purposes since changing intl.regional_prefs.use_os_locales preference
  // would provide different result when called without aLocale and we
  // need to investigate whether this is wanted or chaching more selctively.
  // when starting to use it to determine the first week of a year, we would
  // need to at least reset that cached properties on pref change.
  if (!("firstDayOfWeek" in _calendarInfo._startup) || aLocale) {
    const info = Services.intl.getCalendarInfo(aLocale || Services.locale.regionalPrefsLocales[0]);
    if (aLocale) {
      return info;
    }
    _calendarInfo._startup = info;
  }
  return _calendarInfo._startup;
}
_calendarInfo._startup = {};

export var l10n = {
  /**
   * Gets the value of a string in a .properties file.
   *
   * @param {string} aComponent - Stringbundle component name
   * @param {string} aBundleName - The name of the properties file
   * @param {string} aStringName - The name of the string within the properties file
   * @param {string[]} aParams - (optional) Parameters to format the string
   * @returns {string} The formatted string
   */
  getAnyString: _getString,

  /**
   * Gets a string from a bundle from chrome://calendar/
   *
   * @param {string} aBundleName - The name of the properties file
   * @param {string} aStringName - The name of the string within the properties file
   * @param {string[]} aParams - (optional) Parameters to format the string
   * @returns {string} The formatted string
   */
  getString: _getString.bind(undefined, "calendar"),

  /**
   * Gets a string from chrome://calendar/locale/calendar.properties bundle
   *
   * @param {string} aStringName - The name of the string within the properties file
   * @param {string[]} aParams - (optional) Parameters to format the string
   * @returns {string} The formatted string
   */
  getCalString: _getString.bind(undefined, "calendar", "calendar"),

  /**
   * Gets a string from chrome://lightning/locale/lightning.properties
   *
   * @param {string} aStringName - The name of the string within the properties file
   * @param {string[]} aParams - (optional) Parameters to format the string
   * @returns {string} The formatted string
   */
  getLtnString: _getString.bind(undefined, "lightning", "lightning"),

  /**
   * Gets a date format string from chrome://calendar/locale/dateFormat.properties bundle
   *
   * @param {string} aStringName - The name of the string within the properties file
   * @param {string[]} aParams - (optional) Parameters to format the string
   * @returns {string} The formatted string
   */
  getDateFmtString: _getString.bind(undefined, "calendar", "dateFormat"),

  /**
   * Gets the month name string in the right form depending on a base string.
   *
   * @param {number} aMonthNum - The month number to get, 1-based.
   * @param {string} aBundleName - The Bundle to get the string from
   * @param {string} aStringBase - The base string name, .monthFormat will be appended
   * @returns {string} The formatted month name
   */
  formatMonth(aMonthNum, aBundleName, aStringBase) {
    let monthForm = l10n.getString(aBundleName, aStringBase + ".monthFormat") || "nominative";

    if (monthForm == "nominative") {
      // Fall back to the default name format
      monthForm = "name";
    }

    return l10n.getDateFmtString(`month.${aMonthNum}.${monthForm}`);
  },

  /**
   * Sort an array of strings in place, according to the current locale.
   *
   * @param {string[]} aStringArray - The strings to sort
   * @returns {string[]} The sorted strings, more specifically aStringArray
   */
  sortArrayByLocaleCollator(aStringArray) {
    const collator = new Intl.Collator();
    aStringArray.sort(collator.compare);
    return aStringArray;
  },

  /**
   * Provides locale dependent parameters for displaying calendar views
   *
   * @param {string} aLocale - The locale to get the info for, e.g. "en-US",
   *                               "de-DE" or null for the current locale
   * @returns {object} The getCalendarInfo object from mozIMozIntl
   */
  calendarInfo: _calendarInfo,
};
