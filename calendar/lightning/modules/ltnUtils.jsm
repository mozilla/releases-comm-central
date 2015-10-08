/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

this.EXPORTED_SYMBOLS = ["ltn"];
var ltn = {
    /**
     * Gets the value of a string in a .properties file from the lightning bundle
     *
     * @param {String} aBundleName  the name of the properties file. It is assumed that the
     *                              file lives in chrome://lightning/locale/
     * @param {String} aStringName  the name of the string within the properties file
     * @param {Array}  aParams      [optional] array of parameters to format the string
     */
    getString: function(aBundleName, aStringName, aParams) {
        return cal.calGetString(aBundleName, aStringName, aParams, "lightning");
    }
};
