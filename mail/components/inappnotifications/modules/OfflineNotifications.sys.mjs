/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @type {?Set<string>}
 */
let defaultNotificationIds;

export const OfflineNotifications = {
  /**
   * List of notifications that should be shown to the user if we have no valid
   * response from the server.
   *
   * Initializes the notification ID cache Set. The notifications themselves are
   * not cached here, since they are presumably written to cache in the primary
   * system.
   *
   * @returns {object[]}
   */
  async getDefaultNotifications() {
    try {
      const request = await fetch(
        "chrome://branding/content/inAppNotificationData.json"
      );
      if (!request.ok) {
        return [];
      }
      const data = await request.json();

      defaultNotificationIds = new Set(data.map(({ id }) => id));
      return data;
    } catch (error) {
      console.warn(
        "Encountered error when trying to read in-app notifications shipped with application:",
        error
      );
      return [];
    }
  },

  /**
   * List of notification IDs of the default notifications. Gets cached in this
   * scope.
   *
   * @returns {Set<string>}
   */
  async getDefaultNotificationIds() {
    if (!defaultNotificationIds) {
      await this.getDefaultNotifications();
    }
    // If there is still no cached set, assume there are no default
    // notifications and cache an empty set.
    if (!defaultNotificationIds) {
      defaultNotificationIds = new Set();
    }
    return defaultNotificationIds;
  },
};
