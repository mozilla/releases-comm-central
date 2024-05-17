/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NotificationManager } from "resource:///modules/NotificationManager.sys.mjs";

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
    //TODO set up refresh from network
    //TODO possibly don't do this here and wait for the network refresh to have
    // completed/failed instead.
    this.notificationManager.updatedNotifications(this.getNotifications());
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
    this.notificationManager.updatedNotifications(notifications);

    this._jsonFile.saveSoon();
  },

  /**
   * @returns {object[]} All available notifications.
   */
  getNotifications() {
    const now = Date.now();
    return this._jsonFile.data.notifications.filter(
      notification =>
        !this._jsonFile.data.interactedWith.includes(notification.id) &&
        Date.parse(notification.start_at) < now &&
        Date.parse(notification.end_at) > now
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
        this.notificationManager.updatedNotifications(this.getNotifications());
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
    return data;
  },
};
