/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  JSONFile: "resource://gre/modules/JSONFile.sys.mjs",
});

const PROFILE_LOCATION = ["scheduled-notifications", "notifications.json"];

/**
 * Controller for the In-App Notification system for showing messages from the
 * project to users.
 */
export const InAppNotifications = {
  /**
   * @type {?JSONFile}
   */
  _jsonFile: null,

  /**
   * Initialization function setting up everything for In-App Notifications.
   * Called by MailGlue if the feature is not disabled by pref.
   */
  async init() {
    if (this._jsonFile) {
      return;
    }
    this._jsonFile = new lazy.JSONFile({
      path: PathUtils.join(PathUtils.profileDir, ...PROFILE_LOCATION),
      dataPostProcessor: this._initializeNotifications,
    });
    await this._jsonFile.load();
    //TODO set up refresh from network
    //TODO initialize notification scheduler
  },

  /**
   * Update the notifications cache.
   *
   * @param {object[]} notifications
   */
  updateNotifications(notifications) {
    this._jsonFile.data.notifications = notifications;
    this._jsonFile.data.lastUpdate = Date.now();
    this._jsonFile.saveSoon();
  },

  /**
   * @returns {object[]} All available notifications.
   */
  getNotifications() {
    return this._jsonFile.data.notifications;
  },

  /**
   * Initialize the basic structure expected in the JSON file.
   *
   * @param {object} data - JSON data from the profile.
   * @returns {object} Initialized data.
   */
  _initializeNotifications(data) {
    if (!Array.isArray(data.notifications)) {
      data.notifications = [];
    }
    return data;
  },
};
