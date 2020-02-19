/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gLightningPane */

/* import-globals-from ../../../mail/components/preferences/preferences.js */
/* import-globals-from ../../../mail/components/preferences/subdialogs.js */
/* import-globals-from ../../base/content/calendar-ui-utils.js */
/* import-globals-from ../../base/content/preferences/alarms.js */
/* import-globals-from ../../base/content/preferences/categories.js */
/* import-globals-from ../../base/content/preferences/general.js */
/* import-globals-from ../../base/content/preferences/views.js */

Preferences.add({ id: "calendar.preferences.lightning.selectedTabIndex", type: "int" });

var gLightningPane = {
  init() {
    let elements = document.querySelectorAll("#paneLightning preference");
    for (let element of elements) {
      element.updateElements();
    }
  },
};

gCalendarGeneralPane.init();
gAlarmsPane.init();
gCategoriesPane.init();
gViewsPane.init();
gLightningPane.init();
