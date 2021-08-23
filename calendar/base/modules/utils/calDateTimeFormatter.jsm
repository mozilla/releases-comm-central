/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "gDateStringBundle", () =>
  Services.strings.createBundle("chrome://calendar/locale/dateFormat.properties")
);

XPCOMUtils.defineLazyPreferenceGetter(this, "dateFormat", "calendar.date.format", 0);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "timeBeforeDate",
  "calendar.date.formatTimeBeforeDate",
  false
);

/** Cache of calls to new Services.intl.DateTimeFormat. */
var formatCache = new Map();

/*
 * Date time formatting functions for display.
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.dtz.formatter namespace.

const EXPORTED_SYMBOLS = ["formatter"]; /* exported formatter */

var formatter = {
  /**
   * Format a date in either short or long format, depending on the users preference.
   *
   * @param {calIDateTime} aDate    The datetime to format.
   * @return {string}               A string representing the date part of the datetime.
   */
  formatDate(aDate) {
    // Format the date using user's format preference (long or short)
    return dateFormat == 0 ? this.formatDateLong(aDate) : this.formatDateShort(aDate);
  },

  /**
   * Format a date into a short format, for example "12/17/2005".
   *
   * @param {calIDateTime} aDate    The datetime to format.
   * @return {string}               A string representing the date part of the datetime.
   */
  formatDateShort(aDate) {
    return inTimezone(aDate, { dateStyle: "short" });
  },

  /**
   * Format a date into a long format, for example "Sat Dec 17 2005".
   *
   * @param {calIDateTime} aDate    The datetime to format.
   * @return {string}               A string representing the date part of the datetime.
   */
  formatDateLong(aDate) {
    return inTimezone(aDate, { dateStyle: "full" });
  },

  /**
   * Format a date into a short format without mentioning the year, for example "Dec 17"
   *
   * @param {calIDateTime} aDate    The datetime to format.
   * @return {string}               A string representing the date part of the datetime.
   */
  formatDateWithoutYear(aDate) {
    let dtOptions = { month: "short", day: "numeric" };
    return inTimezone(aDate, dtOptions);
  },

  /**
   * Format a time into the format specified by the OS settings. Will omit the seconds from the
   * output.
   *
   * @param {calIDateTime} aDate    The datetime to format.
   * @return {string}               A string representing the time part of the datetime.
   */
  formatTime(aDate) {
    if (aDate.isDate) {
      return gDateStringBundle.GetStringFromName("AllDay");
    }

    return inTimezone(aDate, { timeStyle: "short" });
  },

  /**
   * Format a datetime into the format specified by the OS settings. Will omit the seconds from the
   * output.
   *
   * @param {calIDateTime} aDate    The datetime to format.
   * @return {string}               A string representing the datetime.
   */
  formatDateTime(aDate) {
    let formattedDate = this.formatDate(aDate);
    let formattedTime = this.formatTime(aDate);

    if (timeBeforeDate) {
      return formattedTime + " " + formattedDate;
    }
    return formattedDate + " " + formattedTime;
  },

  /**
   * Format a time interval like formatInterval, but show only the time.
   *
   * @param {calIDateTime} aStartDate   The start of the interval.
   * @param {calIDateTime} aEndDate     The end of the interval.
   * @return {string}                   The formatted time interval.
   */
  formatTimeInterval(aStartDate, aEndDate) {
    if (!aStartDate && aEndDate) {
      return this.formatTime(aEndDate);
    }
    if (!aEndDate && aStartDate) {
      return this.formatTime(aStartDate);
    }
    if (!aStartDate && !aEndDate) {
      return "";
    }

    // TODO do we need l10n for this?
    // TODO should we check for the same day? The caller should know what
    // he is doing...
    return this.formatTime(aStartDate) + "\u2013" + this.formatTime(aEndDate);
  },

  /**
   * Format a date/time interval. The returned string may assume that the dates are so close to each
   * other, that it can leave out some parts of the part string denoting the end date.
   *
   * @param {calIDateTime} aStartDate        The start of the interval.
   * @param {calIDateTime} aEndDate          The end of the interval.
   * @return {string}                        A string describing the interval in a legible form.
   */
  formatInterval(aStartDate, aEndDate) {
    // Check for tasks without start and/or due date
    if (aEndDate == null && aStartDate == null) {
      return cal.l10n.getCalString("datetimeIntervalTaskWithoutDate");
    } else if (aEndDate == null) {
      let startDateString = this.formatDate(aStartDate);
      let startTime = this.formatTime(aStartDate);
      return cal.l10n.getCalString("datetimeIntervalTaskWithoutDueDate", [
        startDateString,
        startTime,
      ]);
    } else if (aStartDate == null) {
      let endDateString = this.formatDate(aEndDate);
      let endTime = this.formatTime(aEndDate);
      return cal.l10n.getCalString("datetimeIntervalTaskWithoutStartDate", [
        endDateString,
        endTime,
      ]);
    }
    // Here there are only events or tasks with both start and due date.
    // make sure start and end use the same timezone when formatting intervals:
    let endDate = aEndDate.getInTimezone(aStartDate.timezone);
    let testdate = aStartDate.clone();
    testdate.isDate = true;
    let sameDay = testdate.compare(endDate) == 0;
    if (aStartDate.isDate) {
      // All-day interval, so we should leave out the time part
      if (sameDay) {
        return this.formatDateLong(aStartDate);
      }
      let startDay = this.formatDayWithOrdinal(aStartDate.day);
      let startYear = aStartDate.year;
      let endDay = this.formatDayWithOrdinal(endDate.day);
      let endYear = endDate.year;
      if (aStartDate.year != endDate.year) {
        let startMonthName = cal.l10n.formatMonth(
          aStartDate.month + 1,
          "calendar",
          "daysIntervalBetweenYears"
        );
        let endMonthName = cal.l10n.formatMonth(
          aEndDate.month + 1,
          "calendar",
          "daysIntervalBetweenYears"
        );
        return cal.l10n.getCalString("daysIntervalBetweenYears", [
          startMonthName,
          startDay,
          startYear,
          endMonthName,
          endDay,
          endYear,
        ]);
      } else if (aStartDate.month == endDate.month) {
        let startMonthName = cal.l10n.formatMonth(
          aStartDate.month + 1,
          "calendar",
          "daysIntervalInMonth"
        );
        return cal.l10n.getCalString("daysIntervalInMonth", [
          startMonthName,
          startDay,
          endDay,
          endYear,
        ]);
      }
      let startMonthName = cal.l10n.formatMonth(
        aStartDate.month + 1,
        "calendar",
        "daysIntervalBetweenMonths"
      );
      let endMonthName = cal.l10n.formatMonth(
        aEndDate.month + 1,
        "calendar",
        "daysIntervalBetweenMonths"
      );
      return cal.l10n.getCalString("daysIntervalBetweenMonths", [
        startMonthName,
        startDay,
        endMonthName,
        endDay,
        endYear,
      ]);
    }
    let startDateString = this.formatDate(aStartDate);
    let startTime = this.formatTime(aStartDate);
    let endDateString = this.formatDate(endDate);
    let endTime = this.formatTime(endDate);
    // non-allday, so need to return date and time
    if (sameDay) {
      // End is on the same day as start, so we can leave out the end date
      if (startTime == endTime) {
        // End time is on the same time as start, so we can leave out the end time
        // "5 Jan 2006 13:00"
        return cal.l10n.getCalString("datetimeIntervalOnSameDateTime", [
          startDateString,
          startTime,
        ]);
      }
      // still include end time
      // "5 Jan 2006 13:00 - 17:00"
      return cal.l10n.getCalString("datetimeIntervalOnSameDay", [
        startDateString,
        startTime,
        endTime,
      ]);
    }
    // Spanning multiple days, so need to include date and time
    // for start and end
    // "5 Jan 2006 13:00 - 7 Jan 2006 9:00"
    return cal.l10n.getCalString("datetimeIntervalOnSeveralDays", [
      startDateString,
      startTime,
      endDateString,
      endTime,
    ]);
  },

  /**
   * Get the monthday followed by its ordinal symbol in the current locale.
   * e.g.  monthday 1 -> 1st
   *       monthday 2 -> 2nd etc.
   *
   * @param {number} aDay    A number from 1 to 31.
   * @return {string}        The monthday number in ordinal format in the current locale.
   */
  formatDayWithOrdinal(aDay) {
    let ordinalSymbols = gDateStringBundle.GetStringFromName("dayOrdinalSymbol").split(",");
    let dayOrdinalSymbol = ordinalSymbols[aDay - 1] || ordinalSymbols[0];
    return aDay + dayOrdinalSymbol;
  },

  /**
   * Format an interval that is defined by an item with the default timezone.
   *
   * @param {calIItemBase} aItem      The item describing the interval.
   * @return {string}                 The formatted item interval.
   */
  formatItemInterval(aItem) {
    return this.formatInterval(...getItemDates(aItem));
  },

  /**
   * Format a time interval like formatItemInterval, but only show times.
   *
   * @param {calIItemBase} aItem      The item describing the interval.
   * @return {string}                 The formatted item interval.
   */
  formatItemTimeInterval(aItem) {
    return this.formatTimeInterval(...getItemDates(aItem));
  },

  /**
   * Get the month name.
   *
   * @param {number} aMonthIndex      Zero-based month number (0 is january, 11 is december).
   * @return {string}                 The month name in the current locale.
   */
  monthName(aMonthIndex) {
    let oneBasedMonthIndex = aMonthIndex + 1;
    return gDateStringBundle.GetStringFromName("month." + oneBasedMonthIndex + ".name");
  },

  /**
   * Get the abbreviation of the month name.
   *
   * @param {number} aMonthIndex      Zero-based month number (0 is january, 11 is december).
   * @return {string}                 The abbreviated month name in the current locale.
   */
  shortMonthName(aMonthIndex) {
    let oneBasedMonthIndex = aMonthIndex + 1;
    return gDateStringBundle.GetStringFromName("month." + oneBasedMonthIndex + ".Mmm");
  },

  /**
   * Get the day name.
   *
   * @param {number} aMonthIndex      Zero-based day number (0 is sunday, 6 is saturday).
   * @return {string}                 The day name in the current locale.
   */
  dayName(aDayIndex) {
    let oneBasedDayIndex = aDayIndex + 1;
    return gDateStringBundle.GetStringFromName("day." + oneBasedDayIndex + ".name");
  },

  /**
   * Get the abbreviation of the day name.
   *
   * @param {number} aMonthIndex      Zero-based day number (0 is sunday, 6 is saturday).
   * @return {string}                 The abbrevidated day name in the current locale.
   */
  shortDayName(aDayIndex) {
    let oneBasedDayIndex = aDayIndex + 1;
    return gDateStringBundle.GetStringFromName("day." + oneBasedDayIndex + ".Mmm");
  },
};

/**
 * inTimezone returns a string with date formatted.
 *
 * @param  {calIDateTime} aDate    The date object holding the tz information.
 * @param  {Object} aOptions       The Intl.DateTimeFormatter options object.
 * @return {string}                The date as a string.
 */
function inTimezone(aDate, aOptions) {
  let cacheKey;
  let formatter;
  let timezone = aDate.timezone;

  if (timezone && (timezone.isUTC || timezone.icalComponent)) {
    let optionsWithTimezone = { ...aOptions, timeZone: timezone.tzid };

    cacheKey = JSON.stringify(optionsWithTimezone);
    if (formatCache.has(cacheKey)) {
      formatter = formatCache.get(cacheKey);
    } else {
      try {
        if (Services.appinfo.name === "xpcshell") {
          // Use en-US when running in a test to make the result independent of
          // the locale of the test machine.
          formatter = new Services.intl.DateTimeFormat("en-US", optionsWithTimezone);
        } else {
          formatter = new Services.intl.DateTimeFormat(undefined, optionsWithTimezone);
        }
        formatCache.set(cacheKey, formatter);
      } catch (ex) {
        // Non-IANA timezones throw a RangeError.
        cal.WARN(ex);
      }
    }
  }

  if (!formatter) {
    cacheKey = JSON.stringify(aOptions);
    if (formatCache.has(cacheKey)) {
      formatter = formatCache.get(cacheKey);
    } else {
      if (Services.appinfo.name === "xpcshell") {
        // Use en-US when running in a test to make the result independent of
        // the locale of the test machine.
        formatter = new Services.intl.DateTimeFormat("en-US", aOptions);
      } else {
        formatter = new Services.intl.DateTimeFormat(undefined, aOptions);
      }
      formatCache.set(cacheKey, formatter);
    }
  }

  return formatter.format(cal.dtz.dateTimeToJsDate(aDate));
}

/**
 * Helper to get the start/end dates for a given item.
 *
 * @param {calIItemBase} aItem              The item to get the dates for.
 * @return {[calIDateTime, calIDateTime]}   An array with start and end date.
 */
function getItemDates(aItem) {
  let start = aItem[cal.dtz.startDateProp(aItem)];
  let end = aItem[cal.dtz.endDateProp(aItem)];
  let kDefaultTimezone = cal.dtz.defaultTimezone;
  // Check for tasks without start and/or due date
  if (start) {
    start = start.getInTimezone(kDefaultTimezone);
  }
  if (end) {
    end = end.getInTimezone(kDefaultTimezone);
  }
  // EndDate is exclusive. For all-day events, we need to subtract one day,
  // to get into a format that's understandable.
  if (start && start.isDate && end) {
    end.day -= 1;
  }

  return [start, end];
}
