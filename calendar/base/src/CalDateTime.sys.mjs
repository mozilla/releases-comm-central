/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ICAL, unwrap, unwrapSetter } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

const lazy = {};
ChromeUtils.defineModuleGetter(lazy, "CalDuration", "resource:///modules/CalDuration.jsm");
ChromeUtils.defineModuleGetter(lazy, "CalTimezone", "resource:///modules/CalTimezone.jsm");

var UNIX_TIME_TO_PRTIME = 1000000;

export function CalDateTime(innerObject) {
  this.wrappedJSObject = this;
  this.innerObject = innerObject || ICAL.Time.epochTime.clone();
}

CalDateTime.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIDateTime"]),
  classID: Components.ID("{36783242-ec94-4d8a-9248-d2679edd55b9}"),

  isMutable: true,
  makeImmutable() {
    this.isMutable = false;
  },
  clone() {
    return new CalDateTime(this.innerObject.clone());
  },

  isValid: true,
  innerObject: null,

  get nativeTime() {
    return this.innerObject.toUnixTime() * UNIX_TIME_TO_PRTIME;
  },
  set nativeTime(val) {
    this.innerObject.fromUnixTime(val / UNIX_TIME_TO_PRTIME);
  },

  get year() {
    return this.innerObject.year;
  },
  set year(val) {
    this.innerObject.year = parseInt(val, 10);
  },

  get month() {
    return this.innerObject.month - 1;
  },
  set month(val) {
    this.innerObject.month = val + 1;
  },

  get day() {
    return this.innerObject.day;
  },
  set day(val) {
    this.innerObject.day = parseInt(val, 10);
  },

  get hour() {
    return this.innerObject.hour;
  },
  set hour(val) {
    this.innerObject.hour = parseInt(val, 10);
  },

  get minute() {
    return this.innerObject.minute;
  },
  set minute(val) {
    this.innerObject.minute = parseInt(val, 10);
  },

  get second() {
    return this.innerObject.second;
  },
  set second(val) {
    this.innerObject.second = parseInt(val, 10);
  },

  get timezone() {
    return new lazy.CalTimezone(this.innerObject.zone);
  },
  set timezone(rawval) {
    unwrapSetter(
      ICAL.Timezone,
      rawval,
      function (val) {
        this.innerObject.zone = val;
        return val;
      },
      this
    );
  },

  resetTo(year, month, day, hour, minute, second, timezone) {
    this.innerObject.fromData({
      year,
      month: month + 1,
      day,
      hour,
      minute,
      second,
    });
    this.timezone = timezone;
  },

  reset() {
    this.innerObject.reset();
  },

  get timezoneOffset() {
    return this.innerObject.utcOffset();
  },
  get isDate() {
    return this.innerObject.isDate;
  },
  set isDate(val) {
    this.innerObject.isDate = !!val;
  },

  get weekday() {
    return this.innerObject.dayOfWeek() - 1;
  },
  get yearday() {
    return this.innerObject.dayOfYear();
  },

  toString() {
    return this.innerObject.toString();
  },

  toJSON() {
    return this.toString();
  },

  getInTimezone: unwrap(ICAL.Timezone, function (val) {
    return new CalDateTime(this.innerObject.convertToZone(val));
  }),

  addDuration: unwrap(ICAL.Duration, function (val) {
    this.innerObject.addDuration(val);
  }),

  subtractDate: unwrap(ICAL.Time, function (val) {
    return new lazy.CalDuration(this.innerObject.subtractDateTz(val));
  }),

  compare: unwrap(ICAL.Time, function (val) {
    let a = this.innerObject;
    let b = val;

    // If either this or aOther is floating, both objects are treated
    // as floating for the comparison.
    if (a.zone == ICAL.Timezone.localTimezone || b.zone == ICAL.Timezone.localTimezone) {
      a = a.convertToZone(ICAL.Timezone.localTimezone);
      b = b.convertToZone(ICAL.Timezone.localTimezone);
    }

    if (a.isDate || b.isDate) {
      // Calendar expects 20120101 and 20120101T010101 to be equal
      return a.compareDateOnlyTz(b, a.zone);
    }
    // If both are dates or date-times, then just do the normal compare
    return a.compare(b);
  }),

  get startOfWeek() {
    return new CalDateTime(this.innerObject.startOfWeek());
  },
  get endOfWeek() {
    return new CalDateTime(this.innerObject.endOfWeek());
  },
  get startOfMonth() {
    return new CalDateTime(this.innerObject.startOfMonth());
  },
  get endOfMonth() {
    return new CalDateTime(this.innerObject.endOfMonth());
  },
  get startOfYear() {
    return new CalDateTime(this.innerObject.startOfYear());
  },
  get endOfYear() {
    return new CalDateTime(this.innerObject.endOfYear());
  },

  get icalString() {
    return this.innerObject.toICALString();
  },
  set icalString(val) {
    let jcalString;
    if (val.length > 10) {
      jcalString = ICAL.design.icalendar.value["date-time"].fromICAL(val);
    } else {
      jcalString = ICAL.design.icalendar.value.date.fromICAL(val);
    }
    this.innerObject = ICAL.Time.fromString(jcalString);
  },
};
