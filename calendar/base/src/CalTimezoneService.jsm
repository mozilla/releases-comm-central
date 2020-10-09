/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calTimezone.js */

var EXPORTED_SYMBOLS = ["CalTimezoneService"];

var { NetUtil } = ChromeUtils.import("resource://gre/modules/NetUtil.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

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
      } else if (gUseIcaljs) {
        let parsedComp = ICAL.parse(
          "BEGIN:VCALENDAR\r\nBEGIN:VTIMEZONE\r\nTZID:" +
            tzid +
            "\r\n" +
            timezone.ics.join("\r\n") +
            "\r\nEND:VTIMEZONE\r\nEND:VCALENDAR"
        );
        let icalComp = new ICAL.Component(parsedComp);
        let tzComp = icalComp.getFirstSubcomponent("vtimezone");
        timezone.zone = new calICALJSTimezone(
          ICAL.Timezone.fromData({
            tzid,
            component: tzComp,
            latitude: timezone.latitude,
            longitude: timezone.longitude,
          })
        );
      } else {
        let ics =
          "BEGIN:VTIMEZONE\r\nTZID:" +
          tzid +
          "\r\n" +
          timezone.ics.join("\r\n") +
          "\r\nEND:VTIMEZONE";
        timezone.zone = new calLibicalTimezone(tzid, ics, timezone.latitude, timezone.longitude);
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
      // with floating timezone, set the correctly guessed timezone.
      if (!tzid || tzid == "floating") {
        try {
          tzid = guessSystemTimezone();
        } catch (e) {
          cal.WARN(
            "An exception occurred guessing the system timezone, trying UTC. Exception: " + e
          );
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

/**
 * We're going to do everything in our power, short of rumaging through the
 * user's actual file-system, to figure out the time-zone they're in.  The
 * deciding factors are the offsets given by (northern-hemisphere) summer and
 * winter JSdates.  However, when available, we also use the name of the
 * timezone in the JSdate, or a string-bundle term from the locale.
 *
 * @return a mozilla ICS timezone string.
 */
function guessSystemTimezone() {
  // Probe JSDates for basic OS timezone offsets and names.
  // Check timezone rules for current year
  const dateJun = new Date(new Date().getFullYear(), 5, 20).toString();
  const dateDec = new Date(new Date().getFullYear(), 11, 20).toString();
  const tzNameRegex = /[^(]* ([^ ]*) \(([^)]+)\)/;
  const nameDataJun = dateJun.match(tzNameRegex);
  const nameDataDec = dateDec.match(tzNameRegex);
  const tzNameJun = nameDataJun && nameDataJun[2];
  const tzNameDec = nameDataDec && nameDataDec[2];
  const offsetRegex = /[+-]\d{4}/;
  const offsetJun = dateJun.match(offsetRegex)[0];
  const offsetDec = dateDec.match(offsetRegex)[0];

  const tzSvc = cal.getTimezoneService();

  let continent = "Africa|America|Antarctica|Asia|Australia|Europe";
  let ocean = "Arctic|Atlantic|Indian|Pacific";
  let tzRegex = new RegExp(".*((?:" + continent + "|" + ocean + ")(?:[/][-A-Z_a-z]+)+)");

  function getIcalString(component, property) {
    let prop = component && component.getFirstProperty(property);
    return prop ? prop.valueAsIcalString : null;
  }

  // Check if Olson ZoneInfo timezone matches OS/JSDate timezone properties:
  // * standard offset and daylight/summer offset if present (longitude),
  // * if has summer time, direction of change (northern/southern hemisphere)
  // * if has summer time, dates of next transitions
  // * timezone name (such as "Western European Standard Time").
  // Score is 3 if matches dates and names, 2 if matches dates without names,
  // 1 if matches dates within a week (so changes on different weekday),
  // otherwise 0 if no match.
  function checkTZ(tzId) {
    let timezone = tzSvc.getTimezone(tzId);

    // Have to handle UTC separately because it has no .icalComponent.
    if (timezone.isUTC) {
      if (offsetDec == 0 && offsetJun == 0) {
        if (tzNameJun == "UTC" && tzNameDec == "UTC") {
          return 3;
        }
        return 2;
      }
      return 0;
    }

    let subComp = timezone.icalComponent;
    // find currently applicable time period, not just first,
    // because offsets of timezone may be changed over the years.
    let standard = findCurrentTimePeriod(timezone, subComp, "STANDARD");
    let standardTZOffset = getIcalString(standard, "TZOFFSETTO");
    let standardName = getIcalString(standard, "TZNAME");
    let daylight = findCurrentTimePeriod(timezone, subComp, "DAYLIGHT");
    let daylightTZOffset = getIcalString(daylight, "TZOFFSETTO");
    let daylightName = getIcalString(daylight, "TZNAME");

    // Try northern hemisphere cases.
    if (offsetDec == standardTZOffset && offsetDec == offsetJun && !daylight) {
      if (standardName && standardName == tzNameJun) {
        return 3;
      }
      return 2;
    }

    if (offsetDec == standardTZOffset && offsetJun == daylightTZOffset && daylight) {
      let dateMatchWt = systemTZMatchesTimeShiftDates(timezone, subComp);
      if (dateMatchWt > 0) {
        if (
          standardName &&
          standardName == tzNameJun &&
          daylightName &&
          daylightName == tzNameDec
        ) {
          return 3;
        }
        return dateMatchWt;
      }
    }

    // Now flip them and check again, to cover southern hemisphere cases.
    if (offsetJun == standardTZOffset && offsetDec == offsetJun && !daylight) {
      if (standardName && standardName == tzNameDec) {
        return 3;
      }
      return 2;
    }

    if (offsetJun == standardTZOffset && offsetDec == daylightTZOffset && daylight) {
      let dateMatchWt = systemTZMatchesTimeShiftDates(timezone, subComp);
      if (dateMatchWt > 0) {
        if (
          standardName &&
          standardName == tzNameJun &&
          daylightName &&
          daylightName == tzNameDec
        ) {
          return 3;
        }
        return dateMatchWt;
      }
    }
    return 0;
  }

  // returns 2=match-within-hours, 1=match-within-week, 0=no-match
  function systemTZMatchesTimeShiftDates(timezone, subComp) {
    // Verify local autumn and spring shifts also occur in system timezone
    // (jsDate) on correct date in correct direction.
    // (Differs for northern/southern hemisphere.
    //  Local autumn shift is to local winter STANDARD time.
    //  Local spring shift is to local summer DAYLIGHT time.)
    const autumnShiftJSDate = findCurrentTimePeriod(timezone, subComp, "STANDARD", true);
    const afterAutumnShiftJSDate = new Date(autumnShiftJSDate);
    const beforeAutumnShiftJSDate = new Date(autumnShiftJSDate);
    const springShiftJSDate = findCurrentTimePeriod(timezone, subComp, "DAYLIGHT", true);
    const beforeSpringShiftJSDate = new Date(springShiftJSDate);
    const afterSpringShiftJSDate = new Date(springShiftJSDate);
    // Try with 6 HOURS fuzz in either direction, since OS and ZoneInfo
    // may disagree on the exact time of shift (midnight, 2am, 4am, etc).
    beforeAutumnShiftJSDate.setHours(autumnShiftJSDate.getHours() - 6);
    afterAutumnShiftJSDate.setHours(autumnShiftJSDate.getHours() + 6);
    afterSpringShiftJSDate.setHours(afterSpringShiftJSDate.getHours() + 6);
    beforeSpringShiftJSDate.setHours(beforeSpringShiftJSDate.getHours() - 6);
    if (
      beforeAutumnShiftJSDate.getTimezoneOffset() < afterAutumnShiftJSDate.getTimezoneOffset() &&
      beforeSpringShiftJSDate.getTimezoneOffset() > afterSpringShiftJSDate.getTimezoneOffset()
    ) {
      return 2;
    }
    // Try with 7 DAYS fuzz in either direction, so if no other timezone
    // found, will have a nearby timezone that disagrees only on the
    // weekday of shift (sunday vs. friday vs. calendar day), or off by
    // exactly one week, (e.g., needed to guess Africa/Cairo on w2k in
    // 2006).
    beforeAutumnShiftJSDate.setDate(autumnShiftJSDate.getDate() - 7);
    afterAutumnShiftJSDate.setDate(autumnShiftJSDate.getDate() + 7);
    afterSpringShiftJSDate.setDate(afterSpringShiftJSDate.getDate() + 7);
    beforeSpringShiftJSDate.setDate(beforeSpringShiftJSDate.getDate() - 7);
    if (
      beforeAutumnShiftJSDate.getTimezoneOffset() < afterAutumnShiftJSDate.getTimezoneOffset() &&
      beforeSpringShiftJSDate.getTimezoneOffset() > afterSpringShiftJSDate.getTimezoneOffset()
    ) {
      return 1;
    }
    // no match
    return 0;
  }

  const todayUTC = cal.dtz.jsDateToDateTime(new Date());
  const oneYrUTC = todayUTC.clone();
  oneYrUTC.year += 1;
  const periodStartCalDate = cal.createDateTime();
  const periodUntilCalDate = cal.createDateTime(); // until timezone is UTC
  const periodCalRule = cal.createRecurrenceRule();
  const untilRegex = /UNTIL=(\d{8}T\d{6}Z)/;

  function findCurrentTimePeriod(timezone, subComp, standardOrDaylight, isForNextTransitionDate) {
    // Iterate through 'STANDARD' declarations or 'DAYLIGHT' declarations
    // (periods in history with different settings.
    //  e.g., US changes daylight start in 2007 (from April to March).)
    // Each period is marked by a DTSTART.
    // Find the currently applicable period: has most recent DTSTART
    // not later than today and no UNTIL, or UNTIL is greater than today.
    for (let period of cal.iterate.icalSubcomponent(subComp, standardOrDaylight)) {
      periodStartCalDate.icalString = getIcalString(period, "DTSTART");
      periodStartCalDate.timezone = timezone;
      if (oneYrUTC.nativeTime < periodStartCalDate.nativeTime) {
        continue; // period starts too far in future
      }
      // Must examine UNTIL date (not next daylight start) because
      // some zones (e.g., Arizona, Hawaii) may stop using daylight
      // time, so there might not be a next daylight start.
      let rrule = period.getFirstProperty("RRULE");
      if (rrule) {
        let match = untilRegex.exec(rrule.valueAsIcalString);
        if (match) {
          periodUntilCalDate.icalString = match[1];
          if (todayUTC.nativeTime > periodUntilCalDate.nativeTime) {
            continue; // period ends too early
          }
        } // else forever rule
      } // else no daylight rule

      // found period that covers today.
      if (!isForNextTransitionDate) {
        return period;
      } else if (todayUTC.nativeTime < periodStartCalDate.nativeTime) {
        // already know periodStartCalDate < oneYr from now,
        // and transitions are at most once per year, so it is next.
        return cal.dtz.dateTimeToJsDate(periodStartCalDate);
      } else if (rrule) {
        // find next occurrence after today
        periodCalRule.icalProperty = rrule;
        let nextTransitionDate = periodCalRule.getNextOccurrence(periodStartCalDate, todayUTC);
        // make sure rule doesn't end before next transition date.
        if (nextTransitionDate) {
          return cal.dtz.dateTimeToJsDate(nextTransitionDate);
        }
      }
    }
    // no such period found
    return null;
  }

  function environmentVariableValue(varName) {
    let envSvc = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
    let value = envSvc.get(varName);
    if (!value || !value.match(tzRegex)) {
      return "";
    }
    return varName + "=" + value;
  }

  function symbolicLinkTarget(filepath) {
    try {
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(filepath);
      file.QueryInterface(Ci.nsIFile);
      if (!file.exists() || !file.isSymlink() || !file.target.match(tzRegex)) {
        return "";
      }

      return filepath + " -> " + file.target;
    } catch (ex) {
      Cu.reportError(filepath + ": " + ex);
      return "";
    }
  }

  function fileFirstZoneLineString(filepath) {
    // return first line of file that matches tzRegex (ZoneInfo id),
    // or "" if no file or no matching line.
    try {
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(filepath);
      file.QueryInterface(Ci.nsIFile);
      if (!file.exists()) {
        return "";
      }
      let fileInstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
        Ci.nsIFileInputStream
      );
      const PR_RDONLY = 0x1;
      fileInstream.init(file, PR_RDONLY, 0, 0);
      fileInstream.QueryInterface(Ci.nsILineInputStream);
      try {
        let line = {},
          hasMore = true,
          MAXLINES = 50;
        for (let i = 0; hasMore && i < MAXLINES; i++) {
          hasMore = fileInstream.readLine(line);
          if (line.value && line.value.match(tzRegex)) {
            return filepath + ": " + line.value;
          }
        }
        return ""; // not found
      } finally {
        fileInstream.close();
      }
    } catch (ex) {
      Cu.reportError(filepath + ": " + ex);
      return "";
    }
  }

  function weekday(icsDate, timezone) {
    let calDate = cal.createDateTime(icsDate);
    calDate.timezone = timezone;
    return cal.dtz.dateTimeToJsDate(calDate).toLocaleString(undefined, { weekday: "short" });
  }

  // Try to find a tz that matches OS/JSDate timezone.  If no name match,
  // will use first of probable timezone(s) with highest score.
  let probableTZId = "floating"; // default fallback tz if no tz matches.
  let probableTZScore = 0;
  let probableTZSource = null;

  const calProperties = Services.strings.createBundle(
    "chrome://calendar/locale/calendar.properties"
  );

  // First, try to detect operating system timezone.
  let zoneInfoIdFromOSUserTimeZone = null;
  let osUserTimeZone = null;
  try {
    if (AppConstants.platform == "win") {
      let wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
      wrk.open(
        wrk.ROOT_KEY_LOCAL_MACHINE,
        "SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation",
        wrk.ACCESS_READ
      );
      if (wrk.hasValue("TimeZoneKeyName")) {
        // Clear trailing garbage on this key, see bug 1129712.
        osUserTimeZone = wrk.readStringValue("TimeZoneKeyName").split("\0")[0];
        zoneInfoIdFromOSUserTimeZone = osUserTimeZone;
      }
      wrk.close();
    } else {
      // Else look for ZoneInfo timezone id in
      // - TZ environment variable value
      // - /etc/localtime symbolic link target path
      // - /etc/TIMEZONE or /etc/timezone file content
      // - /etc/sysconfig/clock file line content.
      // The timezone is set per user via the TZ environment variable.
      // TZ may contain a path that may start with a colon and ends with
      // a ZoneInfo timezone identifier, such as ":America/New_York" or
      // ":/share/lib/zoneinfo/America/New_York".  The others are
      // in the filesystem so they give one timezone for the system;
      // the values are similar (but cannot have a leading colon).
      // (Note: the OS ZoneInfo database may be a different version from
      // the one we use, so still need to check that DST dates match.)
      osUserTimeZone =
        environmentVariableValue("TZ") ||
        symbolicLinkTarget("/etc/localtime") ||
        fileFirstZoneLineString("/etc/TIMEZONE") ||
        fileFirstZoneLineString("/etc/timezone") ||
        fileFirstZoneLineString("/etc/sysconfig/clock");
      let results = osUserTimeZone.match(tzRegex);
      if (results) {
        zoneInfoIdFromOSUserTimeZone = results[1];
      }
    }

    // check how well OS tz matches tz defined in our version of zoneinfo db
    if (zoneInfoIdFromOSUserTimeZone != null) {
      let tzId = zoneInfoIdFromOSUserTimeZone;
      let score = checkTZ(tzId);
      switch (score) {
        case 0:
          // Did not match.
          // Maybe OS or Application is old, and the timezone changed.
          // Or maybe user turned off DST in Date/Time control panel.
          // Will look for a better matching tz, or fallback to floating.
          // (Match OS so alarms go off at time indicated by OS clock.)
          cal.WARN(
            calProperties.formatStringFromName("WarningOSTZNoMatch", [
              osUserTimeZone,
              zoneInfoIdFromOSUserTimeZone,
            ])
          );
          break;
        case 1:
        case 2:
          // inexact match: OS TZ and our ZoneInfo TZ matched imperfectly.
          // Will keep looking, will use tzId unless another is better.
          // (maybe OS TZ has changed to match a nearby TZ, so maybe
          // another ZoneInfo TZ matches it better).
          probableTZId = tzId;
          probableTZScore = score;
          probableTZSource = calProperties.formatStringFromName("TZFromOS", [osUserTimeZone]);

          break;
        case 3:
          // exact match
          return tzId;
      }
    }
  } catch (ex) {
    // zoneInfo id given was not recognized by our ZoneInfo database
    let errParams = [zoneInfoIdFromOSUserTimeZone || osUserTimeZone];
    let errMsg = calProperties.formatStringFromName("SkippingOSTimezone", errParams);
    Cu.reportError(errMsg + " " + ex);
  }

  // Second, give priority to "likelyTimezone"s if provided by locale.
  try {
    // The likelyTimezone property is a comma-separated list of
    // ZoneInfo timezone ids.
    const bundleTZString = calProperties.GetStringFromName("likelyTimezone");
    const bundleTZIds = bundleTZString.split(/\s*,\s*/);
    for (let bareTZId of bundleTZIds) {
      let tzId = bareTZId;
      try {
        let score = checkTZ(tzId);

        switch (score) {
          case 0:
            break;
          case 1:
          case 2:
            if (score > probableTZScore) {
              probableTZId = tzId;
              probableTZScore = score;
              probableTZSource = calProperties.GetStringFromName("TZFromLocale");
            }
            break;
          case 3:
            return tzId;
        }
      } catch (ex) {
        let errMsg = calProperties.formatStringFromName("SkippingLocaleTimezone", [bareTZId]);
        Cu.reportError(errMsg + " " + ex);
      }
    }
  } catch (ex) {
    // Oh well, this didn't work, next option...
    Cu.reportError(ex);
  }

  // Third, try all known timezones.
  const tzIDs = tzSvc.timezoneIds;
  for (let tzId of tzIDs) {
    try {
      let score = checkTZ(tzId);
      switch (score) {
        case 0:
          break;
        case 1:
        case 2:
          if (score > probableTZScore) {
            probableTZId = tzId;
            probableTZScore = score;
            probableTZSource = calProperties.GetStringFromName("TZFromKnownTimezones");
          }
          break;
        case 3:
          return tzId;
      }
    } catch (ex) {
      // bug if ics service doesn't recognize own tzid!
      let msg = "ics-service doesn't recognize own tzid: " + tzId + "\n" + ex;
      Cu.reportError(msg);
    }
  }

  // If reach here, there were no score=3 matches, so Warn in console.
  try {
    switch (probableTZScore) {
      case 0: {
        cal.WARN(calProperties.GetStringFromName("warningUsingFloatingTZNoMatch"));
        break;
      }
      case 1:
      case 2: {
        let tzId = probableTZId;
        let timezone = tzSvc.getTimezone(tzId);
        let subComp = timezone.icalComponent;
        let standard = findCurrentTimePeriod(timezone, subComp, "STANDARD");
        let standardTZOffset = getIcalString(standard, "TZOFFSETTO");
        let daylight = findCurrentTimePeriod(timezone, subComp, "DAYLIGHT");
        let daylightTZOffset = getIcalString(daylight, "TZOFFSETTO");
        let warningDetail;
        if (probableTZScore == 1) {
          // score 1 means has daylight time,
          // but transitions start on different weekday from os timezone.
          let standardStart = getIcalString(standard, "DTSTART");
          let standardStartWeekday = weekday(standardStart, timezone);
          let standardRule = getIcalString(standard, "RRULE");
          let standardText =
            "  Standard: " +
            standardStart +
            " " +
            standardStartWeekday +
            "\n" +
            "            " +
            standardRule +
            "\n";
          let daylightStart = getIcalString(daylight, "DTSTART");
          let daylightStartWeekday = weekday(daylightStart, timezone);
          let daylightRule = getIcalString(daylight, "RRULE");
          let daylightText =
            "  Daylight: " +
            daylightStart +
            " " +
            daylightStartWeekday +
            "\n" +
            "            " +
            daylightRule +
            "\n";
          warningDetail =
            (standardStart < daylightStart
              ? standardText + daylightText
              : daylightText + standardText) +
            calProperties.GetStringFromName("TZAlmostMatchesOSDifferAtMostAWeek");
        } else {
          warningDetail = calProperties.GetStringFromName("TZSeemsToMatchOS");
        }
        let offsetString = standardTZOffset + (daylightTZOffset ? "/" + daylightTZOffset : "");
        let warningMsg = calProperties.formatStringFromName("WarningUsingGuessedTZ", [
          tzId,
          offsetString,
          warningDetail,
          probableTZSource,
        ]);
        cal.WARN(warningMsg);
        break;
      }
    }
  } catch (ex) {
    // don't abort if error occurs warning user
    Cu.reportError(ex);
  }

  // return the guessed timezone
  return probableTZId;
}
