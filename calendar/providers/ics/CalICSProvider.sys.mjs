/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import {
  CalDavGenericRequest,
  CalDavPropfindRequest,
} from "resource:///modules/caldav/CalDavRequest.sys.mjs";

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.provider.ics namespace.

/**
 * @implements {calICalendarProvider}
 */
export var CalICSProvider = {
  QueryInterface: ChromeUtils.generateQI(["calICalendarProvider"]),

  get type() {
    return "ics";
  },

  get displayName() {
    return cal.l10n.getCalString("icsName");
  },

  get shortName() {
    return "ICS";
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
    const uri = cal.provider.detection.locationToUri(location);
    if (!uri) {
      throw new Error("Could not infer location from username");
    }

    const detector = new ICSDetector(username, password, savePassword);

    // To support ics files hosted by simple HTTP server, attempt HEAD/GET
    // before PROPFIND.
    for (const method of [
      "attemptHead",
      "attemptGet",
      "attemptDAVLocation",
      "attemptPut",
      "attemptLocalFile",
    ]) {
      try {
        cal.LOG(`[CalICSProvider] Trying to detect calendar using ${method} method`);
        const calendars = await detector[method](uri);
        if (calendars) {
          return calendars;
        }
      } catch (e) {
        // e may be an Error object or a response object like CalDavSimpleResponse.
        const message = `[CalICSProvider] Could not detect calendar using method ${method}`;

        const errorDetails = err =>
          ` - ${err.fileName || err.filename}:${err.lineNumber}: ${err} - ${err.stack}`;

        const responseDetails = response => ` - HTTP response status ${response.status}`;

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
 * Used by the CalICSProvider to detect ICS calendars for a given username,
 * password, location, etc.
 *
 * @implements {nsIAuthPrompt2}
 * @implements {nsIAuthPromptProvider}
 * @implements {nsIInterfaceRequestor}
 */
class ICSDetectionSession {
  QueryInterface = ChromeUtils.generateQI([
    Ci.nsIAuthPrompt2,
    Ci.nsIAuthPromptProvider,
    Ci.nsIInterfaceRequestor,
  ]);

  isDetectionSession = true;

  /**
   * Create a new ICS detection session.
   *
   * @param {string} aSessionId - The session id, used in the password manager.
   * @param {string} aName - The user-readable description of this session.
   * @param {string} aPassword - The password for the session.
   * @param {boolean} aSavePassword - Whether to save the password.
   */
  constructor(aSessionId, aUserName, aPassword, aSavePassword) {
    this.id = aSessionId;
    this.name = aUserName;
    this.password = aPassword;
    this.savePassword = aSavePassword;
  }

  /**
   * Implement nsIInterfaceRequestor.
   *
   * @param {nsIIDRef} aIID - The IID of the interface being requested.
   * @returns {ICSAutodetectSession | null} Either this object QI'd to the IID, or null.
   *                                          Components.returnCode is set accordingly.
   * @see {nsIInterfaceRequestor}
   */
  getInterface(aIID) {
    try {
      // Try to query the this object for the requested interface but don't
      // throw if it fails since that borks the network code.
      return this.QueryInterface(aIID);
    } catch (e) {
      Components.returnCode = e;
    }
    return null;
  }

  /**
   * @see {nsIAuthPromptProvider}
   */
  getAuthPrompt(aReason, aIID) {
    try {
      return this.QueryInterface(aIID);
    } catch (e) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
    }
  }

  /**
   * @see {nsIAuthPrompt2}
   */
  asyncPromptAuth(aChannel, aCallback, aContext, aLevel, aAuthInfo) {
    setTimeout(() => {
      if (this.promptAuth(aChannel, aLevel, aAuthInfo)) {
        aCallback.onAuthAvailable(aContext, aAuthInfo);
      } else {
        aCallback.onAuthCancelled(aContext, true);
      }
    }, 0);
  }

  /**
   * @see {nsIAuthPrompt2}
   */
  promptAuth(aChannel, aLevel, aAuthInfo) {
    if (!this.password) {
      return false;
    }

    if ((aAuthInfo.flags & aAuthInfo.PREVIOUS_FAILED) == 0) {
      aAuthInfo.username = this.name;
      aAuthInfo.password = this.password;

      if (this.savePassword) {
        cal.auth.passwordManagerSave(
          this.name,
          this.password,
          aChannel.URI.prePath,
          aAuthInfo.realm
        );
      }
      return true;
    }

    aAuthInfo.username = null;
    aAuthInfo.password = null;
    if (this.savePassword) {
      cal.auth.passwordManagerRemove(this.name, aChannel.URI.prePath, aAuthInfo.realm);
    }
    return false;
  }

  /** @see {CalDavSession} */
  async prepareRequest(aChannel) {}
  async prepareRedirect(aOldChannel, aNewChannel) {}
  async completeRequest(aResponse) {}
}

/**
 * Used by the CalICSProvider to detect ICS calendars for a given location,
 * username, password, etc. The protocol for detecting ICS calendars is DAV
 * (pure DAV, not CalDAV), but we use some of the CalDAV code here because the
 * code is not currently organized to handle pure DAV and CalDAV separately
 * (e.g. CalDavGenericRequest, CalDavPropfindRequest).
 */
class ICSDetector {
  /**
   * Create a new ICS detector.
   *
   * @param {string} username - A username.
   * @param {string} password - A password.
   * @param {boolean} savePassword - Whether to save the password or not.
   */
  constructor(username, password, savePassword) {
    this.session = new ICSDetectionSession(cal.getUUID(), username, password, savePassword);
  }

  /**
   * Attempt to detect calendars at the given location using CalDAV PROPFIND.
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async attemptDAVLocation(location) {
    const props = ["D:getcontenttype", "D:resourcetype", "D:displayname", "A:calendar-color"];
    const request = new CalDavPropfindRequest(this.session, null, location, props);

    // `request.commit()` can throw; errors should be caught by calling functions.
    const response = await request.commit();
    const target = response.uri;

    if (response.authError) {
      throw new cal.provider.detection.AuthFailedError();
    } else if (!response.ok) {
      cal.LOG(`[calICSProvider] ${target.spec} did not respond properly to PROPFIND`);
      return null;
    }

    const resprops = response.firstProps;
    const resourceType = resprops["D:resourcetype"] || new Set();

    if (resourceType.has("C:calendar") || resprops["D:getcontenttype"] == "text/calendar") {
      cal.LOG(`[calICSProvider] ${target.spec} is a calendar`);
      return [this.handleCalendar(target, resprops)];
    } else if (resourceType.has("D:collection")) {
      return this.handleDirectory(target);
    }

    return null;
  }

  /**
   * Attempt to detect calendars at the given location using a CalDAV generic
   * request and a method like "HEAD" or "GET".
   *
   * @param {string} method - The request method to use, e.g. "GET" or "HEAD".
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async _attemptMethod(method, location) {
    const request = new CalDavGenericRequest(this.session, null, method, location, {
      Accept: "text/calendar, application/ics, text/plain;q=0.9",
    });

    // `request.commit()` can throw; errors should be caught by calling functions.
    const response = await request.commit();

    // The content type header may include a charset, so use 'string.includes'.
    if (response.ok) {
      const header = response.getHeader("Content-Type");

      if (
        header.includes("text/calendar") ||
        header.includes("application/ics") ||
        (response.text && response.text.includes("BEGIN:VCALENDAR"))
      ) {
        const target = response.uri;
        cal.LOG(`[calICSProvider] ${target.spec} has valid content type (via ${method} request)`);
        return [this.handleCalendar(target)];
      }
    }
    return null;
  }

  get attemptHead() {
    return this._attemptMethod.bind(this, "HEAD");
  }

  get attemptGet() {
    return this._attemptMethod.bind(this, "GET");
  }

  /**
   * Attempt to detect calendars at the given location using a CalDAV generic
   * request and "PUT".
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async attemptPut(location) {
    const request = new CalDavGenericRequest(
      this.session,
      null,
      "PUT",
      location,
      { "If-Match": "nothing" },
      "",
      "text/plain"
    );
    // `request.commit()` can throw; errors should be caught by calling functions.
    const response = await request.commit();
    const target = response.uri;

    if (response.conflict) {
      // The etag didn't match, which means we can generally write here but our crafted etag
      // is stopping us. This means we can assume there is a calendar at the location.
      cal.LOG(
        `[calICSProvider] ${target.spec} responded to a dummy ETag request, we can` +
          " assume it is a valid calendar location"
      );
      return [this.handleCalendar(target)];
    }

    return null;
  }

  /**
   * Attempt to detect a calendar for a file URI (`file:///path/to/file.ics`).
   * If a directory in the path does not exist return null. Whether the file
   * exists or not, return a calendar for the location (the file will be
   * created if it does not exist).
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {calICalendar[] | null} An array containing a calendar or null.
   */
  async attemptLocalFile(location) {
    if (location.schemeIs("file")) {
      const fullPath = location.QueryInterface(Ci.nsIFileURL).file.path;
      const pathToDir = PathUtils.parent(fullPath);
      const dirExists = await IOUtils.exists(pathToDir);

      if (dirExists || pathToDir == "") {
        const calendar = this.handleCalendar(location);
        if (calendar) {
          // Check whether we have write permission on the calendar file.
          // Calling stat on a non-existent file is an error so we check for
          // it's existence first.
          const { permissions } = (await IOUtils.exists(fullPath))
            ? await IOUtils.stat(fullPath)
            : await IOUtils.stat(pathToDir);

          calendar.readOnly = (permissions ^ 0o200) == 0;
          return [calendar];
        }
      } else {
        cal.LOG(`[calICSProvider] ${location.spec} includes a directory that does not exist`);
      }
    } else {
      cal.LOG(`[calICSProvider] ${location.spec} is not a "file" URI`);
    }
    return null;
  }

  /**
   * Utility function to make a new attempt to detect calendars after the
   * previous PROPFIND results contained "D:resourcetype" with "D:collection".
   *
   * @param {nsIURI} location - The location to attempt.
   * @returns {Promise<calICalendar[] | null>} An array of calendars or null.
   */
  async handleDirectory(location) {
    const props = [
      "D:getcontenttype",
      "D:current-user-privilege-set",
      "D:displayname",
      "A:calendar-color",
    ];
    const request = new CalDavPropfindRequest(this.session, null, location, props, 1);

    // `request.commit()` can throw; errors should be caught by calling functions.
    const response = await request.commit();
    const target = response.uri;

    const calendars = [];
    for (const [href, resprops] of Object.entries(response.data)) {
      if (resprops["D:getcontenttype"] != "text/calendar") {
        continue;
      }

      const uri = Services.io.newURI(href, null, target);
      calendars.push(this.handleCalendar(uri, resprops));
    }

    cal.LOG(`[calICSProvider] ${target.spec} is a directory, found ${calendars.length} calendars`);

    return calendars.length ? calendars : null;
  }

  /**
   * Set up and return a new ICS calendar object.
   *
   * @param {nsIURI} uri - The location of the calendar.
   * @param {Set} [props] - For CalDav calendars, these are the props
   *                                  parsed from the response.
   * @returns {calICalendar} A new calendar.
   */
  handleCalendar(uri, props = new Set()) {
    let displayName = props["D:displayname"];
    const color = props["A:calendar-color"];
    if (!displayName) {
      const lastPath = uri.filePath.split("/").filter(Boolean).pop() || "";
      const fileName = lastPath.split(".").slice(0, -1).join(".");
      displayName = fileName || lastPath || uri.spec;
    }

    const calendar = cal.manager.createCalendar("ics", uri);
    calendar.setProperty("color", color || cal.view.hashColor(uri.spec));
    calendar.name = displayName;
    calendar.id = cal.getUUID();

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
