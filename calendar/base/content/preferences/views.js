/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gViewsPane */

/**
 * Global Object to hold methods for the views pref pane
 */
var gViewsPane = {
    /**
     * Initialize the views pref pane. Sets up dialog controls to match the
     * values set in prefs.
     */
    init: function() {
        this.updateViewEndMenu(document.getElementById("daystarthour").value);
        this.updateViewStartMenu(document.getElementById("dayendhour").value);
        this.updateViewWorkDayCheckboxes(document.getElementById("weekstarts").value);
        this.initializeViewStartEndMenus();
    },

    /**
     * Initialize the strings for the  "day starts at" and "day ends at"
     * menulists. This is needed to respect locales that use AM/PM.
     */
    initializeViewStartEndMenus: function() {
        let labelIdStart;
        let labelIdEnd;
        let timeFormatter = Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
                                      .getService(Components.interfaces.nsIScriptableDateFormat);
        // 1 to 23 instead of 0 to 24 to keep midnight & noon as the localized strings
        for (let theHour = 1; theHour <= 23; theHour++) {
            let time = timeFormatter.FormatTime("", Components.interfaces.nsIScriptableDateFormat
                                    .timeFormatNoSeconds, theHour, 0, 0);

            labelIdStart = "timeStart" + theHour;
            labelIdEnd = "timeEnd" + theHour;
            // This if block to keep Noon as the localized string, instead of as a number.
            if (theHour != 12) {
                document.getElementById(labelIdStart).setAttribute("label", time);
                document.getElementById(labelIdEnd).setAttribute("label", time);
            }
        }
        // Deselect and reselect to update visible item title
        updateSelectedLabel("daystarthour");
        updateSelectedLabel("dayendhour");
    },


    /**
     * Updates the view end menu to only display hours after the selected view
     * start.
     *
     * @param aStartValue       The value selected for view start.
     */
    updateViewEndMenu: function(aStartValue) {
        let endMenuKids = document.getElementById("dayendhourpopup")
                                  .childNodes;
        for (let i = 0; i < endMenuKids.length; i++) {
            if (Number(endMenuKids[i].value) <= Number(aStartValue)) {
                endMenuKids[i].setAttribute("hidden", true);
            } else {
                endMenuKids[i].removeAttribute("hidden");
            }
        }
    },

    /**
     * Updates the view start menu to only display hours before the selected view
     * end.
     *
     * @param aEndValue         The value selected for view end.
     */
    updateViewStartMenu: function(aEndValue) {
        let startMenuKids = document.getElementById("daystarthourpopup")
                                  .childNodes;
        for (let i = 0; i < startMenuKids.length; i++) {
            if (Number(startMenuKids[i].value) >= Number(aEndValue)) {
                startMenuKids[i].setAttribute("hidden", true);
            } else {
                startMenuKids[i].removeAttribute("hidden");
            }
        }
    },

    /**
     * Update the workday checkboxes based on the start of the week.
     *
     * @Param weekStart         The (0-based) index of the weekday the week
     *                            should start at.
     */
    updateViewWorkDayCheckboxes: function(weekStart) {
        weekStart = Number(weekStart);
        for (let i = weekStart; i < weekStart + 7; i++) {
            let checkbox = document.getElementById("dayoff" + (i % 7));
            checkbox.parentNode.appendChild(checkbox);
        }
    }
};
