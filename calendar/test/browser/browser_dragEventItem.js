/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test dragging an event item in month view works.
 */
const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

let manager = cal.getCalendarManager();
let syncCalendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
syncCalendar.name = "Drag Test";
manager.registerCalendar(syncCalendar);

registerCleanupFunction(() => {
  manager.unregisterCalendar(syncCalendar);
});

let calendar = cal.async.promisifyCalendar(syncCalendar);
let originalTimezone = Services.prefs.getStringPref("calendar.timezone.local");
Services.prefs.setStringPref("calendar.timezone.local", "UTC");

async function getEventBox(selector) {
  let itemBox;
  await TestUtils.waitForCondition(() => {
    itemBox = document.querySelector(selector);
    return itemBox != null;
  }, "calendar event item box did not appear in time");
  return itemBox;
}

/**
 * Moving an event item in the month view to another date should not throw an
 * error. See bug 1681224.
 */
add_task(async function testDragItemToAnotherDate() {
  let event = new CalEvent();
  event.id = "event-id";
  event.title = "Month Event";
  event.startDate = cal.createDateTime("20201216T000001Z");

  await CalendarTestUtils.setCalendarView(window, "month");
  await calendar.addItem(event);

  window.goToDate(event.startDate);

  let srcElement = await getEventBox(
    'calendar-month-day-box[day="16"] calendar-month-day-box-item'
  );
  let destElement = await getEventBox('calendar-month-day-box[day="15"]');
  let dragSession = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);

  dragSession.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  await new Promise(resolve => window.setTimeout(resolve));

  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    srcElement,
    destElement,
    undefined,
    undefined,
    srcElement.ownerGlobal,
    destElement.ownerGlobal
  );
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, destElement);
  dragSession.endDragSession(true);

  Assert.ok(
    !document.querySelector('calendar-month-day-box[day="16"] calendar-month-day-box-item'),
    "calendar item removed from initial date"
  );

  let newEvent = await getEventBox('calendar-month-day-box[day="15"] calendar-month-day-box-item');
  Assert.ok(newEvent, "calendar item moved to new date");
  EventUtils.synthesizeMouseAtCenter(newEvent, {});
  EventUtils.synthesizeKey("VK_DELETE");
});

registerCleanupFunction(() => {
  Services.prefs.setStringPref("calendar.timezone.local", originalTimezone);
});
