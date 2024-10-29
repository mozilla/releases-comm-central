/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { TIMEOUT_MODAL_DIALOG, checkMonthAlarmIcon, handleDeleteOccurrencePrompt } =
  ChromeUtils.importESModule("resource://testing-common/calendar/CalendarUtils.sys.mjs");
var { cancelItemDialog, formatTime, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});
const l10n = new Localization(["calendar/categories.ftl"], true);

const EVENTTITLE = "Event";
const EVENTLOCATION = "Location";
const EVENTDESCRIPTION = "Event Description";
const EVENTATTENDEE = "foo@example.com";
const EVENTURL = "https://mozilla.org/";
const EVENT_ORGANIZER_EMAIL = "pillow@example.com";
var firstDay;

var { dayView, monthView } = CalendarTestUtils;

const calendar = CalendarTestUtils.createCalendar();
// This is done so that calItemBase#isInvitation returns true.
calendar.setProperty("organizerId", `mailto:${EVENT_ORGANIZER_EMAIL}`);
registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

add_task(async function testEventDialog() {
  const now = new Date();

  // Since from other tests we may be elsewhere, make sure we start today.
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(
    window,
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate()
  );
  await CalendarTestUtils.calendarViewBackward(window, 1);

  // Open month view.
  await CalendarTestUtils.setCalendarView(window, "month");
  firstDay = window.currentView().startDay;
  dump(`First day in view is: ${firstDay.year}-${firstDay.month + 1}-${firstDay.day}\n`);

  // Setup start- & endTime.
  // Next full hour except last hour of the day.
  const hour = now.getUTCHours();
  const startHour = hour == 23 ? hour : (hour + 1) % 24;

  const nextHour = cal.dtz.now();
  nextHour.resetTo(firstDay.year, firstDay.month, firstDay.day, startHour, 0, 0, cal.dtz.UTC);
  const startTime = formatTime(nextHour);
  nextHour.resetTo(
    firstDay.year,
    firstDay.month,
    firstDay.day,
    (startHour + 1) % 24,
    0,
    0,
    cal.dtz.UTC
  );
  const endTime = formatTime(nextHour);

  // Create new event on first day in view.
  EventUtils.synthesizeMouseAtCenter(monthView.getDayBox(window, 1, 1), {}, window);

  const { dialogWindow, iframeWindow, dialogDocument, iframeDocument } =
    await CalendarTestUtils.editNewEvent(window);

  // First check all standard-values are set correctly.
  const startPicker = iframeDocument.getElementById("event-starttime");
  Assert.equal(startPicker._timepicker._inputField.value, startTime);

  // Check selected calendar.
  Assert.equal(iframeDocument.getElementById("item-calendar").value, "Test");

  // Check standard title.
  Assert.equal(iframeDocument.getElementById("item-title").placeholder, "New Event");

  // Prepare category.
  const categories = l10n.formatValueSync("categories2");
  // Pick 4th value in a comma-separated list.
  const category = categories.split(",")[4];
  // Calculate date to repeat until.
  const untildate = firstDay.clone();
  untildate.addDuration(cal.createDuration("P20D"));

  // Fill in the rest of the values.
  await setData(dialogWindow, iframeWindow, {
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
    dialogWindow
  );

  const attendeesTab = iframeDocument.getElementById("event-grid-tabpanel-attendees");
  const attendeeNameElements = attendeesTab.querySelectorAll(".attendee-list .attendee-name");
  Assert.equal(attendeeNameElements.length, 2, "there should be two attendees after save");
  Assert.equal(attendeeNameElements[0].textContent, EVENT_ORGANIZER_EMAIL);
  Assert.equal(attendeeNameElements[1].textContent, EVENTATTENDEE);
  Assert.ok(!iframeDocument.getElementById("notify-attendees-checkbox").checked);

  // Verify private label visible.
  await TestUtils.waitForCondition(
    () => !dialogDocument.getElementById("status-privacy-private-box").hasAttribute("collapsed")
  );
  dialogDocument.getElementById("event-privacy-menupopup").hidePopup();

  // Add attachment and verify added.
  EventUtils.synthesizeMouseAtCenter(
    iframeDocument.getElementById("event-grid-tab-attachments"),
    {},
    iframeWindow
  );

  const attachmentsTab = iframeDocument.getElementById("event-grid-tabpanel-attachments");
  Assert.equal(attachmentsTab.querySelectorAll("richlistitem").length, 1);

  const alarmPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-alarm-dialog.xhtml",
    {
      callback(alarmWindow) {
        const dismissAllButton = alarmWindow.document.getElementById("alarm-dismiss-all-button");
        EventUtils.synthesizeMouseAtCenter(dismissAllButton, {}, alarmWindow);
      },
    }
  );

  // save
  await saveAndCloseItemDialog(dialogWindow);

  // Catch and dismiss alarm.
  await alarmPromise;

  // Verify event and alarm icon visible until endDate (3 full rows) and check tooltip.
  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      await monthView.waitForItemAt(window, row, col, 1);
      checkMonthAlarmIcon(window, row, col);
      checkTooltip(row, col, startTime, endTime);
    }
  }
  Assert.ok(!monthView.getItemAt(window, 4, 1, 1));

  // Delete and verify deleted 6th col in row 1.
  EventUtils.synthesizeMouseAtCenter(monthView.getItemAt(window, 1, 6, 1), {}, window);
  let elemToDelete = document.getElementById("month-view");
  await handleDeleteOccurrencePrompt(window, elemToDelete, false);

  await monthView.waitForNoItemAt(window, 1, 6, 1);

  // Verify all others still exist.
  for (let col = 1; col <= 5; col++) {
    Assert.ok(monthView.getItemAt(window, 1, col, 1));
  }
  Assert.ok(monthView.getItemAt(window, 1, 7, 1));

  for (let row = 2; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      Assert.ok(monthView.getItemAt(window, row, col, 1));
    }
  }

  // Delete series by deleting last item in row 1 and confirming to delete all.
  EventUtils.synthesizeMouseAtCenter(monthView.getItemAt(window, 1, 7, 1), {}, window);
  elemToDelete = document.getElementById("month-view");
  await handleDeleteOccurrencePrompt(window, elemToDelete, true);

  // Verify all deleted.
  await monthView.waitForNoItemAt(window, 1, 5, 1);
  await monthView.waitForNoItemAt(window, 1, 6, 1);
  await monthView.waitForNoItemAt(window, 1, 7, 1);

  for (let row = 2; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      await monthView.waitForNoItemAt(window, row, col, 1);
    }
  }
});

add_task(async function testOpenExistingEventDialog() {
  const now = new Date();

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(
    window,
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate()
  );

  const createBox = dayView.getHourBoxAt(window, 8);

  // Create a new event.
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, createBox);
  await setData(dialogWindow, iframeWindow, {
    title: EVENTTITLE,
    location: EVENTLOCATION,
    description: EVENTDESCRIPTION,
  });
  await saveAndCloseItemDialog(dialogWindow);

  const eventBox = await dayView.waitForEventBoxAt(window, 1);

  // Open the event in the summary dialog, it will fail if otherwise.
  const eventWin = await CalendarTestUtils.viewItem(window, eventBox);
  Assert.equal(
    eventWin.document.querySelector("calendar-item-summary .item-title").textContent,
    EVENTTITLE
  );
  Assert.equal(
    eventWin.document.querySelector("calendar-item-summary .item-location").textContent,
    EVENTLOCATION
  );
  Assert.equal(
    eventWin.document.querySelector("calendar-item-summary .item-description").contentDocument.body
      .innerText,
    EVENTDESCRIPTION
  );
  EventUtils.synthesizeKey("VK_ESCAPE", {}, eventWin);

  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await dayView.waitForNoEventBoxAt(window, 1);
});

add_task(async function testEventReminderDisplay() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2020, 1, 1);

  let createBox = dayView.getHourBoxAt(window, 8);

  // Create an event without a reminder.
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, createBox);
  await setData(dialogWindow, iframeWindow, {
    title: EVENTTITLE,
    location: EVENTLOCATION,
    description: EVENTDESCRIPTION,
  });
  await saveAndCloseItemDialog(dialogWindow);

  let eventBox = await dayView.waitForEventBoxAt(window, 1);

  let eventWindow = await CalendarTestUtils.viewItem(window, eventBox);
  let doc = eventWindow.document;
  let row = doc.querySelector(".reminder-row");
  Assert.ok(row.hidden, "reminder dropdown is not displayed");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, eventWindow);

  await CalendarTestUtils.goToDate(window, 2020, 2, 1);
  createBox = dayView.getHourBoxAt(window, 8);

  // Create an event with a reminder.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, createBox));
  await setData(dialogWindow, iframeWindow, {
    title: EVENTTITLE,
    location: EVENTLOCATION,
    description: EVENTDESCRIPTION,
    reminder: "1week",
  });
  await saveAndCloseItemDialog(dialogWindow);

  eventBox = await dayView.waitForEventBoxAt(window, 1);
  eventWindow = await CalendarTestUtils.viewItem(window, eventBox);
  doc = eventWindow.document;
  row = doc.querySelector(".reminder-row");

  Assert.ok(
    row.textContent.includes("7 days before"),
    "the details are shown when a reminder is set"
  );
  EventUtils.synthesizeKey("VK_ESCAPE", {}, eventWindow);

  // Create an invitation.
  const icalString =
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

  const calendarEvent = await calendar.addItem(new CalEvent(icalString));
  await CalendarTestUtils.goToDate(window, 2020, 3, 1);
  eventBox = await dayView.waitForEventBoxAt(window, 1);

  eventWindow = await CalendarTestUtils.viewItem(window, eventBox);
  doc = eventWindow.document;
  row = doc.querySelector(".reminder-row");

  Assert.ok(!row.hidden, "reminder row is displayed");
  Assert.ok(row.querySelector("menulist") != null, "reminder dropdown is available");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, eventWindow);

  // Delete directly, as using the UI causes a prompt to appear.
  calendar.deleteItem(calendarEvent);
  await dayView.waitForNoEventBoxAt(window, 1);
});

/**
 * Test that using CTRL+Enter does not result in two events being created.
 * This only happens in the dialog window. See bug 1668478.
 */
add_task(async function testCtrlEnterShortcut() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2020, 9, 1);

  const createBox = dayView.getHourBoxAt(window, 8);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, createBox);
  await setData(dialogWindow, iframeWindow, {
    title: EVENTTITLE,
    location: EVENTLOCATION,
    description: EVENTDESCRIPTION,
  });
  EventUtils.synthesizeKey("VK_RETURN", { ctrlKey: true }, dialogWindow);

  await CalendarTestUtils.setCalendarView(window, "month");

  // Give the event boxes enough time to appear before checking for duplicates.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 2000));

  const events = document.querySelectorAll("calendar-month-day-box-item");
  Assert.equal(events.length, 1, "event was created once");

  if (Services.focus.activeWindow != window) {
    await BrowserTestUtils.waitForEvent(window, "focus");
  }

  events[0].focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
});

function checkTooltip(row, col, startTime, endTime) {
  const item = monthView.getItemAt(window, row, col, 1);

  const toolTipNode = document.getElementById("itemTooltip");
  toolTipNode.ownerGlobal.onMouseOverItem({ currentTarget: item });

  function getDescription(index) {
    return toolTipNode.querySelector(
      `.tooltipHeaderTable > tr:nth-of-type(${index}) > .tooltipHeaderDescription`
    ).textContent;
  }

  // Check title.
  Assert.equal(getDescription(1), EVENTTITLE);

  // Check date and time.
  const dateTime = getDescription(3);

  const currDate = firstDay.clone();
  currDate.addDuration(cal.createDuration(`P${7 * (row - 1) + (col - 1)}D`));
  const startDate = cal.dtz.formatter.formatDate(currDate);

  Assert.ok(dateTime.startsWith(startDate));

  // AM/PM indicator (if there is one) removed if it's the same in endTime.
  Assert.stringContains(dateTime, startTime.replace(/ [AP]M/, ""));

  // This could be on the next day if it is 00:00.
  Assert.ok(dateTime.endsWith(endTime));
}
