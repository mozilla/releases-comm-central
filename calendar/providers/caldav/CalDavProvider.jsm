/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalDavProvider"];

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

var { CalDavPropfindRequest } = ChromeUtils.import("resource:///modules/caldav/CalDavRequest.jsm");

var { CalDavDetectionSession } = ChromeUtils.import("resource:///modules/caldav/CalDavSession.jsm");

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.provider.caldav namespace.

/**
 * @implements {calICalendarProvider}
 */
var CalDavProvider = {
  QueryInterface: ChromeUtils.generateQI(["calICalendarProvider"]),

  get type() {
    return "caldav";
  },

  get displayName() {
    return cal.l10n.getCalString("caldavName");
  },

  get shortName() {
    return "CalDAV";
  },

  deleteCalendar(aCalendar, aListener) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  async detectCalendars(
    username,
    password,
    location = null,
    savePassword = false,
    extraProperties = {}
  ) {
    let uri = cal.provider.detection.locationToUri(location);
    if (!uri) {
      throw new Error("Could not infer location from username");
    }

    let detector = new CalDavDetector(username, password, savePassword);

    for (let method of [
      "attemptGoogleOauth",
      "attemptLocation",
      "dnsSRV",
      "wellKnown",
      "attemptRoot",
    ]) {
      try {
        cal.LOG(`[CalDavProvider] Trying to detect calendar using ${method} method`);
        let calendars = await detector[method](uri);
        if (calendars) {
          return calendars;
        }
      } catch (e) {
        // e may be an Error object or a response object like CalDavSimpleResponse.
        // It can even be a string, as with the OAuth2 error below.
        let message = `[CalDavProvider] Could not detect calendar using method ${method}`;

        let errorDetails = err =>
          ` - ${err.fileName || err.filename}:${err.lineNumber}: ${err} - ${err.stack}`;

        let responseDetails = response => ` - HTTP response status ${response.status}`;

        // A special thing the OAuth2 code throws.
        if (e == '{ "error": "cancelled"}') {
          cal.WARN(message + ` - OAuth2 '${e}'`);
          throw new cal.provider.detection.CanceledError("OAuth2 prompt canceled");
        }

        // We want to pass on any autodetect errors that will become results.
        if (e instanceof cal.provider.detection.Error) {
          cal.WARN(message + errorDetails(e));
          throw e;
        }

        // Sometimes e is a CalDavResponseBase that is an auth error, so throw it.
        if (e.authError) {
          cal.WARN(message + responseDetails(e));
          throw new cal.provider.detection.AuthFailedError();
        }

        if (e instanceof Error) {
          cal.WARN(message + errorDetails(e));
        } else if (typeof e.status == "number") {
          cal.WARN(message + responseDetails(e));
        } else {
          cal.WARN(message);
        }
      }
    }
    return [];
  },
};

/**
 * Used by the CalDavProvider to detect CalDAV calendars for a given username,
 * password, location, etc.
 */
class CalDavDetector {
  /**
   * Create a new caldav detector.
   *
   * @param {string} username - A username.
   * @param {string} password - A password.
   * @param {boolean} savePassword - Whether to save the password or not.
   */
  constructor(username, password, savePassword) {
    this.username = username;
    this.session = new CalDavDetectionSession(username, password, savePassword);
  }

  /**
   * Attempt to detect calendars at the given location.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  attemptLocation(location) {
    if (location.filePath == "/") {
      // The location is the root, don't try to detect the collection, let the
      // other handlers take care of it.
      return Promise.resolve(null);
    }
    return this.detectCollection(location);
  }

  /**
   * Attempt to detect calendars at the given location using DNS lookups.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async dnsSRV(location) {
    if (location.filePath != "/") {
      // If there is already a path specified, then no need to use DNS lookups.
      return null;
    }

    let dnshost = location.host;
    let secure = location.schemeIs("http") ? "" : "s";
    let dnsres = await DNS.srv(`_caldav${secure}._tcp.${dnshost}`);

    if (!dnsres.length) {
      let basedomain;
      try {
        basedomain = Services.eTLD.getBaseDomain(location);
      } catch (e) {
        // If we can't get a base domain just skip it.
      }

      if (basedomain && basedomain != location.host) {
        cal.LOG(`[CalDavProvider] ${location.host} has no SRV entry, trying ${basedomain}`);
        dnsres = await DNS.srv(`_caldav${secure}._tcp.${basedomain}`);
        dnshost = basedomain;
      }
    }

    if (!dnsres.length) {
      return null;
    }
    dnsres.sort((a, b) => a.prio - b.prio || b.weight - a.weight);

    // Determine path from TXT, if available.
    let pathres = await DNS.txt(`_caldav${secure}._tcp.${dnshost}`);
    pathres.sort((a, b) => a.prio - b.prio || b.weight - a.weight);
    pathres = pathres.filter(result => result.data.startsWith("path="));
    // Get the string after `path=`.
    let path = pathres.length ? pathres[0].data.substr(5) : "";

    let calendars;
    if (path) {
      // If the server has SRV and TXT entries, we already have a full context path to test.
      let uri = `http${secure}://${dnsres[0].host}:${dnsres[0].port}${path}`;
      cal.LOG(`[CalDavProvider] Trying ${uri} from SRV and TXT response`);
      calendars = await this.detectCollection(Services.io.newURI(uri));
    }

    if (!calendars) {
      // Either the txt record doesn't point to a path (in which case we need to repeat with
      // well-known), or no calendars could be detected at that location (in which case we
      // need to repeat with well-known).

      let baseloc = Services.io.newURI(
        `http${secure}://${dnsres[0].host}:${dnsres[0].port}/.well-known/caldav`
      );
      cal.LOG(`[CalDavProvider] Trying ${baseloc.spec} from SRV response with .well-known`);

      calendars = await this.detectCollection(baseloc);
    }

    return calendars;
  }

  /**
   * Attempt to detect calendars using a `.well-known` URI.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async wellKnown(location) {
    let wellKnownUri = Services.io.newURI("/.well-known/caldav", null, location);
    cal.LOG(`[CalDavProvider] Trying .well-known URI without dns at ${wellKnownUri.spec}`);
    return this.detectCollection(wellKnownUri);
  }

  /**
   * Attempt to detect calendars using a root ("/") URI.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  attemptRoot(location) {
    let rootUri = Services.io.newURI("/", null, location);
    return this.detectCollection(rootUri);
  }

  /**
   * Attempt to detect calendars using Google OAuth.
   *
   * @param {nsIURI} calURI - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async attemptGoogleOauth(calURI) {
    let usesGoogleOAuth = cal.provider.detection.googleOAuthDomains.has(calURI.host);
    if (!usesGoogleOAuth) {
      // Not using Google OAuth that we know of, but we could check the mx entry.
      // If mail is handled by Google then this is likely a Google Apps domain.
      let mxRecords = await DNS.mx(calURI.host);
      usesGoogleOAuth = mxRecords.some(r => /\bgoogle\.com$/.test(r.host));
    }

    if (usesGoogleOAuth) {
      // If we were given a full URL to a calendar, try to use it.
      let spec = this.username
        ? `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(
            this.username
          )}/user`
        : calURI.spec;
      let uri = Services.io.newURI(spec);
      return this.handlePrincipal(uri);
    }
    return null;
  }

  /**
   * Utility function to detect whether a calendar collection exists at a given
   * location and return it if it exists.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async detectCollection(location) {
    let props = [
      "D:resourcetype",
      "D:owner",
      "D:displayname",
      "D:current-user-principal",
      "D:current-user-privilege-set",
      "A:calendar-color",
      "C:calendar-home-set",
    ];

    cal.LOG(`[CalDavProvider] Checking collection type at ${location.spec}`);
    let request = new CalDavPropfindRequest(this.session, null, location, props);

    // `request.commit()` can throw; errors should be caught by calling functions.
    let response = await request.commit();
    let target = response.uri;

    if (response.authError) {
      throw new cal.provider.detection.AuthFailedError();
    } else if (!response.ok) {
      cal.LOG(`[CalDavProvider] ${target.spec} did not respond properly to PROPFIND`);
      return null;
    }

    let resprops = response.firstProps;
    let resourceType = resprops["D:resourcetype"];

    if (resourceType.has("C:calendar")) {
      cal.LOG(`[CalDavProvider] ${target.spec} is a calendar`);
      return [this.handleCalendar(target, resprops)];
    } else if (resourceType.has("D:principal")) {
      cal.LOG(`[CalDavProvider] ${target.spec} is a principal, looking at home set`);
      let homeSet = resprops["C:calendar-home-set"];
      let homeSetUrl = Services.io.newURI(homeSet, null, target);
      return this.handleHomeSet(homeSetUrl);
    } else if (resprops["D:current-user-principal"]) {
      cal.LOG(
        `[CalDavProvider] ${target.spec} is something else, looking at current-user-principal`
      );
      let principalUrl = Services.io.newURI(resprops["D:current-user-principal"], null, target);
      return this.handlePrincipal(principalUrl);
    } else if (resprops["D:owner"]) {
      cal.LOG(`[CalDavProvider] ${target.spec} is something else, looking at collection owner`);
      let principalUrl = Services.io.newURI(resprops["D:owner"], null, target);
      return this.handlePrincipal(principalUrl);
    }

    return null;
  }

  /**
   * Utility function to make a new attempt to detect calendars after the
   * previous PROPFIND results contained either "D:current-user-principal"
   * or "D:owner" props.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async handlePrincipal(location) {
    let props = ["D:resourcetype", "C:calendar-home-set"];
    let request = new CalDavPropfindRequest(this.session, null, location, props);
    cal.LOG(`[CalDavProvider] Checking collection type at ${location.spec}`);

    // `request.commit()` can throw; errors should be caught by calling functions.
    let response = await request.commit();
    let homeSets = response.firstProps["C:calendar-home-set"];
    let target = response.uri;

    if (response.authError) {
      throw new cal.provider.detection.AuthFailedError();
    } else if (!response.firstProps["D:resourcetype"].has("D:principal")) {
      cal.LOG(`[CalDavProvider] ${target.spec} is not a principal collection`);
      return null;
    } else if (homeSets) {
      let calendars = [];
      for (let homeSet of homeSets) {
        cal.LOG(`[CalDavProvider] ${target.spec} has a home set at ${homeSet}, checking that`);
        let homeSetUrl = Services.io.newURI(homeSet, null, target);
        let discoveredCalendars = await this.handleHomeSet(homeSetUrl);
        if (discoveredCalendars) {
          calendars.push(...discoveredCalendars);
        }
      }
      return calendars.length ? calendars : null;
    } else {
      cal.LOG(`[CalDavProvider] ${target.spec} doesn't have a home set`);
      return null;
    }
  }

  /**
   * Utility function to make a new attempt to detect calendars after the
   * previous PROPFIND results contained a "C:calendar-home-set" prop.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async handleHomeSet(location) {
    let props = [
      "D:resourcetype",
      "D:displayname",
      "D:current-user-privilege-set",
      "A:calendar-color",
    ];
    let request = new CalDavPropfindRequest(this.session, null, location, props, 1);

    // `request.commit()` can throw; errors should be caught by calling functions.
    let response = await request.commit();
    let target = response.uri;

    if (response.authError) {
      throw new cal.provider.detection.AuthFailedError();
    }

    let calendars = [];
    for (let [href, resprops] of Object.entries(response.data)) {
      if (resprops["D:resourcetype"].has("C:calendar")) {
        let hrefUri = Services.io.newURI(href, null, target);
        calendars.push(this.handleCalendar(hrefUri, resprops));
      }
    }
    cal.LOG(`[CalDavProvider] ${target.spec} is a home set, found ${calendars.length} calendars`);

    return calendars.length ? calendars : null;
  }

  /**
   * Set up and return a new caldav calendar object.
   *
   * @param {nsIURI} uri - The location of the calendar.
   * @param {Set} props - The calendar properties parsed from the
   *                                  response.
   * @returns {calICalendar} A new calendar.
   */
  handleCalendar(uri, props) {
    let displayName = props["D:displayname"];
    let color = props["A:calendar-color"];
    if (!displayName) {
      let fileName = decodeURI(uri.spec).split("/").filter(Boolean).pop();
      displayName = fileName || uri.spec;
    }

    // Some servers provide colors as an 8-character hex string. Strip the alpha component.
    color = color?.replace(/^(#[0-9A-Fa-f]{6})[0-9A-Fa-f]{2}$/, "$1");

    let calendar = cal.manager.createCalendar("caldav", uri);
    calendar.setProperty("color", color || cal.view.hashColor(uri.spec));
    calendar.name = displayName;
    calendar.id = cal.getUUID();
    calendar.setProperty("username", this.username);
    calendar.wrappedJSObject.session = this.session.toBaseSession();

    // Attempt to discover if the user is allowed to write to this calendar.
    let privs = props["D:current-user-privilege-set"];
    if (privs && privs instanceof Set) {
      calendar.readOnly = !["D:write", "D:write-content", "D:write-properties", "D:all"].some(
        priv => privs.has(priv)
      );
    }
    return calendar;
  }
}
