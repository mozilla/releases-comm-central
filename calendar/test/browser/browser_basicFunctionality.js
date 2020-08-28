/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals createCalendarUsingDialog */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

add_task(async function testBasicFunctionality() {
  const calendarName = "Mochitest";
  let manager = cal.getCalendarManager();

  registerCleanupFunction(() => {
    for (let calendar of manager.getCalendars()) {
      if (calendar.name == calendarName) {
        manager.removeCalendar(calendar);
      }
    }
    Services.focus.focusedWindow = window;
  });

  Services.focus.focusedWindow = window;

  // Create test calendar.
  await createCalendarUsingDialog(calendarName);

  // Check for minimonth, every month has a day 1.
  Assert.ok(
    document.querySelector("#calMinimonth .minimonth-cal-box td[aria-label='1']"),
    "day 1 exists in the minimonth"
  );

  // Check for calendar list.
  Assert.ok(document.querySelector("#calendar-list-pane"), "calendar list pane exists");
  Assert.ok(document.querySelector("#calendar-list"), "calendar list exists");

  // Check for event search.
  Assert.ok(document.querySelector("#bottom-events-box"), "event search box exists");

  // There should be search field.
  Assert.ok(document.querySelector("#unifinder-search-field"), "unifinded search field exists");

  let dayViewButton = document.querySelector("#calendar-day-view-button");
  dayViewButton.click();
  Assert.ok(dayViewButton.selected, "day view button is selected");

  // Default view is day view which should have 09:00 label and box.
  let someTime = cal.createDateTime();
  someTime.resetTo(someTime.year, someTime.month, someTime.day, 9, 0, 0, someTime.timezone);
  let label = cal.dtz.formatter.formatTime(someTime);
  Assert.ok(
    document.querySelector(`.calendar-time-bar-label[value='${label}']`),
    "09:00 label exists"
  );
  Assert.ok(
    document.querySelector("#day-view .daybox .multiday-column-bg-box").children[9],
    "09:00 box exists"
  );

  // Open tasks view.
  document.querySelector("#task-tab-button").click();

  // Should be possible to filter today's tasks.
  Assert.ok(document.querySelector("#opt_today_filter"), "show today radio button exists");

  // Check for task add button.
  Assert.ok(document.querySelector("#calendar-add-task-button"), "task add button exists");

  // Check for filtered tasks list.
  Assert.ok(
    document.querySelector("#calendar-task-tree .calendar-task-treechildren"),
    "filtered tasks list exists"
  );
});
