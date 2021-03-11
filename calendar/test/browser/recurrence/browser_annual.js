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
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

var elib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");

var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const STARTYEAR = 1950;
const EPOCH = 1970;

add_task(async function testAnnualRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, STARTYEAR, 1, 1);

  // Create yearly recurring all-day event.
  let eventBox = dayView.getAllDayHeader(controller.window);
  await invokeNewEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { title: "Event", repeat: "yearly" });
    saveAndCloseItemDialog(eventWindow);
  });

  let checkYears = [STARTYEAR, STARTYEAR + 1, EPOCH - 1, EPOCH, EPOCH + 1];
  for (let year of checkYears) {
    goToDate(controller, year, 1, 1);
    let date = new Date(Date.UTC(year, 0, 1));
    let column = date.getUTCDay() + 1;

    // day view
    switchToView(controller, "day");
    await dayView.waitForAllDayItem(controller.window);

    // week view
    switchToView(controller, "week");
    await weekView.waitForAllDayItem(controller.window, column);

    // multiweek view
    switchToView(controller, "multiweek");
    await multiweekView.waitForItemAt(controller.window, 1, column);

    // month view
    switchToView(controller, "month");
    await monthView.waitForItemAt(controller.window, 1, column);
  }

  // Delete event.
  goToDate(controller, checkYears[0], 1, 1);
  switchToView(controller, "day");
  const box = new elib.Elem(await dayView.waitForAllDayItem(controller.window));
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  await TestUtils.waitForCondition(
    () => !dayView.getAllDayItem(controller.window),
    "No all-day events"
  );

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
