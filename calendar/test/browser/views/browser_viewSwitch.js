/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the time indicator is restarted and scroll position is restored
 * when switching tabs or views.
 */

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

add_task(async function() {
  let tabmail = document.getElementById("tabmail");

  // Ensure the initial state is correct.

  await CalendarTestUtils.closeCalendarTab(window);
  Assert.equal(tabmail.tabInfo.length, 1);

  Assert.equal(Services.prefs.getIntPref("calendar.view.daystarthour"), 8);
  Assert.equal(Services.prefs.getIntPref("calendar.view.dayendhour"), 17);
  Assert.equal(Services.prefs.getIntPref("calendar.view.visiblehours"), 9);
  Assert.equal(Services.prefs.getIntPref("calendar.view.timeIndicatorInterval"), 15);

  Assert.equal(window.timeIndicator.timer, null, "time indicator is not active");

  // Open the day view, check the display matches the prefs.

  await CalendarTestUtils.setCalendarView(window, "day");

  let dayViewScrollBox = document.querySelector("#day-view scrollbox");
  let dayViewHourHeight = dayViewScrollBox.scrollHeight / 24;

  Assert.notEqual(window.timeIndicator.timer, null, "time indicator is active");
  Assert.less(
    Math.abs(dayViewScrollBox.scrollTop - 8 * dayViewHourHeight),
    2,
    "day view is scrolled correctly"
  );
  Assert.equal(
    Math.round(dayViewScrollBox.clientHeight / dayViewHourHeight),
    9,
    "day view shows the correct number of hours"
  );

  // Scroll down 3 hours. We'll check this scroll position later.

  EventUtils.synthesizeWheel(
    dayViewScrollBox,
    5,
    5,
    { deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_LINE },
    window
  );
  Assert.less(
    Math.abs(dayViewScrollBox.scrollTop - 9 * dayViewHourHeight),
    2,
    "day view is scrolled correctly"
  );

  EventUtils.synthesizeWheel(
    dayViewScrollBox,
    5,
    5,
    { deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_LINE },
    window
  );
  EventUtils.synthesizeWheel(
    dayViewScrollBox,
    5,
    5,
    { deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_LINE },
    window
  );
  Assert.less(
    Math.abs(dayViewScrollBox.scrollTop - 11 * dayViewHourHeight),
    2,
    "day view is scrolled correctly"
  );
  Assert.equal(
    Math.round(dayViewScrollBox.clientHeight / dayViewHourHeight),
    9,
    "day view shows the correct number of hours"
  );

  // Open the week view, check the display matches the prefs.

  await CalendarTestUtils.setCalendarView(window, "week");

  let weekViewScrollBox = document.querySelector("#week-view scrollbox");
  let weekViewHourHeight = weekViewScrollBox.scrollHeight / 24;

  Assert.notEqual(window.timeIndicator.timer, null, "time indicator is active");
  Assert.less(
    Math.abs(weekViewScrollBox.scrollTop - 8 * weekViewHourHeight),
    2,
    "week view is scrolled correctly"
  );
  Assert.equal(
    Math.round(weekViewScrollBox.clientHeight / weekViewHourHeight),
    9,
    "week view shows the correct number of hours"
  );

  // Scroll up 1 hour. We'll check this scroll position later.

  EventUtils.synthesizeWheel(
    weekViewScrollBox,
    5,
    5,
    { deltaY: -1, deltaMode: WheelEvent.DOM_DELTA_LINE },
    window
  );
  Assert.less(
    Math.abs(weekViewScrollBox.scrollTop - 7 * weekViewHourHeight),
    2,
    "week view is scrolled correctly"
  );
  Assert.equal(
    Math.round(weekViewScrollBox.clientHeight / weekViewHourHeight),
    9,
    "week view shows the correct number of hours"
  );

  // Go back to the day view, check the timer and scroll position.

  await CalendarTestUtils.setCalendarView(window, "day");

  Assert.notEqual(window.timeIndicator.timer, null, "time indicator is active");
  Assert.less(
    Math.abs(dayViewScrollBox.scrollTop - 11 * dayViewHourHeight),
    2,
    "day view is scrolled correctly"
  );
  Assert.equal(
    Math.round(dayViewScrollBox.clientHeight / dayViewHourHeight),
    9,
    "day view shows the correct number of hours"
  );

  // Switch away from the calendar tab.

  tabmail.switchToTab(0);
  Assert.equal(window.timeIndicator.timer, null, "time indicator is not active");

  // Pause to be sure the event loop is empty.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => window.setTimeout(resolve, 250));

  // Switch back to the calendar tab. Check the timer and scroll position.

  tabmail.switchToTab(1);
  Assert.equal(window.currentView().id, "day-view");

  // Pause to be sure the event loop is empty.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => window.setTimeout(resolve, 250));

  Assert.notEqual(window.timeIndicator.timer, null, "time indicator is active");
  Assert.less(
    Math.abs(dayViewScrollBox.scrollTop - 11 * dayViewHourHeight),
    2,
    "day view is scrolled correctly"
  );
  Assert.equal(
    Math.round(dayViewScrollBox.clientHeight / dayViewHourHeight),
    9,
    "day view shows the correct number of hours"
  );

  // Go back to the week view, check the timer and scroll position.

  await CalendarTestUtils.setCalendarView(window, "week");

  Assert.notEqual(window.timeIndicator.timer, null, "time indicator is active");
  Assert.less(
    Math.abs(weekViewScrollBox.scrollTop - 7 * weekViewHourHeight),
    2,
    "week view is scrolled correctly"
  );
  Assert.equal(
    Math.round(weekViewScrollBox.clientHeight / weekViewHourHeight),
    9,
    "week view shows the correct number of hours"
  );

  // Clean up.

  await CalendarTestUtils.closeCalendarTab(window);
});
