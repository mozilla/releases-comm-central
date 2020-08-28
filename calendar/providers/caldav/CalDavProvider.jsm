/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalDavProvider"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { DNS } = ChromeUtils.import("resource:///modules/DNS.jsm");
var { Autodetect } = ChromeUtils.import("resource:///modules/calendar/calAutodetect.jsm");

var { CalDavPropfindRequest } = ChromeUtils.import("resource:///modules/caldav/CalDavRequest.jsm");

var { CalDavAutodetectSession } = ChromeUtils.import(
  "resource:///modules/caldav/CalDavSession.jsm"
);

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.provider.caldav namespace.

/**
 * @implements {calICalendarProvider}
 */
var CalDavProvider = {
  get type() {
    return "caldav";
  },

  get displayName() {
    return cal.l10n.getCalString("caldavName");
  },

  createCalendar(aName, aUri, aListener) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  deleteCalendar(aCalendar, aListener) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  getCalendar(aUri) {
    return cal.getCalendarManager().createCalendar("caldav", aUri);
  },

  async autodetect(
    username,
    password,
    location = null,
    savePassword = false,
    extraProperties = {}
  ) {
    let uri = Autodetect.locationToUri(location);
    if (!uri) {
      throw new Error("Could not infer location from username");
    }

    let detector = new CalDavAutodetector(username, password, savePassword);

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
          throw new Autodetect.CanceledError("OAuth2 prompt cancelled");
        }

        // We want to pass on any autodetect errors that will become results.
        if (e instanceof Autodetect.Error) {
          cal.WARN(message + errorDetails(e));
          throw e;
        }

        // Sometimes e is a CalDavResponseBase that is an auth error, so throw it.
        if (e.authError) {
          cal.WARN(message + responseDetails(e));
          throw new Autodetect.AuthFailedError();
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
class CalDavAutodetector {
  /**
   * Create a new caldav autodetector.
   *
   * @param {string} username         A username.
   * @param {string} password         A password.
   * @param {boolean} savePassword    Whether to save the password or not.
   */
  constructor(username, password, savePassword) {
    this.username = username;
    this.session = new CalDavAutodetectSession(cal.getUUID(), username, password, savePassword);
  }

  /**
   * Attempt to detect calendars at the given location.
   *
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
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
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
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
      cal.LOG(`[CalDavProvider] Trying ${baseloc.spec} from SRV and TXT response`);
      let baseloc = Services.io.newURI(
        `http${secure}://${dnsres[0].host}:${dnsres[0].port}${path}`
      );
      calendars = await this.detectCollection(baseloc);
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
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
   */
  async wellKnown(location) {
    let wellKnownUri = Services.io.newURI("/.well-known/caldav", null, location);
    cal.LOG(`[CalDavProvider] Trying .well-known URI without dns at ${wellKnownUri.spec}`);
    return this.detectCollection(wellKnownUri);
  }

  /**
   * Attempt to detect calendars using a root ("/") URI.
   *
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
   */
  attemptRoot(location) {
    let rootUri = Services.io.newURI("/", null, location);
    return this.detectCollection(rootUri);
  }

  /**
   * Attempt to detect calendars using Google Oauth.
   *
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
   */
  async attemptGoogleOauth(location) {
    let usesGoogleOAuth = Autodetect.googleOAuthDomains.has(location.host);

    if (!usesGoogleOAuth) {
      // Not using Google OAuth that we know of, but we could check the mx entry.
      // If mail is handled by Google then this is likely a Google Apps domain.
      let mxres = await DNS.mx(location.host);
      usesGoogleOAuth = mxres.some(record => record.name.endsWith("google.com"));
    }

    if (usesGoogleOAuth) {
      let uri = Services.io.newURI(
        `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(this.username)}/user`
      );
      return this.handlePrincipal(uri);
    }

    return null;
  }

  /**
   * Utility function to detect whether a calendar collection exists at a given
   * location and return it if it exists.
   *
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
   */
  async detectCollection(location) {
    let props = [
      "D:resourcetype",
      "D:owner",
      "D:displayname",
      "D:current-user-principal",
      "A:calendar-color",
      "C:calendar-home-set",
    ];

    cal.LOG(`[CalDavProvider] Checking collection type at ${location.spec}`);
    let request = new CalDavPropfindRequest(this.session, null, location, props);

    // `request.commit()` can throw; errors should be caught by calling functions.
    let response = await request.commit();
    let target = response.uri;

    if (response.authError) {
      throw new Autodetect.AuthFailedError();
    } else if (!response.ok) {
      cal.LOG(`[CalDavProvider] ${target.spec} did not respond properly to PROPFIND`);
      return null;
    }

    let resprops = response.firstProps;
    let resourceType = resprops["D:resourcetype"];

    if (resourceType.has("C:calendar")) {
      cal.LOG(`[CalDavProvider] ${target.spec} is a calendar`);
      return [this.handleCalendar(target, resprops["D:displayname"], resprops["A:calendar-color"])];
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
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
   */
  async handlePrincipal(location) {
    let props = ["D:resourcetype", "C:calendar-home-set"];
    let request = new CalDavPropfindRequest(this.session, null, location, props);
    cal.LOG(`[CalDavProvider] Checking collection type at ${location.spec}`);

    // `request.commit()` can throw; errors should be caught by calling functions.
    let response = await request.commit();
    let homeSet = response.firstProps["C:calendar-home-set"];
    let target = response.uri;

    if (response.authError) {
      throw new Autodetect.AuthFailedError();
    } else if (!response.firstProps["D:resourcetype"].has("D:principal")) {
      cal.LOG(`[CalDavProvider] ${target.spec} is not a principal collection`);
      return null;
    } else if (homeSet) {
      cal.LOG(`[CalDavProvider] ${target.spec} has a home set at ${homeSet}, checking that`);
      let homeSetUrl = Services.io.newURI(homeSet, null, target);
      return this.handleHomeSet(homeSetUrl);
    } else {
      cal.LOG(`[CalDavProvider] ${target.spec} doesn't have a home set`);
      return null;
    }
  }

  /**
   * Utility function to make a new attempt to detect calendars after the
   * previous PROPFIND results contained a "C:calendar-home-set" prop.
   *
   * @param {nsIURI} location                   The location to attempt.
   * @return {Promise<calICalendar[] | null>}   An array of calendars or null.
   */
  async handleHomeSet(location) {
    let props = ["D:resourcetype", "D:displayname", "A:calendar-color"];
    let request = new CalDavPropfindRequest(this.session, null, location, props, 1);

    // `request.commit()` can throw; errors should be caught by calling functions.
    let response = await request.commit();
    let target = response.uri;

    if (response.authError) {
      throw new Autodetect.AuthFailedError();
    }

    let calendars = [];
    for (let [href, resprops] of Object.entries(response.data)) {
      if (resprops["D:resourcetype"].has("C:calendar")) {
        let hrefUri = Services.io.newURI(href, null, target);
        calendars.push(
          this.handleCalendar(hrefUri, resprops["D:displayname"], resprops["A:calendar-color"])
        );
      }
    }
    cal.LOG(`[CalDavProvider] ${target.spec} is a home set, found ${calendars.length} calendars`);

    return calendars.length ? calendars : null;
  }

  /**
   * Set up and return a new caldav calendar object.
   *
   * @param {nsIURI} uri              The location of the calendar.
   * @param {string} [displayName]    The display name of the calendar.
   * @param {string} [color]          The color for the calendar.
   * @return {calICalendar}           A new calendar.
   */
  handleCalendar(uri, displayName, color) {
    if (!displayName) {
      let fileName = decodeURI(uri.spec)
        .split("/")
        .filter(Boolean)
        .pop();
      displayName = fileName || uri.spec;
    }

    let calMgr = cal.getCalendarManager();
    let calendar = calMgr.createCalendar("caldav", uri);
    calendar.setProperty("color", color || cal.view.hashColor(uri.spec));
    calendar.name = displayName;
    calendar.id = cal.getUUID();
    calendar.wrappedJSObject.session = this.session.toBaseSession();
    return calendar;
  }
}
