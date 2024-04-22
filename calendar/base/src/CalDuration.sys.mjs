/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import ICAL from "resource:///modules/calendar/Ical.sys.mjs";

export function CalDuration(innerObject) {
  this.innerObject = innerObject || new ICAL.Duration();
  this.wrappedJSObject = this;
}

CalDuration.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIDuration"]),
  classID: Components.ID("{7436f480-c6fc-4085-9655-330b1ee22288}"),

  isMutable: true,
  makeImmutable() {
    this.isMutable = false;
  },
  clone() {
    return new CalDuration(this.innerObject.clone());
  },

  get isNegative() {
    return this.innerObject.isNegative;
  },
  set isNegative(val) {
    this.innerObject.isNegative = !!val;
  },

  get weeks() {
    return this.innerObject.weeks;
  },
  set weeks(val) {
    this.innerObject.weeks = parseInt(val, 10);
  },

  get days() {
    return this.innerObject.days;
  },
  set days(val) {
    this.innerObject.days = parseInt(val, 10);
  },

  get hours() {
    return this.innerObject.hours;
  },
  set hours(val) {
    this.innerObject.hours = parseInt(val, 10);
  },

  get minutes() {
    return this.innerObject.minutes;
  },
  set minutes(val) {
    this.innerObject.minutes = parseInt(val, 10);
  },

  get seconds() {
    return this.innerObject.seconds;
  },
  set seconds(val) {
    this.innerObject.seconds = parseInt(val, 10);
  },

  get inSeconds() {
    return this.innerObject.toSeconds();
  },
  set inSeconds(val) {
    this.innerObject.fromSeconds(val);
  },

  addDuration(val) {
    this.innerObject.fromSeconds(
      this.innerObject.toSeconds() + val.wrappedJSObject.innerObject.toSeconds()
    );
  },

  compare(val) {
    return this.innerObject.compare(val.wrappedJSObject.innerObject);
  },

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
