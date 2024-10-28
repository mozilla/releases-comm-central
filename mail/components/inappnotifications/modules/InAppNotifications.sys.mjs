/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NotificationManager } from "resource:///modules/NotificationManager.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  JSONFile: "resource://gre/modules/JSONFile.sys.mjs",
  NotificationFilter: "resource:///modules/NotificationFilter.sys.mjs",
  NotificationUpdater: "resource:///modules/NotificationUpdater.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const PROFILE_LOCATION = ["scheduled-notifications", "notifications.json"];

/**
 * Controller for the In-App Notification system for showing messages from the
 * project to users.
 *
 * @implements {nsIObserver}
 */
export const InAppNotifications = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
  /**
   * @type {?JSONFile}
   */
  _jsonFile: null,

  /**
   * Notification manager for the front-end to interact with. Immediately
   * initialized, so event listeners can be added before the rest of the module
   * is initialized.
   *
   * @type {NotificationManager}
   */
  notificationManager: new NotificationManager(),

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
    this.notificationManager.addEventListener(
      NotificationManager.NOTIFICATION_INTERACTION_EVENT,
      this
    );
    this.notificationManager.addEventListener(
      NotificationManager.REQUEST_NOTIFICATIONS_EVENT,
      this
    );
    Services.obs.addObserver(this, "intl:app-locales-changed");
    lazy.NotificationUpdater.onUpdate = updatedNotifications => {
      this.updateNotifications(updatedNotifications);
    };
    const shouldPopulateFromStorage = await lazy.NotificationUpdater.init(
      this._jsonFile.data.lastUpdate || 0
    );
    if (shouldPopulateFromStorage) {
      this._updateNotificationManager();
    }
  },

  /**
   * Update the notifications cache.
   *
   * @param {object[]} notifications
   */
  updateNotifications(notifications) {
    this._jsonFile.data.notifications = notifications;
    this._jsonFile.data.lastUpdate = Date.now();

    const notificationIds = new Set(
      notifications.map(notification => notification.id)
    );
    const interactedWithSet = new Set(this._jsonFile.data.interactedWith);
    const stillExistingInteractedWith =
      interactedWithSet.intersection(notificationIds);
    if (stillExistingInteractedWith.size < interactedWithSet.size) {
      this._jsonFile.data.interactedWith = Array.from(
        stillExistingInteractedWith
      );
    }
    this._jsonFile.data.seeds = Object.fromEntries(
      Object.entries(this._jsonFile.data.seeds).filter(([notificationId]) =>
        notificationIds.has(notificationId)
      )
    );
    this._updateNotificationManager();

    this._jsonFile.saveSoon();
  },

  /**
   * @returns {object[]} All available notifications.
   */
  getNotifications() {
    return this._jsonFile.data.notifications.filter(notification =>
      lazy.NotificationFilter.isActiveNotification(
        notification,
        this._getSeed(notification.id),
        this._jsonFile.data.interactedWith
      )
    );
  },

  /**
   * Mark a notification as having been interacted with and remember it.
   *
   * @param {string} notificationId - ID of the notification that was interacted
   *   with.
   */
  markAsInteractedWith(notificationId) {
    if (!this._jsonFile.data.interactedWith.includes(notificationId)) {
      this._jsonFile.data.interactedWith.push(notificationId);
      this._jsonFile.saveSoon();
    }
  },

  /**
   *
   * @param {Event} event
   */
  handleEvent(event) {
    switch (event.type) {
      case NotificationManager.NOTIFICATION_INTERACTION_EVENT:
        this.markAsInteractedWith(event.detail);
        break;
      case NotificationManager.REQUEST_NOTIFICATIONS_EVENT:
        this._updateNotificationManager();
        break;
    }
  },

  observe(subject, topic) {
    switch (topic) {
      case "intl:app-locales-changed":
        // When locales change, the filtered notifications can change.
        this._updateNotificationManager();
        break;
    }
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
    if (!Array.isArray(data.interactedWith)) {
      data.interactedWith = [];
    }
    if (typeof data.seeds !== "object") {
      data.seeds = {};
    }
    return data;
  },

  /**
   *
   * @param {string} notificationId - ID of the notification to get a seed for.
   * @returns {number} Value between 0 and 100 to compare against a percent
   *   chance. The value stays the same if the same notification ID is passed
   *   in.
   */
  _getSeed(notificationId) {
    if (Object.hasOwn(this._jsonFile.data.seeds, notificationId)) {
      return this._jsonFile.data.seeds[notificationId];
    }
    // Random number between 0 and 100, including 100.
    const seed = Math.floor(Math.random() * 101);
    this._jsonFile.data.seeds[notificationId] = seed;
    this._jsonFile.saveSoon();
    return seed;
  },

  /**
   * Update the notifications the notification manager decides the active
   * notification with.
   */
  _updateNotificationManager() {
    this._scheduleNotification();
    this.notificationManager.updatedNotifications(this.getNotifications());
  },

  /**
   * @type {number}
   */
  _showNotificationTimer: null,

  /**
   * Schedule a timer to make sure we check for new candidate notifications
   * when the next possible notification becomes available.
   */
  _scheduleNotification() {
    lazy.clearTimeout(this._showNotificationTimer);
    this._showNotificationTimer = null;

    if (!this._jsonFile.data.notifications.length) {
      return;
    }

    const now = Date.now();
    const [nextNotification] = this._jsonFile.data.notifications
      .map(n => Date.parse(n.start_at))
      .filter(n => n > now)
      .sort((a, b) => a - b);
    if (!nextNotification) {
      return;
    }

    this._showNotificationTimer = lazy.setTimeout(() => {
      this._showNotificationTimer = null;
      this._updateNotificationManager();
    }, nextNotification - Date.now());
  },
};
