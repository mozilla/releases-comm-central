/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Controller for the In-App Notification system for showing messages from the
 * project to users.
 */
export const InAppNotifications = {
  /**
   * Initialization function setting up everything for In-App Notifications.
   * Called by MailGlue if the feature is not disabled by pref.
   */
  init() {
    //TODO load state from cache
    //TODO set up refresh from network
    //TODO initialize notification scheduler
  },
};
