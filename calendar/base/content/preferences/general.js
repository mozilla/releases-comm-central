/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

/**
 * Global Object to hold methods for the general pref pane
 */
var gCalendarGeneralPane = {
    /**
     * Initialize the general pref pane. Sets up dialog controls to match the
     * values set in prefs.
     */
    init: function gCGP_init() {
        var df = Components.classes["@mozilla.org/calendar/datetime-formatter;1"]
                    .getService(Components.interfaces.calIDateTimeFormatter);

        var dateFormattedLong  = df.formatDateLong(now());
        var dateFormattedShort = df.formatDateShort(now());

        // menu items include examples of current date formats.
        document.getElementById("dateformat-long-menuitem")
                .setAttribute("label", labelLong + ": " + dateFormattedLong);
        document.getElementById("dateformat-short-menuitem")
                .setAttribute("label", labelShort + ": " + dateFormattedShort);

        // deselect and reselect to update visible item title
        updateSelectedLabel("dateformat");
        updateUnitLabelPlural("defaultlength", "defaultlengthunit", "minutes");
        this.updateDefaultTodoDates();

        let tzMenuList = document.getElementById("calendar-timezone-menulist");
        let tzMenuPopup = document.getElementById("calendar-timezone-menupopup");

        let tzService = cal.getTimezoneService();
        let enumerator = tzService.timezoneIds;
        let tzids = {};
        let displayNames = [];
        // don't rely on what order the timezone-service gives you
        while (enumerator.hasMore()) {
            let tz = tzService.getTimezone(enumerator.getNext());
            if (tz && !tz.isFloating && !tz.isUTC) {
                let displayName = tz.displayName;
                displayNames.push(displayName);
                tzids[displayName] = tz.tzid;
            }
        }
        // the display names need to be sorted
        displayNames.sort(String.localeCompare);
        for (let displayName of displayNames) {
            addMenuItem(tzMenuPopup, displayName, tzids[displayName]);
        }

        let prefValue = document.getElementById("calendar-timezone-local").value;
        if (!prefValue) {
            prefValue = calendarDefaultTimezone().tzid;
        }
        tzMenuList.value = prefValue;

        // Set the soondays menulist preference
        this.initializeTodaypaneMenu();
    },

    updateDefaultTodoDates: function gCGP_updateDefaultTodoDates() {
        let defaultDue = document.getElementById("default_task_due").value;
        let defaultStart = document.getElementById("default_task_start").value;
        let offsetValues = ["offsetcurrent", "offsetnexthour"];

        document.getElementById("default_task_due_offset")
                .style.visibility = offsetValues.includes(defaultDue) ? "" : "hidden";
        document.getElementById("default_task_start_offset")
                .style.visibility = offsetValues.includes(defaultStart) ? "" : "hidden";

        updateMenuLabelsPlural("default_task_start_offset_text", "default_task_start_offset_units");
        updateMenuLabelsPlural("default_task_due_offset_text", "default_task_due_offset_units");
    },

    updateItemtypeDeck: function() {
        let panelId = document.getElementById("defaults-itemtype-menulist").value;
        let panel = document.getElementById(panelId);
        document.getElementById("defaults-itemtype-deck").selectedPanel = panel;
    },

    initializeTodaypaneMenu: function gCGP_initializeTodaypaneMenu() {
        // Assign the labels for the menuitem
        let soondaysMenu = document.getElementById("soondays-menulist");
        let items = soondaysMenu.getElementsByTagName("menuitem");
        for (let menuItem of items) {
            let menuitemValue = Number(menuItem.value);
            if (menuitemValue > 7) {
                menuItem.label = unitPluralForm(menuitemValue / 7, "weeks");
            } else {
                menuItem.label = unitPluralForm(menuitemValue, "days");
            }
        }

        let prefName = "calendar.agendaListbox.soondays";
        let soonpref = Preferences.get(prefName, 5);

        // Check if soonDays preference has been edited with a wrong value.
        if (soonpref > 0 && soonpref <= 28) {
            if (soonpref % 7 != 0) {
                let intSoonpref = Math.floor(soonpref / 7) * 7;
                soonpref = (intSoonpref == 0 ? soonpref : intSoonpref);
                Preferences.set(prefName, soonpref, "INT");
            }
        } else {
            soonpref = soonpref > 28 ? 28 : 1;
            Preferences.set(prefName, soonpref, "INT");
        }

        document.getElementById("soondays-menulist").value = soonpref;
    },

    updateTodaypaneMenu: function gCGP_updateTodaypaneMenu() {
        let soonpref = Number(document.getElementById("soondays-menulist").value);
        Preferences.set("calendar.agendaListbox.soondays", soonpref);
    }
};
