/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalRecurrenceDate"];

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

function CalRecurrenceDate() {
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
    let other = new CalRecurrenceDate();
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

  getNextOccurrence(aStartTime, aOccurrenceTime) {
    if (this.mDate && this.mDate.compare(aStartTime) > 0) {
      return this.mDate;
    }
    return null;
  },

  getOccurrences(aStartTime, aRangeStart, aRangeEnd, aMaxCount) {
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
    let comp = this.icalProperty;
    return comp ? comp.icalString : "";
  },
  set icalString(val) {
    let prop = cal.getIcsService().createIcalPropertyFromString(val);
    let propName = prop.propertyName;
    if (propName != "RDATE" && propName != "EXDATE") {
      throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
    }

    this.icalProperty = prop;
  },

  get icalProperty() {
    let prop = cal.getIcsService().createIcalProperty(this.mIsNegative ? "EXDATE" : "RDATE");
    prop.valueAsDatetime = this.mDate;
    return prop;
  },
  set icalProperty(prop) {
    if (prop.propertyName == "RDATE") {
      this.mIsNegative = false;
      if (prop.getParameter("VALUE") == "PERIOD") {
        let period = Cc["@mozilla.org/calendar/period;1"].createInstance(Ci.calIPeriod);
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
