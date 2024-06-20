/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "gDateStringBundle", () =>
  Services.strings.createBundle("chrome://calendar/locale/dateFormat.properties")
);
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

XPCOMUtils.defineLazyPreferenceGetter(lazy, "dateFormat", "calendar.date.format", 0);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
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
// including calUtils.sys.mjs under the cal.dtz.formatter namespace.

export var formatter = {
  /**
   * Format a date in either short or long format, depending on the users preference.
   *
   * @param {calIDateTime} aDate - The datetime to format.
   * @returns {string} A string representing the date part of the datetime.
   */
  formatDate(aDate) {
    // Format the date using user's format preference (long or short)
    return lazy.dateFormat == 0 ? this.formatDateLong(aDate) : this.formatDateShort(aDate);
  },

  /**
   * Format a date into a short format, for example "12/17/2005".
   *
   * @param {calIDateTime} aDate - The datetime to format.
   * @returns {string} A string representing the date part of the datetime.
   */
  formatDateShort(aDate) {
    return formatDateTimeWithOptions(aDate, { dateStyle: "short" });
  },

  /**
   * Format a date into a long format, for example "Sat Dec 17 2005".
   *
   * @param {calIDateTime} aDate - The datetime to format.
   * @returns {string} A string representing the date part of the datetime.
   */
  formatDateLong(aDate) {
    return formatDateTimeWithOptions(aDate, { dateStyle: "full" });
  },

  /**
   * Format a date into a short format without mentioning the year, for example "Dec 17"
   *
   * @param {calIDateTime} aDate - The datetime to format.
   * @returns {string} A string representing the date part of the datetime.
   */
  formatDateWithoutYear(aDate) {
    return formatDateTimeWithOptions(aDate, { month: "short", day: "numeric" });
  },

  /**
   * Format a date into a long format without mentioning the year, for example
   * "Monday, December 17".
   *
   * @param {calIDateTime} aDate - The datetime to format.
   * @returns {string} A string representing the date part of the datetime.
   */
  formatDateLongWithoutYear(aDate) {
    return formatDateTimeWithOptions(aDate, { weekday: "long", month: "long", day: "numeric" });
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
   * @returns {string} A string representing the time.
   */
  formatTime(time, preferEndOfDay = false) {
    if (time.isDate) {
      return lazy.gDateStringBundle.GetStringFromName("AllDay");
    }

    const options = { timeStyle: "short" };
    if (preferEndOfDay && time.hour == 0 && time.minute == 0) {
      // Midnight. Note that the timeStyle is short, so we don't test for
      // seconds.
      // Test what hourCycle the default formatter would use.
      if (getFormatter(options).resolvedOptions().hourCycle == "h23") {
        // Midnight start-of-day is 00:00, so we can show midnight end-of-day
        // as 24:00.
        options.hourCycle = "h24";
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

    return formatDateTimeWithOptions(time, options);
  },

  /**
   * Format a datetime into the format specified by the OS settings. Will omit the seconds from the
   * output.
   *
   * @param {calIDateTime} aDate - The datetime to format.
   * @returns {string} A string representing the datetime.
   */
  formatDateTime(aDate) {
    const formattedDate = this.formatDate(aDate);
    const formattedTime = this.formatTime(aDate);

    if (lazy.timeBeforeDate) {
      return formattedTime + " " + formattedDate;
    }
    return formattedDate + " " + formattedTime;
  },

  /**
   * Format a time interval like formatInterval, but show only the time.
   *
   * @param {calIDateTime} aStartDate - The start of the interval.
   * @param {calIDateTime} aEndDate - The end of the interval.
   * @returns {string} The formatted time interval.
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
   * Format a date/time interval to a string. The returned string may assume
   * that the dates are so close to each other, that it can leave out some parts
   * of the part string denoting the end date.
   *
   * @param {calIDateTime} startDate - The start of the interval.
   * @param {calIDateTime} endDate - The end of the interval.
   * @returns {string} - A string describing the interval in a legible form.
   */
  formatInterval(startDate, endDate) {
    const format = this.formatIntervalParts(startDate, endDate);
    switch (format.type) {
      case "task-without-dates":
        return lazy.l10n.formatValueSync("datetime-interval-task-without-date");

      case "task-without-due-date":
        return lazy.l10n.formatValueSync("datetime-interval-task-without-due-date", {
          date: format.startDate,
          time: format.startTime,
        });

      case "task-without-start-date":
        return lazy.l10n.formatValueSync("datetime-interval-task-without-start-date", {
          date: format.endDate,
          time: format.endTime,
        });

      case "all-day":
        return format.startDate;

      case "all-day-between-years":
        return lazy.l10n.formatValueSync("days-interval-between-years", {
          startMonth: format.startMonth,
          startDayIndex: format.startDay,
          startYear: format.startYear,
          endMonth: format.endMonth,
          endDayIndex: format.endDay,
          endYear: format.endYear,
        });

      case "all-day-in-month":
        return lazy.l10n.formatValueSync("days-interval-in-month", {
          startMonth: format.month,
          startDayIndex: format.startDay,
          endDayIndex: format.endDay,
          year: format.year,
        });

      case "all-day-between-months":
        return lazy.l10n.formatValueSync("days-interval-between-months", {
          startMonth: format.startMonth,
          startDayIndex: format.startDay,
          endMonth: format.endMonth,
          endDayIndex: format.endDay,
          year: format.year,
        });

      case "same-date-time":
        return lazy.l10n.formatValueSync("datetime-interval-on-same-date-time", {
          startDate: format.startDate,
          startTime: format.startTime,
        });

      case "same-day":
        return lazy.l10n.formatValueSync("datetime-interval-on-same-day", {
          startDate: format.startDate,
          startTime: format.startTime,
          endTime: format.endTime,
        });

      case "several-days":
        return lazy.l10n.formatValueSync("datetime-interval-on-several-days", {
          startDate: format.startDate,
          startTime: format.startTime,
          endDate: format.endDate,
          endTime: format.endTime,
        });
      default:
        return "";
    }
  },

  /**
   * Object used to describe the parts of a formatted interval.
   *
   * @typedef {object} IntervalParts
   * @property {string} type
   *   Used to distinguish IntervalPart results.
   * @property {string?} startDate
   *   The full date of the start of the interval.
   * @property {string?} startTime
   *   The time part of the start of the interval.
   * @property {string?} startDay
   *   The day (of the month) the interval starts on.
   * @property {string?} startMonth
   *   The month the interval starts on.
   * @property {string?} startYear
   *   The year interval starts on.
   * @property {string?} endDate
   *   The full date of the end of the interval.
   * @property {string?} endTime
   *   The time part of the end of the interval.
   * @property {string?} endDay
   *   The day (of the month) the interval ends on.
   * @property {string?} endMonth
   *   The month the interval ends on.
   * @property {string?} endYear
   *   The year interval ends on.
   * @property {string?} month
   *   The month the interval occurs in when the start is all day and the
   *   interval does not span multiple months.
   * @property {string?} year
   *   The year the interval occurs in when the the start is all day and the
   *   interval does not span multiple years.
   */

  /**
   * Format a date interval into various parts suitable for building
   * strings that describe the interval. This result may leave out some parts of
   * either date based on the closeness of the two.
   *
   * @param {calIDateTime} startDate - The start of the interval.
   * @param {calIDateTime} endDate - The end of the interval.
   * @returns {IntervalParts} An object to be used to create an
   *                                       interval string.
   */
  formatIntervalParts(startDate, endDate) {
    if (endDate == null && startDate == null) {
      return { type: "task-without-dates" };
    }

    if (endDate == null) {
      return {
        type: "task-without-due-date",
        startDate: this.formatDate(startDate),
        startTime: this.formatTime(startDate),
      };
    }

    if (startDate == null) {
      return {
        type: "task-without-start-date",
        endDate: this.formatDate(endDate),
        endTime: this.formatTime(endDate),
      };
    }

    // Here there are only events or tasks with both start and due date.
    // make sure start and end use the same timezone when formatting intervals:
    const testdate = startDate.clone();
    testdate.isDate = true;
    const originalEndDate = endDate.clone();
    endDate = endDate.getInTimezone(startDate.timezone);
    const sameDay = testdate.compare(endDate) == 0;
    if (startDate.isDate) {
      // All-day interval, so we should leave out the time part
      if (sameDay) {
        return {
          type: "all-day",
          startDate: this.formatDateLong(startDate),
        };
      }

      const startDay = this.formatDayWithOrdinal(startDate.day);
      const startYear = String(startDate.year);
      const endDay = this.formatDayWithOrdinal(endDate.day);
      const endYear = String(endDate.year);
      if (startDate.year != endDate.year) {
        return {
          type: "all-day-between-years",
          startDay,
          startMonth: lazy.cal.l10n.formatMonth(startDate.month + 1, "days-interval-between-years"),
          startYear,
          endDay,
          endMonth: lazy.cal.l10n.formatMonth(
            originalEndDate.month + 1,
            "days-interval-between-years"
          ),
          endYear,
        };
      }

      if (startDate.month == endDate.month) {
        return {
          type: "all-day-in-month",
          startDay,
          month: lazy.cal.l10n.formatMonth(startDate.month + 1, "days-interval-in-month"),
          endDay,
          year: endYear,
        };
      }

      return {
        type: "all-day-between-months",
        startDay,
        startMonth: lazy.cal.l10n.formatMonth(startDate.month + 1, "days-interval-between-months"),
        endDay,
        endMonth: lazy.cal.l10n.formatMonth(
          originalEndDate.month + 1,
          "days-interval-between-months"
        ),
        year: endYear,
      };
    }

    const startDateString = this.formatDate(startDate);
    const startTime = this.formatTime(startDate);
    const endDateString = this.formatDate(endDate);
    const endTime = this.formatTime(endDate);
    // non-allday, so need to return date and time
    if (sameDay) {
      // End is on the same day as start, so we can leave out the end date
      if (startTime == endTime) {
        // End time is on the same time as start, so we can leave out the end time
        // "5 Jan 2006 13:00"
        return {
          type: "same-date-time",
          startDate: startDateString,
          startTime,
        };
      }
      // still include end time
      // "5 Jan 2006 13:00 - 17:00"
      return {
        type: "same-day",
        startDate: startDateString,
        startTime,
        endTime,
      };
    }

    // Spanning multiple days, so need to include date and time
    // for start and end
    // "5 Jan 2006 13:00 - 7 Jan 2006 9:00"
    return {
      type: "several-days",
      startDate: startDateString,
      startTime,
      endDate: endDateString,
      endTime,
    };
  },

  /**
   * Get the monthday followed by its ordinal symbol in the current locale.
   * e.g.  monthday 1 -> 1st
   *       monthday 2 -> 2nd etc.
   *
   * @param {number} aDay - A number from 1 to 31.
   * @returns {string} The monthday number in ordinal format in the current locale.
   */
  formatDayWithOrdinal(aDay) {
    const ordinalSymbols = lazy.gDateStringBundle.GetStringFromName("dayOrdinalSymbol").split(",");
    const dayOrdinalSymbol = ordinalSymbols[aDay - 1] || ordinalSymbols[0];
    return aDay + dayOrdinalSymbol;
  },

  /**
   * Helper to get the start/end dates for a given item.
   *
   * @param {calIItemBase} item - The item to get the dates for.
   * @returns {[calIDateTime, calIDateTime]} An array with start and end date.
   */
  getItemDates(item) {
    let start = item[lazy.cal.dtz.startDateProp(item)];
    let end = item[lazy.cal.dtz.endDateProp(item)];
    const kDefaultTimezone = lazy.cal.dtz.defaultTimezone;
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
  },

  /**
   * Format an interval that is defined by an item with the default timezone.
   *
   * @param {calIItemBase} aItem - The item describing the interval.
   * @returns {string} The formatted item interval.
   */
  formatItemInterval(aItem) {
    return this.formatInterval(...this.getItemDates(aItem));
  },

  /**
   * Format a time interval like formatItemInterval, but only show times.
   *
   * @param {calIItemBase} aItem - The item describing the interval.
   * @returns {string} The formatted item interval.
   */
  formatItemTimeInterval(aItem) {
    return this.formatTimeInterval(...this.getItemDates(aItem));
  },

  /**
   * Get the month name.
   *
   * @param {number} aMonthIndex - Zero-based month number (0 is january, 11 is december).
   * @returns {string} The month name in the current locale.
   */
  monthName(aMonthIndex) {
    const oneBasedMonthIndex = aMonthIndex + 1;
    return lazy.gDateStringBundle.GetStringFromName("month." + oneBasedMonthIndex + ".name");
  },

  /**
   * Get the abbreviation of the month name.
   *
   * @param {number} aMonthIndex - Zero-based month number (0 is january, 11 is december).
   * @returns {string} The abbreviated month name in the current locale.
   */
  shortMonthName(aMonthIndex) {
    const oneBasedMonthIndex = aMonthIndex + 1;
    return lazy.gDateStringBundle.GetStringFromName("month." + oneBasedMonthIndex + ".Mmm");
  },

  /**
   * Get the day name.
   *
   * @param {number} aDayIndex - Zero-based day number (0 is sunday, 6 is saturday).
   * @returns {string} The day name in the current locale.
   */
  dayName(aDayIndex) {
    const oneBasedDayIndex = aDayIndex + 1;
    return lazy.gDateStringBundle.GetStringFromName("day." + oneBasedDayIndex + ".name");
  },

  /**
   * Get the abbreviation of the day name.
   *
   * @param {number} aDayIndex - Zero-based day number (0 is sunday, 6 is saturday).
   * @returns {string} The abbrevidated day name in the current locale.
   */
  shortDayName(aDayIndex) {
    const oneBasedDayIndex = aDayIndex + 1;
    return lazy.gDateStringBundle.GetStringFromName("day." + oneBasedDayIndex + ".Mmm");
  },
};

/**
 * Determine whether a datetime is specified relative to the user, i.e. a date
 * or floating datetime, both of which should be displayed the same regardless
 * of the user's time zone.
 *
 * @param {calIDateTime} dateTime The datetime object to check.
 * @returns {boolean}
 */
function isDateTimeRelativeToUser(dateTime) {
  return dateTime.isDate || dateTime.timezone.isFloating;
}

/**
 * Format a datetime object as a string with a given set of formatting options.
 *
 * @param {calIDateTime} dateTime The datetime object to be formatted.
 * @param {object} options
 *  The set of Intl.DateTimeFormat options to use for formatting.
 * @returns {string} A formatted string representing the given datetime.
 */
function formatDateTimeWithOptions(dateTime, options) {
  const jsDate = getDateTimeAsAdjustedJsDate(dateTime);

  // We want floating datetimes and dates to be formatted without regard to
  // timezone; everything else has been adjusted so that "UTC" will produce the
  // correct result because we cannot guarantee that the datetime's timezone is
  // supported by Gecko.
  const timezone = isDateTimeRelativeToUser(dateTime) ? undefined : "UTC";

  return getFormatter({ ...options, timeZone: timezone }).format(jsDate);
}

/**
 * Convert a calendar datetime object to a JavaScript standard Date adjusted
 * for timezone offset.
 *
 * @param {calIDateTime} dateTime The datetime object to convert and adjust.
 * @returns {Date} The standard JS equivalent of the given datetime, offset
 *                 from UTC according to the datetime's timezone.
 */
function getDateTimeAsAdjustedJsDate(dateTime) {
  const unadjustedJsDate = lazy.cal.dtz.dateTimeToJsDate(dateTime);

  // If the datetime is date-only, it doesn't make sense to adjust for timezone.
  // Floating datetimes likewise are not fixed in a single timezone.
  if (isDateTimeRelativeToUser(dateTime)) {
    return unadjustedJsDate;
  }

  // We abuse `Date` slightly here: its internal representation is intended to
  // contain the date as seconds from the epoch, but `Intl` relies on adjusting
  // timezone and we can't be sure we have a recognized timezone ID. Instead, we
  // force the internal representation to compensate for timezone offset.
  const offsetInMs = dateTime.timezoneOffset * 1000;
  return new Date(unadjustedJsDate.valueOf() + offsetInMs);
}

/**
 * Get a formatter that can be used to format a date-time in a
 * locale-appropriate way.
 *
 * NOTE: formatters are cached for future requests.
 *
 * @param {object} formatOptions - Intl.DateTimeFormatter options.
 *
 * @returns {DateTimeFormatter} - The formatter.
 */
function getFormatter(formatOptions) {
  const cacheKey = JSON.stringify(formatOptions);
  if (formatCache.has(cacheKey)) {
    return formatCache.get(cacheKey);
  }

  // Use en-US when running in a test to make the result independent of the test
  // machine.
  const locale = Services.appinfo.name == "xpcshell" ? "en-US" : undefined;
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
