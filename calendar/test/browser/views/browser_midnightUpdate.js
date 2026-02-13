/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the UI is correctly updated at midnight.
 */

/* globals CalMetronome TodayPane */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

// UI elements that we want to test.
const minimonths = {
  sidebar: document.getElementById("calMinimonth"),
  todayPane: document.getElementById("today-minimonth"),
  miniday: document.getElementById("miniday-dropdown-minimonth"),
};
const viewBox = document.getElementById("viewBox");
const views = {
  day: document.getElementById("day-view"),
  week: document.getElementById("week-view"),
  multiweek: document.getElementById("multiweek-view"),
  month: document.getElementById("month-view"),
};

// Dates that we need.
const now = cal.dtz.jsDateToDateTime(new Date()).getInTimezone(cal.dtz.UTC);
const closeToRealMidnight = now.hour == 23 && now.minute > 55;
now.isDate = true;
const today = {
  year: now.year,
  month: now.month,
  day: now.day,
  weekday: now.weekday,
  weekdayName: cal.dtz.formatter.weekdayNames[now.weekday],
  shortWeekdayName: cal.dtz.formatter.shortWeekdayNames[now.weekday],
  calDate: now.clone(),
};
now.day--;
const yesterday = {
  year: now.year,
  month: now.month,
  day: now.day,
  weekday: now.weekday,
  weekdayName: cal.dtz.formatter.weekdayNames[now.weekday],
  shortWeekdayName: cal.dtz.formatter.shortWeekdayNames[now.weekday],
  jsDate: cal.dtz.dateTimeToJsDate(now),
  calDate: now.clone(),
};
now.day--;
const dayBeforeYesterday = {
  year: now.year,
  month: now.month,
  day: now.day,
  weekday: now.weekday,
  weekdayName: cal.dtz.formatter.weekdayNames[now.weekday],
  shortWeekdayName: cal.dtz.formatter.shortWeekdayNames[now.weekday],
  jsDate: cal.dtz.dateTimeToJsDate(now),
  calDate: now.clone(),
};

add_setup(async function () {
  Assert.equal(
    new Date().getDate(), // eslint-disable-line no-restricted-properties
    today.day,
    "This test will fail, because the local date and UTC date are not the same. You should be running this test in UTC."
  );

  cal.manager.getCalendars()[0].setProperty("disabled", false);
  Assert.ok(BrowserTestUtils.isVisible(document.getElementById("today-pane-panel")));
});

add_task(function testReportIfCloseToMidnight() {
  Assert.report(
    false,
    undefined,
    undefined,
    "This test didn't run, because the real UTC time is close to midnight, and that could cause it to fail."
  );
}).skip(!closeToRealMidnight);

/**
 * Tests that the calendar tab views are updated at midnight. The current day
 * mark and selection should move.
 */
add_task(async function testViewsWithTodaySelected() {
  // Check the state of the views, before the calendar tab opens.
  // This test must run first.

  checkMinimonthToday("sidebar", today);
  checkMinimonthSelected("sidebar", today);
  Assert.ok(minimonths.sidebar.showsToday);

  for (const [name, view] of Object.entries(views)) {
    Assert.strictEqual(
      view.mToggleStatus,
      undefined,
      `${name} view should not be initialised at the start of the test`
    );
  }

  // Open the views and check their state.

  await checkDayViewToday("day", today);
  await checkDayViewSelected("day", today);
  await checkDayViewToday("week", today);
  await checkDayViewSelected("week", today);
  await checkMonthViewToday("multiweek", today);
  await checkMonthViewSelected("multiweek", today);
  await checkMonthViewToday("month", today);
  await checkMonthViewSelected("month", today);

  // Set things up as they would have been before midnight last night. Set
  // `mShowsToday` to true to indicate that the selection should be follow the
  // current day.

  info("selecting yesterday");
  minimonths.sidebar.value = yesterday.jsDate;
  checkMinimonthToday("sidebar", today);
  checkMinimonthSelected("sidebar", yesterday);
  Assert.ok(!minimonths.sidebar.showsToday);

  await checkDayViewSelected("day", yesterday);
  await checkDayViewSelected("week", yesterday);
  await checkMonthViewSelected("multiweek", yesterday);
  await checkMonthViewSelected("month", yesterday);

  info("changing the UI so that it needs updating");
  minimonths.sidebar.mShowsToday = true;
  minimonths.sidebar.querySelector("td[today]").removeAttribute("today");
  minimonths.sidebar.mToday = null;
  document.querySelectorAll("#view-box [relation]").forEach(e => e.removeAttribute("relation"));

  // Now emit the "day" event, as the metronome would do when it detects that
  // the current day is not the same as it was last time events were emitted.

  info("emitting midnight update");
  CalMetronome.emit("day");
  checkMinimonthToday("sidebar", today);
  checkMinimonthSelected("sidebar", today);
  Assert.ok(minimonths.sidebar.showsToday);

  // Check the current view.

  await checkMonthViewToday("month", today);
  await checkMonthViewSelected("month", today);

  // Without opening them, check the other views are marked as needing a refresh.

  Assert.strictEqual(
    views.day.mToggleStatus,
    -1,
    "day view status should be -1 after midnight update"
  );
  Assert.strictEqual(
    views.week.mToggleStatus,
    -1,
    "week view status should be -1 after midnight update"
  );
  Assert.strictEqual(
    views.multiweek.mToggleStatus,
    -1,
    "multiweek view status should be -1 after midnight update"
  );

  // Switch to the other views and check them.

  await checkMonthViewToday("multiweek", today);
  await checkMonthViewSelected("multiweek", today);
  await checkDayViewToday("week", today);
  await checkDayViewSelected("week", today);
  await checkDayViewToday("day", today);
  await checkDayViewSelected("day", today);

  await CalendarTestUtils.closeCalendarTab(window);
}).skip(closeToRealMidnight);

/**
 * Tests that the calendar tab views are updated at midnight, when the
 * current day is not selected. The current day mark should move, but not the
 * selection.
 */
add_task(async function testViewsWithTodayNotSelected() {
  // Now repeat the test, but this time don't set `mShowsToday`. The selected
  // day should not change.
  await CalendarTestUtils.openCalendarTab(window);

  info("selecting the day before yesterday");
  minimonths.sidebar.value = dayBeforeYesterday.jsDate;
  checkMinimonthToday("sidebar", today);
  checkMinimonthSelected("sidebar", dayBeforeYesterday);
  Assert.ok(!minimonths.sidebar.showsToday);

  await checkDayViewSelected("day", dayBeforeYesterday);
  await checkDayViewSelected("week", dayBeforeYesterday);
  await checkMonthViewSelected("multiweek", dayBeforeYesterday);
  await checkMonthViewSelected("month", dayBeforeYesterday);

  info("changing the UI so that it needs updating");
  minimonths.sidebar.querySelector("td[today]").removeAttribute("today");
  minimonths.sidebar.mToday = null;
  document.querySelectorAll("#view-box [relation]").forEach(e => e.removeAttribute("relation"));

  // Now emit the "day" event, as the metronome would do when it detects that
  // the current day is not the same as it was last time events were emitted.

  info("emitting midnight update");
  CalMetronome.emit("day");
  checkMinimonthToday("sidebar", today);
  checkMinimonthSelected("sidebar", dayBeforeYesterday);
  Assert.ok(!minimonths.sidebar.showsToday);

  // Check the current view.

  await checkMonthViewToday("month", today);
  await checkMonthViewSelected("month", dayBeforeYesterday);

  // Without opening them, check the other views are marked as needing a refresh.

  Assert.strictEqual(
    views.day.mToggleStatus,
    -1,
    "day view status should be -1 after midnight update"
  );
  Assert.strictEqual(
    views.week.mToggleStatus,
    -1,
    "week view status should be -1 after midnight update"
  );
  Assert.strictEqual(
    views.multiweek.mToggleStatus,
    -1,
    "multiweek view status should be -1 after midnight update"
  );

  // Switch to the other views and check them.

  await checkMonthViewToday("multiweek", today);
  await checkMonthViewSelected("multiweek", dayBeforeYesterday);
  await checkDayViewToday("week", dayBeforeYesterday.weekday <= 4 ? today : null);
  await checkDayViewSelected("week", dayBeforeYesterday);
  await checkDayViewToday("day", null);
  await checkDayViewSelected("day", dayBeforeYesterday);

  EventUtils.synthesizeMouseAtCenter(minimonths.sidebar.querySelector(".today-button"), {}, window);
  await CalendarTestUtils.closeCalendarTab(window);
}).skip(closeToRealMidnight);

/**
 * Tests that the today pane mini-month is updated at midnight. The current
 * day mark and selection should move.
 */
add_task(async function testTodayPaneMinimonthWithTodaySelected() {
  const todayPlus14 = today.calDate.clone();
  todayPlus14.day += 14;

  TodayPane.displayMiniSection("minimonth");

  checkMinimonthToday("todayPane", today);
  checkMinimonthSelected("todayPane", today);
  Assert.ok(minimonths.todayPane.showsToday);
  Assert.ok(TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(today.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(todayPlus14), 0);

  info("selecting yesterday");
  minimonths.todayPane.value = yesterday.jsDate;
  checkMinimonthToday("todayPane", today);
  checkMinimonthSelected("todayPane", yesterday);
  Assert.equal(TodayPane.agenda.startDate.compare(yesterday.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(today.calDate), 0);
  Assert.ok(!minimonths.todayPane.showsToday);
  Assert.ok(!TodayPane.showsToday);

  info("changing the UI so that it needs updating");
  minimonths.todayPane.mShowsToday = true;
  TodayPane._showsToday = true;
  minimonths.todayPane.querySelector("td[today]").removeAttribute("today");
  minimonths.todayPane.mToday = null;

  // Now emit the "day" event, as the metronome would do when it detects that
  // the current day is not the same as it was last time events were emitted.

  info("emitting midnight update");
  CalMetronome.emit("day");
  checkMinimonthToday("todayPane", today);
  checkMinimonthSelected("todayPane", today);
  Assert.ok(minimonths.todayPane.showsToday);
  Assert.ok(TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(today.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(todayPlus14), 0);
}).skip(closeToRealMidnight);

/**
 * Tests that the today pane mini-month is updated at midnight. The current
 * day mark should move, but not the selection.
 */
add_task(async function testTodayPaneMinimonthWithTodayNotSelected() {
  const todayPlus14 = today.calDate.clone();
  todayPlus14.day += 14;

  TodayPane.displayMiniSection("minimonth");

  checkMinimonthToday("todayPane", today);
  checkMinimonthSelected("todayPane", today);
  Assert.ok(minimonths.todayPane.showsToday);
  Assert.ok(TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(today.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(todayPlus14), 0);

  info("selecting the day before yesterday");
  minimonths.todayPane.value = dayBeforeYesterday.jsDate;
  checkMinimonthToday("todayPane", today);
  checkMinimonthSelected("todayPane", dayBeforeYesterday);
  Assert.ok(!minimonths.todayPane.showsToday);
  Assert.ok(!TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(dayBeforeYesterday.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(yesterday.calDate), 0);

  info("changing the UI so that it needs updating");
  minimonths.todayPane.querySelector("td[today]").removeAttribute("today");
  minimonths.todayPane.mToday = null;

  // Now emit the "day" event, as the metronome would do when it detects that
  // the current day is not the same as it was last time events were emitted.

  info("emitting midnight update");
  CalMetronome.emit("day");
  checkMinimonthToday("todayPane", today);
  checkMinimonthSelected("todayPane", dayBeforeYesterday);
  Assert.ok(!minimonths.todayPane.showsToday);
  Assert.ok(!TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(dayBeforeYesterday.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(yesterday.calDate), 0);

  EventUtils.synthesizeMouseAtCenter(
    minimonths.todayPane.querySelector(".today-button"),
    {},
    window
  );
}).skip(closeToRealMidnight);

/**
 * Tests that the today pane mini-day is updated at midnight. The current
 * day mark and selection should move.
 */
add_task(async function testTodayPaneMinidayWithTodaySelected() {
  const todayPlus14 = today.calDate.clone();
  todayPlus14.day += 14;

  TodayPane.displayMiniSection("miniday");

  const dayLabel = document.getElementById("datevalue-label");
  const weekdayLabel = document.getElementById("weekdayNameLabel");
  Assert.equal(dayLabel.value, today.day);
  Assert.equal(weekdayLabel.value, today.shortWeekdayName);
  checkMinimonthToday("miniday", today);
  checkMinimonthSelected("miniday", today);
  Assert.ok(TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(today.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(todayPlus14), 0);

  info("selecting yesterday");
  EventUtils.synthesizeMouseAtCenter(document.getElementById("previous-day-button"), {}, window);
  Assert.equal(dayLabel.value, yesterday.day);
  Assert.equal(weekdayLabel.value, yesterday.shortWeekdayName);
  checkMinimonthToday("miniday", today);
  checkMinimonthSelected("miniday", yesterday);
  Assert.ok(!TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(yesterday.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(today.calDate), 0);

  info("changing the UI so that it needs updating");
  TodayPane._showsToday = true;
  minimonths.miniday.querySelector("td[today]").removeAttribute("today");
  minimonths.miniday.mToday = null;

  // Now emit the "day" event, as the metronome would do when it detects that
  // the current day is not the same as it was last time events were emitted.

  info("emitting midnight update");
  CalMetronome.emit("day");
  Assert.equal(dayLabel.value, today.day);
  Assert.equal(weekdayLabel.value, today.shortWeekdayName);
  checkMinimonthToday("miniday", today);
  checkMinimonthSelected("miniday", today);
  Assert.ok(TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(today.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(todayPlus14), 0);
}).skip(closeToRealMidnight);

/**
 * Tests that the today pane mini-day is updated at midnight. The current
 * day mark should move, but not the selection.
 */
add_task(async function testTodayPaneMinidayWithTodayNotSelected() {
  const todayPlus14 = today.calDate.clone();
  todayPlus14.day += 14;

  TodayPane.displayMiniSection("miniday");

  const dayLabel = document.getElementById("datevalue-label");
  const weekdayLabel = document.getElementById("weekdayNameLabel");
  Assert.equal(dayLabel.value, today.day);
  Assert.equal(weekdayLabel.value, today.shortWeekdayName);
  checkMinimonthToday("miniday", today);
  checkMinimonthSelected("miniday", today);
  Assert.ok(TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(today.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(todayPlus14), 0);

  info("selecting yesterday");
  EventUtils.synthesizeMouseAtCenter(document.getElementById("previous-day-button"), {}, window);
  EventUtils.synthesizeMouseAtCenter(document.getElementById("previous-day-button"), {}, window);
  Assert.equal(dayLabel.value, dayBeforeYesterday.day);
  Assert.equal(weekdayLabel.value, dayBeforeYesterday.shortWeekdayName);
  checkMinimonthToday("miniday", today);
  checkMinimonthSelected("miniday", dayBeforeYesterday);
  Assert.ok(!TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(dayBeforeYesterday.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(yesterday.calDate), 0);

  info("changing the UI so that it needs updating");
  minimonths.miniday.querySelector("td[today]").removeAttribute("today");
  minimonths.miniday.mToday = null;

  // Now emit the "day" event, as the metronome would do when it detects that
  // the current day is not the same as it was last time events were emitted.

  info("emitting midnight update");
  CalMetronome.emit("day");
  Assert.equal(dayLabel.value, dayBeforeYesterday.day);
  Assert.equal(weekdayLabel.value, dayBeforeYesterday.shortWeekdayName);
  checkMinimonthToday("miniday", today);
  checkMinimonthSelected("miniday", dayBeforeYesterday);
  Assert.ok(!TodayPane.showsToday);
  Assert.equal(TodayPane.agenda.startDate.compare(dayBeforeYesterday.calDate), 0);
  Assert.equal(TodayPane.agenda.endDate.compare(yesterday.calDate), 0);

  EventUtils.synthesizeMouseAtCenter(document.getElementById("today-button"), {}, window);
}).skip(closeToRealMidnight);

/**
 * Tests that the day number on the today pane button is updated at midnight.
 */
add_task(function () {
  const todayButtonLabel = document.querySelector(
    "#calendar-status-todaypane-button .toolbarbutton-day-text"
  );
  todayButtonLabel.textContent = "X";

  // Now emit the "day" event, as the metronome would do when it detects that
  // the current day is not the same as it was last time events were emitted.

  info("emitting midnight update");
  CalMetronome.emit("day");
  Assert.equal(todayButtonLabel.textContent, today.day);
}).skip(closeToRealMidnight);

/**
 * Check the day marked as today in a mini-month is correct.
 *
 * @param {"sidebar"|"todayPane"|"miniday"} which
 * @param {object} expected
 */
function checkMinimonthToday(which, expected) {
  info(`checking ${which} minimonth today`);

  const todays = minimonths[which].querySelectorAll("td[today]");
  Assert.equal(todays.length, 1);
  const todayInUTC = cal.dtz.jsDateToDateTime(todays[0].date, cal.dtz.UTC);
  Assert.equal(todayInUTC.year, expected.year);
  Assert.equal(todayInUTC.month, expected.month);
  Assert.equal(todayInUTC.day, expected.day);
  Assert.equal(todays[0].textContent, expected.day);
}

/**
 * Check the selected day in a mini-month is correct.
 *
 * @param {"sidebar"|"todayPane"|"miniday"} which
 * @param {object} expected
 */
function checkMinimonthSelected(which, expected) {
  info(`checking ${which} minimonth selection`);

  const selectedDays = minimonths[which].querySelectorAll("td[selected]");
  Assert.equal(selectedDays.length, 1);
  const selectedInUTC = cal.dtz.jsDateToDateTime(selectedDays[0].date, cal.dtz.UTC);
  Assert.equal(selectedInUTC.year, expected.year);
  Assert.equal(selectedInUTC.month, expected.month);
  Assert.equal(selectedInUTC.day, expected.day);
  Assert.equal(selectedDays[0].textContent, expected.day);
}

/**
 * Check the day marked as today in a day or week view is correct.
 *
 * @param {"day"|"week"} which
 * @param {object} expected
 */
async function checkDayViewToday(which, expected) {
  info(`checking ${which} view today`);
  await CalendarTestUtils.setCalendarView(window, which);

  const todayLabels = views[which].querySelectorAll(".day-column-container.day-column-today");
  if (!expected) {
    Assert.equal(todayLabels.length, 0);
    return;
  }
  Assert.equal(todayLabels.length, 1);
  Assert.stringContains(todayLabels[0].textContent, `${expected.weekdayName} `);
  Assert.stringContains(todayLabels[0].textContent, `${expected.shortWeekdayName} `);
  Assert.stringContains(todayLabels[0].textContent, ` ${expected.day}`);
  const dayLabels = [...views[which].querySelectorAll(".day-column-container")];
  if (which == "day") {
    Assert.equal(dayLabels.length, 1);
  } else {
    Assert.equal(dayLabels.length, 7);
    Assert.equal(dayLabels.indexOf(todayLabels[0]), expected.weekday);
  }
}

/**
 * Check the selected day in a day or week view is correct.
 *
 * @param {"day"|"week"} which
 * @param {object} expected
 */
async function checkDayViewSelected(which, expected) {
  info(`checking ${which} view selection`);
  await CalendarTestUtils.setCalendarView(window, which);

  const selectedLabels = views[which].querySelectorAll(
    which == "day" ? ".day-column-container" : ".day-column-container.day-column-selected"
  );
  Assert.equal(selectedLabels.length, 1);
  Assert.stringContains(selectedLabels[0].textContent, `${expected.weekdayName} `);
  Assert.stringContains(selectedLabels[0].textContent, `${expected.shortWeekdayName} `);
  Assert.stringContains(selectedLabels[0].textContent, ` ${expected.day}`);
  const dayLabels = [...views[which].querySelectorAll(".day-column-container")];
  if (which == "day") {
    Assert.equal(dayLabels.length, 1);
  } else {
    Assert.equal(dayLabels.length, 7);
    Assert.equal(dayLabels.indexOf(selectedLabels[0]), expected.weekday);
  }
}

/**
 * Check the day marked as today in a multiweek or month view is correct.
 *
 * @param {"multiweek"|"month"} which
 * @param {object} expected
 */
async function checkMonthViewToday(which, expected) {
  info(`checking ${which} view today`);
  await CalendarTestUtils.setCalendarView(window, which);

  const todayLabels = views[which].querySelectorAll(`calendar-day-label[relation="today"]`);
  Assert.equal(todayLabels.length, 1);
  Assert.equal(todayLabels[0].firstElementChild.value, expected.weekdayName);
  const dayLabels = [...views[which].querySelectorAll("calendar-day-label")];
  Assert.equal(dayLabels.length, 7);
  Assert.equal(dayLabels.indexOf(todayLabels[0]), expected.weekday);

  const todayBoxes = views[which].querySelectorAll(`calendar-month-day-box[relation="today"]`);
  Assert.equal(todayBoxes.length, 1);
  Assert.equal(todayBoxes[0].getAttribute("year"), expected.year);
  Assert.equal(todayBoxes[0].getAttribute("month"), expected.month + 1); // Not zero-indexed.
  Assert.equal(todayBoxes[0].getAttribute("day"), expected.day);
  const dayBoxes = [...todayBoxes[0].closest("tr").querySelectorAll("calendar-month-day-box")];
  Assert.equal(dayBoxes.length, 7);
  Assert.equal(dayBoxes.indexOf(todayBoxes[0]), expected.weekday);

  if (expected.weekday > 0) {
    Assert.equal(dayBoxes[0].getAttribute("relation"), "past");
  }
  if (expected.weekday < 6) {
    Assert.equal(dayBoxes[6].getAttribute("relation"), "future");
  }
}

/**
 * Check the selected day in a multiweek or month view is correct.
 *
 * @param {"multiweek"|"month"} which
 * @param {object} expected
 */
async function checkMonthViewSelected(which, expected) {
  info(`checking ${which} view selection`);
  await CalendarTestUtils.setCalendarView(window, which);

  const selectedBoxes = views[which].querySelectorAll(`calendar-month-day-box[selected="true"]`);
  Assert.equal(selectedBoxes.length, 1);
  Assert.equal(selectedBoxes[0].getAttribute("year"), expected.year);
  Assert.equal(selectedBoxes[0].getAttribute("month"), expected.month + 1); // Not zero-indexed.
  Assert.equal(selectedBoxes[0].getAttribute("day"), expected.day);
  const dayBoxes = [...selectedBoxes[0].closest("tr").querySelectorAll("calendar-month-day-box")];
  Assert.equal(dayBoxes.length, 7);
  Assert.equal(dayBoxes.indexOf(selectedBoxes[0]), expected.weekday);
}
