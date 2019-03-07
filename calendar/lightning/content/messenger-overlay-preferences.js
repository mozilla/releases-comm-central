/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gLightningPane */

Preferences.add({ id: "calendar.preferences.lightning.selectedTabIndex", type: "int" });

var gLightningPane = {
    mInitialized: false,

    init: function() {
        let preference = Preferences.get("calendar.preferences.lightning.selectedTabIndex");
        let ltnPrefs = document.getElementById("calPreferencesTabbox");
        if (preference.value) {
            ltnPrefs.selectedIndex = preference.value;
        }
        ltnPrefs.addEventListener("select", gLightningPane.tabSelectionChanged.bind(this));
        this.mInitialized = true;

        let elements = document.querySelectorAll("#paneLightning preference");
        for (let element of elements) {
            element.updateElements();
        }
    },

    tabSelectionChanged: function() {
        if (!this.mInitialized) {
            return;
        }
        let ltnPrefs = document.getElementById("calPreferencesTabbox");
        let preference = Preferences.get("calendar.preferences.lightning.selectedTabIndex");
        preference.valueFromPreferences = ltnPrefs.selectedIndex;
    }
};

gCalendarGeneralPane.init();
gAlarmsPane.init();
gCategoriesPane.init();
gViewsPane.init();
gLightningPane.init();
