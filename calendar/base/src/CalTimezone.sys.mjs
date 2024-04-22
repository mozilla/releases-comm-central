/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import ICAL from "resource:///modules/calendar/Ical.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "l10nBundle", () => {
  // Prepare localized timezone display values
  const bundleURL = "chrome://calendar/locale/timezones.properties";
  return Services.strings.createBundle(bundleURL);
});

export function CalTimezone(innerObject) {
  this.innerObject = innerObject || new ICAL.Timezone();
  this.wrappedJSObject = this;
}

CalTimezone.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calITimezone"]),
  classID: Components.ID("{6702eb17-a968-4b43-b562-0d0c5f8e9eb5}"),

  innerObject: null,

  get provider() {
    return cal.timezoneService;
  },

  get icalComponent() {
    const innerComp = this.innerObject.component;
    let comp = null;
    if (innerComp) {
      comp = cal.icsService.createIcalComponent("VTIMEZONE");
      comp.icalComponent = innerComp;
    }
    return comp;
  },

  get tzid() {
    return this.innerObject.tzid;
  },

  get isFloating() {
    return this.innerObject == ICAL.Timezone.localTimezone;
  },

  get isUTC() {
    return this.innerObject == ICAL.Timezone.utcTimezone;
  },

  get displayName() {
    // Localization is currently only used for floating/UTC until we have a
    // better story around timezone localization and display
    const stringName = "pref.timezone." + this.tzid.replace(/\//g, ".");
    let displayName = this.tzid;

    try {
      displayName = lazy.l10nBundle.GetStringFromName(stringName);
    } catch (e) {
      // Just use the TZID if the string is missing.
    }

    this.__defineGetter__("displayName", () => {
      return displayName;
    });
    return displayName;
  },

  toString() {
    return this.innerObject.toString();
  },
};
