/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

this.EXPORTED_SYMBOLS = ["Autodetect"]; /* exported Autodetect */

/*
 * Code to call the calendar provider autodetection mechanism.
 */

/**
 * The base class marker for autodetect error. Useful in instanceof checks.
 */
class AutodetectError extends Error {}

/**
 * Creates an error class that extends the base autodetect error.
 *
 * @param {string} aName        The name of the constructor, used for the base error class.
 * @return {AutodetectError}    A class extending AutodetectError.
 */
function AutodetectErrorClass(aName) {
  return class extends AutodetectError {
    constructor(message) {
      super(message);
      this.name = aName;
    }
  };
}

/**
 * The exported Autodetect object.
 */
var Autodetect = {
  /**
   * A map of providers that implement autodetection. Maps the type identifier
   * (e.g. "ics", "caldav") to the provider object.
   * @type {Map<string, calICalendarProvider>}
   */
  get providers() {
    let providers = new Map();
    for (let [type, provider] of cal.provider.providers) {
      if (provider.autodetect) {
        providers.set(type, provider);
      }
    }
    return providers;
  },

  /**
   * Known domains for Google OAuth. This is just to catch the most common case,
   * MX entries should be checked for remaining cases.
   * @type {Set<string>}
   */
  googleOAuthDomains: new Set(["gmail.com", "googlemail.com"]),

  /**
   * Translate location and username to an uri. If the location is empty, the
   * domain part of the username is taken. If the location is a hostname it is
   * converted to a https:// uri, if it is an uri string then use that.
   *
   * @param {string} aLocation        The location string.
   * @param {string} aUsername        The username string.
   * @return {nsIURI}                 The resulting location uri.
   */
  locationToUri(aLocation, aUsername) {
    let uri = null;
    if (!aLocation) {
      let match = aUsername.match(/[^@]+@([^.]+\..*)/);
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
   * Detect calendars using the given information. The location can be a number of things,
   * detecting this is up to the autodetect provider. It could be a hostname, a specific URL, the
   * origin URL, etc.
   *
   * @param {string} aUsername                              The username for logging in.
   * @param {string} aPassword                              The password for logging in.
   * @param {string} aLocation                              The location information.
   * @param {boolean} aSavePassword                         If true, the credentials will be saved
   *                                                          in the password manager if used.
   * @param {ProviderFilter[]} aPreDetectFilters            Functions for filtering out providers.
   * @param {Object} aExtraProperties                       Extra properties to pass on to the
   *                                                          autodetect providers.
   * @return {Promise<Map<String, calICalendar[]>>}         A promise resolving with a Map of
   *                                                          provider type to calendars found.
   */
  async detect(
    aUsername,
    aPassword,
    aLocation,
    aSavePassword,
    aPreDetectFilters,
    aExtraProperties
  ) {
    let providers = this.providers;

    if (!providers.size) {
      throw new Autodetect.NoneFoundError("No autodetect providers available");
    }

    // Filter out the providers that should not be used (for the location, username, etc.).
    for (let func of aPreDetectFilters) {
      let typesToFilterOut = func(providers.keys(), aLocation, aUsername);
      typesToFilterOut.forEach(type => providers.delete(type));
    }

    let resolutions = await Promise.allSettled(
      [...providers.values()].map(provider => {
        let detectionResult = provider.autodetect(
          aUsername,
          aPassword,
          aLocation,
          aSavePassword,
          aExtraProperties
        );
        return detectionResult.then(
          result => ({ type: provider.type, status: Cr.NS_OK, detail: result }),
          failure => ({ type: provider.type, status: Cr.NS_ERROR_FAILURE, detail: failure })
        );
      })
    );

    let failCount = 0;
    let lastError;
    let results = new Map(
      resolutions.reduce((res, resolution) => {
        let { type, status, detail } = resolution.value || resolution.reason;

        if (Components.isSuccessCode(status) && detail && detail.length) {
          res.push([type, detail]);
        } else {
          failCount++;
          if (detail instanceof AutodetectError) {
            lastError = detail;
          }
        }

        return res;
      }, [])
    );

    // If everything failed due to one of the autodetect errors, then pass that on.
    if (failCount == resolutions.length) {
      throw lastError || new Autodetect.NoneFoundError();
    }

    return results;
  },

  /** The base autodetection error class */
  Error: AutodetectError,

  /** An error that can be thrown if authentication failed */
  AuthFailedError: AutodetectErrorClass("AuthFailedError"),

  /** An error that can be thrown if the location is invalid or has no calendars */
  NoneFoundError: AutodetectErrorClass("NoneFoundError"),

  /** An error that can be thrown if the user canceled the operation */
  CanceledError: AutodetectErrorClass("CanceledError"),
};
