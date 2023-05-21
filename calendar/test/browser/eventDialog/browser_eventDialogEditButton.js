/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the edit button displayed in the calendar summary dialog.
 */

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

const calendar = CalendarTestUtils.createCalendar("Edit Button Test", "storage");

registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

function createNonRecurringEvent() {
  let event = new CalEvent();
  event.title = "Non-Recurring Event";
  event.startDate = cal.createDateTime("20191201T000001Z");
  return event;
}

function createRecurringEvent() {
  let event = new CalEvent();
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
  let event = await calendar.addItem(createNonRecurringEvent());
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  let eventWindow = await CalendarTestUtils.monthView.viewItemAt(window, 1, 1, 1);
  let editMenuButton = eventWindow.document.querySelector(
    "#calendar-summary-dialog-edit-menu-button"
  );

  Assert.ok(
    !BrowserTestUtils.is_visible(editMenuButton),
    "edit dropdown is not visible for non-recurring event"
  );

  let editButton = eventWindow.document.querySelector("#calendar-summary-dialog-edit-button");

  Assert.ok(
    BrowserTestUtils.is_visible(editButton),
    "edit button is visible for non-recurring event"
  );
  await CalendarTestUtils.items.cancelItemDialog(eventWindow);
  await calendar.deleteItem(event);
});

/**
 * Test the edit button for a non-recurring event actual edits the event.
 */
add_task(async function testEditNonRecurringEvent() {
  let event = await calendar.addItem(createNonRecurringEvent());
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  let modificationPromise = new Promise(resolve => {
    calendar.wrappedJSObject.addObserver({
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onModifyItem(aNewItem, aOldItem) {
        calendar.wrappedJSObject.removeObserver(this);
        resolve();
      },
    });
  });

  let { dialogWindow, iframeDocument } = await CalendarTestUtils.monthView.editItemAt(
    window,
    1,
    1,
    1
  );

  let newTitle = "Edited Non-Recurring Event";
  iframeDocument.querySelector("#item-title").value = newTitle;

  await CalendarTestUtils.items.saveAndCloseItemDialog(dialogWindow);
  await modificationPromise;

  let viewWindow = await CalendarTestUtils.monthView.viewItemAt(window, 1, 1, 1);
  let actualTitle = viewWindow.document.querySelector(
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
  let event = await calendar.addItem(createRecurringEvent());
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  let viewWindow = await CalendarTestUtils.monthView.viewItemAt(window, 1, 6, 1);

  Assert.ok(
    !BrowserTestUtils.is_visible(
      viewWindow.document.querySelector("#calendar-summary-dialog-edit-button")
    ),
    "non-recurring edit button is not visible for recurring event"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(
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

  let modificationPromise = new Promise(resolve => {
    calendar.wrappedJSObject.addObserver({
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onModifyItem(aNewItem, aOldItem) {
        calendar.wrappedJSObject.removeObserver(this);
        resolve();
      },
    });
  });

  let { dialogWindow, iframeDocument } = await CalendarTestUtils.monthView.editItemOccurrenceAt(
    window,
    1,
    6,
    1
  );

  let originalTitle = event.title;
  let newTitle = "Edited This Occurrence";

  iframeDocument.querySelector("#item-title").value = newTitle;
  await CalendarTestUtils.items.saveAndCloseItemDialog(dialogWindow);

  await modificationPromise;

  let changedBox = await CalendarTestUtils.monthView.waitForItemAt(window, 1, 6, 1);
  let eventBoxes = document.querySelectorAll("calendar-month-day-box-item");

  for (let box of eventBoxes) {
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
  let event = await calendar.addItem(createRecurringEvent());

  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(event.startDate);

  // Setup an observer so we can wait for the event boxes to be updated.
  let boxesRefreshed = false;
  let observer = new MutationObserver(() => (boxesRefreshed = true));
  observer.observe(document.querySelector("#month-view"), {
    childList: true,
    subtree: true,
  });

  let { dialogWindow, iframeDocument } = await CalendarTestUtils.monthView.editItemOccurrencesAt(
    window,
    1,
    6,
    1
  );

  let newTitle = "Edited All Occurrences";

  iframeDocument.querySelector("#item-title").value = newTitle;
  await CalendarTestUtils.items.saveAndCloseItemDialog(dialogWindow);
  await TestUtils.waitForCondition(() => boxesRefreshed, "event boxes did not refresh in time");

  let eventBoxes = document.querySelectorAll("calendar-month-day-box-item");
  for (let box of eventBoxes) {
    Assert.equal(box.item.title, newTitle, '"Edit all occurrences" edited each occurrence');
  }
  await calendar.deleteItem(event);
});
