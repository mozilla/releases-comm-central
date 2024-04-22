/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import ICAL from "resource:///modules/calendar/Ical.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
  CalDuration: "resource:///modules/CalDuration.sys.mjs",
});

export function CalPeriod(innerObject) {
  this.innerObject = innerObject || new ICAL.Period({});
  this.wrappedJSObject = this;
}

CalPeriod.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIPeriod"]),
  classID: Components.ID("{394a281f-7299-45f7-8b1f-cce21258972f}"),

  isMutable: true,
  innerObject: null,

  get icalPeriod() {
    return this.innerObject;
  },
  set icalPeriod(val) {
    this.innerObject = val;
  },

  makeImmutable() {
    this.isMutable = false;
  },
  clone() {
    return new CalPeriod(this.innerObject.clone());
  },

  get start() {
    const val = this.innerObject.start;
    return val ? new lazy.CalDateTime(val) : null;
  },
  set start(val) {
    this.innerObject.start = val.wrappedJSObject.innerObject;
  },

  get end() {
    const val = this.innerObject.getEnd();
    return val ? new lazy.CalDateTime(val) : null;
  },
  set end(val) {
    if (this.innerObject.duration) {
      this.innerObject.duration = null;
    }
    this.innerObject.end = val.wrappedJSObject.innerObject;
  },

  get duration() {
    const val = this.innerObject.getDuration();
    return val ? new lazy.CalDuration(val) : null;
  },

  get icalString() {
    return this.innerObject.toICALString();
  },
  set icalString(val) {
    const dates = ICAL.parse._parseValue(val, "period", ICAL.design.icalendar);
    this.innerObject = ICAL.Period.fromString(dates.join("/"));
  },

  toString() {
    return this.innerObject.toString();
  },
};
