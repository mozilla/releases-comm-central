/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Date, time and timezone related functions
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.dtz namespace.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

export var dtz = {
  /**
   * Shortcut to the timezone service's defaultTimezone
   */
  get defaultTimezone() {
    return lazy.cal.timezoneService.defaultTimezone;
  },

  /**
   * Shorcut to the UTC timezone
   */
  get UTC() {
    return lazy.cal.timezoneService.UTC;
  },

  /**
   * Shortcut to the floating (local) timezone
   */
  get floating() {
    return lazy.cal.timezoneService.floating;
  },

  /**
   * Makes sure the given timezone id is part of the list of recent timezones.
   *
   * @param aTzid     The timezone id to add
   */
  saveRecentTimezone(aTzid) {
    const recentTimezones = dtz.getRecentTimezones();
    const MAX_RECENT_TIMEZONES = 5; // We don't need a pref for *everything*.

    if (aTzid != dtz.defaultTimezone.tzid && !recentTimezones.includes(aTzid)) {
      // Add the timezone if its not already the default timezone
      recentTimezones.unshift(aTzid);
      recentTimezones.splice(MAX_RECENT_TIMEZONES);
      Services.prefs.setStringPref("calendar.timezone.recent", JSON.stringify(recentTimezones));
    }
  },

  /**
   * Returns a calIDateTime that corresponds to the current time in the user's
   * default timezone.
   */
  now() {
    const date = dtz.jsDateToDateTime(new Date());
    return date.getInTimezone(dtz.defaultTimezone);
  },

  /**
   * Get the default event start date. This is the next full hour, or 23:00 if it
   * is past 23:00.
   *
   * @param aReferenceDate    If passed, the time of this date will be modified,
   *                            keeping the date and timezone intact.
   */
  getDefaultStartDate(aReferenceDate) {
    let startDate = dtz.now();
    if (aReferenceDate) {
      const savedHour = startDate.hour;
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
  setDefaultStartEndHour(aItem, aReferenceDate) {
    aItem[dtz.startDateProp(aItem)] = dtz.getDefaultStartDate(aReferenceDate);

    if (aItem.isEvent()) {
      aItem.endDate = aItem.startDate.clone();
      aItem.endDate.minute += Services.prefs.getIntPref("calendar.event.defaultlength", 60);
    }
  },

  /**
   * Returns the property name used for the start date of an item, ie either an
   * event's start date or a task's entry date.
   */
  startDateProp(aItem) {
    if (aItem) {
      if (aItem.isEvent()) {
        return "startDate";
      } else if (aItem.isTodo()) {
        return "entryDate";
      }
    }
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  /**
   * Returns the property name used for the end date of an item, ie either an
   * event's end date or a task's due date.
   */
  endDateProp(aItem) {
    if (aItem) {
      if (aItem.isEvent()) {
        return "endDate";
      } else if (aItem.isTodo()) {
        return "dueDate";
      }
    }
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  /**
   * Check if the two dates are on the same day (ignoring time)
   *
   * @param date1     The left date to compare
   * @param date2     The right date to compare
   * @returns True, if dates are on the same day
   */
  sameDay(date1, date2) {
    if (date1 && date2) {
      if (date1.day == date2.day && date1.month == date2.month && date1.year == date2.year) {
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
  ensureDateTime(aDate) {
    if (!aDate || !aDate.isDate) {
      return aDate;
    }
    const newDate = aDate.clone();
    newDate.isDate = false;
    return newDate;
  },

  /**
   * Returns a calIDateTime corresponding to a javascript Date.
   *
   * @param aDate     a javascript date
   * @param aTimezone (optional) a timezone that should be enforced
   * @returns a calIDateTime
   *
   * @warning  Use of this function is strongly discouraged.  calIDateTime should
   *           be used directly whenever possible.
   *           If you pass a timezone, then the passed jsDate's timezone will be ignored,
   *           but only its local time portions are be taken.
   */
  jsDateToDateTime(aDate, aTimezone) {
    const newDate = lazy.cal.createDateTime();
    if (aTimezone) {
      newDate.resetTo(
        aDate.getFullYear(),
        aDate.getMonth(),
        aDate.getDate(),
        aDate.getHours(),
        aDate.getMinutes(),
        aDate.getSeconds(),
        aTimezone
      );
    } else {
      newDate.resetTo(
        aDate.getUTCFullYear(),
        aDate.getUTCMonth(),
        aDate.getUTCDate(),
        aDate.getUTCHours(),
        aDate.getUTCMinutes(),
        aDate.getUTCSeconds(),
        // Use the existing timezone instead of caldtz.UTC, or starting the
        // timezone service becomes a requirement in tests.
        newDate.timezone
      );
    }
    return newDate;
  },

  /**
   * Convert a calIDateTime to a Javascript date object. This is the
   * replacement for the former .jsDate property.
   *
   * @param cdt       The calIDateTime instance
   * @returns The Javascript date equivalent.
   */
  dateTimeToJsDate(cdt) {
    if (cdt.isDate) {
      return new Date(cdt.year, cdt.month, cdt.day);
    }

    if (cdt.timezone.isFloating) {
      return new Date(cdt.year, cdt.month, cdt.day, cdt.hour, cdt.minute, cdt.second);
    }
    return new Date(cdt.nativeTime / 1000);
  },

  /**
   * fromRFC3339
   * Convert a RFC3339 compliant Date string to a calIDateTime.
   *
   * @param aStr          The RFC3339 compliant Date String
   * @param aTimezone     The timezone this date string is most likely in
   * @returns A calIDateTime object
   */
  fromRFC3339(aStr, aTimezone) {
    // XXX I have not covered leapseconds (matches[8]), this might need to
    // be done. The only reference to leap seconds I found is bug 227329.
    const dateTime = lazy.cal.createDateTime();

    // Killer regex to parse RFC3339 dates
    const re = new RegExp(
      "^([0-9]{4})-([0-9]{2})-([0-9]{2})" +
        "([Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(\\.[0-9]+)?)?" +
        "(([Zz]|([+-])([0-9]{2}):([0-9]{2})))?"
    );

    const matches = re.exec(aStr);

    if (!matches) {
      return null;
    }

    // Set usual date components
    dateTime.isDate = matches[4] == null;

    dateTime.year = matches[1];
    dateTime.month = matches[2] - 1; // Jan is 0
    dateTime.day = matches[3];

    if (!dateTime.isDate) {
      dateTime.hour = matches[5];
      dateTime.minute = matches[6];
      dateTime.second = matches[7];
    }

    // Timezone handling
    if (matches[9] == "Z" || matches[9] == "z") {
      // If the dates timezone is "Z" or "z", then this is UTC, no matter
      // what timezone was passed
      dateTime.timezone = lazy.cal.dtz.UTC;
    } else if (matches[9] == null) {
      // We have no timezone info, only a date. We have no way to
      // know what timezone we are in, so lets assume we are in the
      // timezone of our local calendar, or whatever was passed.

      dateTime.timezone = aTimezone;
    } else {
      const offset_in_s = (matches[11] == "-" ? -1 : 1) * (matches[12] * 3600 + matches[13] * 60);

      // try local timezone first
      dateTime.timezone = aTimezone;

      // If offset does not match, go through timezones. This will
      // give you the first tz in the alphabet and kill daylight
      // savings time, but we have no other choice
      if (dateTime.timezoneOffset != offset_in_s) {
        // TODO A patch to Bug 363191 should make this more efficient.

        // Enumerate timezones, set them, check their offset
        for (const id of lazy.cal.timezoneService.timezoneIds) {
          dateTime.timezone = lazy.cal.timezoneService.getTimezone(id);
          if (dateTime.timezoneOffset == offset_in_s) {
            // This is our last step, so go ahead and return
            return dateTime;
          }
        }
        // We are still here: no timezone was found
        dateTime.timezone = lazy.cal.dtz.UTC;
        if (!dateTime.isDate) {
          dateTime.hour += (matches[11] == "-" ? -1 : 1) * matches[12];
          dateTime.minute += (matches[11] == "-" ? -1 : 1) * matches[13];
        }
      }
    }
    return dateTime;
  },

  /**
   * toRFC3339
   * Convert a calIDateTime to a RFC3339 compliant Date string
   *
   * @param aDateTime     The calIDateTime object
   * @returns The RFC3339 compliant date string
   */
  toRFC3339(aDateTime) {
    if (!aDateTime) {
      return "";
    }

    const full_tzoffset = aDateTime.timezoneOffset;
    const tzoffset_hr = Math.floor(Math.abs(full_tzoffset) / 3600);

    const tzoffset_mn = ((Math.abs(full_tzoffset) / 3600).toFixed(2) - tzoffset_hr) * 60;

    let str =
      aDateTime.year +
      "-" +
      ("00" + (aDateTime.month + 1)).substr(-2) +
      "-" +
      ("00" + aDateTime.day).substr(-2);

    // Time and Timezone extension
    if (!aDateTime.isDate) {
      str +=
        "T" +
        ("00" + aDateTime.hour).substr(-2) +
        ":" +
        ("00" + aDateTime.minute).substr(-2) +
        ":" +
        ("00" + aDateTime.second).substr(-2);
      if (aDateTime.timezoneOffset != 0) {
        str +=
          (full_tzoffset < 0 ? "-" : "+") +
          ("00" + tzoffset_hr).substr(-2) +
          ":" +
          ("00" + tzoffset_mn).substr(-2);
      } else if (aDateTime.timezone.isFloating) {
        // RFC3339 Section 4.3 Unknown Local Offset Convention
        str += "-00:00";
      } else {
        // ZULU Time, according to ISO8601's timezone-offset
        str += "Z";
      }
    }
    return str;
  },

  /**
   * Gets the list of recent timezones. Optionally returns the list as
   * calITimezones.
   *
   * @param aConvertZones     (optional) If true, return calITimezones instead
   * @returns An array of timezone ids or calITimezones.
   */
  getRecentTimezones(aConvertZones) {
    let recentTimezones = JSON.parse(
      Services.prefs.getStringPref("calendar.timezone.recent", "[]") || "[]"
    );
    if (!Array.isArray(recentTimezones)) {
      recentTimezones = [];
    }

    if (aConvertZones) {
      const oldZonesLength = recentTimezones.length;
      for (let i = 0; i < recentTimezones.length; i++) {
        const timezone = lazy.cal.timezoneService.getTimezone(recentTimezones[i]);
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
        Services.prefs.setStringPref(
          "calendar.timezone.recent",
          JSON.stringify(recentTimezones.map(zone => zone.tzid))
        );
      }
    }
    return recentTimezones;
  },

  /**
   * Returns a string representation of a given datetime. For example, to show
   * in the calendar item summary dialog.
   *
   * @param {calIDateTime} dateTime - Datetime to convert.
   * @returns {string} A string representation of the datetime.
   */
  getStringForDateTime(dateTime) {
    const kDefaultTimezone = lazy.cal.dtz.defaultTimezone;
    const localTime = dateTime.getInTimezone(kDefaultTimezone);
    const formatter = lazy.cal.dtz.formatter;
    const formattedLocalTime = formatter.formatDateTime(localTime);

    if (!dateTime.timezone.isFloating && dateTime.timezone.tzid != kDefaultTimezone.tzid) {
      // Additionally display the original datetime with timezone.
      const originalTime = lazy.cal.l10n.getCalString("datetimeWithTimezone", [
        formatter.formatDateTime(dateTime),
        dateTime.timezone.tzid,
      ]);
      return `${formattedLocalTime} (${originalTime})`;
    }
    return formattedLocalTime;
  },
};

// XXX: https://bugzilla.mozilla.org/show_bug.cgi?id=1745807 should drop the
// pattern seen here of "namespacing" calendar utils onto the `cal` object.
// Until that work is done, we ignore the lint requirement that lazy objects be
// named `lazy`.
// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(dtz, {
  formatter: "resource:///modules/calendar/utils/calDateTimeFormatter.sys.mjs",
});
