/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setInterval: "resource://gre/modules/Timer.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "InAppNotifications",
    maxLogLevel: "Warn",
  })
);

/**
 * Regularily check the in-app notification server for the latest notifications.
 */
export const NotificationUpdater = {
  /**
   * Reference to the update interval.
   *
   * @type {?number}
   */
  _interval: null,

  /**
   * Callback for the updater, called with the latest parsed JSON from the
   * server.
   *
   * @type {?Function}
   */
  onUpdate: null,

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
   * @param {number} lastUpdate - Timestamp (in ms) of the last cached update.
   * @returns {boolean} True if the caller should initialize its state from
   *   cache, since updating from the network did not yield any information.
   */
  async init(lastUpdate) {
    if (this._interval) {
      return false;
    }
    const refreshInterval = Services.prefs.getIntPref(
      "mail.inappnotifications.refreshInterval",
      21600000
    );
    this._interval = lazy.setInterval(() => {
      this._fetch();
    }, refreshInterval);
    // Don't immediately update if the cache is new enough.
    if (lastUpdate + refreshInterval > Date.now()) {
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
    if (!this.canUpdate) {
      return false;
    }
    if (!this.onUpdate) {
      lazy.console.warn(
        "Not checking for in-app notifications updates because no callback is registered"
      );
      return false;
    }
    const refreshUrl = Services.prefs.getStringPref(
      "mail.inappnotifications.url",
      ""
    );
    if (!refreshUrl) {
      return false;
    }
    try {
      const response = await fetch(refreshUrl, {
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok || response.code >= 400) {
        return false;
      }
      const notificationJson = await response.json();
      this.onUpdate(notificationJson);
    } catch (error) {
      lazy.console.error("Error fetching in-app notifications:", error);
      return false;
    }
    return true;
  },
};
