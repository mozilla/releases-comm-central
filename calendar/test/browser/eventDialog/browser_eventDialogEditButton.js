/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

const manager = cal.getCalendarManager();
const _calendar = manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://"));
_calendar.name = "eventDialogEditButton";
manager.registerCalendar(_calendar);
registerCleanupFunction(() => {
  manager.unregisterCalendar(_calendar);
});
const calendar = cal.async.promisifyCalendar(_calendar);

let originalTimezone = Services.prefs.getStringPref("calendar.timezone.local");
Services.prefs.setStringPref("calendar.timezone.local", "UTC");

async function getEventBox(attrSelector) {
  let itemBox;
  await TestUtils.waitForCondition(() => {
    itemBox = document.querySelector(
      `calendar-month-day-box[${attrSelector}] calendar-month-day-box-item`
    );
    return itemBox != null;
  }, "calendar item did not appear in time");
  return itemBox;
}

async function openEventFromBox(eventBox) {
  if (Services.focus.activeWindow != window) {
    await BrowserTestUtils.waitForEvent(window, "focus");
  }

  let promise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return win.document.documentURI == "chrome://calendar/content/calendar-summary-dialog.xhtml";
  });
  EventUtils.synthesizeMouseAtCenter(eventBox, { clickCount: 2 });
  return promise;
}

async function closeEventWindow(eventWin) {
  let promise = BrowserTestUtils.domWindowClosed(eventWin);
  let dialog = eventWin.document.querySelector("dialog");
  dialog.getButton("cancel").click();
  return promise;
}

async function clickEditButton(button) {
  let promise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    let doc = win.document;
    if (doc.documentURI == "chrome://calendar/content/calendar-event-dialog.xhtml") {
      let iframe = doc.getElementById("lightning-item-panel-iframe");
      await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");
      return true;
    }
    return false;
  });
  button.click();
  return promise;
}

async function clickSaveAndClose(eventWindow) {
  let promise = BrowserTestUtils.domWindowClosed(eventWindow);
  EventUtils.synthesizeMouseAtCenter(
    eventWindow.document.querySelector("#button-saveandclose"),
    {},
    eventWindow
  );
  return promise;
}

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

add_task(async function testNonRecurringEvent() {
  let event = await calendar.addItem(createNonRecurringEvent());
  registerCleanupFunction(() => calendar.deleteItem(event));
  window.goToDate(event.startDate);
  window.switchToView("month");

  let eventWindow = await openEventFromBox(await getEventBox('year="2019"'));
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
  await closeEventWindow(eventWindow);
  await calendar.deleteItem(event);
});

add_task(async function testEditNonRecurringEvent() {
  let event = await calendar.addItem(createNonRecurringEvent());
  registerCleanupFunction(() => calendar.deleteItem(event));
  window.goToDate(event.startDate);
  window.switchToView("month");

  let modificationPromise = new Promise(resolve => {
    calendar.wrappedJSObject.addObserver({
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onModifyItem(aNewItem, aOldItem) {
        calendar.wrappedJSObject.removeObserver(this);
        resolve();
      },
    });
  });

  let eventWindow = await openEventFromBox(await getEventBox('year="2019"'));

  let editWindow = await clickEditButton(
    eventWindow.document.querySelector("#calendar-summary-dialog-edit-button")
  );

  let editDoc = editWindow.document.querySelector("#lightning-item-panel-iframe").contentDocument;
  let newTitle = "Edited Non-Recurring Event";

  editDoc.querySelector("#item-title").value = newTitle;
  await clickSaveAndClose(editWindow);

  await modificationPromise;

  let eventBox = await getEventBox('year="2019"');
  eventWindow = await openEventFromBox(eventBox);
  let actualTitle = eventWindow.document.querySelector("#calendar-item-summary-item-title")
    .textContent;

  Assert.ok(actualTitle === newTitle, "edit non-recurring event successful");
  await closeEventWindow(eventWindow);
  await calendar.deleteItem(event);
});

add_task(async function testRecurringEvent() {
  let event = await calendar.addItem(createRecurringEvent());
  registerCleanupFunction(() => calendar.deleteItem(event));
  window.switchToView("month");
  window.goToDate(event.startDate);

  let eventWindow = await openEventFromBox(await getEventBox('day="3"'));
  Assert.ok(
    !BrowserTestUtils.is_visible(
      eventWindow.document.querySelector("#calendar-summary-dialog-edit-button")
    ),
    "non-recurring edit button is not visible for recurring event"
  );
  Assert.ok(
    BrowserTestUtils.is_visible(
      eventWindow.document.querySelector("#calendar-summary-dialog-edit-menu-button")
    ),
    "edit dropdown is visible for recurring event"
  );

  await closeEventWindow(eventWindow);
  await calendar.deleteItem(event);
});

add_task(async function testEditThisOccurrence() {
  let event = createRecurringEvent();
  event = await calendar.addItem(event);
  registerCleanupFunction(async () => calendar.deleteItem(event));
  window.switchToView("month");
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

  let eventWindow = await openEventFromBox(await getEventBox('day="3"'));

  let editWindow = await clickEditButton(
    eventWindow.document.querySelector("#edit-button-context-menu-this-occurrence")
  );

  let editDoc = editWindow.document.querySelector("#lightning-item-panel-iframe").contentDocument;
  let originalTitle = event.title;
  let newTitle = "Edited This Occurrence";

  editDoc.querySelector("#item-title").value = newTitle;
  await clickSaveAndClose(editWindow);

  await modificationPromise;

  let changedBox = await getEventBox('day="3"');
  let eventBoxes = document.querySelectorAll("calendar-month-day-box-item");
  for (let box of eventBoxes) {
    let targetWindow = await openEventFromBox(box);
    let actualTitle = targetWindow.document.querySelector("#calendar-item-summary-item-title")
      .textContent;

    await closeEventWindow(targetWindow);

    if (box !== changedBox) {
      Assert.ok(
        actualTitle === originalTitle,
        '"Edit this occurrence" did not edit other occurrences'
      );
    } else {
      Assert.ok(actualTitle === newTitle, '"Edit this occurrence only" edited this occurrence.');
    }
  }
  await calendar.deleteItem(event);
});

add_task(async function testEditAllOccurrences() {
  let event = await calendar.addItem(createRecurringEvent());
  registerCleanupFunction(async () => calendar.deleteItem(event));
  window.switchToView("month");
  window.goToDate(event.startDate);

  // Setup an observer so we can wait for the event boxes to be updated.
  let boxesRefreshed = false;
  let observer = new MutationObserver(() => (boxesRefreshed = true));
  observer.observe(document.querySelector("#month-view"), {
    childList: true,
    subtree: true,
  });

  let eventWindow = await openEventFromBox(await getEventBox('day="3"'));

  let editWindow = await clickEditButton(
    eventWindow.document.querySelector("#edit-button-context-menu-all-occurrences")
  );

  let editDoc = editWindow.document.querySelector("#lightning-item-panel-iframe").contentDocument;
  let newTitle = "Edited All Occurrences";

  editDoc.querySelector("#item-title").value = newTitle;
  await clickSaveAndClose(editWindow);
  await TestUtils.waitForCondition(() => boxesRefreshed, "event boxes did not refresh in time");

  let eventBoxes = document.querySelectorAll("calendar-month-day-box-item");
  for (let box of eventBoxes) {
    let targetWindow = await openEventFromBox(box);
    let actualTitle = targetWindow.document.querySelector("#calendar-item-summary-item-title")
      .textContent;

    await closeEventWindow(targetWindow);
    Assert.ok(actualTitle === newTitle, '"Edit all occurrences" edited each occurrence');
  }
  await calendar.deleteItem(event);
});

registerCleanupFunction(() => {
  Services.prefs.setStringPref("calendar.timezone.local", originalTimezone);
});
