/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals createCalendarUsingDialog */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

add_task(async function testBasicFunctionality() {
  const calendarName = "Mochitest";

  registerCleanupFunction(() => {
    for (const calendar of cal.manager.getCalendars()) {
      if (calendar.name == calendarName) {
        cal.manager.removeCalendar(calendar);
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

  // Make sure the week view is the default selected view.
  Assert.ok(
    document
      .querySelector(`.calview-toggle-item[aria-selected="true"]`)
      .getAttribute("aria-controls") == "week-view",
    "week-view toggle is the current default"
  );

  const dayViewButton = document.querySelector("#calTabDay");
  dayViewButton.click();
  Assert.ok(dayViewButton.getAttribute("aria-selected"), "day view button is selected");
  await CalendarTestUtils.ensureViewLoaded(window);

  // Day view should have 09:00 box.
  const someTime = cal.createDateTime();
  someTime.resetTo(someTime.year, someTime.month, someTime.day, 9, 0, 0, someTime.timezone);
  const label = cal.dtz.formatter.formatTime(someTime);
  const labelEl = document.querySelectorAll("#day-view .multiday-timebar .multiday-hour-box")[9];
  Assert.ok(labelEl, "9th hour box should exist");
  Assert.equal(labelEl.textContent, label, "9th hour box should show the correct time");
  Assert.ok(CalendarTestUtils.dayView.getHourBoxAt(window, 9), "09:00 box exists");

  // Open tasks view.
  document.querySelector("#tasksButton").click();

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
