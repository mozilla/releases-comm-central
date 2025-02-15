/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const SUNDAY = 0;
const THURSDAY = 4;

export function CalWeekInfoService() {
  this.wrappedJSObject = this;
}

/** @implements {calIWeekInfoService} */
CalWeekInfoService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIWeekInfoService"]),
  classID: Components.ID("{6877bbdd-f336-46f5-98ce-fe86d0285cc1}"),

  /**
   * @param {calIDateTime} aDateTime - A date time object
   */
  getWeekTitle(aDateTime) {
    /**
     * This implementation is based on the ISO 8601 standard.
     * ISO 8601 defines week one as the first week with at least 4
     * days, and defines Monday as the first day of the week.
     * Equivalently, the week one is the week with the first Thursday.
     *
     * This implementation uses the second definition, because it
     * enables the user to set a different start-day of the week
     * (Sunday instead of Monday is a common setting).  If the first
     * definition was used, all week-numbers could be off by one
     * depending on the week start day.  (For example, if weeks start
     * on Sunday, a year that starts on Thursday has only 3 days
     * [Thu-Sat] in that week, so it would be part of the last week of
     * the previous year, but if weeks start on Monday, the year would
     * have four days [Thu-Sun] in that week, so it would be counted
     * as week 1.)
     */

    // The week number is the number of days since the start of week 1,
    // divided by 7 and rounded up. Week 1 is the week containing the first
    // Thursday of the year.
    // Thus, the week number of any day is the same as the number of days
    // between the Thursday of that week and the Thursday of week 1, divided
    // by 7 and rounded up. (This takes care of days at end/start of a year
    // which may be part of first/last week in the other year.)
    // The Thursday of a week is the Thursday that follows the first day
    // of the week.
    // The week number of a day is the same as the week number of the first
    // day of the week. (This takes care of days near the start of the year,
    // which may be part of the week counted in the previous year.) So we
    // need the startWeekday.

    // The number of days since the start of the week.
    // Notice that the result of the subtraction might be negative.
    // We correct for that by adding 7, and then using the remainder operator.
    const startWeekday = Services.prefs.getIntPref("calendar.week.start", SUNDAY);
    const sinceStartOfWeek = (aDateTime.weekday - startWeekday + 7) % 7;

    // The number of days to Thursday is the difference between Thursday
    // and the start-day of the week (again corrected for negative values).
    const startToThursday = (THURSDAY - startWeekday + 7) % 7;

    // The yearday number of the Thursday this week.
    let thisWeeksThursday = aDateTime.yearday - sinceStartOfWeek + startToThursday;

    if (thisWeeksThursday < 1) {
      // For the first few days of the year, we still are in week 52 or 53.
      const lastYearDate = aDateTime.clone();
      lastYearDate.year -= 1;
      thisWeeksThursday += lastYearDate.endOfYear.yearday;
    } else if (thisWeeksThursday > aDateTime.endOfYear.yearday) {
      // For the last few days of the year, we already are in week 1.
      thisWeeksThursday -= aDateTime.endOfYear.yearday;
    }

    const weekNumber = Math.ceil(thisWeeksThursday / 7);
    return weekNumber;
  },

  /**
   * Gets the first day of a week of a passed day under consideration
   * of the preference setting "calendar.week.start"
   *
   * @param {calIDateTime} aDate - A date time object
   * @returns {calIDateTime} a dateTime-object denoting the first day of the week.
   */
  getStartOfWeek(aDate) {
    const startWeekday = Services.prefs.getIntPref("calendar.week.start", SUNDAY);
    const date = aDate.clone();
    date.isDate = true;
    const offset = startWeekday - aDate.weekday;
    date.day += offset;
    if (offset > 0) {
      date.day -= 7;
    }
    return date;
  },

  /**
   * gets the last day of a week of a passed day under consideration
   * of the preference setting "calendar.week.start"
   *
   * @param {calIDateTime} aDate - A date time object.
   * @returns {calIDateTime} a dateTime-object denoting the last day of the week.
   */
  getEndOfWeek(aDate) {
    const date = this.getStartOfWeek(aDate);
    date.day += 6;
    return date;
  },
};
