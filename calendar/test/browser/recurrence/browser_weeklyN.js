/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
  invokeNewEventDialog,
  switchToView,
  viewForward,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");

var { menulistSelect, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const HOUR = 8;

add_task(async function testWeeklyNRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 5);

  // Create weekly recurring event.
  let eventBox = dayView.getHourBoxAt(controller.window, HOUR);
  await invokeNewEventDialog(window, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { title: "Event", repeat: setRecurrence });
    await saveAndCloseItemDialog(eventWindow);
  });

  // Check day view.
  // Monday, Tuesday, Wednesday, Thursday
  for (let i = 0; i < 4; i++) {
    await dayView.waitForEventBoxAt(controller.window, 1);
    viewForward(controller, 1);
  }

  // Not Friday.
  await dayView.waitForNoEventBoxAt(controller.window, 1);
  viewForward(controller, 1);

  // Not Saturday as only 4 occurrences are set.
  await dayView.waitForNoEventBoxAt(controller.window, 1);

  // Check week view.
  switchToView(controller, "week");

  // Monday, Tuesday, Wednesday, Thursday
  for (let i = 2; i < 6; i++) {
    await weekView.waitForEventBoxAt(controller.window, i, 1);
  }

  // Saturday
  await weekView.waitForNoEventBoxAt(controller.window, 7, 1);

  // Check multiweek view.
  switchToView(controller, "multiweek");

  // Monday, Tuesday, Wednesday, Thursday
  for (let i = 2; i < 6; i++) {
    await multiweekView.waitForItemAt(controller.window, 1, i, 1);
  }

  // Saturday
  Assert.ok(!multiweekView.getItemAt(controller.window, 1, 7, 1));

  // Check month view.
  switchToView(controller, "month");

  // Monday, Tuesday, Wednesday, Thursday
  for (let i = 2; i < 6; i++) {
    // in month-view, start on week 2
    await monthView.waitForItemAt(controller.window, 2, i, 1);
  }

  // Saturday
  Assert.ok(!monthView.getItemAt(controller.window, 2, 7, 1));

  // Delete event.
  let box = await monthView.waitForItemAt(controller.window, 2, 2, 1);
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  await monthView.waitForNoItemAt(controller.window, 2, 2, 1);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  let recurrenceDocument = recurrenceWindow.document;

  // weekly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

  let mon = cal.l10n.getDateFmtString("day.2.Mmm");
  let tue = cal.l10n.getDateFmtString("day.3.Mmm");
  let wed = cal.l10n.getDateFmtString("day.4.Mmm");
  let thu = cal.l10n.getDateFmtString("day.5.Mmm");
  let sat = cal.l10n.getDateFmtString("day.7.Mmm");

  let dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

  // Starting from Monday so it should be checked.
  Assert.ok(dayPicker.querySelector(`[label="${mon}"]`).checked, "mon checked");
  // Check Tuesday, Wednesday, Thursday and Saturday too.
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${tue}"]`),
    {},
    recurrenceWindow
  );
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${wed}"]`),
    {},
    recurrenceWindow
  );
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${thu}"]`),
    {},
    recurrenceWindow
  );
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${sat}"]`),
    {},
    recurrenceWindow
  );

  // Set number of recurrences.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.getElementById("recurrence-range-for"),
    {},
    recurrenceWindow
  );
  recurrenceDocument.getElementById("repeat-ntimes-count").value = "4";

  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.querySelector("dialog").getButton("accept"),
    {},
    recurrenceWindow
  );
}

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
