/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

function calDateTimeFormatter() {
  this.wrappedJSObject = this;
  this.mDateStringBundle = Services.strings.createBundle(
    "chrome://calendar/locale/dateFormat.properties"
  );
}
calDateTimeFormatter.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIDateTimeFormatter]),
  classID: Components.ID("{4123da9a-f047-42da-a7d0-cc4175b9f36a}"),

  formatDate: function(aDate) {
    // Format the date using user's format preference (long or short)
    let format = Services.prefs.getIntPref("calendar.date.format", 0);
    return format == 0 ? this.formatDateLong(aDate) : this.formatDateShort(aDate);
  },

  formatDateShort: function(aDate) {
    return this._inTimezone(aDate, { dateStyle: "short" });
  },

  formatDateLong: function(aDate) {
    return this._inTimezone(aDate, { dateStyle: "full" });
  },

  formatDateWithoutYear: function(aDate) {
    let dtOptions = { month: "short", day: "numeric" };
    return this._inTimezone(aDate, dtOptions);
  },

  formatTime: function(aDate) {
    if (aDate.isDate) {
      return this.mDateStringBundle.GetStringFromName("AllDay");
    }

    return this._inTimezone(aDate, { timeStyle: "short" });
  },

  formatDateTime: function(aDate) {
    let formattedDate = this.formatDate(aDate);
    let formattedTime = this.formatTime(aDate);

    let timeBeforeDate = Services.prefs.getBoolPref("calendar.date.formatTimeBeforeDate", false);
    if (timeBeforeDate) {
      return formattedTime + " " + formattedDate;
    } else {
      return formattedDate + " " + formattedTime;
    }
  },

  /**
   * _inTimezone returns a string with date formatted
   *
   * @param  {calIDateTime} aDate    The date object holding the tz information
   * @param  {JsObject}     aOptions The options object for formatting.
   * @return {String}                The date as a string.
   */
  _inTimezone: function(aDate, aOptions) {
    let formatter = new Services.intl.DateTimeFormat(undefined, aOptions);

    let timezone = aDate.timezone;
    // We set the tz only if we have a valid tz - otherwise localtime will be used on formatting.
    if (timezone && (timezone.isUTC || timezone.icalComponent)) {
      aOptions.timeZone = timezone.tzid;
      try {
        formatter = new Services.intl.DateTimeFormat(undefined, aOptions);
      } catch (ex) {
        // Non-IANA timezones throw a RangeError.
        cal.WARN(ex);
      }
    }

    return formatter.format(cal.dtz.dateTimeToJsDate(aDate));
  },

  formatTimeInterval: function(aStartDate, aEndDate) {
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

  formatInterval: function(aStartDate, aEndDate) {
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
      } else {
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
        } else {
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
      }
    } else {
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
        } else {
          // still include end time
          // "5 Jan 2006 13:00 - 17:00"
          return cal.l10n.getCalString("datetimeIntervalOnSameDay", [
            startDateString,
            startTime,
            endTime,
          ]);
        }
      } else {
        // Spanning multiple days, so need to include date and time
        // for start and end
        // "5 Jan 2006 13:00 - 7 Jan 2006 9:00"
        return cal.l10n.getCalString("datetimeIntervalOnSeveralDays", [
          startDateString,
          startTime,
          endDateString,
          endTime,
        ]);
      }
    }
  },

  formatDayWithOrdinal: function(aDay) {
    let ordinalSymbols = this.mDateStringBundle.GetStringFromName("dayOrdinalSymbol").split(",");
    let dayOrdinalSymbol = ordinalSymbols[aDay - 1] || ordinalSymbols[0];
    return aDay + dayOrdinalSymbol;
  },

  _getItemDates: function(aItem) {
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
  },

  formatItemInterval: function(aItem) {
    return this.formatInterval(...this._getItemDates(aItem));
  },

  formatItemTimeInterval: function(aItem) {
    return this.formatTimeInterval(...this._getItemDates(aItem));
  },

  monthName: function(aMonthIndex) {
    let oneBasedMonthIndex = aMonthIndex + 1;
    return this.mDateStringBundle.GetStringFromName("month." + oneBasedMonthIndex + ".name");
  },

  shortMonthName: function(aMonthIndex) {
    let oneBasedMonthIndex = aMonthIndex + 1;
    return this.mDateStringBundle.GetStringFromName("month." + oneBasedMonthIndex + ".Mmm");
  },

  dayName: function(aDayIndex) {
    let oneBasedDayIndex = aDayIndex + 1;
    return this.mDateStringBundle.GetStringFromName("day." + oneBasedDayIndex + ".name");
  },

  shortDayName: function(aDayIndex) {
    let oneBasedDayIndex = aDayIndex + 1;
    return this.mDateStringBundle.GetStringFromName("day." + oneBasedDayIndex + ".Mmm");
  },
};
