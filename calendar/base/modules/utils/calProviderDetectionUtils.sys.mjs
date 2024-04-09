/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * Code to call the calendar provider detection mechanism.
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.provider.detection namespace.

/**
 * The base class marker for detection errors. Useful in instanceof checks.
 */
class DetectionError extends Error {}

/**
 * Creates an error class that extends the base detection error.
 *
 * @param {string} aName - The name of the constructor, used for the base error class.
 * @returns {DetectionError} A class extending DetectionError.
 */
function DetectionErrorClass(aName) {
  return class extends DetectionError {
    constructor(message) {
      super(message);
      this.name = aName;
    }
  };
}

/**
 * The exported `calproviderdetection` object.
 */
export var detection = {
  /**
   * A map of providers that implement detection. Maps the type identifier
   * (e.g. "ics", "caldav") to the provider object.
   *
   * @type {Map<string, calICalendarProvider>}
   */
  get providers() {
    const providers = new Map();
    for (const [type, provider] of cal.provider.providers) {
      if (provider.detectCalendars) {
        providers.set(type, provider);
      }
    }
    return providers;
  },

  /**
   * Known domains for Google OAuth. This is just to catch the most common case,
   * MX entries should be checked for remaining cases.
   *
   * @type {Set<string>}
   */
  googleOAuthDomains: new Set(["gmail.com", "googlemail.com", "apidata.googleusercontent.com"]),

  /**
   * Translate location and username to an uri. If the location is empty, the
   * domain part of the username is taken. If the location is a hostname it is
   * converted to a https:// uri, if it is an uri string then use that.
   *
   * @param {string} aLocation - The location string.
   * @param {string} aUsername - The username string.
   * @returns {nsIURI} The resulting location uri.
   */
  locationToUri(aLocation, aUsername) {
    let uri = null;
    if (!aLocation) {
      const match = aUsername.match(/[^@]+@([^.]+\..*)/);
      if (match) {
        uri = Services.io.newURI("https://" + match[1]);
      }
    } else if (aLocation.includes("://")) {
      // Try to parse it as an uri
      uri = Services.io.newURI(aLocation);
    } else {
      // Maybe its just a simple hostname
      uri = Services.io.newURI("https://" + aLocation);
    }
    return uri;
  },

  /**
   * Detect calendars using the given information. The location can be a number
   * of things and handling this is up to the provider. It could be a hostname,
   * a specific URL, the origin URL, etc.
   *
   * @param {string} aUsername - The username for logging in.
   * @param {string} aPassword - The password for logging in.
   * @param {string} aLocation - The location information.
   * @param {boolean} aSavePassword - If true, the credentials will be saved
   *   in the password manager if used.
   * @param {ProviderFilter[]} aPreDetectFilters - Functions for filtering out providers.
   * @param {object} aExtraProperties - Extra properties to pass on to the
   *   providers.
   * @returns {Promise<Map<string,calICalendar[]>>} a Map of provider type to calendars found.
   */
  async detect(
    aUsername,
    aPassword,
    aLocation,
    aSavePassword,
    aPreDetectFilters,
    aExtraProperties
  ) {
    const providers = this.providers;

    if (!providers.size) {
      throw new detection.NoneFoundError(
        "No providers available that implement calendar detection"
      );
    }

    // Filter out the providers that should not be used (for the location, username, etc.).
    for (const func of aPreDetectFilters) {
      const typesToFilterOut = func(providers.keys(), aLocation, aUsername);
      typesToFilterOut.forEach(type => providers.delete(type));
    }

    const resolutions = await Promise.allSettled(
      [...providers.values()].map(provider => {
        const detectionResult = provider.detectCalendars(
          aUsername,
          aPassword,
          aLocation,
          aSavePassword,
          aExtraProperties
        );
        return detectionResult.then(
          result => ({ provider, status: Cr.NS_OK, detail: result }),
          failure => ({ provider, status: Cr.NS_ERROR_FAILURE, detail: failure })
        );
      })
    );

    let failCount = 0;
    let lastError;
    const results = new Map(
      resolutions.reduce((res, resolution) => {
        const { provider, status, detail } = resolution.value || resolution.reason;

        if (Components.isSuccessCode(status) && detail && detail.length) {
          res.push([provider, detail]);
        } else {
          failCount++;
          if (detail instanceof DetectionError) {
            lastError = detail;
          }
        }

        return res;
      }, [])
    );

    // If everything failed due to one of the detection errors, then pass that on.
    if (failCount == resolutions.length) {
      throw lastError || new detection.NoneFoundError();
    }

    return results;
  },

  /** The base detection error class */
  Error: DetectionError,

  /** An error that can be thrown if authentication failed */
  AuthFailedError: DetectionErrorClass("AuthFailedError"),

  /** An error that can be thrown if the location is invalid or has no calendars */
  NoneFoundError: DetectionErrorClass("NoneFoundError"),

  /** An error that can be thrown if the user canceled the operation */
  CanceledError: DetectionErrorClass("CanceledError"),
};
