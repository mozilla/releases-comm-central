/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ICAL, unwrap } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

function calDuration(innerObject) {
  this.innerObject = innerObject || new ICAL.Duration();
  this.wrappedJSObject = this;
}

calDuration.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIDuration"]),
  classID: Components.ID("{7436f480-c6fc-4085-9655-330b1ee22288}"),

  get icalDuration() {
    return this.innerObject;
  },
  set icalDuration(val) {
    this.innerObject = val;
  },

  isMutable: true,
  makeImmutable() {
    this.isMutable = false;
  },
  clone() {
    return new calDuration(this.innerObject.clone());
  },

  get isNegative() {
    return this.innerObject.isNegative;
  },
  set isNegative(val) {
    this.innerObject.isNegative = val;
  },

  get weeks() {
    return this.innerObject.weeks;
  },
  set weeks(val) {
    this.innerObject.weeks = val;
  },

  get days() {
    return this.innerObject.days;
  },
  set days(val) {
    this.innerObject.days = val;
  },

  get hours() {
    return this.innerObject.hours;
  },
  set hours(val) {
    this.innerObject.hours = val;
  },

  get minutes() {
    return this.innerObject.minutes;
  },
  set minutes(val) {
    this.innerObject.minutes = val;
  },

  get seconds() {
    return this.innerObject.seconds;
  },
  set seconds(val) {
    this.innerObject.seconds = val;
  },

  get inSeconds() {
    return this.innerObject.toSeconds();
  },
  set inSeconds(val) {
    this.innerObject.fromSeconds(val);
  },

  addDuration: unwrap(ICAL.Duration, function(val) {
    this.innerObject.fromSeconds(this.innerObject.toSeconds() + val.toSeconds());
  }),

  compare: unwrap(ICAL.Duration, function(val) {
    return this.innerObject.compare(val);
  }),

  reset() {
    this.innerObject.reset();
  },
  normalize() {
    this.innerObject.normalize();
  },
  toString() {
    return this.innerObject.toString();
  },

  get icalString() {
    return this.innerObject.toString();
  },
  set icalString(val) {
    this.innerObject = ICAL.Duration.fromString(val);
  },
};
