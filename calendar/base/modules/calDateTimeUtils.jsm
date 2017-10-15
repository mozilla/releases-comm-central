/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * date, time and timezone related functions via cal.dtz.*
 *
 * NOTE this module should never be imported directly. Instead, load
 * calUtils.jsm and accss them via cal.dtz.*
 */

Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "cal", "resource://calendar/modules/calUtils.jsm", "cal");

this.EXPORTED_SYMBOLS = ["caldtz"]; /* exported caldtz */

var caldtz = {
    /**
     * Shortcut to the timezone service's defaultTimezone
     */
    get defaultTimezone() {
        return cal.getTimezoneService().defaultTimezone;
    },

    /**
     * Shorcut to the UTC timezone
     */
    get UTC() {
        return cal.getTimezoneService().UTC;
    },

    /**
     * Shortcut to the floating (local) timezone
     */
    get floating() {
        return cal.getTimezoneService().floating;
    },

    /**
     * Makes sure the given timezone id is part of the list of recent timezones.
     *
     * @param aTzid     The timezone id to add
     */
    saveRecentTimezone: function(aTzid) {
        let recentTimezones = caldtz.getRecentTimezones();
        const MAX_RECENT_TIMEZONES = 5; // We don't need a pref for *everything*.

        if (aTzid != caldtz.defaultTimezone.tzid &&
            !recentTimezones.includes(aTzid)) {
            // Add the timezone if its not already the default timezone
            recentTimezones.unshift(aTzid);
            recentTimezones.splice(MAX_RECENT_TIMEZONES);
            Preferences.set("calendar.timezone.recent", JSON.stringify(recentTimezones));
        }
    },

    /**
     * Returns a calIDateTime that corresponds to the current time in the user's
     * default timezone.
     */
    now: function() {
        let date = caldtz.jsDateToDateTime(new Date());
        return date.getInTimezone(caldtz.defaultTimezone);
    },

    /**
     * Get the default event start date. This is the next full hour, or 23:00 if it
     * is past 23:00.
     *
     * @param aReferenceDate    If passed, the time of this date will be modified,
     *                            keeping the date and timezone intact.
     */
    getDefaultStartDate: function(aReferenceDate) {
        let startDate = caldtz.now();
        if (aReferenceDate) {
            let savedHour = startDate.hour;
            startDate = aReferenceDate;
            if (!startDate.isMutable) {
                startDate = startDate.clone();
            }
            startDate.isDate = false;
            startDate.hour = savedHour;
        }

        startDate.second = 0;
        startDate.minute = 0;
        if (startDate.hour < 23) {
            startDate.hour++;
        }
        return startDate;
    },

    /**
     * Setup the default start and end hours of the given item. This can be a task
     * or an event.
     *
     * @param aItem             The item to set up the start and end date for.
     * @param aReferenceDate    If passed, the time of this date will be modified,
     *                            keeping the date and timezone intact.
     */
    setDefaultStartEndHour: function(aItem, aReferenceDate) {
        aItem[caldtz.startDateProp(aItem)] = caldtz.getDefaultStartDate(aReferenceDate);

        if (cal.item.isEvent(aItem)) {
            aItem.endDate = aItem.startDate.clone();
            aItem.endDate.minute += Preferences.get("calendar.event.defaultlength", 60);
        }
    },

    /**
     * Returns the property name used for the start date of an item, ie either an
     * event's start date or a task's entry date.
     */
    startDateProp: function(aItem) {
        if (cal.item.isEvent(aItem)) {
            return "startDate";
        } else if (cal.item.isToDo(aItem)) {
            return "entryDate";
        }
        throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    },

    /**
     * Returns the property name used for the end date of an item, ie either an
     * event's end date or a task's due date.
     */
    endDateProp: function(aItem) {
        if (cal.item.isEvent(aItem)) {
            return "endDate";
        } else if (cal.item.isToDo(aItem)) {
            return "dueDate";
        }
        throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    },

    /**
     * Check if the two dates are on the same day (ignoring time)
     *
     * @param date1     The left date to compare
     * @param date2     The right date to compare
     * @return          True, if dates are on the same day
     */
    sameDay: function(date1, date2) {
        if (date1 && date2) {
            if ((date1.day == date2.day) &&
                (date1.month == date2.month) &&
                (date1.year == date2.year)) {
                return true;
            }
        }
        return false;
    },

    /**
     * Many computations want to work only with date-times, not with dates.  This
     * method will return a proper datetime (set to midnight) for a date object.  If
     * the object is already a datetime, it will simply be returned.
     *
     * @param aDate  the date or datetime to check
     */
    ensureDateTime: function(aDate) {
        if (!aDate || !aDate.isDate) {
            return aDate;
        }
        let newDate = aDate.clone();
        newDate.isDate = false;
        return newDate;
    },

    /**
     * Returns a calIDateTime corresponding to a javascript Date.
     *
     * @param aDate     a javascript date
     * @param aTimezone (optional) a timezone that should be enforced
     * @returns         a calIDateTime
     *
     * @warning  Use of this function is strongly discouraged.  calIDateTime should
     *           be used directly whenever possible.
     *           If you pass a timezone, then the passed jsDate's timezone will be ignored,
     *           but only its local time portions are be taken.
     */
    jsDateToDateTime: function(aDate, aTimezone) {
        let newDate = cal.createDateTime();
        if (aTimezone) {
            newDate.resetTo(aDate.getFullYear(),
                            aDate.getMonth(),
                            aDate.getDate(),
                            aDate.getHours(),
                            aDate.getMinutes(),
                            aDate.getSeconds(),
                            aTimezone);
        } else {
            newDate.nativeTime = aDate.getTime() * 1000;
        }
        return newDate;
    },

    /**
     * Convert a calIDateTime to a Javascript date object. This is the
     * replacement for the former .jsDate property.
     *
     * @param cdt       The calIDateTime instnace
     * @return          The Javascript date equivalent.
     */
    dateTimeToJsDate: function(cdt) {
        if (cdt.timezone.isFloating) {
            return new Date(cdt.year, cdt.month, cdt.day,
                            cdt.hour, cdt.minute, cdt.second);
        } else {
            return new Date(cdt.nativeTime / 1000);
        }
    },

    /**
     * Gets the list of recent timezones. Optionally retuns the list as
     * calITimezones.
     *
     * @param aConvertZones     (optional) If true, return calITimezones instead
     * @return                  An array of timezone ids or calITimezones.
     */
    getRecentTimezones: function(aConvertZones) {
        let recentTimezones = JSON.parse(Preferences.get("calendar.timezone.recent", "[]") || "[]");
        if (!Array.isArray(recentTimezones)) {
            recentTimezones = [];
        }

        let tzService = cal.getTimezoneService();
        if (aConvertZones) {
            let oldZonesLength = recentTimezones.length;
            for (let i = 0; i < recentTimezones.length; i++) {
                let timezone = tzService.getTimezone(recentTimezones[i]);
                if (timezone) {
                    // Replace id with found timezone
                    recentTimezones[i] = timezone;
                } else {
                    // Looks like the timezone doesn't longer exist, remove it
                    recentTimezones.splice(i, 1);
                    i--;
                }
            }

            if (oldZonesLength != recentTimezones.length) {
                // Looks like the one or other timezone dropped out. Go ahead and
                // modify the pref.
                Preferences.set("calendar.timezone.recent", JSON.stringify(recentTimezones));
            }
        }
        return recentTimezones;
    }
};
