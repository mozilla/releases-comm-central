/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/** Tests that changes in a calendar's properties are reflected in the current view. */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

const composite = cal.view.getCompositeCalendar(window);

// This is the calendar we're going to change the properties of.
const thisCalendar = CalendarTestUtils.createCalendar("This Calendar", "memory");
thisCalendar.setProperty("color", "#ffee22");

// This calendar isn't going to change, and we'll check it doesn't.
const notThisCalendar = CalendarTestUtils.createCalendar("Not This Calendar", "memory");
notThisCalendar.setProperty("color", "#dd3333");

add_setup(async function () {
  const { dedent } = CalendarTestUtils;
  await thisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:This Event 1
    DTSTART;VALUE=DATE:20160205
    DTEND;VALUE=DATE:20160206
    END:VEVENT
  `)
  );
  await thisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:This Event 2
    DTSTART:20160205T130000Z
    DTEND:20160205T150000Z
    END:VEVENT
  `)
  );
  await thisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:This Event 3
    DTSTART;VALUE=DATE:20160208
    DTEND;VALUE=DATE:20160209
    RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3
    END:VEVENT
  `)
  );

  await notThisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:Not This Event 1
    DTSTART;VALUE=DATE:20160205
    DTEND;VALUE=DATE:20160207
    END:VEVENT
  `)
  );
  await notThisCalendar.addItem(
    new CalEvent(dedent`
    BEGIN:VEVENT
    SUMMARY:Not This Event 2
    DTSTART:20160205T140000Z
    DTEND:20160205T170000Z
    END:VEVENT
  `)
  );
});

/**
 * Assert whether the given event box is draggable (editable).
 *
 * @param {MozCalendarEventBox} eventBox - The event box to test.
 * @param {boolean} draggable - Whether we expect it to be draggable.
 * @param {string} message - A message for assertions.
 */
async function assertCanDrag(eventBox, draggable, message) {
  // Hover to see if the drag gripbars appear.
  const enterPromise = BrowserTestUtils.waitForEvent(eventBox, "mouseenter");
  EventUtils.synthesizeMouseAtCenter(eventBox, { type: "mouseover" }, window);
  await enterPromise;
  Assert.equal(
    BrowserTestUtils.isVisible(eventBox.startGripbar),
    draggable,
    `Start gripbar should be ${draggable ? "visible" : "hidden"} on hover: ${message}`
  );
  Assert.equal(
    BrowserTestUtils.isVisible(eventBox.endGripbar),
    draggable,
    `End gripbar should be ${draggable ? "visible" : "hidden"} on hover: ${message}`
  );
}

/**
 * Assert whether the given event element is editable.
 *
 * @param {Element} eventElement - The event element to test.
 * @param {boolean} editable - Whether we expect it to be editable.
 * @param {string} message - A message for assertions.
 */
async function assertEditable(eventElement, editable, message) {
  // FIXME: Have more ways to test if an event is editable (e.g. test the
  // context menu)
  if (eventElement.matches("calendar-event-box")) {
    await CalendarTestUtils.assertEventBoxDraggable(eventElement, editable, editable, message);
  }
}

async function subTest(viewName, boxSelector, thisBoxCount, notThisBoxCount) {
  async function makeChangeWithReload(changeFunction) {
    await changeFunction();
    await CalendarTestUtils.ensureViewLoaded(window);
  }

  async function checkBoxItems(expectedCount, checkFunction) {
    await TestUtils.waitForCondition(
      () => view.querySelectorAll(boxSelector).length == expectedCount,
      "waiting for the correct number of boxes to be displayed"
    );
    const boxItems = view.querySelectorAll(boxSelector);

    if (!checkFunction) {
      return;
    }

    for (const boxItem of boxItems) {
      // TODO: why is it named `item` in some places and `occurrence` elsewhere?
      const isThisCalendar =
        (boxItem.item && boxItem.item.calendar == thisCalendar) ||
        boxItem.occurrence.calendar == thisCalendar;
      await checkFunction(boxItem, isThisCalendar);
    }
  }

  const view = document.getElementById(`${viewName}-view`);

  await CalendarTestUtils.setCalendarView(window, viewName);
  await CalendarTestUtils.goToDate(window, 2016, 2, 5);

  info("Check initial state.");

  await checkBoxItems(thisBoxCount + notThisBoxCount, async (boxItem, isThisCalendar) => {
    const style = getComputedStyle(boxItem);

    if (isThisCalendar) {
      Assert.equal(style.backgroundColor, "rgb(255, 238, 34)", "item background correct");
      Assert.equal(style.color, "rgb(34, 34, 34)", "item foreground correct");
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
    await assertEditable(boxItem, true, "Initial event");
  });

  info("Change color.");

  thisCalendar.setProperty("color", "#16a765");
  await checkBoxItems(thisBoxCount + notThisBoxCount, async (boxItem, isThisCalendar) => {
    const style = getComputedStyle(boxItem);

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
  await checkBoxItems(notThisBoxCount);

  info("Enable.");

  await makeChangeWithReload(() => thisCalendar.setProperty("disabled", false));
  await checkBoxItems(thisBoxCount + notThisBoxCount);

  info("Hide.");

  composite.removeCalendar(thisCalendar);
  await checkBoxItems(notThisBoxCount);

  info("Show.");

  await makeChangeWithReload(() => composite.addCalendar(thisCalendar));
  await checkBoxItems(thisBoxCount + notThisBoxCount);

  info("Set read-only.");

  await makeChangeWithReload(() => thisCalendar.setProperty("readOnly", true));
  await checkBoxItems(thisBoxCount + notThisBoxCount, async (boxItem, isThisCalendar) => {
    if (isThisCalendar) {
      await assertEditable(boxItem, false, "In readonly calendar");
    } else {
      await assertEditable(boxItem, true, "In non-readonly calendar");
    }
  });

  info("Clear read-only.");

  await makeChangeWithReload(() => thisCalendar.setProperty("readOnly", false));
  await checkBoxItems(thisBoxCount + notThisBoxCount, async boxItem => {
    await assertEditable(boxItem, true, "In non-readonly calendar after clearing");
  });
}

add_task(async function testMonthView() {
  await subTest("month", "calendar-month-day-box-item", 5, 3);
});

add_task(async function testMultiWeekView() {
  await subTest("multiweek", "calendar-month-day-box-item", 5, 3);
});

add_task(async function testWeekView() {
  await subTest("week", "calendar-editable-item, .multiday-events-list calendar-event-box", 4, 3);
});

add_task(async function testDayView() {
  await subTest("day", "calendar-editable-item, .multiday-events-list calendar-event-box", 2, 2);
});

registerCleanupFunction(async () => {
  CalendarTestUtils.removeCalendar(thisCalendar);
  CalendarTestUtils.removeCalendar(notThisCalendar);
});
