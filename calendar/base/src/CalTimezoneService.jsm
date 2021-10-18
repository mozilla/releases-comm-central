/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calTimezone.js */

var EXPORTED_SYMBOLS = ["CalTimezoneService"];

var { NetUtil } = ChromeUtils.import("resource://gre/modules/NetUtil.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { ICAL, unwrapSingle } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

XPCOMUtils.defineLazyPreferenceGetter(this, "gUseIcaljs", "calendar.icaljs", false);

Services.scriptloader.loadSubScript("resource:///components/calTimezone.js");

function calStringEnumerator(stringArray) {
  this.mIndex = 0;
  this.mStringArray = stringArray;
}
calStringEnumerator.prototype = {
  // nsIUTF8StringEnumerator:
  [Symbol.iterator]() {
    return this.mStringArray.values();
  },
  hasMore() {
    return this.mIndex < this.mStringArray.length;
  },
  getNext() {
    if (!this.hasMore()) {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }
    return this.mStringArray[this.mIndex++];
  },
};

function CalTimezoneService() {
  this.wrappedJSObject = this;

  this.mZones = new Map();

  ICAL.TimezoneService = this.wrappedJSObject;
}
var calTimezoneServiceClassID = Components.ID("{e736f2bd-7640-4715-ab35-887dc866c587}");
var calTimezoneServiceInterfaces = [
  Ci.calITimezoneService,
  Ci.calITimezoneProvider,
  Ci.calIStartupService,
];
CalTimezoneService.prototype = {
  mDefaultTimezone: null,
  mHasSetupObservers: false,
  mVersion: null,
  mZones: null,

  classID: calTimezoneServiceClassID,
  QueryInterface: cal.generateQI([
    "calITimezoneService",
    "calITimezoneProvider",
    "calIStartupService",
  ]),
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

  // calIStartupService:
  startup(aCompleteListener) {
    function fetchJSON(aURL) {
      cal.LOG("[CalTimezoneService] Loading " + aURL);

      return new Promise((resolve, reject) => {
        let uri = Services.io.newURI(aURL);
        let channel = Services.io.newChannelFromURI(
          uri,
          null,
          Services.scriptSecurityManager.getSystemPrincipal(),
          null,
          Ci.nsILoadInfo.SEC_REQUIRE_SAME_ORIGIN_INHERITS_SEC_CONTEXT,
          Ci.nsIContentPolicy.TYPE_OTHER
        );

        NetUtil.asyncFetch(channel, (inputStream, status) => {
          if (!Components.isSuccessCode(status)) {
            reject(status);
            return;
          }

          try {
            let jsonData = NetUtil.readInputStreamToString(inputStream, inputStream.available());
            let tzData = JSON.parse(jsonData);
            resolve(tzData);
          } catch (ex) {
            reject(ex);
          }
        });
      });
    }

    fetchJSON("resource:///res/zones.json")
      .then(tzData => {
        for (let tzid of Object.keys(tzData.aliases)) {
          let data = tzData.aliases[tzid];
          if (typeof data == "object" && data !== null) {
            this.mZones.set(tzid, data);
          }
        }
        for (let tzid of Object.keys(tzData.zones)) {
          let data = tzData.zones[tzid];
          if (typeof data == "object" && data !== null) {
            this.mZones.set(tzid, data);
          }
        }

        this.mVersion = tzData.version;
        cal.LOG("[CalTimezoneService] Timezones version " + this.version + " loaded");

        let bundleURL = "chrome://calendar/locale/timezones.properties";
        this.stringBundle = ICAL.Timezone.cal_tz_bundle = Services.strings.createBundle(bundleURL);

        // Make sure UTC and floating are cached by calling their getters
        this.UTC; // eslint-disable-line no-unused-expressions
        this.floating; // eslint-disable-line no-unused-expressions
      })
      .then(
        () => {
          if (aCompleteListener) {
            aCompleteListener.onResult(null, Cr.NS_OK);
          }
        },
        error => {
          cal.ERROR("Missing calendar timezones error.");
        }
      );
  },

  shutdown(aCompleteListener) {
    Services.prefs.removeObserver("calendar.timezone.local", this);
    aCompleteListener.onResult(null, Cr.NS_OK);
  },

  get UTC() {
    if (!this.mZones.has("UTC")) {
      let utc;
      if (gUseIcaljs) {
        utc = new calICALJSTimezone(ICAL.Timezone.utcTimezone);
      } else {
        utc = new calLibicalTimezone("UTC", null, "", "");
        utc.mUTC = true;
      }

      this.mZones.set("UTC", { zone: utc });
    }

    return this.mZones.get("UTC").zone;
  },

  get floating() {
    if (!this.mZones.has("floating")) {
      let floating;
      if (gUseIcaljs) {
        floating = new calICALJSTimezone(ICAL.Timezone.localTimezone);
      } else {
        floating = new calLibicalTimezone("floating", null, "", "");
        floating.isFloating = true;
      }
      this.mZones.set("floating", { zone: floating });
    }

    return this.mZones.get("floating").zone;
  },

  // calITimezoneProvider:
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

    let timezone = this.mZones.get(tzid);
    if (!timezone) {
      cal.ERROR("Couldn't find " + tzid);
      return null;
    }
    if (!timezone.zone) {
      if (timezone.aliasTo) {
        // This zone is an alias.
        timezone.zone = this.getTimezone(timezone.aliasTo);
      } else {
        let ics =
          "BEGIN:VTIMEZONE\r\nTZID:" +
          tzid +
          "\r\n" +
          timezone.ics.join("\r\n") +
          "\r\nEND:VTIMEZONE";
        if (gUseIcaljs) {
          timezone.zone = new calICALJSTimezone(
            ICAL.Timezone.fromData({
              tzid,
              component: ics,
              latitude: timezone.latitude,
              longitude: timezone.longitude,
            })
          );
        } else {
          timezone.zone = new calLibicalTimezone(tzid, ics, timezone.latitude, timezone.longitude);
        }
      }
    }
    return timezone.zone;
  },

  get timezoneIds() {
    let zones = [];
    for (let [k, v] of this.mZones.entries()) {
      if (!v.aliasTo && k != "UTC" && k != "floating") {
        zones.push(k);
      }
    }
    return new calStringEnumerator(zones);
  },

  get aliasIds() {
    let zones = [];
    for (let [key, value] of this.mZones.entries()) {
      if (value.aliasTo && key != "UTC" && key != "floating") {
        zones.push(key);
      }
    }
    return new calStringEnumerator(zones);
  },

  get version() {
    return this.mVersion;
  },

  get defaultTimezone() {
    if (!this.mDefaultTimezone) {
      let prefTzid = Services.prefs.getStringPref("calendar.timezone.local", null);
      let tzid = prefTzid;
      // If a user already has a profile created by an earlier version
      // with floating timezone, set the correctly determined timezone.
      if (!tzid || tzid == "floating") {
        tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (tzid) {
          cal.WARN(`Using determined system default timezone "${tzid}".`);
        } else {
          cal.WARN("Could not determine system default timezone, trying UTC.");
          tzid = "UTC";
        }
      }
      this.mDefaultTimezone = this.getTimezone(tzid);
      cal.ASSERT(this.mDefaultTimezone, "Timezone not found: " + tzid);
      // Update prefs if necessary:
      if (this.mDefaultTimezone && this.mDefaultTimezone.tzid != prefTzid) {
        Services.prefs.setStringPref("calendar.timezone.local", this.mDefaultTimezone.tzid);
      }

      // We need to observe the timezone preference to update the default
      // timezone if needed.
      this.setupObservers();
    }
    return this.mDefaultTimezone;
  },

  setupObservers() {
    if (!this.mHasSetupObservers) {
      // Now set up the observer
      Services.prefs.addObserver("calendar.timezone.local", this);
      this.mHasSetupObservers = true;
    }
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed" && aData == "calendar.timezone.local") {
      // Unsetting the default timezone will make the next call to the
      // default timezone getter set up the correct timezone again.
      this.mDefaultTimezone = null;
      Services.obs.notifyObservers(null, "defaultTimezoneChanged");
    }
  },
};
