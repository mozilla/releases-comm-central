/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test dragging of events in the various calendar views.
 */
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

const calendar = CalendarTestUtils.createCalendar("Drag Test", "memory");
// Set a low number of hours to reduce pixel -> minute rounding errors.
Services.prefs.setIntPref("calendar.view.visiblehours", 3);

registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
  Services.prefs.clearUserPref("calendar.view.visiblehours");
  // Reset the spaces toolbar to its default visible state.
  window.gSpacesToolbar.toggleToolbar(false);
});

/**
 * Ensures that the window is maximised after switching dates.
 *
 * @param {calIDateTime} date - A date to navigate the view to.
 */
async function resetView(date) {
  window.goToDate(date);

  if (window.windowState != window.STATE_MAXIMIZED) {
    // The multi-day views adjust scrolling dynamically when they detect a
    // resize. Hook into the resize event and scroll after the adjustment.
    const resizePromise = BrowserTestUtils.waitForEvent(window, "resize");
    window.maximize();
    await resizePromise;
  }
}

/**
 * End the dragging of the event at the specified location.
 *
 * @param {number} day - The day to drop into.
 * @param {number} hour - The starting hour to drop to.
 * @param {number} topOffset - An offset to apply to the mouse position.
 */
function endDrag(day, hour, topOffset) {
  const view = window.currentView();
  let hourElement;
  if (view.id == "day-view") {
    hourElement = CalendarTestUtils.dayView.getHourBoxAt(window, hour);
  } else {
    hourElement = CalendarTestUtils.weekView.getHourBoxAt(window, day, hour);
  }
  // We scroll to align the *end* of the hour element so we can avoid triggering
  // the auto-scroll when we synthesize mousemove below.
  // FIXME: Use and test auto scroll by holding mouseover at the view edges.
  CalendarTestUtils.scrollViewToTarget(hourElement, false);

  const hourRect = hourElement.getBoundingClientRect();

  // We drop the event with some offset from the starting edge of the desired
  // hourElement.
  // NOTE: This may mean that the drop point may not be above the hourElement.
  // NOTE: We assume that the drop point is however still above the view.
  // Currently event "move" events get cancelled if the pointer leaves the view.
  const top = Math.round(hourRect.top + topOffset);
  const left = Math.round(hourRect.left + hourRect.width / 2);

  EventUtils.synthesizeMouseAtPoint(left, top, { type: "mousemove", shiftKey: true }, window);
  EventUtils.synthesizeMouseAtPoint(left, top, { type: "mouseup", shiftKey: true }, window);
}

/**
 * Simulates the dragging of an event box in a multi-day view to another
 * column, horizontally.
 *
 * @param {MozCalendarEventBox} eventBox - The event to start moving.
 * @param {number} day - The day to drop into.
 * @param {number} hour - The starting hour to drop to.
 */
function simulateDragToColumn(eventBox, day, hour) {
  // Scroll to align to the top of the view.
  CalendarTestUtils.scrollViewToTarget(eventBox, true);

  const sourceRect = eventBox.getBoundingClientRect();
  // Start dragging from the center of the event box to avoid the gripbars.
  // NOTE: We assume that the eventBox's center is in view.
  const leftOffset = sourceRect.width / 2;
  // We round the mouse position to try and reduce rounding errors when
  // scrolling the view.
  const sourceTop = Math.round(sourceRect.top + sourceRect.height / 2);
  const sourceLeft = sourceRect.left + leftOffset;
  // Keep track of the exact offset.
  const topOffset = sourceTop - sourceRect.top;

  EventUtils.synthesizeMouseAtPoint(
    sourceLeft,
    sourceTop,
    // Hold shift to avoid snapping.
    { type: "mousedown", shiftKey: true },
    window
  );
  EventUtils.synthesizeMouseAtPoint(
    // We assume the location of the mouseout event does not matter, just as
    // long as the event box receives it.
    sourceLeft,
    sourceTop,
    { type: "mouseout", shiftKey: true },
    window
  );

  // End drag with the same offset from the starting edge.
  endDrag(day, hour, topOffset);
}

/**
 * Simulates the dragging of an event box via one of the gripbars.
 *
 * @param {MozCalendarEventBox} eventBox - The event to resize.
 * @param {"start"|"end"} - The side to grab.
 * @param {number} day - The day to move into.
 * @param {number} hour - The hour to move to.
 */
function simulateGripbarDrag(eventBox, side, day, hour) {
  // Scroll the edge of the box into view.
  CalendarTestUtils.scrollViewToTarget(eventBox, side == "start");

  const gripbar = side == "start" ? eventBox.startGripbar : eventBox.endGripbar;

  const sourceRect = gripbar.getBoundingClientRect();
  const sourceTop = sourceRect.top + sourceRect.height / 2;
  const sourceLeft = sourceRect.left + sourceRect.width / 2;

  // Hover to make the gripbar visible.
  EventUtils.synthesizeMouseAtPoint(sourceLeft, sourceTop, { type: "mouseover" }, window);
  EventUtils.synthesizeMouseAtPoint(
    sourceLeft,
    sourceTop,
    // Hold shift to avoid snapping.
    { type: "mousedown", shiftKey: true },
    window
  );

  // End the drag at the start of the hour.
  endDrag(day, hour, 0);
}

/**
 * Tests dragging an event item updates the event in the month view.
 */
add_task(async function testMonthViewDragEventItem() {
  const event = new CalEvent();
  event.id = "1";
  event.title = "Month View Event";
  event.startDate = cal.createDateTime("20210316T000000Z");
  event.endDate = cal.createDateTime("20210316T110000Z");

  await CalendarTestUtils.setCalendarView(window, "month");
  await calendar.addItem(event);
  await resetView(event.startDate);

  // Hide the spaces toolbar since it interferes with the calendar
  window.gSpacesToolbar.toggleToolbar(true);

  let eventItem = await CalendarTestUtils.monthView.waitForItemAt(window, 3, 3, 1);
  const dayBox = await CalendarTestUtils.monthView.getDayBox(window, 3, 2);
  const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);
  dragService.startDragSessionForTests(window, Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  const [result, dataTransfer] = EventUtils.synthesizeDragOver(
    eventItem,
    dayBox,
    undefined,
    undefined,
    eventItem.ownerGlobal,
    dayBox.ownerGlobal
  );
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, dayBox);
  dragService.getCurrentSession().endDragSession(true);

  Assert.ok(
    !CalendarTestUtils.monthView.getItemAt(window, 3, 3, 1),
    "item removed from initial date"
  );

  eventItem = await CalendarTestUtils.monthView.waitForItemAt(window, 3, 2, 1);
  Assert.ok(eventItem, "item moved to new date");

  const { id, title, startDate, endDate } = eventItem.occurrence;
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
  const event = new CalEvent();
  event.id = "2";
  event.title = "Multiweek View Event";
  event.startDate = cal.createDateTime("20210316T000000Z");
  event.endDate = cal.createDateTime("20210316T110000Z");

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventItem = await CalendarTestUtils.multiweekView.waitForItemAt(window, 1, 3, 1);
  const dayBox = await CalendarTestUtils.multiweekView.getDayBox(window, 1, 2);
  const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);
  dragService.startDragSessionForTests(window, Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  const [result, dataTransfer] = EventUtils.synthesizeDragOver(
    eventItem,
    dayBox,
    undefined,
    undefined,
    eventItem.ownerGlobal,
    dayBox.ownerGlobal
  );
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, dayBox);
  dragService.getCurrentSession().endDragSession(true);

  Assert.ok(
    !CalendarTestUtils.multiweekView.getItemAt(window, 1, 3, 1),
    "item removed from initial date"
  );

  eventItem = await CalendarTestUtils.multiweekView.waitForItemAt(window, 1, 2, 1);
  Assert.ok(eventItem, "item moved to new date");

  const { id, title, startDate, endDate } = eventItem.occurrence;
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
  const event = new CalEvent();
  event.id = "3";
  event.title = "Week View Previous Day";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  simulateDragToColumn(eventBox, 2, 2);

  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 2, 1);
  await TestUtils.waitForCondition(
    () => !CalendarTestUtils.weekView.getEventBoxAt(window, 3, 1),
    "Old position is empty"
  );

  const { id, title, startDate, endDate } = eventBox.occurrence;
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
  const event = new CalEvent();
  event.id = "4";
  event.title = "Week View Following Day";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  simulateDragToColumn(eventBox, 4, 2);

  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 4, 1);
  await TestUtils.waitForCondition(
    () => !CalendarTestUtils.weekView.getEventBoxAt(window, 3, 1),
    "Old position is empty"
  );

  const { id, title, startDate, endDate } = eventBox.occurrence;
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
  const event = new CalEvent();
  event.id = "5";
  event.title = "Week View Start";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  simulateGripbarDrag(eventBox, "start", 3, 1);
  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);

  const { id, title, startDate, endDate } = eventBox.occurrence;
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
  const event = new CalEvent();
  event.id = "6";
  event.title = "Week View End";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "week");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);
  simulateGripbarDrag(eventBox, "end", 3, 6);
  eventBox = await CalendarTestUtils.weekView.waitForEventBoxAt(window, 3, 1);

  const { id, title, startDate, endDate } = eventBox.occurrence;
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
  const event = new CalEvent();
  event.id = "7";
  event.title = "Day View Start";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "day");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);
  simulateGripbarDrag(eventBox, "start", 1, 1);
  eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);

  const { id, title, startDate, endDate } = eventBox.occurrence;
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
  const event = new CalEvent();
  event.id = "8";
  event.title = "Day View End";
  event.startDate = cal.createDateTime("20210316T020000Z");
  event.endDate = cal.createDateTime("20210316T030000Z");

  await CalendarTestUtils.setCalendarView(window, "day");
  await calendar.addItem(event);
  await resetView(event.startDate);

  let eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);
  simulateGripbarDrag(eventBox, "end", 1, 4);
  eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);

  const { id, title, startDate, endDate } = eventBox.occurrence;
  Assert.equal(id, event.id, "id is correct");
  Assert.equal(title, event.title, "title is correct");
  Assert.equal(startDate.icalString, "20210316T020000Z", "startDate did not change");
  Assert.equal(endDate.icalString, "20210316T040000Z", "endDate was changed");
  await calendar.deleteItem(eventBox.occurrence);
});
