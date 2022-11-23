/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global addMenuItem */ // From  ../calendar-ui-utils.js

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

window.addEventListener("load", onLoad);

/**
 * Sets up the timezone dialog from the window arguments, also setting up all
 * dialog controls from the window's dates.
 */
function onLoad() {
  let args = window.arguments[0];
  window.time = args.time;
  window.onAcceptCallback = args.onOk;

  let menulist = document.getElementById("timezone-menulist");
  let tzMenuPopup = document.getElementById("timezone-menupopup");

  // floating and UTC (if supported) at the top:
  if (args.calendar.getProperty("capabilities.timezones.floating.supported") !== false) {
    addMenuItem(tzMenuPopup, cal.dtz.floating.displayName, cal.dtz.floating.tzid);
  }
  if (args.calendar.getProperty("capabilities.timezones.UTC.supported") !== false) {
    addMenuItem(tzMenuPopup, cal.dtz.UTC.displayName, cal.dtz.UTC.tzid);
  }

  let tzids = {};
  let displayNames = [];
  for (let timezoneId of cal.timezoneService.timezoneIds) {
    let timezone = cal.timezoneService.getTimezone(timezoneId);
    if (timezone && !timezone.isFloating && !timezone.isUTC) {
      let displayName = timezone.displayName;
      displayNames.push(displayName);
      tzids[displayName] = timezone.tzid;
    }
  }
  // the display names need to be sorted
  displayNames.sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < displayNames.length; ++i) {
    let displayName = displayNames[i];
    addMenuItem(tzMenuPopup, displayName, tzids[displayName]);
  }

  let index = findTimezone(window.time.timezone);
  if (index < 0) {
    index = findTimezone(cal.dtz.defaultTimezone);
    if (index < 0) {
      index = 0;
    }
  }

  menulist = document.getElementById("timezone-menulist");
  menulist.selectedIndex = index;

  updateTimezone();

  opener.setCursor("auto");
}

/**
 * Find the index of the timezone menuitem corresponding to the given timezone.
 *
 * @param timezone      The calITimezone to look for.
 * @returns The index of the childnode below "timezone-menulist"
 */
function findTimezone(timezone) {
  let tzid = timezone.tzid;
  let menulist = document.getElementById("timezone-menulist");
  let numChilds = menulist.children[0].children.length;
  for (let i = 0; i < numChilds; i++) {
    let menuitem = menulist.children[0].children[i];
    if (menuitem.getAttribute("value") == tzid) {
      return i;
    }
  }
  return -1;
}

/**
 * Handler function to call when the timezone selection has changed. Updates the
 * timezone-time field and the timezone-stack.
 */
function updateTimezone() {
  let menulist = document.getElementById("timezone-menulist");
  let menuitem = menulist.selectedItem;
  let timezone = cal.timezoneService.getTimezone(menuitem.getAttribute("value"));

  // convert the date/time to the currently selected timezone
  // and display the result in the appropriate control.
  // before feeding the date/time value into the control we need
  // to set the timezone to 'floating' in order to avoid the
  // automatic conversion back into the OS timezone.
  let datetime = document.getElementById("timezone-time");
  let time = window.time.getInTimezone(timezone);
  time.timezone = cal.dtz.floating;
  datetime.value = cal.dtz.dateTimeToJsDate(time);

  // don't highlight any timezone in the map by default
  let standardTZOffset = "none";
  if (timezone.isUTC) {
    standardTZOffset = "+0000";
  } else if (!timezone.isFloating) {
    let standard = timezone.icalComponent.getFirstSubcomponent("STANDARD");
    // any reason why valueAsIcalString is used instead of plain value? xxx todo: ask mickey
    standardTZOffset = standard.getFirstProperty("TZOFFSETTO").valueAsIcalString;
  }

  let image = document.getElementById("highlighter");
  image.setAttribute("tzid", standardTZOffset);
}

/**
 * Handler function to be called when the accept button is pressed.
 */
document.addEventListener("dialogaccept", () => {
  let menulist = document.getElementById("timezone-menulist");
  let menuitem = menulist.selectedItem;
  let timezoneString = menuitem.getAttribute("value");
  let timezone = cal.timezoneService.getTimezone(timezoneString);
  let datetime = window.time.getInTimezone(timezone);
  window.onAcceptCallback(datetime);
});
