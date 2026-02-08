/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the collection of telemetry when calendar views are initialized.
 */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const expectedTelemetryValue = {};

function checkTelemetry(itemToAdd) {
  if (itemToAdd) {
    expectedTelemetryValue[itemToAdd] = 1;
    Assert.deepEqual(
      Glean.calendar.viewInitialized.testGetValue(),
      expectedTelemetryValue,
      `${itemToAdd} should have been recorded`
    );
  } else {
    Assert.deepEqual(
      Glean.calendar.viewInitialized.testGetValue(),
      expectedTelemetryValue,
      "no changes expected"
    );
  }
}

add_setup(async function () {
  // Only the agenda should have been opened before running this test. This happens automatically
  // when starting with a new profile.
  checkTelemetry("agenda");
  cal.manager.getCalendars()[0].setProperty("disabled", false);
});

add_task(async function testTodayPane() {
  const todayHeader = document.getElementById("today-pane-header");
  Assert.equal(todayHeader.getAttribute("index"), "2");

  const todayNext = document.getElementById("today-pane-cycler-next");
  EventUtils.synthesizeMouseAtCenter(todayNext, {}, window);
  Assert.equal(todayHeader.getAttribute("index"), "0");
  checkTelemetry("unifinder-todo-tree");

  EventUtils.synthesizeMouseAtCenter(todayNext, {}, window);
  Assert.equal(todayHeader.getAttribute("index"), "1");
  checkTelemetry();

  EventUtils.synthesizeMouseAtCenter(todayNext, {}, window);
  Assert.equal(todayHeader.getAttribute("index"), "2");
  checkTelemetry();
});

add_task(async function testCalendarTab() {
  // Week view is this default view when starting a new profile.
  await CalendarTestUtils.setCalendarView(window, "week");
  checkTelemetry("week-view");

  await CalendarTestUtils.setCalendarView(window, "day");
  checkTelemetry("day-view");

  await CalendarTestUtils.setCalendarView(window, "week");
  checkTelemetry();

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  checkTelemetry("multiweek-view");

  await CalendarTestUtils.setCalendarView(window, "month");
  checkTelemetry("month-view");

  await CalendarTestUtils.setCalendarView(window, "day");
  checkTelemetry();

  await CalendarTestUtils.closeCalendarTab(window);
});

add_task(async function testTasksTab() {
  await CalendarTestUtils.openTasksTab(window);
  checkTelemetry("calendar-task-tree");

  EventUtils.synthesizeMouseAtCenter(document.getElementById("opt_next7days_filter"), {}, window);
  checkTelemetry();

  EventUtils.synthesizeMouseAtCenter(document.getElementById("opt_all_filter"), {}, window);
  checkTelemetry();

  await CalendarTestUtils.closeTasksTab(window);
});

add_task(async function testSwitchTabs() {
  await CalendarTestUtils.openCalendarTab(window);
  await CalendarTestUtils.openTasksTab(window);

  const tabmail = document.getElementById("tabmail");
  tabmail.switchToTab(0);
  checkTelemetry();

  tabmail.switchToTab(1);
  checkTelemetry();

  tabmail.switchToTab(2);
  checkTelemetry();

  tabmail.closeOtherTabs(0);
  checkTelemetry();

  await CalendarTestUtils.closeCalendarTab(window);
  await CalendarTestUtils.closeTasksTab(window);
});
