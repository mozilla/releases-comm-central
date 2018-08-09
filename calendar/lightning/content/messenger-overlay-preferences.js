/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gLightningPane */

var gLightningPane = {
    mInitialized: false,

    init: function() {
        let preference = document.getElementById("calendar.preferences.lightning.selectedTabIndex");
        let ltnPrefs = document.getElementById("calPreferencesTabbox");
        if (preference.value) {
            ltnPrefs.selectedIndex = preference.value;
        }
        ltnPrefs.addEventListener("select", gLightningPane.tabSelectionChanged.bind(this));
        this.mInitialized = true;

        let prefTab = document.documentElement;
        let lightningButton = prefTab._makePaneButton(document.getElementById("paneLightning"));
        let advancedButton = document.querySelector('#category-box radio[pane="paneAdvanced"]');
        advancedButton.parentNode.insertBefore(lightningButton, advancedButton);

        // We probably messed this up just by existing. Fix it.
        prefTab._paneDeck.selectedIndex = prefTab._selector.selectedIndex;

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
        let preference = document.getElementById("calendar.preferences.lightning.selectedTabIndex");
        preference.valueFromPreferences = ltnPrefs.selectedIndex;
    }
};

gCalendarGeneralPane.init();
gAlarmsPane.init();
gCategoriesPane.init();
gViewsPane.init();
gLightningPane.init();
