/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// The tests in this folder frequently take too long. Give them more time.
requestLongerTimeout(2);

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

/* globals toggleOrientation */

let isRotated =
  document.getElementById("calendar_toggle_orientation_command").getAttribute("checked") == "true";
let shouldBeRotated = Services.prefs.getBoolPref("calendar.test.rotateViews", false);

if (isRotated != shouldBeRotated) {
  toggleOrientation();
}

const calendarViewsInitialState = CalendarTestUtils.saveCalendarViewsState(window);

registerCleanupFunction(async () => {
  await CalendarTestUtils.restoreCalendarViewsState(window, calendarViewsInitialState);
});
