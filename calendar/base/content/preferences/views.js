/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gViewsPane */

/* globals Preferences */

Preferences.addAll([
  { id: "calendar.week.start", type: "int" },
  { id: "calendar.view-minimonth.showWeekNumber", type: "bool" },
  { id: "calendar.week.d0sundaysoff", type: "bool", inverted: "true" },
  { id: "calendar.week.d1mondaysoff", type: "bool", inverted: "true" },
  { id: "calendar.week.d2tuesdaysoff", type: "bool", inverted: "true" },
  { id: "calendar.week.d3wednesdaysoff", type: "bool", inverted: "true" },
  { id: "calendar.week.d4thursdaysoff", type: "bool", inverted: "true" },
  { id: "calendar.week.d5fridaysoff", type: "bool", inverted: "true" },
  { id: "calendar.week.d6saturdaysoff", type: "bool", inverted: "true" },
  { id: "calendar.view.daystarthour", type: "int" },
  { id: "calendar.view.dayendhour", type: "int" },
  { id: "calendar.view.visiblehours", type: "int" },
  { id: "calendar.weeks.inview", type: "int" },
  { id: "calendar.previousweeks.inview", type: "int" },
  { id: "calendar.view.showLocation", type: "bool" },
]);

/**
 * Global Object to hold methods for the views pref pane
 */
var gViewsPane = {
  /**
   * Initialize the views pref pane. Sets up dialog controls to match the
   * values set in prefs.
   */
  init() {
    this.updateViewEndMenu(Preferences.get("calendar.view.daystarthour").value);
    this.updateViewStartMenu(Preferences.get("calendar.view.dayendhour").value);
    this.updateViewWorkDayCheckboxes(Preferences.get("calendar.week.start").value);
    this.initializeViewStartEndMenus();
  },

  /**
   * Initialize the strings for the  "day starts at" and "day ends at"
   * menulists. This is needed to respect locales that use AM/PM.
   */
  initializeViewStartEndMenus() {
    const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

    let formatter = cal.dtz.formatter;
    let calTime = cal.createDateTime();
    calTime.minute = 0;

    // 1 to 23 instead of 0 to 24 to keep midnight & noon as the localized strings
    for (let theHour = 1; theHour <= 23; theHour++) {
      calTime.hour = theHour;
      let time = formatter.formatTime(calTime);

      let labelIdStart = "timeStart" + theHour;
      let labelIdEnd = "timeEnd" + theHour;
      // This if block to keep Noon as the localized string, instead of as a number.
      if (theHour != 12) {
        document.getElementById(labelIdStart).setAttribute("label", time);
        document.getElementById(labelIdEnd).setAttribute("label", time);
      }
    }
  },

  /**
   * Updates the view end menu to only display hours after the selected view
   * start.
   *
   * @param aStartValue       The value selected for view start.
   */
  updateViewEndMenu(aStartValue) {
    let endMenuKids = document.getElementById("dayendhourpopup").children;
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
  updateViewStartMenu(aEndValue) {
    let startMenuKids = document.getElementById("daystarthourpopup").children;
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
  updateViewWorkDayCheckboxes(weekStart) {
    weekStart = Number(weekStart);
    for (let i = weekStart; i < weekStart + 7; i++) {
      let checkbox = document.getElementById("dayoff" + (i % 7));
      checkbox.parentNode.appendChild(checkbox);
    }
  },
};
