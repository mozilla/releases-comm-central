/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/** Tests that changes in a calendar's properties are reflected in the current view. */

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);
const { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");

const { closeCalendarTab, dedent, setCalendarView } = CalendarTestUtils;

let manager = cal.getCalendarManager();
let composite = cal.view.getCompositeCalendar(window);

// This is the calendar we're going to change the properties of.
let thisCalendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
thisCalendar.name = `This Calendar`;
thisCalendar.setProperty("color", "#ffee22");
manager.registerCalendar(thisCalendar);

// This calendar isn't going to change, and we'll check it doesn't.
let notThisCalendar = manager.createCalendar(
  "memory",
  Services.io.newURI("moz-memory-calendar://")
);
notThisCalendar.name = `Not This Calendar`;
notThisCalendar.setProperty("color", "#dd3333");
manager.registerCalendar(notThisCalendar);

add_task(async function setUp() {
  let asyncThisCalendar = cal.async.promisifyCalendar(thisCalendar);
  await asyncThisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:This Event 1
    DTSTART;VALUE=DATE:20160201
    DTEND;VALUE=DATE:20160202
    END:VEVENT
  `)
  );
  await asyncThisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:This Event 2
    DTSTART:20160201T130000Z
    DTEND:20160201T150000Z
    END:VEVENT
  `)
  );
  await asyncThisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:This Event 3
    DTSTART;VALUE=DATE:20160204
    DTEND;VALUE=DATE:20160205
    RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3
    END:VEVENT
  `)
  );

  let asyncNotThisCalendar = cal.async.promisifyCalendar(notThisCalendar);
  await asyncNotThisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:Not This Event 1
    DTSTART;VALUE=DATE:20160201
    DTEND;VALUE=DATE:20160203
    END:VEVENT
  `)
  );
  await asyncNotThisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:Not This Event 2
    DTSTART:20160201T140000Z
    DTEND:20160201T170000Z
    END:VEVENT
  `)
  );
});

async function subTest(viewName, boxSelector, thisBoxCount, notThisBoxCount) {
  async function makeChangeWithReload(changeFunction) {
    let loadedPromise = BrowserTestUtils.waitForEvent(view, "viewloaded");
    await changeFunction();
    await loadedPromise;
    // 5ms delay in MozCalendarEventColumn.addEvent.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 5));
  }

  function checkBoxItems(expectedCount, checkFunction) {
    let boxItems = view.querySelectorAll(boxSelector);
    Assert.equal(boxItems.length, expectedCount, "correct number of boxes displayed");

    if (!checkFunction) {
      return;
    }

    for (let boxItem of boxItems) {
      // TODO: why is it named `item` in some places and `occurrence` elsewhere?
      let isThisCalendar =
        (boxItem.item && boxItem.item.calendar == thisCalendar) ||
        boxItem.occurrence.calendar == thisCalendar;
      checkFunction(boxItem, isThisCalendar);
    }
  }

  let view = document.getElementById(`${viewName}-view`);

  window.goToDate(cal.createDateTime("20150201T000000Z"));
  await setCalendarView(window, viewName);
  await makeChangeWithReload(() => {
    window.goToDate(cal.createDateTime("20160201T000000Z"));
  });

  info("Check initial state.");

  checkBoxItems(thisBoxCount + notThisBoxCount, (boxItem, isThisCalendar) => {
    let style = getComputedStyle(boxItem);

    if (isThisCalendar) {
      Assert.equal(style.backgroundColor, "rgb(255, 238, 34)", "item background correct");
      Assert.equal(style.color, "rgb(0, 0, 0)", "item foreground correct");
    } else {
      Assert.equal(
        style.backgroundColor,
        "rgb(221, 51, 51)",
        "item background correct (not target calendar)"
      );
      Assert.equal(
        style.color,
        "rgb(255, 255, 255)",
        "item foreground correct (not target calendar)"
      );
    }
    Assert.ok(!boxItem.hasAttribute("readonly"), "item is not marked read-only");
  });

  info("Change color.");

  thisCalendar.setProperty("color", "#16a765");
  checkBoxItems(thisBoxCount + notThisBoxCount, (boxItem, isThisCalendar) => {
    let style = getComputedStyle(boxItem);

    if (isThisCalendar) {
      Assert.equal(style.backgroundColor, "rgb(22, 167, 101)", "item background correct");
      Assert.equal(style.color, "rgb(255, 255, 255)", "item foreground correct");
    } else {
      Assert.equal(
        style.backgroundColor,
        "rgb(221, 51, 51)",
        "item background correct (not target calendar)"
      );
      Assert.equal(
        style.color,
        "rgb(255, 255, 255)",
        "item foreground correct (not target calendar)"
      );
    }
  });

  info("Reset color.");
  thisCalendar.setProperty("color", "#ffee22");

  info("Disable.");

  thisCalendar.setProperty("disabled", true);
  checkBoxItems(notThisBoxCount);

  info("Enable.");

  await makeChangeWithReload(() => thisCalendar.setProperty("disabled", false));
  checkBoxItems(thisBoxCount + notThisBoxCount);

  info("Hide.");

  composite.removeCalendar(thisCalendar);
  checkBoxItems(notThisBoxCount);

  info("Show.");

  await makeChangeWithReload(() => composite.addCalendar(thisCalendar));
  checkBoxItems(thisBoxCount + notThisBoxCount);

  info("Set read-only.");

  await makeChangeWithReload(() => thisCalendar.setProperty("readOnly", true));
  checkBoxItems(thisBoxCount + notThisBoxCount, (boxItem, isThisCalendar) => {
    if (isThisCalendar) {
      Assert.ok(boxItem.hasAttribute("readonly"), "item is marked read-only");
    } else {
      Assert.ok(
        !boxItem.hasAttribute("readonly"),
        "item is marked read-only (not target calendar)"
      );
    }
  });

  info("Clear read-only.");

  await makeChangeWithReload(() => thisCalendar.setProperty("readOnly", false));
  checkBoxItems(thisBoxCount + notThisBoxCount, boxItem => {
    Assert.ok(!boxItem.hasAttribute("readonly"), "item is not marked read-only");
  });

  info("Reset.");

  await closeCalendarTab(window);
}

add_task(async function testMonthView() {
  await subTest("month", "calendar-month-day-box-item", 5, 3);
});

add_task(async function testMultiWeekView() {
  await subTest("multiweek", "calendar-month-day-box-item", 5, 3);
});

add_task(async function testWeekView() {
  // TODO: why are there hidden items?
  await subTest("week", "calendar-editable-item, calendar-event-box:not([hidden])", 4, 3);
});

add_task(async function testDayView() {
  // TODO: why are there hidden items?
  await subTest("day", "calendar-editable-item, calendar-event-box:not([hidden])", 2, 2);
});

registerCleanupFunction(async () => {
  await closeCalendarTab(window);
  manager.unregisterCalendar(thisCalendar);
  manager.unregisterCalendar(notThisCalendar);
});
