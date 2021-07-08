/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gNotificationsPane */
/* globals Preferences */

Preferences.add({ id: "calendar.notifications.times", type: "string" });

/**
 * Global Object to hold methods for the notifications pref pane.
 */
var gNotificationsPane = {
  /**
   * Initialize <calendar-notifications-setting> and listen to the change event.
   */
  init() {
    var calendarNotificationsSetting = document.getElementById("calendar-notifications-setting");
    calendarNotificationsSetting.value = Preferences.get("calendar.notifications.times").value;
    calendarNotificationsSetting.addEventListener("change", () => {
      Preferences.get("calendar.notifications.times").value = calendarNotificationsSetting.value;
    });
  },
};
