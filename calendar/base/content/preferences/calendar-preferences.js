/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gCalendarPane */

/* import-globals-from alarms.js */
/* import-globals-from categories.js */
/* import-globals-from general.js */
/* import-globals-from notifications.js */
/* import-globals-from views.js */
/* globals Preferences */

Preferences.add({ id: "calendar.preferences.lightning.selectedTabIndex", type: "int" });

var gCalendarPane = {
  init() {
    let elements = document.querySelectorAll("#paneCalendar preference");
    for (let element of elements) {
      element.updateElements();
    }
    gCalendarGeneralPane.init();
    gAlarmsPane.init();
    gNotificationsPane.init();
    gCategoriesPane.init();
    gViewsPane.init();
  },
};
