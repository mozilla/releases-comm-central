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
  helpersForController,
  invokeNewEventDialog,
  invokeEditingRepeatEventDialog,
  switchToView,
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

var elib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");

var { menulistSelect, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const HOUR = 8;
const STARTDATE = cal.createDateTime("20090106T000000Z");
const TITLE = "Event";

add_task(async function testWeeklyWithExceptionRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 5);

  // Create weekly recurring event.
  let eventBox = dayView.getHourBox(controller.window, HOUR);
  await invokeNewEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { title: TITLE, repeat: setRecurrence });
    saveAndCloseItemDialog(eventWindow);
  });

  // Move 5th January occurrence to 6th January.
  eventBox = await dayView.waitForEventBox(controller.window);
  await invokeEditingRepeatEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      title: TITLE,
      startdate: STARTDATE,
      enddate: STARTDATE,
    });
    saveAndCloseItemDialog(eventWindow);
  });

  goToDate(controller, 2009, 1, 6);
  await dayView.waitForEventBox(controller.window);

  // Change recurrence rule.
  goToDate(controller, 2009, 1, 7);
  eventBox = await dayView.waitForEventBox(controller.window);
  await invokeEditingRepeatEventDialog(
    controller,
    eventBox,
    async (eventWindow, iframeWindow) => {
      await setData(eventWindow, iframeWindow, { title: "Event", repeat: changeRecurrence });
      saveAndCloseItemDialog(eventWindow);
    },
    true
  );

  // Check two weeks.
  // day view
  switchToView(controller, "day");

  goToDate(controller, 2009, 1, 5);
  await dayView.waitForNoEvents(controller.window);

  viewForward(controller, 1);

  // Assert exactly two.
  await TestUtils.waitForCondition(
    () => dayView.getEventBoxes(controller.window).length === 2,
    "Two events on Tuesday day-view"
  );

  viewForward(controller, 1);
  await dayView.waitForEventBox(controller.window);
  viewForward(controller, 1);
  await dayView.waitForNoEvents(controller.window);
  viewForward(controller, 1);
  await dayView.waitForEventBox(controller.window);
  viewForward(controller, 1);
  await dayView.waitForNoEvents(controller.window);
  viewForward(controller, 1);
  await dayView.waitForNoEvents(controller.window);

  // next week
  viewForward(controller, 1);
  await dayView.waitForEventBox(controller.window);
  viewForward(controller, 1);
  await dayView.waitForEventBox(controller.window);
  viewForward(controller, 1);
  await dayView.waitForEventBox(controller.window);
  viewForward(controller, 1);
  await dayView.waitForNoEvents(controller.window);
  viewForward(controller, 1);
  await dayView.waitForEventBox(controller.window);
  viewForward(controller, 1);
  await dayView.waitForNoEvents(controller.window);

  // week view
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 5);

  // Assert exactly two on Tuesday.
  await TestUtils.waitForCondition(
    () => weekView.getEventBoxes(controller.window, 3).length === 2,
    "Two events on Tuesday week-view"
  );

  // Wait for the last occurrence because this appears last.
  await weekView.waitForEventBox(controller.window, 6);
  Assert.ok(!weekView.getEventBox(controller.window, 1));
  Assert.ok(!weekView.getEventBox(controller.window, 2));
  Assert.ok(weekView.getEventBox(controller.window, 4));
  Assert.ok(!weekView.getEventBox(controller.window, 5));
  Assert.ok(!weekView.getEventBox(controller.window, 7));

  viewForward(controller, 1);
  await weekView.waitForEventBox(controller.window, 6);
  Assert.ok(!weekView.getEventBox(controller.window, 1));
  Assert.ok(weekView.getEventBox(controller.window, 2));
  Assert.ok(weekView.getEventBox(controller.window, 3));
  Assert.ok(weekView.getEventBox(controller.window, 4));
  Assert.ok(!weekView.getEventBox(controller.window, 5));
  Assert.ok(!weekView.getEventBox(controller.window, 7));

  // multiweek view
  switchToView(controller, "multiweek");
  goToDate(controller, 2009, 1, 5);
  // Wait for the first items, then check the ones not to be present.
  // Assert exactly two.
  await multiweekView.waitForItemAt(controller.window, 1, 3, 1);
  Assert.ok(multiweekView.getItemAt(controller.window, 1, 3, 2));
  Assert.ok(!multiweekView.getItemAt(controller.window, 1, 3, 3));
  // Then check no item on the 5th.
  Assert.ok(!multiweekView.getItemAt(controller.window, 1, 2));
  Assert.ok(multiweekView.getItemAt(controller.window, 1, 4));
  Assert.ok(!multiweekView.getItemAt(controller.window, 1, 5));
  Assert.ok(multiweekView.getItemAt(controller.window, 1, 6));
  Assert.ok(!multiweekView.getItemAt(controller.window, 1, 7));

  Assert.ok(!multiweekView.getItemAt(controller.window, 2, 1));
  Assert.ok(multiweekView.getItemAt(controller.window, 2, 2));
  Assert.ok(multiweekView.getItemAt(controller.window, 2, 3));
  Assert.ok(multiweekView.getItemAt(controller.window, 2, 4));
  Assert.ok(!multiweekView.getItemAt(controller.window, 2, 5));
  Assert.ok(multiweekView.getItemAt(controller.window, 2, 6));
  Assert.ok(!multiweekView.getItemAt(controller.window, 2, 7));

  // month view
  switchToView(controller, "month");
  // Wait for the first items, then check the ones not to be present.
  // Assert exactly two.
  // start on the second week
  await monthView.waitForItemAt(controller.window, 2, 3, 1);
  Assert.ok(monthView.getItemAt(controller.window, 2, 3, 2));
  Assert.ok(!monthView.getItemAt(controller.window, 2, 3, 3));
  // Then check no item on the 5th.
  Assert.ok(!monthView.getItemAt(controller.window, 2, 2));
  Assert.ok(monthView.getItemAt(controller.window, 2, 4));
  Assert.ok(!monthView.getItemAt(controller.window, 2, 5));
  Assert.ok(monthView.getItemAt(controller.window, 2, 6));
  Assert.ok(!monthView.getItemAt(controller.window, 2, 7));

  Assert.ok(!monthView.getItemAt(controller.window, 3, 1));
  Assert.ok(monthView.getItemAt(controller.window, 3, 2));
  Assert.ok(monthView.getItemAt(controller.window, 3, 3));
  Assert.ok(monthView.getItemAt(controller.window, 3, 4));
  Assert.ok(!monthView.getItemAt(controller.window, 3, 5));
  Assert.ok(monthView.getItemAt(controller.window, 3, 6));
  Assert.ok(!monthView.getItemAt(controller.window, 3, 7));

  // Delete event.
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 12);
  eventBox = new elib.Elem(await dayView.waitForEventBox(controller.window));
  controller.click(eventBox);
  handleOccurrencePrompt(controller, eventBox, "delete", true);
  await dayView.waitForNoEvents(controller.window);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  let recurrenceDocument = recurrenceWindow.document;

  // weekly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

  let mon = cal.l10n.getDateFmtString("day.2.Mmm");
  let wed = cal.l10n.getDateFmtString("day.4.Mmm");
  let fri = cal.l10n.getDateFmtString("day.6.Mmm");

  let dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

  // Starting from Monday so it should be checked.
  Assert.ok(dayPicker.querySelector(`[label="${mon}"]`).checked, "mon checked");

  // Check Wednesday and Friday too.
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${wed}"]`),
    {},
    recurrenceWindow
  );
  Assert.ok(dayPicker.querySelector(`[label="${wed}"]`).checked, "wed checked");
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${fri}"]`),
    {},
    recurrenceWindow
  );
  Assert.ok(dayPicker.querySelector(`[label="${fri}"]`).checked, "fri checked");

  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.querySelector("dialog").getButton("accept"),
    {},
    recurrenceWindow
  );
}

async function changeRecurrence(recurrenceWindow) {
  let recurrenceDocument = recurrenceWindow.document;

  // weekly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

  let mon = cal.l10n.getDateFmtString("day.2.Mmm");
  let tue = cal.l10n.getDateFmtString("day.3.Mmm");
  let wed = cal.l10n.getDateFmtString("day.4.Mmm");
  let fri = cal.l10n.getDateFmtString("day.6.Mmm");

  let dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

  // Check old rule.
  // Starting from Monday so it should be checked.
  Assert.ok(dayPicker.querySelector(`[label="${mon}"]`).checked, "mon checked");
  Assert.ok(dayPicker.querySelector(`[label="${wed}"]`).checked, "wed checked");
  Assert.ok(dayPicker.querySelector(`[label="${fri}"]`).checked, "fri checked");

  // Check Tuesday.
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${tue}"]`),
    {},
    recurrenceWindow
  );
  Assert.ok(dayPicker.querySelector(`[label="${tue}"]`).checked, "tue checked");

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
