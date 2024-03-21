/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ICAL, unwrapSetter, wrapGetter } from "resource:///modules/calendar/Ical.sys.mjs";

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
    return wrapGetter(lazy.CalDateTime, this.innerObject.start);
  },
  set start(rawval) {
    unwrapSetter(
      ICAL.Time,
      rawval,
      function (val) {
        this.innerObject.start = val;
      },
      this
    );
  },

  get end() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getEnd());
  },
  set end(rawval) {
    unwrapSetter(
      ICAL.Time,
      rawval,
      function (val) {
        if (this.innerObject.duration) {
          this.innerObject.duration = null;
        }
        this.innerObject.end = val;
      },
      this
    );
  },

  get duration() {
    return wrapGetter(lazy.CalDuration, this.innerObject.getDuration());
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
