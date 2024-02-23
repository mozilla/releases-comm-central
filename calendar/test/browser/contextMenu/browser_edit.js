/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

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
add_setup(function () {
  return CalendarTestUtils.setCalendarView(window, "month");
});

/**
 * Tests the "Edit" menu item is available and opens up the event dialog.
 */
add_task(async function testEditEditableItem() {
  const calendar = CalendarTestUtils.createCalendar("Editable", "memory");
  registerCleanupFunction(() => CalendarTestUtils.removeCalendar(calendar));

  const title = "Editable Event";
  const event = new CalEvent();
  event.title = title;
  event.startDate = cal.createDateTime("20200101T000001Z");

  await calendar.addItem(event);
  window.goToDate(event.startDate);

  const menu = document.querySelector("#calendar-item-context-menu");
  const editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  const popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="1"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(!editMenu.disabled, 'context menu "Edit" item is not disabled for editable event');

  const editDialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");

    const doc = win.document;
    Assert.ok(
      doc.documentURI == "chrome://calendar/content/calendar-event-dialog.xhtml",
      "editing event dialog opened"
    );

    const iframe = doc.querySelector("#calendar-item-panel-iframe");
    await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");

    const iframeDoc = iframe.contentDocument;
    Assert.ok(
      (iframeDoc.querySelector("#item-title").value = title),
      'context menu "Edit" item opens the editing dialog'
    );
    doc.querySelector("dialog").acceptDialog();
    return true;
  });

  menu.activateItem(editMenu);
  await editDialogPromise;
});

/**
 * Tests that the "Edit" menu item is disabled for events we are not allowed to
 * modify.
 */
add_task(async function testEditNonEditableItem() {
  const calendar = CalendarTestUtils.createCalendar("Non-Editable", "memory");
  registerCleanupFunction(() => CalendarTestUtils.removeCalendar(calendar));

  const event = new CalEvent();
  const acl = {
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

  await calendar.addItem(event);
  window.goToDate(event.startDate);

  const menu = document.querySelector("#calendar-item-context-menu");
  const editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  const popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="2"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(editMenu.disabled, 'context menu "Edit" item is disabled for non-editable event');
  menu.hidePopup();
});

/**
 * Tests that the "Edit" menu item is disabled when the event is an invitation.
 */
add_task(async function testInvitation() {
  const calendar = CalendarTestUtils.createCalendar("Invitation", "memory");
  calendar.setProperty("organizerId", "mailto:attendee@example.com");
  registerCleanupFunction(() => CalendarTestUtils.removeCalendar(calendar));

  const icalString = CalendarTestUtils.dedent`
    BEGIN:VEVENT
    CREATED:20200103T152601Z
    DTSTAMP:20200103T192729Z
    UID:x131e
    SUMMARY:Invitation
    ORGANIZER;CN=Org:mailto:organizer@example.com
    ATTENDEE;RSVP=TRUE;CN=attendee@example.com;PARTSTAT=NEEDS-ACTION;CUTY
     PE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;X-NUM-GUESTS=0:mailto:attendee@example.com
    DTSTART:20200103T153000Z
    DTEND:20200103T163000Z
    DESCRIPTION:Just a Test
    SEQUENCE:0
    TRANSP:OPAQUE
    END:VEVENT
  `;

  const invitation = new CalEvent(icalString);
  await calendar.addItem(invitation);
  window.goToDate(invitation.startDate);

  const menu = document.querySelector("#calendar-item-context-menu");
  const editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  const popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="3"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(editMenu.disabled, 'context menu "Edit" item is disabled for invitations');
  menu.hidePopup();
});

/**
 * Tests that the "Edit" menu item is disabled when the calendar is read-only.
 */
add_task(async function testCalendarReadOnly() {
  const calendar = CalendarTestUtils.createCalendar("ReadOnly", "memory");
  registerCleanupFunction(() => CalendarTestUtils.removeCalendar(calendar));

  const event = new CalEvent();
  event.title = "ReadOnly Event";
  event.startDate = cal.createDateTime("20200104T000001Z");

  await calendar.addItem(event);
  calendar.setProperty("readOnly", true);
  window.goToDate(event.startDate);

  const menu = document.querySelector("#calendar-item-context-menu");
  const editMenu = document.querySelector("#calendar-item-context-menu-modify-menuitem");
  const popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshowing");

  EventUtils.synthesizeMouseAtCenter(await getDayBoxItem('day="4"'), { type: "contextmenu" });
  await popupPromise;
  Assert.ok(editMenu.disabled, 'context menu "Edit" item is disabled when calendar is read-only');
  menu.hidePopup();
});

registerCleanupFunction(() => {
  return CalendarTestUtils.closeCalendarTab(window);
});
