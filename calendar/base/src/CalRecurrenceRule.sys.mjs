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
 * The most occurrences a single rule will produce while answering one query.
 * A rule reaching this is malformed or hostile; iterating it to the end would
 * exhaust memory and hang the application.
 */
const MAX_OCCURRENCES_PER_QUERY = 10000;

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
    const { freq, interval, parts } = this.innerObject;
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
    const maxInstances = MAX_INSTANCES_PER_HOUR * PERIOD_HOURS[freq] * Math.max(interval || 1, 1);
    if (instances > maxInstances) {
      lazy.log.warn(
        `The rule "${this.innerObject}" expands to ${instances} instances per period, ` +
          `more than the ${maxInstances} supported. No occurrences will be generated.`
      );
      return false;
    }
    return true;
  },

  getNextOccurrence(aStartTime, aRecId) {
    if (!this.isSupported()) {
      return null;
    }
    aStartTime = aStartTime.wrappedJSObject.innerObject;
    aRecId = aRecId.wrappedJSObject.innerObject;

    // This is ICAL.Recur.getNextOccurrence, which searches from the start of
    // the series, spelled out here so that the search can be given a budget.
    const iter = this.innerObject.iterator(aStartTime);
    let val;
    let count = 0;
    do {
      if (++count > MAX_OCCURRENCES_PER_QUERY) {
        lazy.log.warn(
          `Gave up looking for the occurrence of "${this.innerObject}" after ${aRecId}, ` +
            `it is more than ${MAX_OCCURRENCES_PER_QUERY} occurrences from ${aStartTime}.`
        );
        return null;
      }
      val = iter.next();
    } while (val && val.compare(aRecId) <= 0);

    if (val && aRecId.zone) {
      val.zone = aRecId.zone;
    }
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

    let iter;
    if (this.isMutable) {
      const _iter = this.innerObject.iterator(aStartTime);
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

    let count = 0;
    for (const next of iter) {
      if (++count > MAX_OCCURRENCES_PER_QUERY) {
        lazy.log.warn(
          `The rule "${this.innerObject}" produced more than ${MAX_OCCURRENCES_PER_QUERY} ` +
            `occurrences from ${aStartTime}, ignoring the rest.`
        );
        break;
      }

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
