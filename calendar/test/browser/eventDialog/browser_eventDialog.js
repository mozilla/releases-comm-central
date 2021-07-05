/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  TIMEOUT_MODAL_DIALOG,
  checkMonthAlarmIcon,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
  invokeNewEventDialog,
  invokeViewingEventDialog,
  switchToView,
  viewBack,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { cancelItemDialog, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

const EVENTTITLE = "Event";
const EVENTLOCATION = "Location";
const EVENTDESCRIPTION = "Event Description";
const EVENTATTENDEE = "foo@bar.com";
const EVENTURL = "http://mozilla.org/";
var firstDay;

var { dayView, monthView } = CalendarTestUtils;

add_task(async function testEventDialog() {
  let now = new Date();

  createCalendar(controller, CALENDARNAME);
  // Since from other tests we may be elsewhere, make sure we start today.
  switchToView(controller, "day");
  goToDate(controller, now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  viewBack(controller, 1);

  // Open month view.
  switchToView(controller, "month");
  firstDay = controller.window.currentView().startDay;
  dump(`First day in view is: ${firstDay.year}-${firstDay.month + 1}-${firstDay.day}\n`);

  // Setup start- & endTime.
  // Next full hour except last hour of the day.
  let hour = now.getUTCHours();
  let startHour = hour == 23 ? hour : (hour + 1) % 24;

  let nextHour = cal.dtz.now();
  nextHour.resetTo(firstDay.year, firstDay.month, firstDay.day, startHour, 0, 0, cal.dtz.floating);
  let startTime = cal.dtz.formatter.formatTime(nextHour);
  nextHour.resetTo(
    firstDay.year,
    firstDay.month,
    firstDay.day,
    (startHour + 1) % 24,
    0,
    0,
    cal.dtz.floating
  );
  let endTime = cal.dtz.formatter.formatTime(nextHour);

  // Create new event on first day in view.
  controller.click(monthView.getDayBox(controller.window, 1, 1));

  await invokeNewEventDialog(window, null, async (eventWindow, iframeWindow) => {
    let eventDocument = eventWindow.document;
    let iframeDocument = iframeWindow.document;

    // First check all standard-values are set correctly.
    let startPicker = iframeDocument.getElementById("event-starttime");
    Assert.equal(startPicker._timepicker._inputField.value, startTime);

    // Check selected calendar.
    Assert.equal(iframeDocument.getElementById("item-calendar").value, CALENDARNAME);

    // Check standard title.
    let defTitle = cal.l10n.getAnyString("calendar", "calendar", "newEvent");
    Assert.equal(iframeDocument.getElementById("item-title").placeholder, defTitle);

    // Prepare category.
    let categories = cal.l10n.getAnyString("calendar", "categories", "categories2");
    // Pick 4th value in a comma-separated list.
    let category = categories.split(",")[4];
    // Calculate date to repeat until.
    let untildate = firstDay.clone();
    untildate.addDuration(cal.createDuration("P20D"));

    // Fill in the rest of the values.
    await setData(eventWindow, iframeWindow, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
      categories: [category],
      repeat: "daily",
      repeatuntil: untildate,
      reminder: "5minutes",
      privacy: "private",
      attachment: { add: EVENTURL },
      attendees: { add: EVENTATTENDEE },
    });

    // Verify attendee added.
    EventUtils.synthesizeMouseAtCenter(
      iframeDocument.getElementById("event-grid-tab-attendees"),
      {},
      eventWindow
    );

    let attendeesTab = iframeDocument.getElementById("event-grid-tabpanel-attendees");
    let attendeeName = attendeesTab.querySelector(".attendee-list .attendee-name");

    Assert.ok(attendeeName);
    Assert.equal(attendeeName.textContent, EVENTATTENDEE);
    Assert.ok(!iframeDocument.getElementById("notify-attendees-checkbox").checked);

    // Verify private label visible.
    controller.waitFor(
      () => !eventDocument.getElementById("status-privacy-private-box").hasAttribute("collapsed")
    );
    eventDocument.getElementById("event-privacy-menupopup").hidePopup();

    // Add attachment and verify added.
    EventUtils.synthesizeMouseAtCenter(
      iframeDocument.getElementById("event-grid-tab-attachments"),
      {},
      iframeWindow
    );

    let attachmentsTab = iframeDocument.getElementById("event-grid-tabpanel-attachments");
    Assert.equal(attachmentsTab.querySelectorAll("richlistitem").length, 1);

    // save
    await saveAndCloseItemDialog(eventWindow);
  });

  // Catch and dismiss alarm.
  plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
    let dismissAllButton = alarm.window.document.getElementById("alarm-dismiss-all-button");
    alarm.click(dismissAllButton);
    // The dialog will close itself if we wait long enough.
    alarm.sleep(500);
  });
  wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

  // Verify event and alarm icon visible until endDate (3 full rows) and check tooltip.
  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      await monthView.waitForItemAt(controller.window, row, col, 1);
      checkMonthAlarmIcon(controller, row, col);
      checkTooltip(row, col, startTime, endTime);
    }
  }
  Assert.ok(!monthView.getItemAt(controller.window, 4, 1, 1));

  // Delete and verify deleted 6th col in row 1.
  controller.click(monthView.getItemAt(controller.window, 1, 6, 1));
  let elemToDelete = controller.window.document.getElementById("month-view");
  handleOccurrencePrompt(controller, elemToDelete, "delete", false);

  await monthView.waitForNoItemAt(controller.window, 1, 6, 1);

  // Verify all others still exist.
  for (let col = 1; col <= 5; col++) {
    Assert.ok(monthView.getItemAt(controller.window, 1, col, 1));
  }
  Assert.ok(monthView.getItemAt(controller.window, 1, 7, 1));

  for (let row = 2; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      Assert.ok(monthView.getItemAt(controller.window, row, col, 1));
    }
  }

  // Delete series by deleting last item in row 1 and confirming to delete all.
  controller.click(monthView.getItemAt(controller.window, 1, 7, 1));
  elemToDelete = controller.window.document.getElementById("month-view");
  handleOccurrencePrompt(controller, elemToDelete, "delete", true);

  // Verify all deleted.
  await monthView.waitForNoItemAt(controller.window, 1, 5, 1);
  await monthView.waitForNoItemAt(controller.window, 1, 6, 1);
  await monthView.waitForNoItemAt(controller.window, 1, 7, 1);

  for (let row = 2; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      await monthView.waitForNoItemAt(controller.window, row, col, 1);
    }
  }

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testOpenExistingEventDialog() {
  let now = new Date();

  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());

  let createBox = dayView.getHourBoxAt(controller.window, 8);

  // Create a new event.
  await invokeNewEventDialog(window, createBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
    });
    await saveAndCloseItemDialog(eventWindow);
  });

  let eventBox = await dayView.waitForEventBoxAt(controller.window, 1);

  // Open the event in the summary dialog, it will fail if otherwise.
  await invokeViewingEventDialog(
    window,
    eventBox,
    async event => {
      Assert.equal(
        event.window.document.querySelector("calendar-item-summary .item-title").textContent,
        EVENTTITLE
      );
      Assert.equal(
        event.window.document.querySelector("calendar-item-summary .item-location").textContent,
        EVENTLOCATION
      );
      Assert.equal(
        event.window.document.querySelector("calendar-item-summary .item-description")
          .contentDocument.body.innerText,
        EVENTDESCRIPTION
      );
      EventUtils.synthesizeKey("VK_ESCAPE", {}, event.window);
    },
    "view"
  );

  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  await dayView.waitForNoEventBoxAt(controller.window, 1);

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testEventReminderDisplay() {
  let calId = createCalendar(controller, CALENDARNAME);

  switchToView(controller, "day");
  goToDate(controller, 2020, 1, 1);

  let createBox = dayView.getHourBoxAt(controller.window, 8);

  // Create an event without a reminder.
  await invokeNewEventDialog(window, createBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
    });
    await saveAndCloseItemDialog(eventWindow);
  });

  let eventBox = await dayView.waitForEventBoxAt(controller.window, 1);

  await invokeViewingEventDialog(
    window,
    eventBox,
    async event => {
      let doc = event.window.document;
      let row = doc.querySelector(".reminder-row");
      Assert.ok(row.hidden, "reminder dropdown is not displayed");
      EventUtils.synthesizeKey("VK_ESCAPE", {}, event.window);
    },
    "view"
  );

  goToDate(controller, 2020, 2, 1);
  createBox = dayView.getHourBoxAt(controller.window, 8);

  // Create an event with a reminder.
  await invokeNewEventDialog(window, createBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
      reminder: "1week",
    });
    await saveAndCloseItemDialog(eventWindow);
  });

  eventBox = await dayView.waitForEventBoxAt(controller.window, 1);
  await invokeViewingEventDialog(
    window,
    eventBox,
    async event => {
      let doc = event.window.document;
      let row = doc.querySelector(".reminder-row");

      Assert.ok(
        row.textContent.includes("7 days before"),
        "the details are shown when a reminder is set"
      );
      EventUtils.synthesizeKey("VK_ESCAPE", {}, event.window);
    },
    "view"
  );

  // This is done so that calItemBase#isInvitation returns true.
  let calendar = cal.getCalendarManager().getCalendarById(calId);
  calendar.setProperty("organizerId", "mailto:pillow@example.com");

  // Create an invitation.
  let icalString =
    "BEGIN:VCALENDAR\r\n" +
    "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN\r\n" +
    "VERSION:2.0\r\n" +
    "BEGIN:VEVENT\r\n" +
    "CREATED:20200301T152601Z\r\n" +
    "DTSTAMP:20200301T192729Z\r\n" +
    "UID:x137e\r\n" +
    "SUMMARY:Nap Time\r\n" +
    "ORGANIZER;CN=Papa Bois:mailto:papabois@example.com\r\n" +
    "ATTENDEE;RSVP=TRUE;CN=pillow@example.com;PARTSTAT=NEEDS-ACTION;CUTY\r\n" +
    " PE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;X-NUM-GUESTS=0:mailto:pillow@example.com\r\n" +
    "DTSTART:20200301T153000Z\r\n" +
    "DTEND:20200301T163000Z\r\n" +
    "DESCRIPTION:Slumber In Lumber\r\n" +
    "SEQUENCE:0\r\n" +
    "TRANSP:OPAQUE\r\n" +
    "BEGIN:VALARM\r\n" +
    "TRIGGER:-PT30M\r\n" +
    "REPEAT:2\r\n" +
    "DURATION:PT15M\r\n" +
    "ACTION:DISPLAY\r\n" +
    "END:VALARM\r\n" +
    "END:VEVENT\r\n" +
    "END:VCALENDAR\r\n";

  let calendarProxy = cal.async.promisifyCalendar(calendar);
  let calendarEvent = await calendarProxy.addItem(new CalEvent(icalString));
  goToDate(controller, 2020, 3, 1);
  eventBox = await dayView.waitForEventBoxAt(controller.window, 1);

  await invokeViewingEventDialog(
    window,
    eventBox,
    async event => {
      let doc = event.window.document;
      let row = doc.querySelector(".reminder-row");

      Assert.ok(!row.hidden, "reminder row is displayed");
      Assert.ok(row.querySelector("menulist") != null, "reminder dropdown is available");
      EventUtils.synthesizeKey("VK_ESCAPE", {}, event.window);
    },
    "view"
  );

  // Delete directly, as using the UI causes a prompt to appear.
  calendarProxy.deleteItem(calendarEvent);
  await dayView.waitForNoEventBoxAt(controller.window, 1);
});

/**
 * Test that using CTRL+Enter does not result in two events being created.
 * This only happens in the dialog window. See bug 1668478.
 */
add_task(async function testCtrlEnterShortcut() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2020, 9, 1);

  let createBox = dayView.getHourBoxAt(controller.window, 8);
  await invokeNewEventDialog(window, createBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
    });
    EventUtils.synthesizeKey("VK_RETURN", { ctrlKey: true }, eventWindow);
  });

  switchToView(controller, "month");

  // Give the event boxes enough time to appear before checking for duplicates.
  controller.sleep(2000);

  let events = document.querySelectorAll("calendar-month-day-box-item");
  Assert.equal(events.length, 1, "event was created once");

  if (Services.focus.activeWindow != controller.window) {
    await BrowserTestUtils.waitForEvent(controller.window, "focus");
  }

  events[0].focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
});

function checkTooltip(row, col, startTime, endTime) {
  let item = monthView.getItemAt(controller.window, row, col, 1);

  let toolTipNode = window.document.getElementById("itemTooltip");
  toolTipNode.ownerGlobal.onMouseOverItem({ currentTarget: item });

  function getDescription(index) {
    return toolTipNode.querySelector(
      `.tooltipHeaderTable > tr:nth-of-type(${index}) > .tooltipHeaderDescription`
    ).textContent;
  }

  // Check title.
  Assert.equal(getDescription(1), EVENTTITLE);

  // Check date and time.
  let dateTime = getDescription(3);

  let currDate = firstDay.clone();
  currDate.addDuration(cal.createDuration(`P${7 * (row - 1) + (col - 1)}D`));
  let startDate = cal.dtz.formatter.formatDate(currDate);

  Assert.ok(dateTime.includes(`${startDate} ${startTime} – `));

  // This could be on the next day if it is 00:00.
  Assert.ok(dateTime.endsWith(endTime));
}

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
