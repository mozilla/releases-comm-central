/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test dragging of events in the various calendar views.
 */
const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

const calendar = CalendarTestUtils.createProxyCalendar("Drag Test", "memory");
Services.prefs.setIntPref("calendar.view.visiblehours", 24);

registerCleanupFunction(() => {
  CalendarTestUtils.removeProxyCalendar(calendar);
  Services.prefs.clearUserPref("calendar.view.visiblehours");
});

/**
 * Ensures that we are dragging from a consistent location in the various
 * calendar views (scrolled all the way to the top with the window maximized).
 *
 * @param {calIDateTime} date - A date to navigate the view to.
 */
async function resetView(date) {
  window.goToDate(date);

  if (window.windowState != window.STATE_MAXIMIZED) {
    // The multi-day views adjust scrolling dynamically when they detect a
    // resize. Hook into the resize event and scroll after the adjustment.
    let promise = BrowserTestUtils.waitForEvent(window, "resize");
    window.maximize();
    await promise;
    await new Promise(resolve => setTimeout(resolve));
  }
}

/**
 * Simulates the dragging of an event box in a multi-day view to another
 * column, horizontally.
 *
 * @param {MozCalendarEventBox} eventBox
 * @param {MozCalendarEventColumn} column
 * @param {number} index
 */
function simulateDragToColumn(eventBox, column, index) {
  // Force 1 pixel = 1 minute in the column
  let shiftKey = true;
  column.pixelsPerMinute = 1;

  let mousedownProps = {
    screenX: eventBox.screenX,
    screenY: eventBox.screenY,
    shiftKey: true,
  };
  eventBox.dispatchEvent(new MouseEvent("mousedown", mousedownProps));
  eventBox.dispatchEvent(new MouseEvent("mouseout"));

  let spacer = column.querySelector(
    `.multiday-column-box-stack > .multiday-column-bg-box >` +
      `.calendar-event-column-linebox:nth-child(${index})`
  );
  let screenX = spacer.screenX;
  let screenY = spacer.screenY;
  let destRect = column.getBoundingClientRect();
  let clientX = destRect.x;
  let clientY = eventBox.getBoundingClientRect().y;

  let props = { clientX, clientY, screenX, screenY, shiftKey };
  window.dispatchEvent(new MouseEvent("mousemove", props));
  window.dispatchEvent(new MouseEvent("mouseup", props));
}

/**
 * Simulates the dragging of an event box via one of the gripbars.
 *
 * @param {MozCalendarEventgripbar} gripbar
 * @param {MozCalendarEventBox} eventBox
 * @param {MozCalendarEventColumn} column
 * @param {number} index
 */
function simulateGripbarDrag(gripbar, eventBox, column, index) {
  // Force 1 pixel = 1 minute in the column
  let shiftKey = true;
  column.pixelsPerMinute = 1;

  let gripbarRect = eventBox.getBoundingClientRect();
  let mousedownProps = {
    screenX: gripbarRect.x,
    screenY: gripbarRect.y + gripbarRect.height,
    shiftKey,
    bubbles: true,
  };
  gripbar.dispatchEvent(new MouseEvent("mousedown", mousedownProps));

  let spacer = column.querySelector(
    `.multiday-column-box-stack > .multiday-column-bg-box >` +
      `.calendar-event-column-linebox:nth-child(${index})`
  );
  let screenX = spacer.screenX;
  let screenY = spacer.screenY;
  let destRect = spacer.getBoundingClientRect();
  let clientX = destRect.x;
  let clientY = destRect.y;
  eventBox.dispatchEvent(new MouseEvent("mouseout"));

  let props = { clientX, clientY, screenX, screenY, shiftKey };
  window.dispatchEvent(new MouseEvent("mousemove", props));
  window.dispatchEvent(new MouseEvent("mouseup", props));
}

/**
 * Tests dragging an event item updates the event in the month view.
 */
add_task(async function testMonthViewDragEventItem() {
  let event = new CalEvent();
  event.id = "1";
  event.title = "Month View Event";
  event.startDate = cal.createDateTime("20210316T000000Z");
  event.endDate = cal.createDateTime("20210316T110000Z");

  await CalendarTestUtils.setCalendarView(window, "month");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventItem = await CalendarTestUtils.monthView.waitForItemAt(window, 3, 3, 1);
  let dayBox = await CalendarTestUtils.monthView.getDayBox(window, 3, 2);
  let dragSession = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);
  dragSession.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    eventItem,
    dayBox,
    undefined,
    undefined,
    eventItem.ownerGlobal,
    dayBox.ownerGlobal
  );
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, dayBox);
  dragSession.endDragSession(true);

  Assert.ok(
    !CalendarTestUtils.monthView.getItemAt(window, 3, 3, 1),
    "item removed from initial date"
  );

  eventItem = await CalendarTestUtils.monthView.waitForItemAt(window, 3, 2, 1);
  Assert.ok(eventItem, "item moved to new date");

  let { id, title, startDate, endDate } = eventItem.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210315T000000Z", "startDate is correct");
  Assert.equal(endDate.icalString, "20210315T110000Z", "endDate is correct");
  await calendar.deleteItem(eventItem.occurrence);
});

/**
 * Tests dragging an event item updates the event in the multiweek view.
 */
add_task(async function testMultiWeekViewDragEventItem() {
  let event = new CalEvent();
  event.id = "2";
  event.title = "Multiweek View Event";
  event.startDate = cal.createDateTime("20210316T000000Z");
  event.endDate = cal.createDateTime("20210316T110000Z");

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventItem = await CalendarTestUtils.multiweekView.waitForItemAt(window, 1, 3, 1);
  let dayBox = await CalendarTestUtils.multiweekView.getDayBox(window, 1, 2);
  let dragSession = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);
  dragSession.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    eventItem,
    dayBox,
    undefined,
    undefined,
    eventItem.ownerGlobal,
    dayBox.ownerGlobal
  );
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, dayBox);
  dragSession.endDragSession(true);

  Assert.ok(
    !CalendarTestUtils.multiweekView.getItemAt(window, 1, 3, 1),
    "item removed from initial date"
  );

  eventItem = await CalendarTestUtils.multiweekView.waitForItemAt(window, 1, 2, 1);
  Assert.ok(eventItem, "item moved to new date");

  let { id, title, startDate, endDate } = eventItem.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210315T000000Z", "startDate is correct");
  Assert.equal(endDate.icalString, "20210315T110000Z", "endDate is correct");
  await calendar.deleteItem(eventItem.occurrence);
});

/**
 * Tests dragging an event box to the previous day updates the event in the
 * week view.
 */
add_task(async function testWeekViewDragEventBoxToPreviousDay() {
  let event = new CalEvent();
  event.id = "3";
  event.title = "Week View Previous Day";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  let column = await CalendarTestUtils.weekView.getEventColumn(window, 2);
  simulateDragToColumn(eventBox, column, 3);

  Assert.ok(
    !CalendarTestUtils.weekView.getEventBoxAt(window, 3, 1),
    "event moved from initial position"
  );

  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 2, 1);
  Assert.ok(eventBox, "event is at new position");

  let { id, title, startDate, endDate } = eventBox.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210315T020000Z", "startDate is correct");
  Assert.equal(endDate.icalString, "20210315T030000Z", "endDate is correct");
  await calendar.deleteItem(eventBox.occurrence);
});

/**
 * Tests dragging an event box to the following day updates the event in the
 * week view.
 */
add_task(async function testWeekViewDragEventBoxToFollowingDay() {
  let event = new CalEvent();
  event.id = "4";
  event.title = "Week View Following Day";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  let column = await CalendarTestUtils.weekView.getEventColumn(window, 4);
  simulateDragToColumn(eventBox, column, 3);

  Assert.ok(
    !CalendarTestUtils.weekView.getEventBoxAt(window, 3, 1),
    "event moved from initial position"
  );

  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 4, 1);
  Assert.ok(eventBox, "event is at new position");

  let { id, title, startDate, endDate } = eventBox.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210317T020000Z", "startDate is correct");
  Assert.equal(endDate.icalString, "20210317T030000Z", "endDate is correct");
  await calendar.deleteItem(eventBox.occurrence);
});

/**
 * Tests dragging the top of an event box updates the start time in the week
 * view.
 */
add_task(async function testWeekViewDragEventBoxStartTime() {
  let event = new CalEvent();
  event.id = "5";
  event.title = "Week View Start";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  let gripbar = eventBox.querySelector('[whichside="start"]');
  let column = await CalendarTestUtils.weekView.getEventColumn(window, 3);
  simulateGripbarDrag(gripbar, eventBox, column, 2);
  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);

  let { id, title, startDate, endDate } = eventBox.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210316T010000Z", "startDate was changed");
  Assert.equal(endDate.icalString, "20210316T030000Z", "endDate did not change");
  await calendar.deleteItem(eventBox.occurrence);
});

/**
 * Tests dragging the end of an event box changes the time in the week view.
 */
add_task(async function testWeekViewDragEventBoxEndTime() {
  let event = new CalEvent();
  event.id = "6";
  event.title = "Week View End";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  let gripbar = eventBox.querySelector('[whichside="end"]');
  let column = await CalendarTestUtils.weekView.getEventColumn(window, 3);
  simulateGripbarDrag(gripbar, eventBox, column, 7);
  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);

  let { id, title, startDate, endDate } = eventBox.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210316T020000Z", "startDate did not change");
  Assert.equal(endDate.icalString, "20210316T060000Z", "endDate was changed");
  await calendar.deleteItem(eventBox.occurrence);
});

/**
 * Tests dragging the top of an event box changes the start time in the day view.
 */
add_task(async function testDayViewDragEventBoxStartTime() {
  let event = new CalEvent();
  event.id = "7";
  event.title = "Day View Start";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "day");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);
  let gripbar = eventBox.querySelector('[whichside="start"]');
  let column = await CalendarTestUtils.dayView.getEventColumn(window);
  simulateGripbarDrag(gripbar, eventBox, column, 2);
  eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);

  let { id, title, startDate, endDate } = eventBox.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210316T010000Z", "startDate was changed");
  Assert.equal(endDate.icalString, "20210316T030000Z", "endDate did not change");
  await calendar.deleteItem(eventBox.occurrence);
});

/**
 * Tests dragging the bottom of an event box changes the end time in the day
 * view.
 */
add_task(async function testDayViewDragEventBoxEndTime() {
  let event = new CalEvent();
  event.id = "8";
  event.title = "Day View End";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "day");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);
  let gripbar = eventBox.querySelector('[whichside="end"]');
  let column = await CalendarTestUtils.dayView.getEventColumn(window);
  simulateGripbarDrag(gripbar, eventBox, column, 5);
  eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);

  let { id, title, startDate, endDate } = eventBox.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210316T020000Z", "startDate did not change");
  Assert.equal(endDate.icalString, "20210316T040000Z", "endDate was changed");
  await calendar.deleteItem(eventBox.occurrence);
});
