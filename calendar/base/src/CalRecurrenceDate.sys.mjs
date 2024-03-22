/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CalPeriod: "resource:///modules/CalPeriod.sys.mjs",
});

export function CalRecurrenceDate() {
  this.wrappedJSObject = this;
}

var calRecurrenceDateClassID = Components.ID("{806b6423-3aaa-4b26-afa3-de60563e9cec}");
var calRecurrenceDateInterfaces = [Ci.calIRecurrenceItem, Ci.calIRecurrenceDate];
CalRecurrenceDate.prototype = {
  isMutable: true,

  mIsNegative: false,
  mDate: null,

  classID: calRecurrenceDateClassID,
  QueryInterface: cal.generateQI(["calIRecurrenceItem", "calIRecurrenceDate"]),
  classInfo: cal.generateCI({
    classID: calRecurrenceDateClassID,
    contractID: "@mozilla.org/calendar/recurrence-date;1",
    classDescription: "The date of an occurrence of a recurring item",
    interfaces: calRecurrenceDateInterfaces,
  }),

  makeImmutable() {
    this.isMutable = false;
  },

  ensureMutable() {
    if (!this.isMutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
  },

  clone() {
    const other = new CalRecurrenceDate();
    other.mDate = this.mDate ? this.mDate.clone() : null;
    other.mIsNegative = this.mIsNegative;
    return other;
  },

  get isNegative() {
    return this.mIsNegative;
  },
  set isNegative(val) {
    this.ensureMutable();
    this.mIsNegative = val;
  },

  get isFinite() {
    return true;
  },

  get date() {
    return this.mDate;
  },
  set date(val) {
    this.ensureMutable();
    this.mDate = val;
  },

  getNextOccurrence(aStartTime) {
    if (this.mDate && this.mDate.compare(aStartTime) > 0) {
      return this.mDate;
    }
    return null;
  },

  getOccurrences(aStartTime, aRangeStart, aRangeEnd) {
    if (
      this.mDate &&
      this.mDate.compare(aRangeStart) >= 0 &&
      (!aRangeEnd || this.mDate.compare(aRangeEnd) < 0)
    ) {
      return [this.mDate];
    }
    return [];
  },

  get icalString() {
    const comp = this.icalProperty;
    return comp ? comp.icalString : "";
  },
  set icalString(val) {
    const prop = cal.icsService.createIcalPropertyFromString(val);
    const propName = prop.propertyName;
    if (propName != "RDATE" && propName != "EXDATE") {
      throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
    }

    this.icalProperty = prop;
  },

  get icalProperty() {
    const prop = cal.icsService.createIcalProperty(this.mIsNegative ? "EXDATE" : "RDATE");
    prop.valueAsDatetime = this.mDate;
    return prop;
  },
  set icalProperty(prop) {
    if (prop.propertyName == "RDATE") {
      this.mIsNegative = false;
      if (prop.getParameter("VALUE") == "PERIOD") {
        const period = new lazy.CalPeriod();
        period.icalString = prop.valueAsIcalString;
        this.mDate = period.start;
      } else {
        this.mDate = prop.valueAsDatetime;
      }
    } else if (prop.propertyName == "EXDATE") {
      this.mIsNegative = true;
      this.mDate = prop.valueAsDatetime;
    }
  },
};
