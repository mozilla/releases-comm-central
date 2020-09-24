/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

let originalTimezone = Services.prefs.getStringPref("calendar.timezone.local");
Services.prefs.setStringPref("calendar.timezone.local", "UTC");

/**
 * Grabs a calendar-month-day-box-item from the view using an attribute CSS
 * selector. Only works when the calendar is in month view.
 */
async function getDayBoxItem(attrSelector) {
  let itemBox;
  await TestUtils.waitForCondition(() => {
    itemBox = document.querySelector(
      `calendar-month-day-box[${attrSelector}] calendar-month-day-box-item`
    );
    return itemBox != null;
  }, "calendar item did not appear in time");
  return itemBox;
}

/**
 * Switches to the view to the calendar.
 */
add_task(async function setUp() {
  EventUtils.synthesizeMouseAtCenter(document.querySelector("#calendar-tab-button"), {});
  window.switchToView("month");
});

/**
 * Tests the "Edit" menu item is available and opens up the event dialog.
 */
add_task(async function testEditEditableItem() {
  let uri = Services.io.newURI("moz-memory-calendar://");
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", uri);
  let calendarProxy = cal.async.promisifyCalendar(calendar);
  calendar.name = "Editable";
  manager.registerCalendar(calendar);
  registerCleanupFunction(() => manager.removeCalendar(calendar));

  let title = "Editable Event";
  let event = new CalEvent();
  event.title = title;
  event.startDate = cal.createDateTime("20200101T000001Z");

  await calendarProxy.addItem(event);
  window.goToDate(event.startDate);

  let menu = document.querySelector("#calendar-item-context-menu");
  let editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  let popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="1"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(!editMenu.disabled, 'context menu "Edit" item is not disabled for editable event');

  let editDialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");

    let doc = win.document;
    Assert.ok(
      doc.documentURI == "chrome://calendar/content/calendar-event-dialog.xhtml",
      "editing event dialog opened"
    );

    let iframe = doc.querySelector("#lightning-item-panel-iframe");
    await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");

    let iframeDoc = iframe.contentDocument;
    Assert.ok(
      (iframeDoc.querySelector("#item-title").value = title),
      'context menu "Edit" item opens the editing dialog'
    );
    doc.querySelector("dialog").acceptDialog();
    return true;
  });

  EventUtils.synthesizeMouseAtCenter(editMenu, {});
  await editDialogPromise;
});

/**
 * Tests that the "Edit" menu item is disabled for events we are not allowed to
 * modify.
 */
add_task(async function testEditNonEditableItem() {
  let uri = Services.io.newURI("moz-memory-calendar://");
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", uri);
  let calendarProxy = cal.async.promisifyCalendar(calendar);
  calendar.name = "Non-Editable";
  manager.registerCalendar(calendar);
  registerCleanupFunction(() => manager.removeCalendar(calendar));

  let event = new CalEvent();
  let acl = {
    QueryInterface: ChromeUtils.generateQI(["calIItemACLEntry"]),
    userCanModify: false,
    userCanRespond: true,
    userCanViewAll: true,
    userCanViewDateAndTime: true,
    calendarEntry: {
      hasAccessControl: true,
      userIsOwner: false,
    },
  };
  event.title = "Read Only Event";
  event.startDate = cal.createDateTime("20200102T000001Z");
  event.mACLEntry = acl;

  await calendarProxy.addItem(event);
  window.goToDate(event.startDate);

  let menu = document.querySelector("#calendar-item-context-menu");
  let editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  let popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="2"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(editMenu.disabled, 'context menu "Edit" item is disabled for non-editable event');
  EventUtils.synthesizeKey("VK_ESCAPE");
});

/**
 * Tests that the "Edit" menu item is disabled when the event is an invitation.
 */
add_task(async function testInvitation() {
  let uri = Services.io.newURI("moz-memory-calendar://");
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", uri);
  let calendarProxy = cal.async.promisifyCalendar(calendar);
  calendar.name = "Invitation";
  calendar.setProperty("organizerId", "mailto:attendee@example.com");
  manager.registerCalendar(calendar);
  registerCleanupFunction(() => manager.removeCalendar(calendar));

  let icalString =
    "BEGIN:VEVENT\r\n" +
    "CREATED:20200103T152601Z\r\n" +
    "DTSTAMP:20200103T192729Z\r\n" +
    "UID:x131e\r\n" +
    "SUMMARY:Invitation\r\n" +
    "ORGANIZER;CN=Org:mailto:organizer@example.com\r\n" +
    "ATTENDEE;RSVP=TRUE;CN=attendee@example.com;PARTSTAT=NEEDS-ACTION;CUTY\r\n" +
    " PE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;X-NUM-GUESTS=0:mailto:attendee@example.com\r\n" +
    "DTSTART:20200103T153000Z\r\n" +
    "DTEND:20200103T163000Z\r\n" +
    "DESCRIPTION:Just a Test\r\n" +
    "SEQUENCE:0\r\n" +
    "TRANSP:OPAQUE\r\n" +
    "END:VEVENT\r\n";

  let invitation = new CalEvent(icalString);
  await calendarProxy.addItem(invitation);
  window.goToDate(invitation.startDate);

  let menu = document.querySelector("#calendar-item-context-menu");
  let editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  let popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="3"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(editMenu.disabled, 'context menu "Edit" item is disabled for invitations');
  EventUtils.synthesizeKey("VK_ESCAPE");
});

/**
 * Tests that the "Edit" menu item is disabled when the calendar is read-only.
 */
add_task(async function testCalendarReadOnly() {
  let uri = Services.io.newURI("moz-memory-calendar://");
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", uri);
  let calendarProxy = cal.async.promisifyCalendar(calendar);
  calendar.name = "ReadOnly";
  manager.registerCalendar(calendar);
  registerCleanupFunction(() => manager.removeCalendar(calendar));

  let event = new CalEvent();
  event.title = "ReadOnly Event";
  event.startDate = cal.createDateTime("20200104T000001Z");

  await calendarProxy.addItem(event);
  calendar.setProperty("readOnly", true);
  window.goToDate(event.startDate);

  let menu = document.querySelector("#calendar-item-context-menu");
  let editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  let popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="4"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(editMenu.disabled, 'context menu "Edit" item is disabled when calendar is read-only');
  EventUtils.synthesizeKey("VK_ESCAPE");
});

registerCleanupFunction(() => {
  Services.prefs.setStringPref("calendar.timezone.local", originalTimezone);
});
