/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

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
    },

    updateDefaultTodoDates: function gCGP_updateDefaultTodoDates() {
        let defaultDue = document.getElementById("default_task_due").value;
        let defaultStart = document.getElementById("default_task_start").value;
        let offsetValues = ["offsetcurrent", "offsetnexthour"];

        document.getElementById("default_task_due_offset")
                .style.visibility = offsetValues.indexOf(defaultDue) > -1 ? "" : "hidden";
        document.getElementById("default_task_start_offset")
                .style.visibility = offsetValues.indexOf(defaultStart) > -1 ? "" : "hidden";

        updateMenuLabelsPlural("default_task_start_offset_text", "default_task_start_offset_units");
        updateMenuLabelsPlural("default_task_due_offset_text", "default_task_due_offset_units");
    },

    updateItemtypeDeck: function() {
        let panelId = document.getElementById("defaults-itemtype-menulist").value;
        let panel = document.getElementById(panelId);
        document.getElementById("defaults-itemtype-deck").selectedPanel = panel;
    }
};

