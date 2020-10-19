/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  // Test the calendar tab opens and closes.
  await CalendarTestUtils.openCalendarTab(window);
  await CalendarTestUtils.closeCalendarTab(window);

  // Test the tasks tab opens and closes.
  await openTasksTab();
  await closeTasksTab();

  // Test the calendar and tasks tabs at the same time.
  await CalendarTestUtils.openCalendarTab(window);
  await openTasksTab();
  await CalendarTestUtils.closeCalendarTab(window);
  await closeTasksTab();

  // Test calendar view selection.
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.setCalendarView(window, "month");
  await CalendarTestUtils.closeCalendarTab(window);
});
