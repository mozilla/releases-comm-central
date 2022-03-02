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
   * Format a date into a long format without mentioning the year, for example
   * "Monday, December 17".
   *
   * @param {calIDateTime} aDate    The datetime to format.
   * @return {string}               A string representing the date part of the datetime.
   */
  formatDateLongWithoutYear(aDate) {
    return inTimezone(aDate, { weekday: "long", month: "long", day: "numeric" });
  },

  /**
   * Format the time portion of a date-time object. Note: only the hour and
   * minutes are shown.
   *
   * @param {calIDateTime} time - The date-time to format the time of.
   * @param {boolean} [preferEndOfDay = false] - Whether to prefer showing a
   *   midnight time as the end of a day, rather than the start of the day, if
   *   the time formatting allows for it. I.e. if the formatter would use a
   *   24-hour format, then this would show midnight as 24:00, rather than
   *   00:00.
   *
   * @return {string} A string representing the time.
   */
  formatTime(time, preferEndOfDay = false) {
    if (time.isDate) {
      return gDateStringBundle.GetStringFromName("AllDay");
    }

    let options = { timeStyle: "short" };
    let formatter = getFormatterWithTimezone(options, time.timezone);
    if (preferEndOfDay && time.hour == 0 && time.minute == 0) {
      // Midnight. Note that the timeStyle is short, so we don't test for
      // seconds.
      // Test what hourCycle the default formatter would use.
      if (formatter.resolvedOptions().hourCycle == "h23") {
        // Midnight start-of-day is 00:00, so we can show midnight end-of-day
        // as 24:00.
        options.hourCycle = "h24";
        formatter = getFormatterWithTimezone(options, time.timezone);
      }
      // NOTE: Regarding the other hourCycle values:
      // + "h24": This is not expected in any locale.
      // + "h12": In a 12-hour format that cycles 12 -> 1 -> ... -> 11, there is
      //   no convention to distinguish between midnight start-of-day and
      //   midnight end-of-day. So we do nothing.
      // + "h11": The ja-JP locale with a 12-hour format returns this. In this
      //   locale, midnight start-of-day is shown as "午前0:00" (i.e. 0 AM),
      //   which means midnight end-of-day can be shown as "午後12:00" (12 PM).
      //   However, Intl.DateTimeFormatter does not expose a means to do this.
      //   Just forcing a h12 hourCycle will show midnight as "午前12:00", which
      //   would be incorrect in this locale. Therefore, we similarly do nothing
      //   in this case as well.
    }

    return formatter.format(cal.dtz.dateTimeToJsDate(time));
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
 * Get a formatter that can be used to format a date-time in a
 * locale-appropriate way.
 *
 * NOTE: formatters are cached for future requests.
 *
 * @param {Object} formatOptions - Intl.DateTimeFormatter options.
 *
 * @return {DateTimeFormatter} - The formatter.
 */
function getFormatter(formatOptions) {
  let cacheKey = JSON.stringify(formatOptions);
  if (formatCache.has(cacheKey)) {
    return formatCache.get(cacheKey);
  }
  // Use en-US when running in a test to make the result independent of the test
  // machine.
  let locale = Services.appinfo.name == "xpcshell" ? "en-US" : Services.locale.appLocalesAsBCP47;
  let formatter;
  if ("hourCycle" in formatOptions) {
    // FIXME: The hourCycle property is currently ignored by Services.intl, so
    // we use Intl instead. Once bug 1749459 is closed, we should only use
    // Services.intl again.
    formatter = new Intl.DateTimeFormat(locale, formatOptions);
  } else {
    formatter = new Services.intl.DateTimeFormat(locale, formatOptions);
  }
  formatCache.set(cacheKey, formatter);
  return formatter;
}

/**
 * Get a formatter that can be used to format a date-time within the given
 * timezone. NOTE: some timezones may be ignored if they are not properly
 * handled.
 *
 * @param {Object} formatOptions - The basis Intl.DateTimeFormatter options.
 * @param {?calITimezone} timezone - The timezone to try and use.
 *
 * @return {DateTimeFormatter} - The formatter.
 */
function getFormatterWithTimezone(formatOptions, timezone) {
  if (timezone && (timezone.isUTC || timezone.icalComponent)) {
    let optionsWithTimezone = { ...formatOptions, timeZone: timezone.tzid };
    try {
      return getFormatter(optionsWithTimezone);
    } catch (ex) {
      // Non-IANA timezones throw a RangeError.
      cal.WARN(ex);
    }
  }
  return getFormatter(formatOptions);
}

/**
 * Format the given date or date-time. If a date-time object is given, it will
 * be shown in its timezone.
 *
 * @param {calIDateTime} date - The date or date-time to format.
 * @param {Object} formatOptions - The Intl.DateTimeFormatter options
 *   describing how to format the date.
 *
 * @return {string} - The date formatted as a string.
 */
function inTimezone(date, formatOptions) {
  return getFormatterWithTimezone(formatOptions, date.isDate ? null : date.timezone).format(
    cal.dtz.dateTimeToJsDate(date)
  );
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
