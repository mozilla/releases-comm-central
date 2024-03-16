/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

var { ICAL, unwrapSingle } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

import { CalTimezone } from "resource:///modules/CalTimezone.sys.mjs";

const TIMEZONE_CHANGED_TOPIC = "default-timezone-changed";

// CalTimezoneService acts as an implementation of both ICAL.TimezoneService and
// the XPCOM calITimezoneService used for providing timezone objects to calendar
// code.
export function CalTimezoneService() {
  this.wrappedJSObject = this;

  this._timezoneDatabase = Cc["@mozilla.org/calendar/timezone-database;1"].getService(
    Ci.calITimezoneDatabase
  );

  this.mZones = new Map();
  this.mZoneIds = [];

  ICAL.TimezoneService = this.wrappedJSObject;
}

var calTimezoneServiceClassID = Components.ID("{e736f2bd-7640-4715-ab35-887dc866c587}");
var calTimezoneServiceInterfaces = [Ci.calITimezoneService, Ci.calIStartupService];
CalTimezoneService.prototype = {
  mDefaultTimezone: null,
  mVersion: null,
  mZones: null,
  mZoneIds: null,

  classID: calTimezoneServiceClassID,
  QueryInterface: cal.generateQI(["calITimezoneService", "calIStartupService"]),
  classInfo: cal.generateCI({
    classID: calTimezoneServiceClassID,
    contractID: "@mozilla.org/calendar/timezone-service;1",
    classDescription: "Calendar Timezone Service",
    interfaces: calTimezoneServiceInterfaces,
    flags: Ci.nsIClassInfo.SINGLETON,
  }),

  // ical.js TimezoneService methods
  has(id) {
    return this.getTimezone(id) != null;
  },
  get(id) {
    return id ? unwrapSingle(ICAL.Timezone, this.getTimezone(id)) : null;
  },
  remove() {},
  register() {},

  // calIStartupService methods
  startup(aCompleteListener) {
    // Fetch list of supported canonical timezone IDs from the backing database
    this.mZoneIds = this._timezoneDatabase.getCanonicalTimezoneIds();

    // Fetch the version of the backing database
    this.mVersion = this._timezoneDatabase.version;
    cal.LOG("[CalTimezoneService] Timezones version " + this.version + " loaded");

    // Set up zones for special values
    const utc = new CalTimezone(ICAL.Timezone.utcTimezone);
    this.mZones.set("UTC", utc);

    const floating = new CalTimezone(ICAL.Timezone.localTimezone);
    this.mZones.set("floating", floating);

    // Initialize default timezone and, if unset, user timezone prefs
    this._initDefaultTimezone();

    // Watch for changes in system timezone or related user preferences
    Services.prefs.addObserver("calendar.timezone.useSystemTimezone", this);
    Services.prefs.addObserver("calendar.timezone.local", this);
    Services.obs.addObserver(this, TIMEZONE_CHANGED_TOPIC);

    // Notify the startup service that startup is complete
    if (aCompleteListener) {
      aCompleteListener.onResult(null, Cr.NS_OK);
    }
  },

  shutdown(aCompleteListener) {
    Services.obs.removeObserver(this, TIMEZONE_CHANGED_TOPIC);
    Services.prefs.removeObserver("calendar.timezone.local", this);
    Services.prefs.removeObserver("calendar.timezone.useSystemTimezone", this);
    aCompleteListener.onResult(null, Cr.NS_OK);
  },

  // calITimezoneService methods
  get UTC() {
    return this.mZones.get("UTC");
  },

  get floating() {
    return this.mZones.get("floating");
  },

  getTimezone(tzid) {
    if (!tzid) {
      cal.ERROR("Unknown timezone requested\n" + cal.STACK(10));
      return null;
    }

    if (tzid.startsWith("/mozilla.org/")) {
      // We know that our former tzids look like "/mozilla.org/<dtstamp>/continent/..."
      // The ending of the mozilla prefix is the index of that slash before the
      // continent. Therefore, we start looking for the prefix-ending slash
      // after position 13.
      tzid = tzid.substring(tzid.indexOf("/", 13) + 1);
    }

    // Per the IANA timezone database, "Z" is _not_ an alias for UTC, but our
    // previous list of zones included it and Ical.js at a minimum is expecting
    // it to be valid
    if (tzid === "Z") {
      return this.mZones.get("UTC");
    }

    // First check our cache of timezones
    let timezone = this.mZones.get(tzid);
    if (!timezone) {
      // The requested timezone is not in the cache; ask the backing database
      // for the timezone definition
      const tzdef = this._timezoneDatabase.getTimezoneDefinition(tzid);

      if (!tzdef) {
        cal.ERROR(`Could not find definition for ${tzid}`);
        return null;
      }

      timezone = new CalTimezone(
        ICAL.Timezone.fromData({
          tzid,
          component: tzdef,
        })
      );

      // Cache the resulting timezone
      this.mZones.set(tzid, timezone);
    }

    return timezone;
  },

  get timezoneIds() {
    return this.mZoneIds;
  },

  get version() {
    return this.mVersion;
  },

  _initDefaultTimezone() {
    // If the "use system timezone" preference is unset, we default to enabling
    // it if the user's system supports it
    const isSetSystemTimezonePref = Services.prefs.prefHasUserValue(
      "calendar.timezone.useSystemTimezone"
    );

    if (!isSetSystemTimezonePref) {
      const canUseSystemTimezone = AppConstants.MOZ_CAN_FOLLOW_SYSTEM_TIME;

      Services.prefs.setBoolPref("calendar.timezone.useSystemTimezone", canUseSystemTimezone);
    }

    this._updateDefaultTimezone();
  },

  _updateDefaultTimezone() {
    const prefUseSystemTimezone = Services.prefs.getBoolPref(
      "calendar.timezone.useSystemTimezone",
      true
    );
    const prefTzid = Services.prefs.getStringPref("calendar.timezone.local", null);

    let tzid;
    if (prefUseSystemTimezone || prefTzid === null || prefTzid === "floating") {
      // If we do not have a timezone preference set, we default to using the
      // system time; we may also do this if the user has set their preferences
      // accordingly
      tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } else {
      tzid = prefTzid;
    }

    // Update default timezone and preference if necessary
    if (!this.mDefaultTimezone || this.mDefaultTimezone.tzid != tzid) {
      this.mDefaultTimezone = this.getTimezone(tzid);
      cal.ASSERT(this.mDefaultTimezone, `Timezone not found: ${tzid}`);
      Services.obs.notifyObservers(null, "defaultTimezoneChanged");

      if (this.mDefaultTimezone.tzid != prefTzid) {
        Services.prefs.setStringPref("calendar.timezone.local", this.mDefaultTimezone.tzid);
      }
    }
  },

  get defaultTimezone() {
    // We expect this to be initialized when the service comes up and updated if
    // the underlying default changes
    return this.mDefaultTimezone;
  },

  observe(aSubject, aTopic, aData) {
    // Update the default timezone if the system timezone has changed; we
    // expect the update function to decide if actually making the change is
    // appropriate based on user prefs
    if (aTopic == TIMEZONE_CHANGED_TOPIC) {
      this._updateDefaultTimezone();
    } else if (
      aTopic == "nsPref:changed" &&
      (aData == "calendar.timezone.useSystemTimezone" || aData == "calendar.timezone.local")
    ) {
      // We may get a bogus second update from the timezone pref if its change
      // is a result of the system timezone changing, but it should settle, and
      // trying to guard against it is full of corner cases
      this._updateDefaultTimezone();
    }
  },
};
