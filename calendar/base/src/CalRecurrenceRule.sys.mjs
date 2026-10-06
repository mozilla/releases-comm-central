/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import ICAL from "resource:///modules/calendar/Ical.sys.mjs";
import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "calendar",
    maxLogLevel: "Warn",
    maxLogLevelPref: "calendar.loglevel",
  });
});
ChromeUtils.defineESModuleGetters(lazy, {
  CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
  CalIcalProperty: "resource:///modules/CalICSService.sys.mjs",
});

/**
 * The BY* parts that expand the recurrence set of each supported frequency,
 * rather than limiting it. See RFC 5545, section 3.3.10, table 1.
 */
const EXPANDING_PARTS = {
  HOURLY: ["BYMINUTE", "BYSECOND"],
  DAILY: ["BYHOUR", "BYMINUTE", "BYSECOND"],
  WEEKLY: ["BYDAY", "BYHOUR", "BYMINUTE", "BYSECOND"],
  MONTHLY: ["BYMONTHDAY", "BYDAY", "BYHOUR", "BYMINUTE", "BYSECOND"],
  YEARLY: [
    "BYMONTH",
    "BYWEEKNO",
    "BYYEARDAY",
    "BYMONTHDAY",
    "BYDAY",
    "BYHOUR",
    "BYMINUTE",
    "BYSECOND",
  ],
};

/** The longest a single period of each supported frequency can be, in hours. */
const PERIOD_HOURS = {
  HOURLY: 1,
  DAILY: 24,
  WEEKLY: 7 * 24,
  MONTHLY: 31 * 24,
  YEARLY: 366 * 24,
};

/**
 * How many instances a rule may expand to per hour of its period. Hourly is
 * the shortest frequency we support, and the BY* parts of a rule cannot be
 * counted exactly without expanding them, so allow twice that.
 */
const MAX_INSTANCES_PER_HOUR = 2;

/**
 * The most occurrences a single rule will return while answering one query.
 * A rule reaching this is malformed or hostile; iterating it to the end would
 * exhaust memory and hang the application.
 */
const MAX_OCCURRENCES_PER_QUERY = 10000;

/** The length of the period of each frequency with a fixed length, in seconds. */
const PERIOD_SECONDS = {
  HOURLY: 60 * 60,
  DAILY: 24 * 60 * 60,
  WEEKLY: 7 * 24 * 60 * 60,
};

export function CalRecurrenceRule(innerObject) {
  this.innerObject = innerObject || new ICAL.Recur();
  this.wrappedJSObject = this;
}

var calRecurrenceRuleInterfaces = [Ci.calIRecurrenceRule, Ci.calIRecurrenceItem];
var calRecurrenceRuleClassID = Components.ID("{df19281a-5389-4146-b941-798cb93a7f0d}");
CalRecurrenceRule.prototype = {
  QueryInterface: cal.generateQI(["calIRecurrenceRule", "calIRecurrenceItem"]),
  classID: calRecurrenceRuleClassID,
  classInfo: cal.generateCI({
    contractID: "@mozilla.org/calendar/recurrence-rule;1",
    classDescription: "Calendar Recurrence Rule",
    classID: calRecurrenceRuleClassID,
    interfaces: calRecurrenceRuleInterfaces,
  }),

  innerObject: null,

  isMutable: true,
  makeImmutable() {
    this.isMutable = false;
  },
  ensureMutable() {
    if (!this.isMutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
  },
  clone() {
    return new CalRecurrenceRule(new ICAL.Recur(this.innerObject));
  },

  isNegative: false, // We don't support EXRULE anymore
  get isFinite() {
    return this.innerObject.isFinite();
  },

  /**
   * Tests whether this rule is one we are able to expand. A warning is logged
   * for every rule that isn't, and no occurrences are generated for it.
   *
   * Unsupported are the "SECONDLY" and "MINUTELY" frequencies, and rules whose
   * BY* parts expand a single period into far more instances than the shortest
   * frequency we do support would. The latter can be written in about a
   * kilobyte and expand to hundreds of millions of instances.
   *
   * @returns {boolean}
   */
  isSupported() {
    const { freq, parts } = this.innerObject;
    if (!(freq in EXPANDING_PARTS)) {
      lazy.log.warn(
        `The frequency value "${freq}" is currently not supported. No occurrences will be generated.`
      );
      return false;
    }

    let instances = 1;
    for (const part of EXPANDING_PARTS[freq]) {
      // Given a BYMONTHDAY or BYYEARDAY part, BYDAY limits the set instead of
      // expanding it.
      if (part == "BYDAY" && (parts.BYMONTHDAY || parts.BYYEARDAY)) {
        continue;
      }
      instances *= parts[part]?.length || 1;
    }
    const maxInstances = MAX_INSTANCES_PER_HOUR * PERIOD_HOURS[freq];
    if (instances > maxInstances) {
      lazy.log.warn(
        `The rule "${this.innerObject}" expands to ${instances} instances per period, ` +
          `more than the ${maxInstances} supported. No occurrences will be generated.`
      );
      return false;
    }
    return true;
  },

  /**
   * Finds a start date to iterate the rule from that gives the same
   * occurrences as the real start date from some time before the target on,
   * so that a long-running series doesn't have to be iterated from its very
   * beginning. The start date is moved forward a whole number of intervals,
   * which keeps the periods aligned and keeps every value the iterator takes
   * from the start date in place.
   *
   * @param {ICAL.Time} aStartTime - The start date of the series.
   * @param {ICAL.Time} aTarget - The time occurrences are needed from.
   * @returns {ICAL.Time} The start date to iterate from.
   */
  iterationStart(aStartTime, aTarget) {
    const { freq, count } = this.innerObject;
    const interval = Math.max(this.innerObject.interval || 1, 1);
    if (count) {
      return aStartTime;
    }

    let units;
    if (freq in PERIOD_SECONDS) {
      if (freq == "HOURLY" && aStartTime.isDate) {
        return aStartTime;
      }
      units = Math.floor((aTarget.toUnixTime() - aStartTime.toUnixTime()) / PERIOD_SECONDS[freq]);
    } else if (freq == "MONTHLY" || freq == "YEARLY") {
      units = aTarget.year - aStartTime.year;
      if (freq == "MONTHLY") {
        units = units * 12 + aTarget.month - aStartTime.month;
      }
    } else {
      return aStartTime;
    }

    // Stay a couple of intervals clear of the target, so that daylight saving
    // time, time zones and periods spilling into the next one, like the last
    // week of a year, can't move any occurrence the target needs out of reach.
    let steps = Math.floor(units / interval) - 2;
    let start;
    if (freq == "MONTHLY" || freq == "YEARLY") {
      // The day of the month mustn't change, so step back to a month that has
      // it, like the series itself skips the months that don't. Only long
      // intervals can run out of tries, and those have few periods to iterate.
      for (let tries = 0; steps > 0 && tries < 10; steps--, tries++) {
        const months = steps * interval * (freq == "MONTHLY" ? 1 : 12);
        const year = aStartTime.year + Math.floor((aStartTime.month - 1 + months) / 12);
        const month = ((aStartTime.month - 1 + months) % 12) + 1;
        if (aStartTime.day <= ICAL.Time.daysInMonth(month, year)) {
          start = aStartTime.clone();
          start.year = year;
          start.month = month;
          break;
        }
      }
    } else if (steps > 0) {
      start = aStartTime.clone();
      const shift = steps * interval;
      if (freq == "HOURLY") {
        start.adjust(0, shift, 0, 0);
      } else {
        start.adjust(shift * (freq == "WEEKLY" ? 7 : 1), 0, 0, 0);
      }
    }
    return start && start.compare(aTarget) < 0 ? start : aStartTime;
  },

  getNextOccurrence(aStartTime, aRecId) {
    if (!this.isSupported()) {
      return null;
    }
    aStartTime = aStartTime.wrappedJSObject.innerObject;
    aRecId = aRecId.wrappedJSObject.innerObject;
    const val = this.innerObject.getNextOccurrence(this.iterationStart(aStartTime, aRecId), aRecId);
    return val ? new lazy.CalDateTime(val) : null;
  },

  cachingIterator: null,
  getOccurrences(aStartTime, aRangeStart, aRangeEnd, aMaxCount) {
    if (!this.isSupported()) {
      return [];
    }
    aStartTime = aStartTime.wrappedJSObject.innerObject;
    aRangeStart = aRangeStart.wrappedJSObject.innerObject;
    aRangeEnd = aRangeEnd.wrappedJSObject.innerObject;

    if (!aMaxCount && !aRangeEnd && this.count == 0 && this.until == null) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    const occurrences = [];
    const rangeStart = aRangeStart.clone();
    rangeStart.isDate = false;

    let dtend = null;

    if (aRangeEnd) {
      dtend = aRangeEnd.clone();
      dtend.isDate = false;

      // If the start of the recurrence is past the end, we have no dates
      if (aStartTime.compare(dtend) >= 0) {
        return [];
      }
    }

    const iterationStart = this.iterationStart(aStartTime, rangeStart);

    let iter;
    if (this.isMutable || iterationStart != aStartTime) {
      const _iter = this.innerObject.iterator(iterationStart);
      iter = (function* () {
        for (let next = _iter.next(); next; next = _iter.next()) {
          next = next.clone();
          yield next;
        }
      })();
    } else {
      if (this.cachingIterator) {
        if (this.cachingIterator.startTime.compare(aStartTime) != 0) {
          throw new Error(
            `Immutable recurrence rule iteration with different starts: ${this.cachingIterator.startTime} and ${aStartTime}`
          );
        }
      } else {
        // An object that does the recurrence calculation once for all callers,
        // remembering calculated occurrences to use them again later.
        this.cachingIterator = {
          iterator: this.innerObject.iterator(aStartTime),
          values: [],
          startTime: aStartTime.clone(),
          *newInstance() {
            // Yield all values already calculated.
            for (const value of this.values) {
              yield value;
            }
            // Continue calculation of new values.
            for (let next = this.iterator.next(); next; next = this.iterator.next()) {
              next = next.clone();
              if (aStartTime.zone) {
                next.zone = aStartTime.zone;
              }
              this.values.push(next);
              yield next;
            }
          },
        };
      }
      iter = this.cachingIterator.newInstance();
    }

    for (const next of iter) {
      let dtNext;
      if (next.isDate) {
        dtNext = next.clone();
        dtNext.isDate = false;
      } else {
        dtNext = next;
      }

      if (dtNext.compare(rangeStart) < 0) {
        continue;
      }

      if (dtend && dtNext.compare(dtend) >= 0) {
        break;
      }

      if (occurrences.length >= MAX_OCCURRENCES_PER_QUERY) {
        lazy.log.warn(
          `The rule "${this.innerObject}" has more than ${MAX_OCCURRENCES_PER_QUERY} ` +
            `occurrences in the range, ignoring the rest.`
        );
        break;
      }

      occurrences.push(new lazy.CalDateTime(next));

      if (aMaxCount && occurrences.length >= aMaxCount) {
        break;
      }
    }

    return occurrences;
  },

  get icalString() {
    return "RRULE:" + this.innerObject.toString() + ICAL.newLineChar;
  },
  set icalString(val) {
    this.ensureMutable();
    this.innerObject = ICAL.Recur.fromString(val.replace(/^RRULE:/i, ""));
  },

  get icalProperty() {
    const prop = new ICAL.Property("rrule");
    prop.setValue(this.innerObject);
    return new lazy.CalIcalProperty(prop);
  },
  set icalProperty(val) {
    this.ensureMutable();
    this.innerObject = val.wrappedJSObject.innerObject.getFirstValue();
  },

  get type() {
    return this.innerObject.freq;
  },
  set type(val) {
    this.ensureMutable();
    this.innerObject.freq = val;
  },

  get interval() {
    return this.innerObject.interval;
  },
  set interval(val) {
    this.ensureMutable();
    this.innerObject.interval = val;
  },

  get count() {
    if (!this.isByCount) {
      throw Components.Exception("Rule is not by count.", Cr.NS_ERROR_FAILURE);
    }
    return this.innerObject.count || -1;
  },
  set count(val) {
    this.ensureMutable();
    this.innerObject.count = val && val > 0 ? val : null;
  },

  get untilDate() {
    if (this.innerObject.until) {
      return new lazy.CalDateTime(this.innerObject.until);
    }
    return null;
  },
  set untilDate(val) {
    this.ensureMutable();
    val = val.wrappedJSObject.innerObject;
    if (val.timezone != ICAL.Timezone.utcTimezone && val.timezone != ICAL.Timezone.localTimezone) {
      val = val.convertToZone(ICAL.Timezone.utcTimezone);
    }
    this.innerObject.until = val;
  },

  get isByCount() {
    return this.innerObject.isByCount();
  },

  get weekStart() {
    return this.innerObject.wkst - 1;
  },
  set weekStart(val) {
    this.ensureMutable();
    this.innerObject.wkst = val + 1;
  },

  getComponent(aType) {
    const values = this.innerObject.getComponent(aType);
    if (aType == "BYDAY") {
      // BYDAY values are alphanumeric: SU, MO, TU, etc..
      for (let i = 0; i < values.length; i++) {
        const match = /^([+-])?(5[0-3]|[1-4][0-9]|[1-9])?(SU|MO|TU|WE|TH|FR|SA)$/.exec(values[i]);
        if (!match) {
          lazy.log.warn(`Malformed BYDAY rule: ${values[i]}`);
          return [];
        }
        values[i] = ICAL.Recur.icalDayToNumericDay(match[3]);
        if (match[2]) {
          // match[2] is the week number for this value.
          values[i] += 8 * match[2];
        }
        if (match[1] == "-") {
          // Week numbers are counted back from the end of the period.
          values[i] *= -1;
        }
      }
    }

    return values;
  },

  setComponent(aType, aValues) {
    const values = aValues;
    if (aType == "BYDAY") {
      // BYDAY values are alphanumeric: SU, MO, TU, etc..
      for (let i = 0; i < values.length; i++) {
        const absValue = Math.abs(values[i]);
        if (absValue > 7) {
          const ordinal = Math.trunc(values[i] / 8);
          const day = ICAL.Recur.numericDayToIcalDay(absValue % 8);
          values[i] = ordinal + day;
        } else {
          values[i] = ICAL.Recur.numericDayToIcalDay(values[i]);
        }
      }
    }
    this.innerObject.setComponent(aType, values);
  },
};
