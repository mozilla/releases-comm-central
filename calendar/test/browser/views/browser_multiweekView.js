/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { formatDate, formatTime, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const TITLE1 = "Multiweek View Event";
const TITLE2 = "Multiweek View Event Changed";
const DESC = "Multiweek View Event Description";

add_task(async function () {
  let calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  // Verify date.
  await TestUtils.waitForCondition(() => {
    let dateLabel = document.querySelector(
      '#multiweek-view td[selected="true"] > calendar-month-day-box'
    );
    return dateLabel && dateLabel.mDate.icalString == "20090101";
  }, "Inspecting the date");

  // Create event.
  // Thursday of 2009-01-05 should be the selected box in the first row with default settings.
  let hour = new Date().getUTCHours(); // Remember time at click.
  let eventBox = CalendarTestUtils.multiweekView.getDayBox(window, 1, 5);
  let { dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewEvent(
    window,
    eventBox
  );

  // Check that the start time is correct.
  // Next full hour except last hour hour of the day.
  let nextHour = hour == 23 ? hour : (hour + 1) % 24;
  let someDate = cal.dtz.now();
  someDate.resetTo(2009, 0, 5, nextHour, 0, 0, cal.dtz.UTC);

  let startPicker = iframeDocument.getElementById("event-starttime");
  Assert.equal(startPicker._datepicker._inputField.value, formatDate(someDate));
  Assert.equal(startPicker._timepicker._inputField.value, formatTime(someDate));

  // Fill in title, description and calendar.
  await setData(dialogWindow, iframeWindow, {
    title: TITLE1,
    description: DESC,
    calendar: "Test",
  });

  await saveAndCloseItemDialog(dialogWindow);

  // If it was created successfully, it can be opened.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.multiweekView.editItemAt(
    window,
    1,
    5,
    1
  ));
  // Change title and save changes.
  await setData(dialogWindow, iframeWindow, { title: TITLE2 });
  await saveAndCloseItemDialog(dialogWindow);

  // Check if name was saved.
  await TestUtils.waitForCondition(() => {
    eventBox = CalendarTestUtils.multiweekView.getItemAt(window, 1, 5, 1);
    if (eventBox === null) {
      return false;
    }
    let eventName = eventBox.querySelector(".event-name-label");
    return eventName && eventName.textContent == TITLE2;
  }, "Wait for the new title");

  // Delete event.
  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 1, 5, 1);

  Assert.ok(true, "Test ran to completion");
});
