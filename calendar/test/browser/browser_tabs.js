/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  // Test the calendar tab opens and closes.
  await openCalendarTab();
  await closeCalendarTab();

  // Test the tasks tab opens and closes.
  await openTasksTab();
  await closeTasksTab();

  // Test the calendar and tasks tabs at the same time.
  await openCalendarTab();
  await openTasksTab();
  await closeCalendarTab();
  await closeTasksTab();

  // Test calendar view selection.
  await setCalendarView("day");
  await setCalendarView("week");
  await setCalendarView("multiweek");
  await setCalendarView("month");
  await closeCalendarTab();
});
