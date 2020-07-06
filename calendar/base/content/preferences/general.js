/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gCalendarGeneralPane */

/* import-globals-from ../calendar-ui-utils.js */
/* globals Preferences */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

Preferences.addAll([
  { id: "calendar.date.format", type: "int" },
  { id: "calendar.event.defaultlength", type: "int" },
  { id: "calendar.timezone.local", type: "string" },
  { id: "calendar.task.defaultstart", type: "string" },
  { id: "calendar.task.defaultstartoffset", type: "int" },
  { id: "calendar.task.defaultstartoffsetunits", type: "string" },
  { id: "calendar.task.defaultdue", type: "string" },
  { id: "calendar.task.defaultdueoffset", type: "int" },
  { id: "calendar.task.defaultdueoffsetunits", type: "string" },
  { id: "calendar.view.useSystemColors", type: "bool" },
  { id: "calendar.agendaListbox.soondays", type: "int" },
  { id: "calendar.item.editInTab", type: "bool" },
]);

/**
 * Global Object to hold methods for the general pref pane
 */
var gCalendarGeneralPane = {
  /**
   * Initialize the general pref pane. Sets up dialog controls to match the
   * values set in prefs.
   */
  init() {
    let formatter = cal.dtz.formatter;
    let dateFormattedLong = formatter.formatDateLong(cal.dtz.now());
    let dateFormattedShort = formatter.formatDateShort(cal.dtz.now());

    // menu items include examples of current date formats.
    document.l10n.setAttributes(
      document.getElementById("dateformat-long-menuitem"),
      "dateformat-long",
      { date: dateFormattedLong }
    );

    document.l10n.setAttributes(
      document.getElementById("dateformat-short-menuitem"),
      "dateformat-short",
      { date: dateFormattedShort }
    );

    // deselect and reselect to update visible item title
    updateUnitLabelPlural("defaultlength", "defaultlengthunit", "minutes");
    this.updateDefaultTodoDates();

    let tzMenuList = document.getElementById("calendar-timezone-menulist");
    let tzMenuPopup = document.getElementById("calendar-timezone-menupopup");

    let tzService = cal.getTimezoneService();
    let tzids = {};
    let displayNames = [];
    // don't rely on what order the timezone-service gives you
    for (let timezoneId of tzService.timezoneIds) {
      let timezone = tzService.getTimezone(timezoneId);
      if (timezone && !timezone.isFloating && !timezone.isUTC) {
        let displayName = timezone.displayName;
        displayNames.push(displayName);
        tzids[displayName] = timezone.tzid;
      }
    }
    // the display names need to be sorted
    displayNames.sort((a, b) => a.localeCompare(b));
    for (let displayName of displayNames) {
      addMenuItem(tzMenuPopup, displayName, tzids[displayName]);
    }

    let prefValue = Preferences.get("calendar.timezone.local").value;
    if (!prefValue) {
      prefValue = cal.dtz.defaultTimezone.tzid;
    }
    tzMenuList.value = prefValue;

    // Set the soondays menulist preference
    this.initializeTodaypaneMenu();
  },

  updateDefaultTodoDates() {
    let defaultDue = document.getElementById("default_task_due").value;
    let defaultStart = document.getElementById("default_task_start").value;
    let offsetValues = ["offsetcurrent", "offsetnexthour"];

    document.getElementById("default_task_due_offset").style.visibility = offsetValues.includes(
      defaultDue
    )
      ? ""
      : "hidden";
    document.getElementById("default_task_start_offset").style.visibility = offsetValues.includes(
      defaultStart
    )
      ? ""
      : "hidden";

    updateMenuLabelsPlural("default_task_start_offset_text", "default_task_start_offset_units");
    updateMenuLabelsPlural("default_task_due_offset_text", "default_task_due_offset_units");
  },

  initializeTodaypaneMenu() {
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

    let pref = Preferences.get("calendar.agendaListbox.soondays");
    let soonpref = pref.value || 5;

    // Check if soonDays preference has been edited with a wrong value.
    if (soonpref > 0 && soonpref <= 28) {
      if (soonpref % 7 != 0) {
        let intSoonpref = Math.floor(soonpref / 7) * 7;
        soonpref = intSoonpref == 0 ? soonpref : intSoonpref;
        pref.value = soonpref;
      }
    } else {
      soonpref = soonpref > 28 ? 28 : 1;
      pref.value = soonpref;
    }
  },
};
