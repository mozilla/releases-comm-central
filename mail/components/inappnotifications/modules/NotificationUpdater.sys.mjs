/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "InAppNotifications",
    maxLogLevel: "Warn",
  })
);

const MAX_UPDATES_PER_DAY = 24;

/**
 * Regularily check the in-app notification server for the latest notifications.
 */
export const NotificationUpdater = {
  /**
   * The timestamps of when the last MAX_UPDATES_PER_DAY updates were done. This is used
   * to check to make sure that no more than the MAX_UPDATES_PER_DAY updates
   * are done.
   *
   * @type {number[]}
   */
  _updateHistory: [],

  /**
   * Reference to the update timeout.
   *
   * @type {?number}
   */
  _timeout: null,

  /**
   * Callback for the updater, called with the latest parsed JSON from the
   * server.
   *
   * @type {?Function}
   */
  onUpdate: null,

  /**
   * The unit of time in MS, for which notifications are limited. This defaults
   * to 1 day but can be modified to make testing possible.
   *
   * @type {number}
   */
  _PER_TIME_UNIT: 1000 * 60 * 60 * 24,

  /**
   *
   * @param {string} url - The url to fetch the expiration time for.
   * @returns {number} The time the cache expires in seconds since the unix
   *   epoch.
   */
  async getExpirationTime(url) {
    try {
      const { resolve, promise } = Promise.withResolvers();
      Services.cache2
        .diskCacheStorage(Services.loadContextInfo.anonymous)
        .asyncOpenURI(
          Services.io.newURI(url),
          "",
          Ci.nsICacheStorage.READ_ONLY,
          {
            onCacheEntryCheck() {
              return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
            },
            onCacheEntryAvailable({ expirationTime }) {
              resolve(expirationTime);
            },
          }
        );

      return promise;
    } catch (error) {
      lazy.console.error(error);
      return null;
    }
  },

  /**
   *
   * @param {string} url - The url to fetch the remaining cache time for.
   *
   * @returns {number} The number of milliseconds until the urls cache entry
   *  expires.
   */

  async getRemainingCacheTime(url) {
    const expirationTime = await this.getExpirationTime(url);

    // If the time is falsey or 0xFFFFFFFF return zero to fetch immediately.
    // 0xFFFFFFFF means there is no cache entry found.
    if (
      !expirationTime ||
      expirationTime === Ci.nsICacheEntry.NO_EXPIRATION_TIME
    ) {
      return 0;
    }

    return Math.max(expirationTime * 1000 - Date.now(), 0);
  },

  /**
   * If we can check the server for updates.
   *
   * @type {boolean}
   */
  get canUpdate() {
    const dataSubmissionPolicyAcceptedVersion = Services.prefs.getIntPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
      0
    );
    const currentPolicyVersion = Services.prefs.getIntPref(
      "datareporting.policy.currentPolicyVersion",
      1
    );
    return (
      !Services.io.offline &&
      dataSubmissionPolicyAcceptedVersion >= currentPolicyVersion &&
      Services.prefs.getBoolPref("mail.inappnotifications.enabled", false)
    );
  },

  /**
   * Initialize the updater, setting up a scheduled update as well as
   * immediately checking for the latest data from the server.
   *
   * @returns {boolean} True if the caller should initialize its state from
   *   cache, since updating from the network did not yield any information.
   */
  async init() {
    if (this._timeout) {
      return false;
    }

    const expirationTime = await this.getRemainingCacheTime(
      Services.urlFormatter.formatURLPref("mail.inappnotifications.url")
    );

    // Don't update if we have an expirationTime unless it's the defaultInterval
    if (expirationTime) {
      this._schedule(expirationTime);
      return true;
    }
    const didFetch = await this._fetch();
    return !didFetch;
  },

  /**
   * Checks the configured endpoint for json data, which is passed on to the
   * onUpdate callback on this object. Only runs if canUpdate is true.
   *
   * @returns {boolean} If a response from the server was received.
   */
  async _fetch() {
    if (!this.canUpdate || !this.onUpdate) {
      // Check again in ten minutes. Since no requests or updates are done
      // unless something changes we can be a little more eager here.
      this._schedule(1000 * 60 * 10);

      // TODO: Update to check error state and not continue to warn on every
      // iteration once we are storing if we are currently in an error state.
      if (!this.onUpdate) {
        lazy.console.warn(
          "Not checking for in-app notifications updates because no callback is registered"
        );
      }

      return false;
    }

    const url = Services.urlFormatter.formatURLPref(
      "mail.inappnotifications.url"
    );

    if (url === "about:blank" || !url) {
      return false;
    }

    // Check how many updates we have done in the last 24 hours. If
    // MAX_UPDATES_PER_DAY or more notifications have already been shown
    // reschedule.
    if (
      this._updateHistory.length === MAX_UPDATES_PER_DAY &&
      this._updateHistory[0] > Date.now() - this._PER_TIME_UNIT
    ) {
      this._schedule(this._updateHistory[0] + this._PER_TIME_UNIT - Date.now());
      return false;
    }

    let success = true;

    const defaultInterval = Services.prefs.getIntPref(
      "mail.inappnotifications.refreshInterval",
      21600000
    );

    let cacheUrl;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok || response.code >= 400) {
        this._schedule(defaultInterval);
        return false;
      }

      const notificationJson = await response.json();
      this.onUpdate(notificationJson);
      cacheUrl = response.url;
    } catch (error) {
      lazy.console.error("Error fetching in-app notifications:", error);
      success = false;
    }

    // Add the current update into the update history and shift if nessasarry
    this._updateHistory.push(Date.now());

    if (this._updateHistory.length > MAX_UPDATES_PER_DAY) {
      this._updateHistory.shift();
    }

    // Get the remining time on the cache, if it returns anything falsey
    // including zero use the default interval. We should never fetch again
    // without a delay
    const time =
      (await this.getRemainingCacheTime(cacheUrl)) || defaultInterval;

    this._schedule(time);

    return success;
  },

  _schedule(time) {
    this._timeout = lazy.setTimeout(() => {
      this._fetch();
    }, time);
  },
};
