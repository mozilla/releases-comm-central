/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Date/time formatting functions for display. These functions should be used
 * to get the whole formatted string. DO NOT attempt to create date/time
 * strings by assembling parts.
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.dtz.formatter namespace.

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

/** Cache of calls to new Services.intl.DateTimeFormat. */
var formatCache = new Map();

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
   * Format only the day number. In most languages this just returns the day
   * given, but not all languages (notably Japanese and Korean).
   *
   * @param {calIDateTime} aDate - The datetime to format.
   * @returns {string}
   */
  formatDateOnly(aDate) {
    return formatDateTimeWithOptions(aDate, { day: "numeric" });
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
    return formatDateTimeWithOptions(aDate, {
      dateStyle: lazy.dateFormat == 0 ? "full" : "short",
      timeStyle: "short",
    });
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

    // We want floating datetimes and dates to be formatted without regard to
    // timezone; everything else has been adjusted so that "UTC" will produce the
    // correct result because we cannot guarantee that the datetime's timezone is
    // supported by Gecko.
    const timeZone = isDateTimeRelativeToUser(aStartDate) ? undefined : "UTC";
    return getFormatter({ timeStyle: "short", timeZone }).formatRange(
      getDateTimeAsAdjustedJsDate(aStartDate),
      getDateTimeAsAdjustedJsDate(aEndDate)
    );
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
    if (endDate == null && startDate == null) {
      return lazy.l10n.formatValueSync("datetime-interval-task-without-date");
    }

    if (endDate == null) {
      return lazy.l10n.formatValueSync("datetime-interval-task-without-due-date", {
        date: this.formatDate(startDate),
        time: this.formatTime(startDate),
      });
    }

    if (startDate == null) {
      return lazy.l10n.formatValueSync("datetime-interval-task-without-start-date", {
        date: this.formatDate(endDate),
        time: this.formatTime(endDate),
      });
    }

    // We want floating datetimes and dates to be formatted without regard to
    // timezone; everything else has been adjusted so that "UTC" will produce the
    // correct result because we cannot guarantee that the datetime's timezone is
    // supported by Gecko.
    const timeZone = isDateTimeRelativeToUser(startDate) ? undefined : "UTC";
    const options = {
      dateStyle: startDate.isDate ? "long" : "full",
      timeStyle: startDate.isDate ? undefined : "short",
      timeZone,
    };
    return getFormatter(options).formatRange(
      getDateTimeAsAdjustedJsDate(startDate),
      getDateTimeAsAdjustedJsDate(endDate)
    );
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
   * Format a month and year, using the short name for the month.
   *
   * @param {integer} year
   * @param {integer} month - Zero-indexed.
   * @returns {string}
   */
  formatMonthShort(year, month) {
    return getFormatter({ month: "short", year: "numeric" }).format(new Date(year, month, 15));
  },

  /**
   * Format a month and year, using the long name for the month.
   *
   * @param {integer} year
   * @param {integer} month - Zero-indexed.
   * @returns {string}
   */
  formatMonthLong(year, month) {
    return getFormatter({ month: "long", year: "numeric" }).format(new Date(year, month, 15));
  },

  /**
   * Format a year. In most languages this just returns the year given, but
   * not all languages (notably Japanese and Korean).
   *
   * @param {integer} year
   * @returns {string}
   */
  formatYear(year) {
    return getFormatter({ year: "numeric" }).format(new Date(year, 0, 15));
  },
};

/**
 * A zero-indexed array of narrow weekday names in the current locale.
 * DO NOT use these to construct a date string from parts.
 */
ChromeUtils.defineLazyGetter(formatter, "narrowWeekdayNames", function () {
  const weekdayFormatter = getFormatter({ weekday: "narrow" });
  return [
    weekdayFormatter.format(new Date(2001, 0, 7)), // en: S, ja: 日, de: S
    weekdayFormatter.format(new Date(2001, 0, 1)), // en: M, ja: 月, de: M
    weekdayFormatter.format(new Date(2001, 0, 2)), // en: T, ja: 火, de: D
    weekdayFormatter.format(new Date(2001, 0, 3)), // en: W, ja: 水, de: M
    weekdayFormatter.format(new Date(2001, 0, 4)), // en: T, ja: 木, de: D
    weekdayFormatter.format(new Date(2001, 0, 5)), // en: F, ja: 金, de: F
    weekdayFormatter.format(new Date(2001, 0, 6)), // en: S, ja: 土, de: S
  ];
});

/**
 * A zero-indexed array of short weekday names in the current locale.
 * DO NOT use these to construct a date string from parts.
 */
ChromeUtils.defineLazyGetter(formatter, "shortWeekdayNames", function () {
  const weekdayFormatter = getFormatter({ weekday: "short" });
  return [
    weekdayFormatter.format(new Date(2001, 0, 7)), // en: Sun, ja: 日, de: So
    weekdayFormatter.format(new Date(2001, 0, 1)), // en: Mon, ja: 月, de: Mo
    weekdayFormatter.format(new Date(2001, 0, 2)), // en: Tue, ja: 火, de: Di
    weekdayFormatter.format(new Date(2001, 0, 3)), // en: Wed, ja: 水, de: Mi
    weekdayFormatter.format(new Date(2001, 0, 4)), // en: Thu, ja: 木, de: Do
    weekdayFormatter.format(new Date(2001, 0, 5)), // en: Fri, ja: 金, de: Fr
    weekdayFormatter.format(new Date(2001, 0, 6)), // en: Sat, ja: 土, de: Sa
  ];
});

/**
 * A zero-indexed array of weekday names in the current locale.
 * DO NOT use these to construct a date string from parts.
 */
ChromeUtils.defineLazyGetter(formatter, "weekdayNames", function () {
  const weekdayFormatter = getFormatter({ weekday: "long" });
  return [
    weekdayFormatter.format(new Date(2001, 0, 7)), // en: Sunday, ja: 日曜日, de: Sonntag
    weekdayFormatter.format(new Date(2001, 0, 1)), // en: Monday, ja: 月曜日, de: Montag
    weekdayFormatter.format(new Date(2001, 0, 2)), // en: Tuesday, ja: 火曜日, de: Dienstag
    weekdayFormatter.format(new Date(2001, 0, 3)), // en: Wednesday, ja: 水曜日, de: Mittwoch
    weekdayFormatter.format(new Date(2001, 0, 4)), // en: Thursday, ja: 木曜日, de: Donnerstag
    weekdayFormatter.format(new Date(2001, 0, 5)), // en: Friday, ja: 金曜日, de: Freitag
    weekdayFormatter.format(new Date(2001, 0, 6)), // en: Saturday, ja: 土曜日, de: Samstag
  ];
});

/**
 * A zero-indexed array of month names in the current locale.
 * DO NOT use these to construct a date string from parts.
 */
ChromeUtils.defineLazyGetter(formatter, "monthNames", function () {
  const monthFormatter = getFormatter({ month: "long" });
  return [
    monthFormatter.format(new Date(2001, 0, 1)), // en: January, ja: 1月, de: Januar
    monthFormatter.format(new Date(2001, 1, 1)), // en: February, ja: 2月, de: Februar
    monthFormatter.format(new Date(2001, 2, 1)), // en: March, ja: 3月, de: März
    monthFormatter.format(new Date(2001, 3, 1)), // en: April, ja: 4月, de: April
    monthFormatter.format(new Date(2001, 4, 1)), // en: May, ja: 5月, de: Mai
    monthFormatter.format(new Date(2001, 5, 1)), // en: June, ja: 6月, de: Juni
    monthFormatter.format(new Date(2001, 6, 1)), // en: July, ja: 7月, de: Juli
    monthFormatter.format(new Date(2001, 7, 1)), // en: August, ja: 8月, de: August
    monthFormatter.format(new Date(2001, 8, 1)), // en: September, ja: 9月, de: September
    monthFormatter.format(new Date(2001, 9, 1)), // en: October, ja: 10月, de: Oktober
    monthFormatter.format(new Date(2001, 10, 1)), // en: November, ja: 11月, de: November
    monthFormatter.format(new Date(2001, 11, 1)), // en: December, ja: 12月, de: Dezember
  ];
});

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
  let dateTimeFormat;
  if ("hourCycle" in formatOptions) {
    // FIXME: The hourCycle property is currently ignored by Services.intl, so
    // we use Intl instead. Once bug 1749459 is closed, we should only use
    // Services.intl again.
    dateTimeFormat = new Intl.DateTimeFormat(locale, formatOptions);
  } else {
    dateTimeFormat = new Services.intl.DateTimeFormat(locale, formatOptions);
  }

  formatCache.set(cacheKey, dateTimeFormat);
  return dateTimeFormat;
}
