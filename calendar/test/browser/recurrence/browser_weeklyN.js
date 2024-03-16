/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { handleDeleteOccurrencePrompt } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarUtils.sys.mjs"
);

var { menulistSelect, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const HOUR = 8;

/*
 * This test is intended to verify that events recurring on a weekly basis are
 * correctly created and displayed. The event should recur on multiple days in
 * the week, skip days, and be limited to a certain number of recurrences in
 * order to verify that these parameters are respected. Deletion should delete
 * all event occurrences when appropriate.
 */
add_task(async function testWeeklyNRecurrence() {
  async function setRecurrence(recurrenceWindow) {
    const recurrenceDocument = recurrenceWindow.document;

    // Select weekly recurrence
    await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

    const monLabel = cal.l10n.getDateFmtString("day.2.Mmm");
    const tueLabel = cal.l10n.getDateFmtString("day.3.Mmm");
    const wedLabel = cal.l10n.getDateFmtString("day.4.Mmm");
    const friLabel = cal.l10n.getDateFmtString("day.6.Mmm");
    const satLabel = cal.l10n.getDateFmtString("day.7.Mmm");

    const dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

    // Selected date is a Monday, so it should already be selected
    Assert.ok(
      dayPicker.querySelector(`[label="${monLabel}"]`).checked,
      "Monday should already be selected"
    );

    // Select Tuesday, Wednesday, Friday, and Saturday as additional days for
    // event occurrences
    EventUtils.synthesizeMouseAtCenter(
      dayPicker.querySelector(`[label="${tueLabel}"]`),
      {},
      recurrenceWindow
    );
    EventUtils.synthesizeMouseAtCenter(
      dayPicker.querySelector(`[label="${wedLabel}"]`),
      {},
      recurrenceWindow
    );
    EventUtils.synthesizeMouseAtCenter(
      dayPicker.querySelector(`[label="${friLabel}"]`),
      {},
      recurrenceWindow
    );
    EventUtils.synthesizeMouseAtCenter(
      dayPicker.querySelector(`[label="${satLabel}"]`),
      {},
      recurrenceWindow
    );

    // Create a total of four events
    EventUtils.synthesizeMouseAtCenter(
      recurrenceDocument.getElementById("recurrence-range-for"),
      {},
      recurrenceWindow
    );
    recurrenceDocument.getElementById("repeat-ntimes-count").value = "4";

    const button = recurrenceDocument.querySelector("dialog").getButton("accept");
    button.scrollIntoView();
    // Close dialog
    EventUtils.synthesizeMouseAtCenter(button, {}, recurrenceWindow);
  }

  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5);

  // Create event recurring on a weekly basis
  const eventBox = dayView.getHourBoxAt(window, HOUR);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: setRecurrence });
  await saveAndCloseItemDialog(dialogWindow);

  // Verify in the day view that events were created for Monday through Wednesday
  for (let i = 0; i < 3; i++) {
    await dayView.waitForEventBoxAt(window, 1);
    await CalendarTestUtils.calendarViewForward(window, 1);
  }

  // No event should have been created on Thursday because it was not selected
  await dayView.waitForNoEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);

  // An event should have been created for Friday because it was selected
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);

  // No event should have been created on Saturday due to four event limit
  await dayView.waitForNoEventBoxAt(window, 1);

  // Validate event creation and lack of Saturday event in week view
  await CalendarTestUtils.setCalendarView(window, "week");

  for (let i = 2; i < 5; i++) {
    await weekView.waitForEventBoxAt(window, i, 1);
  }

  // No event Thursday or Saturday, event on Friday
  await weekView.waitForNoEventBoxAt(window, 5, 1);
  await weekView.waitForEventBoxAt(window, 6, 1);
  await weekView.waitForNoEventBoxAt(window, 7, 1);

  // Validate event creation and lack of Saturday event in multiweek view
  await CalendarTestUtils.setCalendarView(window, "multiweek");

  for (let i = 2; i < 5; i++) {
    await multiweekView.waitForItemAt(window, 1, i, 1);
  }

  // No event Thursday or Saturday, event on Friday
  await multiweekView.waitForNoItemAt(window, 1, 5, 1);
  await multiweekView.waitForItemAt(window, 1, 6, 1);
  await multiweekView.waitForNoItemAt(window, 1, 7, 1);

  // Validate event creation and lack of Saturday event in month view
  await CalendarTestUtils.setCalendarView(window, "month");

  for (let i = 2; i < 5; i++) {
    // This should be the second week in the month
    await monthView.waitForItemAt(window, 2, i, 1);
  }

  // No event Thursday or Saturday, event on Friday
  await monthView.waitForNoItemAt(window, 2, 5, 1);
  await monthView.waitForItemAt(window, 2, 6, 1);
  await monthView.waitForNoItemAt(window, 2, 7, 1);

  // Delete event
  const box = await monthView.waitForItemAt(window, 2, 2, 1);
  EventUtils.synthesizeMouseAtCenter(box, {}, window);
  await handleDeleteOccurrencePrompt(window, box, true);

  // All occurrences should have been deleted
  for (let i = 2; i < 5; i++) {
    await monthView.waitForNoItemAt(window, 2, i, 1);
  }

  await monthView.waitForNoItemAt(window, 2, 6, 1);
});

/*
 * This test is intended to catch instances in which we aren't correctly setting
 * the week start value of recurrences. For example, if the user has set their
 * week to start on Saturday, then creates a recurring event running every other
 * Saturday, Sunday, and Monday, they expect to see events on the initial
 * Saturday, Sunday, Monday, skip a week, repeat. However, week start defaults
 * to Monday, so if it is not correctly set, they would see events on the
 * initial Saturday and Sunday, nothing on Monday, but an event on the following
 * Monday.
 */
add_task(async function testRecurrenceAcrossWeekStart() {
  // Sanity check that we're not testing against a default value
  const initialWeekStart = Services.prefs.getIntPref("calendar.week.start", 0);
  Assert.notEqual(initialWeekStart, 6, "week start should not be Saturday");

  // Set week start to Saturday
  Services.prefs.setIntPref("calendar.week.start", 6);
  registerCleanupFunction(() => {
    Services.prefs.setIntPref("calendar.week.start", initialWeekStart);
  });

  async function setRecurrence(recurrenceWindow) {
    const recurrenceDocument = recurrenceWindow.document;

    // Select weekly recurrence
    await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

    // Recur every two weeks
    recurrenceDocument.getElementById("weekly-weeks").value = "2";

    const satLabel = cal.l10n.getDateFmtString("day.7.Mmm");
    const sunLabel = cal.l10n.getDateFmtString("day.1.Mmm");
    const monLabel = cal.l10n.getDateFmtString("day.2.Mmm");

    const dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

    // Selected date is a Saturday, so it should already be selected
    Assert.ok(
      dayPicker.querySelector(`[label="${satLabel}"]`).checked,
      "Saturday should already be checked"
    );

    // Select Sunday and Monday as additional days for event occurrences
    EventUtils.synthesizeMouseAtCenter(
      dayPicker.querySelector(`[label="${sunLabel}"]`),
      {},
      recurrenceWindow
    );
    EventUtils.synthesizeMouseAtCenter(
      dayPicker.querySelector(`[label="${monLabel}"]`),
      {},
      recurrenceWindow
    );

    // Create a total of six events
    EventUtils.synthesizeMouseAtCenter(
      recurrenceDocument.getElementById("recurrence-range-for"),
      {},
      recurrenceWindow
    );
    recurrenceDocument.getElementById("repeat-ntimes-count").value = "6";

    const button = recurrenceDocument.querySelector("dialog").getButton("accept");
    button.scrollIntoView();
    // Close dialog
    EventUtils.synthesizeMouseAtCenter(button, {}, recurrenceWindow);
  }

  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2022, 10, 15);

  // Create event recurring every other week
  const eventBox = dayView.getHourBoxAt(window, HOUR);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: setRecurrence });
  await saveAndCloseItemDialog(dialogWindow);

  // Open week view
  await CalendarTestUtils.setCalendarView(window, "week");

  // Verify events created on Saturday, Sunday, Monday of first week
  for (let i = 1; i < 4; i++) {
    await weekView.waitForEventBoxAt(window, i, 1);
  }

  // Verify no events created on Saturday, Sunday, Monday of second week
  await CalendarTestUtils.calendarViewForward(window, 1);

  for (let i = 1; i < 4; i++) {
    await weekView.waitForNoEventBoxAt(window, i, 1);
  }

  // Verify events created on Saturday, Sunday, Monday of third week
  await CalendarTestUtils.calendarViewForward(window, 1);

  for (let i = 1; i < 4; i++) {
    await weekView.waitForEventBoxAt(window, i, 1);
  }
});
