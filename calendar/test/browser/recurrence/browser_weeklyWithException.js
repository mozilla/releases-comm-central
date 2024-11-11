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
const STARTDATE = cal.createDateTime("20090106T000000Z");
const TITLE = "Event";

add_task(async function testWeeklyWithExceptionRecurrence() {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5);

  // Create weekly recurring event.
  let eventBox = dayView.getHourBoxAt(window, HOUR);
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: TITLE, repeat: setRecurrence });
  await saveAndCloseItemDialog(dialogWindow);

  let eventItem = await dayView.waitForEventBoxAt(window, 1);
  let icon = eventItem.querySelector(".item-recurrence-icon");
  Assert.equal(icon.src, "chrome://messenger/skin/icons/new/recurrence.svg");
  Assert.ok(!icon.hidden);

  // Move 5th January occurrence to 6th January.
  ({ dialogWindow, iframeWindow } = await dayView.editEventOccurrenceAt(window, 1));
  await setData(dialogWindow, iframeWindow, {
    title: TITLE,
    startdate: STARTDATE,
    enddate: STARTDATE,
  });
  await saveAndCloseItemDialog(dialogWindow);

  await CalendarTestUtils.goToDate(window, 2009, 1, 6);
  eventItem = await dayView.waitForEventBoxAt(window, 1);
  icon = eventItem.querySelector(".item-recurrence-icon");
  Assert.equal(icon.src, "chrome://messenger/skin/icons/new/recurrence-exception.svg");

  // Change recurrence rule.
  await CalendarTestUtils.goToDate(window, 2009, 1, 7);
  ({ dialogWindow, iframeWindow } = await dayView.editEventOccurrencesAt(window, 1));
  await setData(dialogWindow, iframeWindow, {
    title: "Event",
    repeat: changeRecurrence,
  });
  await saveAndCloseItemDialog(dialogWindow);

  // Check two weeks.
  // day view
  await CalendarTestUtils.setCalendarView(window, "day");

  await CalendarTestUtils.goToDate(window, 2009, 1, 5);
  await dayView.waitForNoEventBoxAt(window, 1);

  await CalendarTestUtils.calendarViewForward(window, 1);

  // Assert exactly two.
  Assert.ok(!!(await dayView.waitForEventBoxAt(window, 1)));
  Assert.ok(!!(await dayView.waitForEventBoxAt(window, 2)));

  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForNoEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForNoEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForNoEventBoxAt(window, 1);

  // next week
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForNoEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);
  await dayView.waitForNoEventBoxAt(window, 1);

  // week view
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5);

  // Assert exactly two on Tuesday.
  Assert.ok(!!(await weekView.waitForEventBoxAt(window, 3, 1)));
  Assert.ok(!!(await weekView.waitForEventBoxAt(window, 3, 2)));

  // Wait for the last occurrence because this appears last.
  eventItem = await weekView.waitForEventBoxAt(window, 6, 1);
  icon = eventItem.querySelector(".item-recurrence-icon");
  Assert.equal(icon.src, "chrome://messenger/skin/icons/new/recurrence.svg");
  Assert.ok(!icon.hidden);

  Assert.ok(!weekView.getEventBoxAt(window, 1, 1));
  Assert.ok(!weekView.getEventBoxAt(window, 2, 1));
  Assert.ok(!!weekView.getEventBoxAt(window, 4, 1));
  Assert.ok(!weekView.getEventBoxAt(window, 5, 1));
  Assert.ok(!weekView.getEventBoxAt(window, 7, 1));

  await CalendarTestUtils.calendarViewForward(window, 1);
  await weekView.waitForEventBoxAt(window, 6, 1);
  Assert.ok(!weekView.getEventBoxAt(window, 1, 1));
  Assert.ok(!!weekView.getEventBoxAt(window, 2, 1));
  Assert.ok(!!weekView.getEventBoxAt(window, 3, 1));
  Assert.ok(!!weekView.getEventBoxAt(window, 4, 1));
  Assert.ok(!weekView.getEventBoxAt(window, 5, 1));
  Assert.ok(!weekView.getEventBoxAt(window, 7, 1));

  // multiweek view
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5);
  // Wait for the first items, then check the ones not to be present.
  // Assert exactly two.
  await multiweekView.waitForItemAt(window, 1, 3, 1, 1);
  Assert.ok(multiweekView.getItemAt(window, 1, 3, 2, 1));
  Assert.ok(!multiweekView.getItemAt(window, 1, 3, 3, 1));
  // Then check no item on the 5th.
  Assert.ok(!multiweekView.getItemAt(window, 1, 2, 1));
  Assert.ok(multiweekView.getItemAt(window, 1, 4, 1));
  Assert.ok(!multiweekView.getItemAt(window, 1, 5, 1));
  Assert.ok(multiweekView.getItemAt(window, 1, 6, 1));
  Assert.ok(!multiweekView.getItemAt(window, 1, 7, 1));

  Assert.ok(!multiweekView.getItemAt(window, 2, 1, 1));
  Assert.ok(multiweekView.getItemAt(window, 2, 2, 1));
  Assert.ok(multiweekView.getItemAt(window, 2, 3, 1));
  Assert.ok(multiweekView.getItemAt(window, 2, 4, 1));
  Assert.ok(!multiweekView.getItemAt(window, 2, 5, 1));
  Assert.ok(multiweekView.getItemAt(window, 2, 6, 1));
  Assert.ok(!multiweekView.getItemAt(window, 2, 7, 1));

  eventItem = multiweekView.getItemAt(window, 2, 4, 1);
  icon = eventItem.querySelector(".item-recurrence-icon");
  Assert.equal(icon.src, "chrome://messenger/skin/icons/new/recurrence.svg");
  Assert.ok(!icon.hidden);

  // month view
  await CalendarTestUtils.setCalendarView(window, "month");
  // Wait for the first items, then check the ones not to be present.
  // Assert exactly two.
  // start on the second week
  await monthView.waitForItemAt(window, 2, 3, 1);
  Assert.ok(monthView.getItemAt(window, 2, 3, 2));
  Assert.ok(!monthView.getItemAt(window, 2, 3, 3));
  // Then check no item on the 5th.
  Assert.ok(!monthView.getItemAt(window, 2, 2, 1));
  Assert.ok(monthView.getItemAt(window, 2, 4, 1));
  Assert.ok(!monthView.getItemAt(window, 2, 5, 1));
  Assert.ok(monthView.getItemAt(window, 2, 6, 1));
  Assert.ok(!monthView.getItemAt(window, 2, 7, 1));

  Assert.ok(!monthView.getItemAt(window, 3, 1, 1));
  Assert.ok(monthView.getItemAt(window, 3, 2, 1));
  Assert.ok(monthView.getItemAt(window, 3, 3, 1));
  Assert.ok(monthView.getItemAt(window, 3, 4, 1));
  Assert.ok(!monthView.getItemAt(window, 3, 5, 1));
  Assert.ok(monthView.getItemAt(window, 3, 6, 1));
  Assert.ok(!monthView.getItemAt(window, 3, 7, 1));

  eventItem = monthView.getItemAt(window, 3, 6, 1);
  icon = eventItem.querySelector(".item-recurrence-icon");
  Assert.equal(icon.src, "chrome://messenger/skin/icons/new/recurrence.svg");
  Assert.ok(!icon.hidden);

  // Delete event.
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 12);
  eventBox = await dayView.waitForEventBoxAt(window, 1);
  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  await handleDeleteOccurrencePrompt(window, eventBox, true);
  await dayView.waitForNoEventBoxAt(window, 1);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  const recurrenceDocument = recurrenceWindow.document;

  // weekly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

  const mon = cal.dtz.formatter.shortWeekdayNames[1];
  const wed = cal.dtz.formatter.shortWeekdayNames[3];
  const fri = cal.dtz.formatter.shortWeekdayNames[5];

  const dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

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

  const button = recurrenceDocument.querySelector("dialog").getButton("accept");
  button.scrollIntoView({ block: "start", behavior: "instant" });
  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(button, {}, recurrenceWindow);
}

async function changeRecurrence(recurrenceWindow) {
  const recurrenceDocument = recurrenceWindow.document;

  // weekly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

  const mon = cal.dtz.formatter.shortWeekdayNames[1];
  const tue = cal.dtz.formatter.shortWeekdayNames[2];
  const wed = cal.dtz.formatter.shortWeekdayNames[3];
  const fri = cal.dtz.formatter.shortWeekdayNames[5];

  const dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

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

  const button = recurrenceDocument.querySelector("dialog").getButton("accept");
  button.scrollIntoView({ block: "start", behavior: "instant" });
  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(button, {}, recurrenceWindow);
}
