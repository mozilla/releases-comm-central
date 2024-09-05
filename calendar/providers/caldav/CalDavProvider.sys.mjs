/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { DNS } from "resource:///modules/DNS.sys.mjs";

import { CalDavPropfindRequest } from "resource:///modules/caldav/CalDavRequest.sys.mjs";
import { CalDavDetectionSession } from "resource:///modules/caldav/CalDavSession.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));
// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.provider.caldav namespace.

/**
 * @implements {calICalendarProvider}
 */
export var CalDavProvider = {
  QueryInterface: ChromeUtils.generateQI(["calICalendarProvider"]),

  get type() {
    return "caldav";
  },

  get displayName() {
    return lazy.l10n.formatValueSync("cal-dav-name");
  },

  get shortName() {
    return "CalDAV";
  },

  deleteCalendar() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  async detectCalendars(username, password, location = null, savePassword = false) {
    const uri = cal.provider.detection.locationToUri(location);
    if (!uri) {
      throw new Error("Could not infer location from username");
    }

    const detector = new CalDavDetector(username, password, savePassword);

    for (const method of [
      "attemptGoogleOauth",
      "attemptLocation",
      "dnsSRV",
      "wellKnown",
      "attemptRoot",
    ]) {
      try {
        cal.LOG(`[CalDavProvider] Trying to detect calendar using ${method} method`);
        const calendars = await detector[method](uri);
        if (calendars) {
          return calendars;
        }
      } catch (e) {
        // e may be an Error object or a response object like CalDavSimpleResponse.
        // It can even be a string, as with the OAuth2 error below.
        const message = `[CalDavProvider] Could not detect calendar using method ${method}`;

        const errorDetails = err =>
          ` - ${err.fileName || err.filename}:${err.lineNumber}: ${err} - ${err.stack}`;

        const responseDetails = response => ` - HTTP response status ${response.status}`;

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

    const secure = location.schemeIs("http") ? "" : "s";
    const host = `_caldav${secure}._tcp.${location.host}`;
    const dnsres = await DNS.srv(host);

    if (!dnsres.length) {
      cal.LOG(`[CalDavProvider] Found no SRV record for for ${host}`);
      return null;
    }
    dnsres.sort((a, b) => a.prio - b.prio || b.weight - a.weight);

    // Determine path from TXT, if available.
    const txtRecords = await DNS.txt(host);
    const pathres = txtRecords
      .map(result => result.strings.find(s => s.startsWith("path=")))
      .filter(Boolean);
    // Get the string after `path=`.
    const path = pathres[0]?.substring(5);

    let calendars;
    if (path) {
      // If the server has SRV and TXT entries, we already have a full context path to test.
      const uri = `http${secure}://${dnsres[0].host}:${dnsres[0].port}${path}`;
      cal.LOG(`[CalDavProvider] Trying ${uri} from SRV and TXT response`);
      calendars = await this.detectCollection(Services.io.newURI(uri));
    }

    if (!calendars) {
      // Either the txt record doesn't point to a path (in which case we need to repeat with
      // well-known), or no calendars could be detected at that location (in which case we
      // need to repeat with well-known).

      const baseloc = Services.io.newURI(
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
    const wellKnownUri = Services.io.newURI("/.well-known/caldav", null, location);
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
    const rootUri = Services.io.newURI("/", null, location);
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
      const mxRecords = await DNS.mx(calURI.host);
      usesGoogleOAuth = mxRecords.some(r => /\bgoogle\.com$/.test(r.host));
    }

    if (usesGoogleOAuth) {
      // If we were given a full URL to a calendar, try to use it.
      const spec = this.username
        ? `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(
            this.username
          )}/user`
        : calURI.spec;
      const uri = Services.io.newURI(spec);
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
    const props = [
      "D:resourcetype",
      "D:owner",
      "D:displayname",
      "D:current-user-principal",
      "D:current-user-privilege-set",
      "A:calendar-color",
      "C:calendar-home-set",
    ];

    cal.LOG(`[CalDavProvider] Checking collection type at ${location.spec}`);
    const request = new CalDavPropfindRequest(this.session, null, location, props);

    // `request.commit()` can throw; errors should be caught by calling functions.
    const response = await request.commit();
    const target = response.uri;

    if (response.authError) {
      throw new cal.provider.detection.AuthFailedError();
    } else if (!response.ok) {
      cal.LOG(`[CalDavProvider] ${target.spec} did not respond properly to PROPFIND`);
      return null;
    }

    const resprops = response.firstProps;
    const resourceType = resprops["D:resourcetype"];

    if (resourceType.has("C:calendar")) {
      cal.LOG(`[CalDavProvider] ${target.spec} is a calendar`);
      return [this.handleCalendar(target, resprops)];
    } else if (resprops["C:calendar-home-set"]?.length) {
      cal.LOG(`[CalDavProvider] ${target.spec} has a home set, looking at it`);
      const homeSetUrl = Services.io.newURI(resprops["C:calendar-home-set"][0], null, target);
      return this.handleHomeSet(homeSetUrl);
    } else if (resprops["D:current-user-principal"]) {
      cal.LOG(
        `[CalDavProvider] ${target.spec} is something else, looking at current-user-principal`
      );
      const principalUrl = Services.io.newURI(resprops["D:current-user-principal"], null, target);
      return this.handlePrincipal(principalUrl);
    } else if (resprops["D:owner"]) {
      cal.LOG(`[CalDavProvider] ${target.spec} is something else, looking at collection owner`);
      const principalUrl = Services.io.newURI(resprops["D:owner"], null, target);
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
    const props = ["C:calendar-home-set"];
    const request = new CalDavPropfindRequest(this.session, null, location, props);
    cal.LOG(`[CalDavProvider] Checking collection type at ${location.spec}`);

    // `request.commit()` can throw; errors should be caught by calling functions.
    const response = await request.commit();
    const homeSets = response.firstProps ? response.firstProps["C:calendar-home-set"] : null;
    const target = response.uri;

    if (response.authError) {
      throw new cal.provider.detection.AuthFailedError();
    } else if (homeSets) {
      const calendars = [];
      for (const homeSet of homeSets) {
        cal.LOG(`[CalDavProvider] ${target.spec} has a home set at ${homeSet}, checking that`);
        const homeSetUrl = Services.io.newURI(homeSet, null, target);
        const discoveredCalendars = await this.handleHomeSet(homeSetUrl);
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
    const props = [
      "D:resourcetype",
      "D:displayname",
      "D:current-user-privilege-set",
      "A:calendar-color",
    ];
    const request = new CalDavPropfindRequest(this.session, null, location, props, 1);

    // `request.commit()` can throw; errors should be caught by calling functions.
    const response = await request.commit();
    const target = response.uri;

    if (response.authError) {
      throw new cal.provider.detection.AuthFailedError();
    }

    const calendars = [];
    for (const [href, resprops] of Object.entries(response.data)) {
      if (resprops["D:resourcetype"].has("C:calendar")) {
        const hrefUri = Services.io.newURI(href, null, target);
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
      const fileName = decodeURI(uri.spec).split("/").filter(Boolean).pop();
      displayName = fileName || uri.spec;
    }

    // Some servers provide colors as an 8-character hex string. Strip the alpha component.
    color = color?.replace(/^(#[0-9A-Fa-f]{6})[0-9A-Fa-f]{2}$/, "$1");

    const calendar = cal.manager.createCalendar("caldav", uri);
    calendar.setProperty("color", color || cal.view.hashColor(uri.spec));
    calendar.name = displayName;
    calendar.id = cal.getUUID();
    calendar.setProperty("username", this.username);
    calendar.wrappedJSObject.session = this.session.toBaseSession();

    // Attempt to discover if the user is allowed to write to this calendar.
    const privs = props["D:current-user-privilege-set"];
    if (privs && privs instanceof Set) {
      calendar.readOnly = !["D:write", "D:write-content", "D:write-properties", "D:all"].some(
        priv => privs.has(priv)
      );
    }
    return calendar;
  }
}
