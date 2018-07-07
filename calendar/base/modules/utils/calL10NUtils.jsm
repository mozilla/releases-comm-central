/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");

/*
 * Localization and locale functions
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.l10n namespace.

this.EXPORTED_SYMBOLS = ["call10n"]; /* exported call10n */

/**
 * Gets the value of a string in a .properties file.
 *
 * @param {String} aComponent       Stringbundle component name
 * @param {String} aBundleName      The name of the properties file
 * @param {String} aStringName      The name of the string within the properties file
 * @param {String[]} aParams        (optional) Parameters to format the string
 * @return {String}                 The formatted string
 */
function _getString(aComponent, aBundleName, aStringName, aParams=[]) {
    let propName = `chrome://${aComponent}/locale/${aBundleName}.properties`;

    try {
        if (!(propName in _getString._bundleCache)) {
            _getString._bundleCache[propName] = Services.strings.createBundle(propName);
        }
        let props = _getString._bundleCache[propName];

        if (aParams && aParams.length) {
            return props.formatStringFromName(aStringName, aParams, aParams.length);
        } else {
            return props.GetStringFromName(aStringName);
        }
    } catch (ex) {
        let msg = `Failed to read '${aStringName}' from ${propName}.`;
        Components.utils.reportError(`${msg} Error: ${ex}`);
        return aStringName;
    }
}
_getString._bundleCache = {};


var call10n = {
    /**
     * Gets the value of a string in a .properties file.
     *
     * @param {String} aComponent       Stringbundle component name
     * @param {String} aBundleName      The name of the properties file
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getAnyString: _getString,

    /**
     * Gets a string from a bundle from chrome://calendar/
     *
     * @param {String} aBundleName      The name of the properties file
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getString: _getString.bind(undefined, "calendar"),

    /**
     * Gets a string from chrome://calendar/locale/calendar.properties bundle
     *
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getCalString: _getString.bind(undefined, "calendar", "calendar"),

    /**
     * Gets a string from chrome://lightning/locale/lightning.properties
     *
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getLtnString: _getString.bind(undefined, "lightning", "lightning"),

    /**
     * Gets a date format string from chrome://calendar/locale/dateFormat.properties bundle
     *
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getDateFmtString: _getString.bind(undefined, "calendar", "dateFormat"),

    /**
     * Gets the month name string in the right form depending on a base string.
     *
     * @param {Number} aMonthNum     The month numer to get, 1-based.
     * @param {String} aBundleName   The Bundle to get the string from
     * @param {String} aStringBase   The base string name, .monthFormat will be appended
     * @return {String}              The formatted month name
     */
    formatMonth: function(aMonthNum, aBundleName, aStringBase) {
        let monthForm = call10n.getString(aBundleName, aStringBase + ".monthFormat") || "nominative";

        if (monthForm == "nominative") {
            // Fall back to the default name format
            monthForm = "name";
        }

        return call10n.getDateFmtString(`month.${aMonthNum}.${monthForm}`);
    },

    /**
     * Create a new locale collator
     *
     * @return {nsICollation}       A new locale collator
     */
    createLocaleCollator: function() {
        return Components.classes["@mozilla.org/intl/collation-factory;1"]
                         .getService(Components.interfaces.nsICollationFactory)
                         .CreateCollation();
    },

    /**
     * Sort an array of strings in place, according to the current locale.
     *
     * @param {String[]} aStringArray   The strings to sort
     * @return {String[]}               The sorted strings, more specifically aStringArray
     */
    sortArrayByLocaleCollator: function(aStringArray) {
        let collator = call10n.createLocaleCollator();
        aStringArray.sort((a, b) => collator.compareString(0, a, b));
        return aStringArray;
    }
};
