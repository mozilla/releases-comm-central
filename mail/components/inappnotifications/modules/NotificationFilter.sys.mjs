/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "bypassFiltering",
  "mail.inappnotifications.bypass-filtering",
  false
);

export const NotificationFilter = {
  /**
   * Check if a notification's conditions make it currently suitable for display.
   *
   * @param {object} notification - Notification to check.
   * @param {number} seed - The random seed for this notification.
   * @param {string[]} interactedWithIds - Notification IDs the user has
   *   interacted with.
   * @returns {boolean} If this notification should be shown.
   */
  isActiveNotification(notification, seed, interactedWithIds) {
    if (lazy.bypassFiltering) {
      return true;
    }
    if (interactedWithIds.includes(notification.id)) {
      return false;
    }
    const now = Date.now();
    const parsedEnd = Date.parse(notification.end_at);
    const parsedStart = Date.parse(notification.start_at);
    if (
      Number.isNaN(parsedEnd) ||
      Number.isNaN(parsedStart) ||
      parsedEnd < now ||
      parsedStart > now
    ) {
      return false;
    }
    // Must point to a https:// URL.
    try {
      if (
        notification.URL &&
        Services.io.extractScheme(notification.URL) !== "https"
      ) {
        return false;
      }
    } catch (error) {
      console.error("Error parsing notification URL:", error);
      return false;
    }
    if (
      Object.hasOwn(notification.targeting, "percent_chance") &&
      notification.targeting.percent_chance !== 100 &&
      notification.targeting.percent_chance < seed
    ) {
      return false;
    }
    if (
      Array.isArray(notification.targeting.exclude) &&
      notification.targeting.exclude.some(profile =>
        this.checkProfile(profile, interactedWithIds)
      )
    ) {
      return false;
    }
    if (
      Array.isArray(notification.targeting.include) &&
      !notification.targeting.include.some(profile =>
        this.checkProfile(profile, interactedWithIds)
      )
    ) {
      return false;
    }
    return true;
  },
  /**
   * Check a targeting profile against this application and the
   * notifications already interacted with by the user.
   *
   * @param {object} profile - The target profile to check.
   * @param {string[]} interactedWithIds - Notification IDs the user has
   *   interacted with.
   * @returns {boolean} If the given profile matches this application.
   */
  checkProfile(profile, interactedWithIds) {
    if (lazy.bypassFiltering) {
      return true;
    }
    if (
      Array.isArray(profile.locales) &&
      !profile.locales.includes(Services.locale.appLocaleAsBCP47)
    ) {
      return false;
    }
    if (
      Array.isArray(profile.versions) &&
      !profile.versions.includes(AppConstants.MOZ_APP_VERSION)
    ) {
      return false;
    }
    if (
      Array.isArray(profile.channels) &&
      !profile.channels.includes(AppConstants.MOZ_UPDATE_CHANNEL)
    ) {
      return false;
    }
    if (
      Array.isArray(profile.operating_systems) &&
      !profile.operating_systems.includes(
        AppConstants.platform === "linux"
          ? AppConstants.unixstyle
          : AppConstants.platform
      )
    ) {
      return false;
    }
    if (
      Array.isArray(profile.displayed_notifications) &&
      profile.displayed_notifications.some(notificationId =>
        interactedWithIds.includes(notificationId)
      )
    ) {
      return false;
    }
    if (
      Array.isArray(profile.pref_true) &&
      profile.pref_true.some(pref => !Services.prefs.getBoolPref(pref, false))
    ) {
      return false;
    }
    if (
      Array.isArray(profile.pref_false) &&
      profile.pref_false.some(pref => Services.prefs.getBoolPref(pref, true))
    ) {
      return false;
    }
    return true;
  },
};
