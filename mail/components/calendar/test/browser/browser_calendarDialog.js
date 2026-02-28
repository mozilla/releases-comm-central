/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const { recurrenceStringFromItem } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calRecurrenceUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser;
let dialog;
let calendarEvent;
let calendar;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialog.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialog.xhtml")
  );
  await SimpleTest.promiseFocus(tab.browser);
  // This test misbehaves if started immediately.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  browser = tab.browser;
  cal.view.colorTracker.registerWindow(browser.contentWindow);
  dialog = browser.contentWindow.document.querySelector("dialog");

  const beforeUnloadGuard = () => {
    info("Unloading!");
    Assert.ok(false, "Should never call beforeunload");
  };
  browser.contentWindow.addEventListener("beforeunload", beforeUnloadGuard, {
    passive: false,
  });

  // Setting the color to the rgb value of #ffbbff so we don't have to do the
  // conversion for the computed color later.
  calendar = createCalendar({
    color: "rgb(255, 187, 255)",
    name: "TB CAL TEST",
  });
  calendarEvent = await createEvent({
    calendar,
    categories: ["TEST"],
    repeats: true,
    description: "foobar",
  });

  MockExternalProtocolService.init();

  registerCleanupFunction(() => {
    browser.contentWindow.removeEventListener(
      "beforeunload",
      beforeUnloadGuard,
      { passive: false }
    );
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    CalendarTestUtils.removeCalendar(calendar);
    MockExternalProtocolService.cleanup();
  });
});

function resetDialog() {
  dialog.removeAttribute("calendar-id");
  dialog.removeAttribute("recurrence-id");
  dialog.removeAttribute("event-id");
  dialog.close();
}

add_task(async function test_dialogStructure() {
  dialog.show();
  const titlebar = dialog.querySelectorAll(".titlebar");
  const closeButton = dialog.querySelectorAll(".titlebar .close-button");

  Assert.equal(titlebar.length, 1, "Contains 1 titlebar");
  Assert.equal(closeButton.length, 1, "Titlebar contains 1 close button");
  Assert.equal(
    dialog.querySelectorAll(".footer").length,
    1,
    "Contains 1 footer bar"
  );
  Assert.equal(
    dialog.querySelectorAll(".content").length,
    1,
    "Contains 1 content container"
  );
});

add_task(async function test_dialogOpenAndClose() {
  dialog.show();

  Assert.ok(dialog.open, "Dialog is updated to open");
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector(".close-button"),
    {},
    browser.contentWindow
  );
  Assert.ok(!dialog.open, "Dialog is closed");
});

add_task(async function test_setCalendarEvent() {
  Assert.throws(
    () => {
      dialog.setCalendarEvent({
        isEvent() {
          return false;
        },
      });
    },
    /Can only display events/,
    "Only accepts events."
  );

  const nextOccurrence = calendarEvent.recurrenceInfo.getNextOccurrence(
    cal.dtz.now()
  );

  dialog.setCalendarEvent(nextOccurrence);

  Assert.equal(
    dialog.getAttribute("calendar-id"),
    calendar.id,
    "Should set the calendar-id attribute"
  );
  Assert.equal(
    dialog.getAttribute("event-id"),
    calendarEvent.id,
    "Should set the event-id attribute"
  );
  Assert.equal(
    dialog.getAttribute("recurrence-id"),
    nextOccurrence.recurrenceId.nativeTime,
    "Should set the recurrence-id attribute"
  );

  resetDialog();
});

add_task(async function test_dialogSubviewNavigation() {
  dialog.show();
  const subviewManager = dialog.querySelector(
    "calendar-dialog-subview-manager"
  );
  const backButton = dialog.querySelector(".back-button");
  const mainSubview = dialog.querySelector("#calendarDialogMainSubview");
  const otherSubview = dialog.querySelector("#calendarDialogOtherSubview");

  Assert.ok(
    BrowserTestUtils.isHidden(backButton),
    "Back button should be hidden initially"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(mainSubview),
    "Main subview should be visible initially"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(otherSubview),
    "Other subview should be hidden initially"
  );

  subviewManager.showSubview(otherSubview.id);

  Assert.ok(
    BrowserTestUtils.isVisible(backButton),
    "Back button should be visible on other subview"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(mainSubview),
    "Main subview should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(otherSubview),
    "Other subview should be visible now"
  );

  EventUtils.synthesizeMouseAtCenter(backButton, {}, browser.contentWindow);

  Assert.ok(
    BrowserTestUtils.isHidden(backButton),
    "Back button should be hidden again"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(mainSubview),
    "Main subview should be visible again"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(otherSubview),
    "Other subview should be hidden again"
  );
});

add_task(async function test_setCalendarEventResetsSubview() {
  dialog.show();
  const subviewManager = dialog.querySelector(
    "calendar-dialog-subview-manager"
  );
  subviewManager.showSubview("calendarDialogOtherSubview");

  Assert.ok(
    !subviewManager.isDefaultSubviewVisible(),
    "Should be showing another subiew 1"
  );

  dialog.setCalendarEvent(calendarEvent);
  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => subviewManager.isDefaultSubviewVisible()
  );
  Assert.ok(
    subviewManager.isDefaultSubviewVisible(),
    "Setting event data should return to default subivew"
  );

  subviewManager.showSubview("calendarDialogOtherSubview");
  Assert.ok(
    !subviewManager.isDefaultSubviewVisible(),
    "Should be showing another subiew 2"
  );
  const title = dialog.querySelector(".event-title");
  await BrowserTestUtils.waitForCondition(
    () => title.textContent.trim() == "Test Event",
    "waiting for title to be updated"
  );

  resetDialog();

  dialog.show();

  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => subviewManager.isDefaultSubviewVisible()
  );

  await BrowserTestUtils.waitForCondition(
    () => title.textContent.trim() == "",
    "waiting for title to be clear"
  );

  Assert.ok(
    subviewManager.isDefaultSubviewVisible(),
    "Clearing event data should return to default subivew"
  );
});

add_task(async function test_dialogTitle() {
  dialog.show();
  const title = dialog.querySelector(".event-title");

  Assert.equal(
    title.textContent.trim(),
    "",
    "The dialog title has no text before data is set"
  );

  dialog.setCalendarEvent(calendarEvent);
  await BrowserTestUtils.waitForMutationCondition(
    title,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => title.textContent == calendarEvent.title
  );

  Assert.equal(
    title.textContent,
    calendarEvent.title,
    "The dialog title has correct title after setting data"
  );

  resetDialog();

  Assert.equal(title.textContent, "", "The dialog title text is cleared");
});

add_task(async function test_dialogTitleOccurrenceException() {
  const title = dialog.querySelector(".event-title");
  const start = cal.dtz.jsDateToDateTime(new Date(todayDate), 0);
  let end = new Date(todayDate);
  end.setDate(todayDate.getDate() + 1);
  end = cal.dtz.jsDateToDateTime(end, 0);
  const event = new CalEvent();
  event.title = "Recurring with exception";
  event.startDate = start;
  event.endDate = end;
  event.recurrenceInfo = new CalRecurrenceInfo(event);
  const rule = cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=30");
  event.recurrenceInfo.appendRecurrenceItem(rule);
  // Add an exception with a different title.
  const nextOccurrence = event.recurrenceInfo.getNextOccurrence(cal.dtz.now());
  nextOccurrence.title = "Exception";
  event.recurrenceInfo.modifyException(nextOccurrence, true);

  const savedEvent = await calendar.addItem(event);

  dialog.show();
  dialog.setCalendarEvent(savedEvent);
  await BrowserTestUtils.waitForMutationCondition(
    title,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => title.textContent == savedEvent.title
  );

  Assert.equal(
    title.textContent,
    "Recurring with exception",
    "Should apply normal title for parent event"
  );

  const nextSavedOccurrence = savedEvent.recurrenceInfo.getNextOccurrence(
    cal.dtz.now()
  );
  dialog.setCalendarEvent(nextSavedOccurrence);
  await BrowserTestUtils.waitForMutationCondition(
    title,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => title.textContent == nextSavedOccurrence.title
  );

  Assert.equal(
    title.textContent,
    "Exception",
    "Should apply title specific to exception"
  );

  resetDialog();
});

add_task(async function test_dialogLocation() {
  dialog.show();
  const locationLink = dialog.querySelector("#locationLink");
  const locationText = dialog.querySelector("#locationText");

  Assert.ok(
    BrowserTestUtils.isHidden(locationLink),
    "Location link should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(locationText),
    "Location text should be hidden"
  );

  const physicalLocation = await createEvent({
    location: "foobar",
    name: "Physical location",
    calendar,
  });
  dialog.setCalendarEvent(physicalLocation);
  dialog.show();
  await BrowserTestUtils.waitForMutationCondition(
    locationText,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isVisible(locationText)
  );
  Assert.ok(
    BrowserTestUtils.isHidden(locationLink),
    "Location link should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(locationText),
    "Location text should be visible"
  );
  Assert.equal(locationText.textContent, "foobar", "Should set location text");

  const internetLocation = await createEvent({
    location:
      "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/",
    name: "Internet location",
    calendar,
  });
  dialog.setCalendarEvent(internetLocation);
  dialog.show();
  await BrowserTestUtils.waitForMutationCondition(
    locationLink,
    {
      attributes: true,
      attributeFilter: ["href"],
    },
    () => BrowserTestUtils.isVisible(locationLink)
  );
  Assert.ok(
    BrowserTestUtils.isVisible(locationLink),
    "Location link should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(locationText),
    "Location text should be hidden"
  );
  Assert.equal(
    locationLink.textContent,
    "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/",
    "Link text should update"
  );
  Assert.equal(
    locationLink.href,
    "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/",
    "Link href should update"
  );

  const loadPromise = MockExternalProtocolService.promiseLoad();
  EventUtils.synthesizeMouseAtCenter(locationLink, {}, browser.contentWindow);
  Assert.equal(
    await loadPromise,
    "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/"
  );

  resetDialog();

  Assert.equal(locationText.textContent, "", "Location text should be empty");
  Assert.ok(
    BrowserTestUtils.isHidden(locationText),
    "Location text should be hidden again"
  );
});

add_task(async function test_dialogDescription() {
  dialog.show();
  const calendarPlainTextDescription = dialog.querySelector(
    "#expandingDescription .plain-text-description"
  );
  const fullDescription = dialog.querySelector(
    "#expandedDescription .rich-description"
  );

  Assert.equal(
    calendarPlainTextDescription.textContent.trim(),
    "",
    "Description row content should be empty"
  );
  Assert.equal(
    fullDescription.contentDocument.body.childElementCount,
    0,
    "Full description should be empty"
  );

  dialog.setCalendarEvent(calendarEvent);
  await BrowserTestUtils.waitForMutationCondition(
    calendarPlainTextDescription,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => calendarPlainTextDescription.textContent.trim()
  );

  Assert.equal(
    calendarPlainTextDescription.textContent.trim(),
    "foobar",
    "Description row content should update"
  );
  Assert.equal(
    fullDescription.contentDocument.body.textContent.trim(),
    "foobar",
    "Full description content should update"
  );

  resetDialog();

  Assert.equal(
    calendarPlainTextDescription.textContent.trim(),
    "",
    "Description row content should be empty again"
  );
  Assert.equal(
    fullDescription.contentDocument.body.childElementCount,
    0,
    "Full description should be empty again"
  );
});

add_task(async function test_dialogCategories() {
  dialog.show();
  const categories = dialog.querySelector("calendar-dialog-categories");

  Assert.equal(
    categories.shadowRoot.querySelectorAll("li").length,
    0,
    "The dialog should have no categories"
  );

  dialog.setCalendarEvent(calendarEvent);
  await BrowserTestUtils.waitForMutationCondition(
    categories.shadowRoot.querySelector("ul"),
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => categories.shadowRoot.querySelectorAll("li").length > 0
  );

  Assert.equal(
    categories.shadowRoot.querySelectorAll("li").length,
    1,
    "The dialog should have a category after setting data"
  );

  resetDialog();

  Assert.equal(
    categories.shadowRoot.querySelectorAll("li").length,
    0,
    "The dialog should have no categories after removing the event association"
  );
});

add_task(async function test_dialogDate() {
  dialog.show();
  const dateRow = dialog.querySelector("calendar-dialog-date-row");
  const endDate = new Date(todayDate);
  endDate.setDate(todayDate.getDate());
  endDate.setMinutes(59);
  endDate.setSeconds(59);

  Assert.ok(
    !dateRow.hasAttribute("repeats"),
    "The dialog should not indicate a repeating event"
  );

  dialog.setCalendarEvent(calendarEvent);
  await BrowserTestUtils.waitForMutationCondition(
    dateRow,
    {
      attributes: true,
      attributeFilter: ["start-date", "end-date", "repeats"],
    },
    () =>
      dateRow.hasAttribute("start-date") &&
      dateRow.hasAttribute("end-date") &&
      dateRow.hasAttribute("repeats")
  );

  Assert.equal(
    dateRow.getAttribute("start-date"),
    todayDate.toISOString(),
    "The start date should be transferred to the date row"
  );

  Assert.equal(
    dateRow.getAttribute("end-date"),
    endDate.toISOString(),
    "The end date should be transferred to the date row"
  );

  Assert.equal(
    dateRow.getAttribute("repeats"),
    recurrenceStringFromItem(calendarEvent, "recurrence-rule-too-complex"),
    "The repeat instructions should be transferred to the date row"
  );

  resetDialog();

  Assert.ok(
    !dateRow.hasAttribute("repeats"),
    "The dialog should not indicate a repeating event again"
  );
});

add_task(async function test_dialogCalendarBarColor() {
  dialog.show();
  dialog.setCalendarEvent(calendarEvent);

  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      attributes: true,
      attributeFilter: ["style"],
    },
    () => dialog.style.getPropertyValue("--calendar-bar-color")
  );

  const computedStyle = window.getComputedStyle(
    dialog.querySelector(".titlebar"),
    "::before"
  );

  Assert.equal(
    computedStyle.backgroundColor,
    calendar.getProperty("color"),
    "Should apply calendar color to top bar"
  );

  resetDialog();

  Assert.ok(
    !dialog.style.getPropertyValue("--calendar-bar-color"),
    "Should not have a bar color set without a loaded event"
  );
});

add_task(async function test_calendarDailogName() {
  dialog.show();
  dialog.setCalendarEvent(calendarEvent);
  const nameElement = dialog.querySelector(".calendar-name");

  await new Promise(requestAnimationFrame);

  Assert.equal(
    nameElement.textContent,
    "TB CAL TEST",
    "Dialog has correct calendar name"
  );

  resetDialog();
  Assert.equal(nameElement.textContent, "", "Calendar name gets cleared");

  dialog.close();
});

add_task(async function test_calendarDailogTitleTooltip() {
  dialog.show();
  dialog.setCalendarEvent(calendarEvent);
  const titleElement = dialog.querySelector(".calendar-dialog-title");

  await new Promise(requestAnimationFrame);

  Assert.equal(
    titleElement.title,
    `TB CAL TEST - ${calendarEvent.title}`,
    "Dialog has correct calendar title tooltip"
  );

  resetDialog();
  Assert.equal(titleElement.title, "", "Calendar title tooltop gets cleared");

  dialog.close();
});

add_task(async function test_dialogReminders() {
  dialog.show();
  const remindersRow = dialog.querySelector("calendar-dialog-reminders-row");
  const reminderLabel = remindersRow.querySelector("#reminderCount");
  const reminderList = remindersRow.querySelector("#reminderList");

  const hourReminder = createAlarmFromDuration("-PT1H");
  const alarms = [hourReminder];
  const oneReminder = await createEvent({
    name: "One Alarm",
    calendar,
    offset: 7,
    alarms,
  });
  dialog.setCalendarEvent(oneReminder);

  await BrowserTestUtils.waitForMutationCondition(
    reminderList,
    {
      childList: true,
      subtree: true,
    },
    () =>
      reminderList.childNodes.length == 1 &&
      reminderList.childNodes[0].textContent == hourReminder.toString()
  );
  let fluentData = document.l10n.getAttributes(reminderLabel);

  Assert.equal(
    fluentData.id,
    "calendar-dialog-reminder-count",
    "Reminder count label should be set"
  );

  Assert.equal(
    fluentData.args.count,
    1,
    "Reminder count label should have the right count"
  );

  const dayReminder = createAlarmFromDuration("-P1D");
  const sixDayReminder = createAlarmFromDuration("-P6D");
  alarms.push(sixDayReminder);
  alarms.push(dayReminder);

  // Setting multiple reminders should show the load more text.
  const multipleReminders = await createEvent({
    name: "Multiple Alarms",
    calendar,
    offset: 7,
    alarms,
  });

  dialog.setCalendarEvent(multipleReminders);

  await BrowserTestUtils.waitForMutationCondition(
    reminderList,
    {
      childList: true,
      subtree: true,
    },
    () => reminderList.childNodes.length == 3
  );

  fluentData = document.l10n.getAttributes(reminderLabel);
  Assert.equal(
    fluentData.args.count,
    3,
    "Reminder count label should have the right count"
  );

  // Reminders should be in sequential order.
  Assert.equal(
    reminderList.childNodes[0].textContent,
    hourReminder.toString(),
    "First reminder should be in correct order"
  );
  Assert.equal(
    reminderList.childNodes[1].textContent,
    dayReminder.toString(),
    "Second reminder should be in correct order"
  );
  Assert.equal(
    reminderList.childNodes[2].textContent,
    sixDayReminder.toString(),
    "Third reminder should be in correct order"
  );

  resetDialog();
  await BrowserTestUtils.waitForMutationCondition(
    reminderList,
    {
      childList: true,
      subtree: true,
    },
    () => reminderList.childNodes.length == 0
  );

  fluentData = document.l10n.getAttributes(reminderLabel);
  Assert.equal(
    fluentData.args.count,
    0,
    "Reminder count label should have the right count"
  );
});

add_task(async function test_toggleRowVisibilty() {
  let calendarEventData = {
    location: "foobar",
    name: "Physical location",
    description: "Foo",
    categories: ["TEST"],
    attachments: ["https://example.com/"],
    calendar,
  };
  let calEvent = await createEvent(calendarEventData);
  dialog.setCalendarEvent(calEvent);
  dialog.show();

  // Test row visibility.
  const descriptionRow = dialog.querySelector("#descriptionRow");
  const calendarPlainTextDescription = dialog.querySelector(
    "#expandingDescription .plain-text-description"
  );
  const categoriesRow = dialog.querySelector("calendar-dialog-categories");
  const locationRow = dialog.querySelector("#locationRow");
  const attachmentsRow = dialog.querySelector("#attachmentsRow");

  // Wait for calendar dialog data to be updated.
  await BrowserTestUtils.waitForMutationCondition(
    calendarPlainTextDescription,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => calendarPlainTextDescription.textContent.trim()
  );

  Assert.ok(
    BrowserTestUtils.isVisible(descriptionRow),
    "Description row should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(categoriesRow),
    "Categories row should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(locationRow),
    "Location row should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(attachmentsRow),
    "Attachments row should be visible"
  );

  const descriptionEventPromise = BrowserTestUtils.waitForEvent(
    descriptionRow.querySelector("calendar-dialog-description-row"),
    "toggleRowVisibility"
  );
  const categoriesEventPromise = BrowserTestUtils.waitForEvent(
    categoriesRow,
    "toggleRowVisibility"
  );

  // Remove event properties to hide the rows.
  calendarEventData = {
    name: "Physical location",
    calendar,
  };
  calEvent = await createEvent(calendarEventData);
  dialog.setCalendarEvent(calEvent);
  dialog.show();

  // The toggleRowVisibility event should have fired from each component.
  await descriptionEventPromise;
  await categoriesEventPromise;

  Assert.ok(
    BrowserTestUtils.isHidden(descriptionRow),
    "Description row should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(categoriesRow),
    "Categories row should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(locationRow),
    "Location row should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(attachmentsRow),
    "Attachments row should be hidden"
  );

  resetDialog();
});

add_task(async function test_joinMeetingButton() {
  dialog.setCalendarEvent(calendarEvent);
  dialog.show();
  const calendarPlainTextDescription = dialog.querySelector(
    "#expandingDescription .plain-text-description"
  );
  const joinMeetingButton = dialog.querySelector("#joinMeeting");

  // Wait for description text to be updated.
  await BrowserTestUtils.waitForMutationCondition(
    calendarPlainTextDescription,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => calendarPlainTextDescription.textContent.trim()
  );

  Assert.ok(
    BrowserTestUtils.isHidden(joinMeetingButton),
    "Join meeting button should be hidden"
  );

  // Setting an event with a meeting link in the description should show the
  // join meeting button.
  const meetingEvent = await createEvent({
    name: "Meeting Event",
    calendar,
    description: "https://test.zoom.us/wc/join/12345",
  });
  dialog.setCalendarEvent(meetingEvent);
  dialog.show();

  // Wait for description text to be updated.
  await BrowserTestUtils.waitForMutationCondition(
    calendarPlainTextDescription,
    {
      subtree: true,
      childList: true,
      characterData: true,
    },
    () => calendarPlainTextDescription.textContent.trim()
  );

  Assert.ok(
    BrowserTestUtils.isVisible(joinMeetingButton),
    "Join meeting button should be visible"
  );

  const loadPromise = MockExternalProtocolService.promiseLoad();
  const joinButtonClickedPromise = BrowserTestUtils.waitForEvent(
    joinMeetingButton,
    "click"
  );
  EventUtils.synthesizeMouseAtCenter(
    joinMeetingButton,
    {},
    browser.contentWindow
  );

  await joinButtonClickedPromise;
  Assert.equal(
    await loadPromise,
    "https://test.zoom.us/wc/join/12345",
    "Should load meeting url"
  );

  resetDialog();
});

add_task(async function test_dialogAttachmentsSubview() {
  const subviewManager = dialog.querySelector(
    "calendar-dialog-subview-manager"
  );
  const calEvent = await createEvent({
    attachments: ["https://example.com/"],
    calendar,
  });
  dialog.setCalendarEvent(calEvent);
  dialog.show();
  subviewManager.showSubview("calendarAttachmentsSubview");
  const list = dialog.querySelector(
    "#calendarAttachmentsList .attachments-list"
  );

  await BrowserTestUtils.waitForMutationCondition(
    list,
    {
      subtree: true,
      childList: true,
    },
    () => list.childElementCount > 0
  );

  Assert.equal(list.childElementCount, 1, "Should have one attachment");
  Assert.equal(
    list.children[0].getAttribute("url"),
    "https://example.com/",
    "Should pass url to attachment"
  );
  Assert.equal(
    list.children[0].getAttribute("label"),
    "https://example.com/",
    "Should pass url as label"
  );
  Assert.equal(
    list.children[0].getAttribute("icon"),
    "moz-icon://dummy.html",
    "Should show an icon for the attachment"
  );

  resetDialog();

  await BrowserTestUtils.waitForMutationCondition(
    list,
    {
      subtree: true,
      childList: true,
    },
    () => list.childElementCount == 0
  );
});

add_task(async function test_dialogAttachmentsRow() {
  const subviewManager = dialog.querySelector(
    "calendar-dialog-subview-manager"
  );
  const row = dialog.querySelector("#attachmentsRow");
  const calEvent = await createEvent({
    attachments: ["https://example.com/", "https://example.org/"],
    calendar,
  });
  dialog.setCalendarEvent(calEvent);
  dialog.show();
  await BrowserTestUtils.waitForAttributeRemoval("hidden", row);

  const rowAttributes = document.l10n.getAttributes(
    row.querySelector(".row-label")
  );

  Assert.deepEqual(
    rowAttributes,
    {
      id: "calendar-dialog-attachments-summary-label",
      args: {
        count: 2,
      },
    },
    "Should update the l10n attributes of the row label"
  );

  const subviewChanged = BrowserTestUtils.waitForEvent(
    dialog,
    "subviewchanged",
    true
  );
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#expandAttachments"),
    {},
    browser.contentWindow
  );
  await subviewChanged;

  Assert.ok(
    !subviewManager.isDefaultSubviewVisible(),
    "Should have switched to a different subview on click"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      dialog.querySelector("#calendarAttachmentsSubview")
    ),
    "Attachments subview should be visible"
  );

  const rowHidden = BrowserTestUtils.waitForAttribute("hidden", row);

  resetDialog();

  info("Waiting for attachment row to be hidden...");
  await rowHidden;
});

add_task(async function testAttendeesRowVisibility() {
  const calendarEventData = {
    location: "foobar",
    name: "Physical location",
    description: "Foo",
    categories: ["TEST"],
    calendar,
    attendees: [
      {
        commonName: "",
        id: "mailto:john@example.com",
        role: "REQ-PARTICIPANT",
        participationStatus: "ACCEPTED",
        isOrganizer: false,
      },
    ],
    isEvent: () => true,
  };
  let calEvent = await createEvent(calendarEventData);
  dialog.setCalendarEvent(calEvent);
  dialog.show();

  const attendeesRow = dialog.querySelector("calendar-dialog-attendees-row");

  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(attendeesRow),
    "Attendees row should be visible"
  );

  resetDialog();

  dialog.show();

  calendarEventData.attendees = [];
  calEvent = await createEvent(calendarEventData);
  dialog.setCalendarEvent(calEvent);

  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(attendeesRow),
    "Attendees row should be hidden"
  );

  resetDialog();
});

add_task(async function testAttendeesRowData() {
  const calendarEventData = {
    location: "foobar",
    name: "Physical location",
    description: "Foo",
    categories: ["TEST"],
    calendar,
    attendees: [
      {
        commonName: "",
        id: "mailto:john@example.com",
        role: "OPT-PARTICIPANT",
        participationStatus: "ACCEPTED",
        isOrganizer: false,
      },
    ],
    isEvent: () => true,
  };
  const calEvent = await createEvent(calendarEventData);
  dialog.setCalendarEvent(calEvent);
  dialog.show();

  const attendeesRow = dialog.querySelector("calendar-dialog-attendees-row");

  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(attendeesRow),
    "Attendees row should be visible"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(attendeesRow.querySelector(".attendee-name")),
    "The attendee name should be hidden"
  );
  Assert.equal(
    attendeesRow.querySelector(".attendee-email").textContent,
    "john@example.com",
    "Should show the correct email"
  );

  resetDialog();
});
