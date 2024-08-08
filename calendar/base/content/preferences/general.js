/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gCalendarGeneralPane */

/* import-globals-from ../calendar-ui-utils.js */
/* globals Preferences */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

Preferences.addAll([
  { id: "calendar.date.format", type: "int" },
  { id: "calendar.event.defaultlength", type: "int" },
  { id: "calendar.timezone.local", type: "string" },
  { id: "calendar.timezone.useSystemTimezone", type: "bool" },
  { id: "calendar.task.defaultstart", type: "string" },
  { id: "calendar.task.defaultstartoffset", type: "int" },
  { id: "calendar.task.defaultstartoffsetunits", type: "string" },
  { id: "calendar.task.defaultdue", type: "string" },
  { id: "calendar.task.defaultdueoffset", type: "int" },
  { id: "calendar.task.defaultdueoffsetunits", type: "string" },
  { id: "calendar.agenda.days", type: "int" },
  { id: "calendar.item.editInTab", type: "bool" },
  { id: "calendar.item.promptDelete", type: "bool" },
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
    this.onChangedUseSystemTimezonePref();

    const formatter = cal.dtz.formatter;
    const dateFormattedLong = formatter.formatDateLong(cal.dtz.now());
    const dateFormattedShort = formatter.formatDateShort(cal.dtz.now());

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

    const tzMenuList = document.getElementById("calendar-timezone-menulist");
    const tzMenuPopup = document.getElementById("calendar-timezone-menupopup");

    const tzids = {};
    const displayNames = [];
    // don't rely on what order the timezone-service gives you
    for (const timezoneId of cal.timezoneService.timezoneIds) {
      const timezone = cal.timezoneService.getTimezone(timezoneId);
      if (timezone && !timezone.isFloating && !timezone.isUTC) {
        const displayName = timezone.displayName;
        displayNames.push(displayName);
        tzids[displayName] = timezone.tzid;
      }
    }
    // the display names need to be sorted
    displayNames.sort((a, b) => a.localeCompare(b));
    for (const displayName of displayNames) {
      addMenuItem(tzMenuPopup, displayName, tzids[displayName]);
    }

    let prefValue = Preferences.get("calendar.timezone.local").value;
    if (!prefValue) {
      prefValue = cal.dtz.defaultTimezone.tzid;
    }
    tzMenuList.value = prefValue;

    // Set the agenda length menulist.
    this.initializeTodaypaneMenu();
  },

  updateDefaultTodoDates() {
    const defaultDue = document.getElementById("default_task_due").value;
    const defaultStart = document.getElementById("default_task_start").value;
    const offsetValues = ["offsetcurrent", "offsetnexthour"];

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
    const menulist = document.getElementById("agenda-days-menulist");
    const items = menulist.getElementsByTagName("menuitem");
    for (const menuItem of items) {
      const menuitemValue = Number(menuItem.value);
      const count = menuitemValue > 7 ? menuitemValue / 7 : menuitemValue;
      const timeUnit = menuitemValue > 7 ? "weeks" : "days";
      // event-duration-menuitem-count-weeks
      // event-duration-menuitem-count-days
      document.l10n.setAttributes(menuItem, `event-duration-menuitem-count-${timeUnit}`, {
        count,
      });
    }

    const pref = Preferences.get("calendar.agenda.days");
    let value = pref.value;

    // Check if the preference has been edited with a wrong value.
    if (value > 0 && value <= 28) {
      if (value % 7 != 0) {
        const intValue = Math.floor(value / 7) * 7;
        value = intValue == 0 ? value : intValue;
        pref.value = value;
      }
    } else {
      pref.value = 14;
    }
  },

  onChangedUseSystemTimezonePref() {
    const useSystemTimezonePref = Preferences.get("calendar.timezone.useSystemTimezone");

    document.getElementById("calendar-timezone-menulist").disabled = useSystemTimezonePref.value;
  },
};

Preferences.get("calendar.timezone.useSystemTimezone").on(
  "change",
  gCalendarGeneralPane.onChangedUseSystemTimezonePref
);
