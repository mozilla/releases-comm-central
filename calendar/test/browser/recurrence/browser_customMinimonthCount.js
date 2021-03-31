/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test minimonth count of the calendar-event-dialog-recurrence dialog when
 * resized.
 */

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const manager = cal.getCalendarManager();
const _calendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
_calendar.name = "Minimonths";

manager.registerCalendar(_calendar);
registerCleanupFunction(() => {
  manager.unregisterCalendar(_calendar);
});

const calendar = cal.async.promisifyCalendar(_calendar);

requestLongerTimeout(2);

/**
 * Test the custom recurrence dialog's minimonths take up the available space
 * when the window is resized. See bug 1679129.
 */
add_task(async function testMinimonthsFillAvailableSpaceOnResize() {
  await CalendarTestUtils.setCalendarView(window, "month");

  let targetDate = cal.createDateTime("20201201T000001Z");
  window.goToDate(targetDate);

  let newEventBtn = window.document.querySelector("#calendar-newevent-button");
  let getEventWin = CalendarTestUtils.waitForEventDialog("edit");
  EventUtils.synthesizeMouseAtCenter(newEventBtn, {});

  let eventWin = await getEventWin;
  let iframe = eventWin.document.querySelector("iframe");

  // For each x,y dimension, open and resize the window. Re-resizing an open
  // window does not always seems to have the precise dimensions we specifiy so
  // we test with a fresh one each time. The x and y values here are actually
  // the number of minimonth boxes we want to resize by horizontal/vertically
  // or both.
  for (let x = 0; x <= 3; x++) {
    for (let y = 0; y <= 3; y++) {
      if (x + y == 0) {
        // Skip resizing to 0,0.
        continue;
      }

      // Forget the previous window width and height.
      Services.xulStore.removeDocument(
        "chrome://calendar/content/calendar-event-dialog-recurrence.xhtml"
      );

      let getRepeatWin = BrowserTestUtils.promiseAlertDialogOpen(
        "",
        "chrome://calendar/content/calendar-event-dialog-recurrence.xhtml",
        {
          async callback(win) {
            let container = win.document.querySelector("#recurrence-preview");
            let containerRect = container.getBoundingClientRect();
            let containerWidth = containerRect.width;
            let containerHeight = containerRect.height;
            let minimonth = container.querySelector("calendar-minimonth");
            let minimonthRect = minimonth.getBoundingClientRect();
            let minimonthWidth = minimonthRect.width;
            let minimonthHeight = minimonthRect.height;
            let widthRemainder = containerWidth % minimonthWidth;
            let heightRemainder = containerHeight % minimonthHeight;

            // Determine how many rows and columns to expect when first opened.
            let defaultCols = (containerWidth - widthRemainder) / minimonthRect.width;
            let defaultRows = (containerHeight - heightRemainder) / minimonthRect.height;
            let defaultMinimonthCount = container.querySelectorAll("calendar-minimonth").length;
            let expectedDefaultMinimonthCount = defaultCols * defaultRows;

            // Ensure the number of minimonths shown is the amount we expect.
            Assert.equal(
              defaultMinimonthCount,
              expectedDefaultMinimonthCount,
              `default minimonth box count is ${expectedDefaultMinimonthCount}`
            );

            // Calculate the expected number of minimonths after resize.
            let expectedCols = defaultCols + x;
            let expectedRows = defaultRows + y;
            let expectedCount = expectedCols * expectedRows;

            // Calculate the actual number of pixels to resize the window by.
            let xDelta = Math.ceil(minimonthWidth * x);
            let yDelta = Math.ceil(minimonthHeight * y);

            // Resize the window.
            let wasResized = BrowserTestUtils.waitForEvent(win, "resize");
            win.resizeBy(xDelta, yDelta);
            await wasResized;

            // Occasionally, the container's vertical height is not what we expect
            // (12px less when resized by 1 minimonth). This seems to be only
            // happening during mochitests. The onResize() handler will not render
            // extra rows when this happens so resize the window incrementally
            // here until the container has the desired vertical height.
            let expectedContainerWidth = containerWidth + xDelta;
            let expectedContainerHeight = containerHeight + yDelta;
            await TestUtils.waitForCondition(async () => {
              let { width, height } = container.getBoundingClientRect();

              if (width >= expectedContainerWidth && height >= expectedContainerHeight) {
                return true;
              }

              let reXDelta = Math.ceil(expectedContainerWidth - width);
              let reYDelta = Math.ceil(expectedContainerHeight - height);
              let wasResizedAgain = BrowserTestUtils.waitForEvent(win, "resize");
              win.resizeBy(reXDelta, reYDelta);
              await wasResizedAgain;

              let rect = container.getBoundingClientRect();
              return rect.width >= expectedContainerWidth && rect.height >= expectedContainerHeight;
            }, `(+${x},+${y}): minimonth container was not resized to ${expectedContainerWidth}x${expectedContainerHeight}`);

            let actualCount = container.querySelectorAll("calendar-minimonth").length;
            Assert.equal(
              actualCount,
              expectedCount,
              `minimonth count is ${expectedCount} when resized by +${x},+${y} minimonths`
            );

            // Close the window here to avoid blocking.
            await BrowserTestUtils.closeWindow(win);
          },
        }
      );
      let repeatMenu = iframe.contentDocument.querySelector("#item-repeat");
      repeatMenu.value = "custom";
      repeatMenu.doCommand();
      await getRepeatWin;
    }
  }
  await BrowserTestUtils.closeWindow(eventWin);
});
