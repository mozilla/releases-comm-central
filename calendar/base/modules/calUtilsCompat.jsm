/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Backwards compat for calUtils migration.
 */

Components.utils.import("resource://gre/modules/Deprecated.jsm");

/* exported injectCalUtilsCompat */

this.EXPORTED_SYMBOLS = ["injectCalUtilsCompat"];

/**
 * Migration data for backwards compatibility, will be used with
 * injectCalUtilsCompat.
 */
var migrations = {
    acl: {
        isCalendarWritable: "isCalendarWritable",
        userCanAddItemsToCalendar: "userCanAddItemsToCalendar",
        userCanDeleteItemsFromCalendar: "userCanDeleteItemsFromCalendar",
        userCanModifyItem: "userCanModifyItem"
    },
    dtz: {
        now: "now",
        ensureDateTime: "ensureDateTime",
        getRecentTimezones: "getRecentTimezones",
        saveRecentTimezone: "saveRecentTimezone",
        getDefaultStartDate: "getDefaultStartDate",
        setDefaultStartEndHour: "setDefaultStartEndHour",
        calGetStartDateProp: "startDateProp",
        calGetEndDateProp: "endDateProp",
        sameDay: "sameDay",
        jsDateToDateTime: "jsDateToDateTime",
        dateTimeToJsDate: "dateTimeToJsDate",

        // The following are now getters
        calendarDefaultTimezone: "defaultTimezone",
        floating: "floating",
        UTC: "UTC"
    }
};

/**
 * Generate a forward function on the given global, for the namespace from the
 * migrations data.
 *
 * @param global        The global object to inject on.
 * @param namespace     The new namespace in the cal object.
 * @param from          The function/property name being migrated from
 * @param to            The function/property name being migrated to
 */
function generateForward(global, namespace, from, to) {
    // Protect from footguns
    if (typeof global[from] != "undefined") {
        throw new Error(from + " is already defined on the cal. namespace!");
    }

    global[from] = function(...args) {
        let suffix = "";
        let target = global[namespace][to];
        if (typeof target == "function") {
            target = target(...args);
            suffix = "()";
        }

        Deprecated.warning(`calUtils' cal.${from}() has changed to cal.${namespace}.${to}${suffix}`,
                           "https://bugzilla.mozilla.org/show_bug.cgi?id=905097",
                           Components.stack.caller);

        return target;
    };
}

/**
 * Inject the backwards compatibility functions using above migration data
 *
 * @param global        The global object to inject on.
 */
function injectCalUtilsCompat(global) {
    for (let [namespace, nsdata] of Object.entries(migrations)) {
        for (let [from, to] of Object.entries(nsdata)) {
            generateForward(global, namespace, from, to);
        }
    }
}
