/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the edit button displayed in the calendar summary dialog.
 */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

const calendar = CalendarTestUtils.createCalendar("Edit Button Test", "storage");

registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

function createNonRecurringEvent() {
  const event = new CalEvent();
  event.title = "Non-Recurring Event";
  event.startDate = cal.createDateTime("20191201T000001Z");
  return event;
}

function createRecurringEvent() {
  const event = new CalEvent();
  event.title = "Recurring Event";
  event.startDate = cal.createDateTime("20200101T000001Z");
  event.recurrenceInfo = new CalRecurrenceInfo(event);
  event.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=30"));
  return event;
}

/**
 * Test the correct edit button is shown for a non-recurring event.
 */
add_task(async function testNonRecurringEvent() {
  const event = await calendar.addItem(createNonRecurringEvent());
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  const eventWindow = await CalendarTestUtils.monthView.viewItemAt(window, 1, 1, 1);
  const editMenuButton = eventWindow.document.querySelector(
    "#calendar-summary-dialog-edit-menu-button"
  );

  Assert.ok(
    !BrowserTestUtils.isVisible(editMenuButton),
    "edit dropdown is not visible for non-recurring event"
  );

  const editButton = eventWindow.document.querySelector("#calendar-summary-dialog-edit-button");

  Assert.ok(
    BrowserTestUtils.isVisible(editButton),
    "edit button is visible for non-recurring event"
  );
  await CalendarTestUtils.items.cancelItemDialog(eventWindow);
  await calendar.deleteItem(event);
});

/**
 * Test the edit button for a non-recurring event actual edits the event.
 */
add_task(async function testEditNonRecurringEvent() {
  const event = await calendar.addItem(createNonRecurringEvent());
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  const modificationPromise = new Promise(resolve => {
    calendar.wrappedJSObject.addObserver({
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onModifyItem(aNewItem, aOldItem) {
        calendar.wrappedJSObject.removeObserver(this);
        resolve();
      },
    });
  });

  const { dialogWindow, iframeDocument } = await CalendarTestUtils.monthView.editItemAt(
    window,
    1,
    1,
    1
  );

  const newTitle = "Edited Non-Recurring Event";
  iframeDocument.querySelector("#item-title").value = newTitle;

  await CalendarTestUtils.items.saveAndCloseItemDialog(dialogWindow);
  await modificationPromise;

  const viewWindow = await CalendarTestUtils.monthView.viewItemAt(window, 1, 1, 1);
  const actualTitle = viewWindow.document.querySelector(
    "#calendar-item-summary .item-title"
  ).textContent;

  Assert.equal(actualTitle, newTitle, "edit non-recurring event successful");
  await CalendarTestUtils.items.cancelItemDialog(viewWindow);
  await calendar.deleteItem(event);
});

/**
 * Tests the dropdown menu is displayed for a recurring event.
 */
add_task(async function testRecurringEvent() {
  const event = await calendar.addItem(createRecurringEvent());
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  const viewWindow = await CalendarTestUtils.monthView.viewItemAt(window, 1, 6, 1);

  Assert.ok(
    !BrowserTestUtils.isVisible(
      viewWindow.document.querySelector("#calendar-summary-dialog-edit-button")
    ),
    "non-recurring edit button is not visible for recurring event"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      viewWindow.document.querySelector("#calendar-summary-dialog-edit-menu-button")
    ),
    "edit dropdown is visible for recurring event"
  );

  await CalendarTestUtils.items.cancelItemDialog(viewWindow);
  await calendar.deleteItem(event);
});

/**
 * Tests the dropdown menu allows a single occurrence of a repeating event
 * to be edited.
 */
add_task(async function testEditThisOccurrence() {
  let event = createRecurringEvent();
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  const modificationPromise = new Promise(resolve => {
    calendar.wrappedJSObject.addObserver({
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onModifyItem(aNewItem, aOldItem) {
        calendar.wrappedJSObject.removeObserver(this);
        resolve();
      },
    });
  });

  const { dialogWindow, iframeDocument } = await CalendarTestUtils.monthView.editItemOccurrenceAt(
    window,
    1,
    6,
    1
  );

  const originalTitle = event.title;
  const newTitle = "Edited This Occurrence";

  iframeDocument.querySelector("#item-title").value = newTitle;
  await CalendarTestUtils.items.saveAndCloseItemDialog(dialogWindow);

  await modificationPromise;

  const changedBox = await CalendarTestUtils.monthView.waitForItemAt(window, 1, 6, 1);
  const eventBoxes = document.querySelectorAll("calendar-month-day-box-item");

  for (const box of eventBoxes) {
    if (box !== changedBox) {
      Assert.equal(
        box.item.title,
        originalTitle,
        '"Edit this occurrence" did not edit other occurrences'
      );
    } else {
      Assert.equal(box.item.title, newTitle, '"Edit this occurrence only" edited this occurrence.');
    }
  }
  await calendar.deleteItem(event);
});

/**
 * Tests the dropdown menu allows all occurrences of a recurring event to be
 * edited.
 */
add_task(async function testEditAllOccurrences() {
  const event = await calendar.addItem(createRecurringEvent());

  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  // Setup an observer so we can wait for the event boxes to be updated.
  let boxesRefreshed = false;
  const observer = new MutationObserver(() => (boxesRefreshed = true));
  observer.observe(document.querySelector("#month-view"), {
    childList: true,
    subtree: true,
  });

  const { dialogWindow, iframeDocument } = await CalendarTestUtils.monthView.editItemOccurrencesAt(
    window,
    1,
    6,
    1
  );

  const newTitle = "Edited All Occurrences";

  iframeDocument.querySelector("#item-title").value = newTitle;
  await CalendarTestUtils.items.saveAndCloseItemDialog(dialogWindow);
  await TestUtils.waitForCondition(() => boxesRefreshed, "event boxes did not refresh in time");

  const eventBoxes = document.querySelectorAll("calendar-month-day-box-item");
  for (const box of eventBoxes) {
    Assert.equal(box.item.title, newTitle, '"Edit all occurrences" edited each occurrence');
  }
  await calendar.deleteItem(event);
});
