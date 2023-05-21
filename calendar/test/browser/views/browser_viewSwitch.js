/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the time indicator is restarted and scroll position is restored
 * when switching tabs or views.
 */

/**
 * Wait until the view's timebar shows the given number of visible hours.
 *
 * @param {CalendarMultidayBaseView} view - The calendar view.
 * @param {number} numHours - The expected number of visible hours.
 *
 * @returns {Promise} - Promise that resolves when the timebar has numHours
 *   visible hours.
 */
function waitForVisibleHours(view, numHours) {
  // The timebar is the only scrollable child in its column (the others are
  // sticky), so the difference between the scroll area's scrollTopMax and the
  // timebar's clientHeight should give us the visible height.
  return TestUtils.waitForCondition(() => {
    let timebarHeight = view.timebar.clientHeight;
    let visiblePx = timebarHeight - view.grid.scrollTopMax;
    let expectPx = (numHours / 24) * timebarHeight;
    // Allow up to 3px difference to accommodate accumulated integer rounding
    // errors (e.g. clientHeight is a rounded integer, whilst client rectangles
    // and expectPx are floating).
    return Math.abs(visiblePx - expectPx) < 3;
  }, `${view.id} should have ${numHours} hours visible`);
}

/**
 * Wait until the view's timebar's first visible hour is the given hour.
 *
 * @param {CalendarMultidayBaseView} view - The calendar view.
 * @param {number} hour - The expected first visible hour.
 *
 * @returns {Promise} - Promise that resolves when the timebar has the given
 *   first visible hour.
 */
function waitForFirstVisibleHour(view, hour) {
  return TestUtils.waitForCondition(() => {
    let expectPx = (hour / 24) * view.timebar.clientHeight;
    let actualPx = view.grid.scrollTop;
    return Math.abs(actualPx - expectPx) < 3;
  }, `${view.id} first visible hour should be ${hour}`);
}

/**
 * Perform a scroll on the view by one hour.
 *
 * @param {CalendarMultidayBaseView} view - The calendar view to scroll.
 * @param {boolean} scrollDown - Whether to scroll down, otherwise scrolls up.
 */
async function doScroll(view, scrollDown) {
  let scrollPromise = BrowserTestUtils.waitForEvent(view.grid, "scroll");
  let viewRect = view.getBoundingClientRect();
  EventUtils.synthesizeWheel(
    view.grid,
    viewRect.width / 2,
    viewRect.height / 2,
    { deltaY: scrollDown ? 1 : -1, deltaMode: WheelEvent.DOM_DELTA_LINE },
    window
  );
  await scrollPromise;
}

add_task(async function () {
  let expectedVisibleHours = 3;
  let expectedStartHour = 3;

  let tabmail = document.getElementById("tabmail");
  Assert.equal(tabmail.tabInfo.length, 1);

  Assert.equal(Services.prefs.getIntPref("calendar.view.daystarthour"), expectedStartHour);
  Assert.equal(Services.prefs.getIntPref("calendar.view.dayendhour"), 12);
  Assert.equal(Services.prefs.getIntPref("calendar.view.visiblehours"), expectedVisibleHours);

  // Open the day view, check the display matches the prefs.

  await CalendarTestUtils.setCalendarView(window, "day");

  let dayView = document.getElementById("day-view");

  await waitForFirstVisibleHour(dayView, expectedStartHour);
  await waitForVisibleHours(dayView, expectedVisibleHours);

  // Scroll down 3 hours. We'll check this scroll position later.
  await doScroll(dayView, true);
  await waitForFirstVisibleHour(dayView, expectedStartHour + 1);

  await doScroll(dayView, true);
  await doScroll(dayView, true);
  await waitForFirstVisibleHour(dayView, expectedStartHour + 3);
  await waitForVisibleHours(dayView, expectedVisibleHours);

  // Open the week view, check the display matches the prefs.

  await CalendarTestUtils.setCalendarView(window, "week");

  let weekView = document.getElementById("week-view");

  await waitForFirstVisibleHour(weekView, expectedStartHour);
  await waitForVisibleHours(weekView, expectedVisibleHours);

  // Scroll up 1 hour.
  await doScroll(weekView, false);
  await waitForFirstVisibleHour(weekView, expectedStartHour - 1);
  await waitForVisibleHours(weekView, expectedVisibleHours);

  // Go back to the day view, check the timer and scroll position.

  await CalendarTestUtils.setCalendarView(window, "day");

  await waitForFirstVisibleHour(dayView, expectedStartHour + 3);
  await waitForVisibleHours(dayView, expectedVisibleHours);

  // Switch away from the calendar tab.

  tabmail.switchToTab(0);

  // Switch back to the calendar tab. Check scroll position.

  tabmail.switchToTab(1);
  Assert.equal(window.currentView().id, "day-view");

  await waitForFirstVisibleHour(dayView, expectedStartHour + 3);
  await waitForVisibleHours(dayView, expectedVisibleHours);

  // Go back to the week view. Check scroll position.

  await CalendarTestUtils.setCalendarView(window, "week");

  await waitForFirstVisibleHour(weekView, expectedStartHour - 1);
  await waitForVisibleHours(weekView, expectedVisibleHours);
});
