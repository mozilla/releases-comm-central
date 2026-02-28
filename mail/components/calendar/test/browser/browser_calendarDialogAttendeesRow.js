/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let attendeesRowElement;
let attendeesRowElementFull;
const baseAttendee = {
  commonName: "",
  id: "mailto:john@example.com",
  role: "REQ-PARTICIPANT",
  participationStatus: "ACCEPTED",
  isOrganizer: false,
};

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogAttendeesRow.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialogAttendeesRow.xhtml")
  );
  tab.browser.focus();
  attendeesRowElement = tab.browser.contentWindow.document.querySelector(
    `calendar-dialog-attendees-row:not([type])`
  );
  attendeesRowElementFull = tab.browser.contentWindow.document.querySelector(
    `calendar-dialog-attendees-row[type]`
  );
});

add_task(async function test_calendarDialogAttendeesRowVisibility() {
  let toggleRowVisibilityPromise = BrowserTestUtils.waitForEvent(
    attendeesRowElement,
    "toggleRowVisibility"
  );

  attendeesRowElement.setAttendees([]);

  let event = await toggleRowVisibilityPromise;

  Assert.ok(event.detail.isHidden, "Row should emit event with isHidden true");

  toggleRowVisibilityPromise = BrowserTestUtils.waitForEvent(
    attendeesRowElement,
    "toggleRowVisibility"
  );

  attendeesRowElement.setAttendees([baseAttendee]);

  event = await toggleRowVisibilityPromise;

  Assert.ok(
    !event.detail.isHidden,
    "Row should emit event with isHidden false"
  );
});

add_task(async function test_calendarDialogAttendeesRowTitle() {
  const title = attendeesRowElement.querySelector("#attendeesCount");

  attendeesRowElement.setAttendees([baseAttendee, baseAttendee, baseAttendee]);

  Assert.equal(
    title.getAttribute("data-l10n-id"),
    "calendar-dialog-attendee-count",
    "should have correct fluent id"
  );

  Assert.equal(
    title.getAttribute("data-l10n-args"),
    '{"count":3}',
    "Should have the correct arguments"
  );
});

add_task(async function test_calendarDialogAttendeesRowSummary() {
  const summary = attendeesRowElement.querySelector(".attendees-summary");

  attendeesRowElement.setAttendees([
    { ...baseAttendee, participationStatus: "DECLINED" },
    { ...baseAttendee, participationStatus: "DECLINED" },
    { ...baseAttendee, participationStatus: "TENTATIVE" },
    { ...baseAttendee, participationStatus: "NEEDS-ACTION" },
    { ...baseAttendee, participationStatus: "NEEDS-ACTION" },
    { ...baseAttendee, participationStatus: "NEEDS-ACTION" },
    baseAttendee,
    baseAttendee,
  ]);

  await TestUtils.waitForCondition(
    () => summary.textContent === "2 attending, 1 maybe, 2 declined, 3 pending",
    "Should show correct summary"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(summary),
    "Summary should be visible with more than 3 attendees"
  );

  attendeesRowElement.setAttendees([baseAttendee]);

  Assert.ok(
    BrowserTestUtils.isHidden(summary),
    "Summary should be hidden with 3 attendees or less"
  );
});

add_task(async function testCalendarDialogAttendeesList() {
  const list = attendeesRowElement.querySelector(".attendees-list");

  attendeesRowElement.setAttendees([
    { ...baseAttendee, participationStatus: "DECLINED", commonName: "one" },
    { ...baseAttendee, participationStatus: "DECLINED", commonName: "two" },
    { ...baseAttendee, commonName: "three" },
  ]);

  await TestUtils.waitForCondition(
    () => list.querySelectorAll("li").length === 3,
    "Should show 3 attendee items"
  );

  const items = list.querySelectorAll("li");

  Assert.equal(
    items.length,
    3,
    "Should show the correct number of attende items"
  );
  Assert.equal(
    items[0].querySelector(".attendee-name").textContent,
    "one",
    "First item should show correct data"
  );
  Assert.equal(
    items[1].querySelector(".attendee-name").textContent,
    "two",
    "Second item should show correct data"
  );
  Assert.equal(
    items[2].querySelector(".attendee-name").textContent,
    "three",
    "Third item should show correct data"
  );
});

add_task(async function testCalendarDialogAttendeesFullList() {
  const list = attendeesRowElementFull.querySelector(".attendees-list");
  attendeesRowElementFull.setAttribute("type", "full");

  attendeesRowElementFull.setAttendees([
    { ...baseAttendee, participationStatus: "DECLINED" },
    { ...baseAttendee, participationStatus: "DECLINED" },
    { ...baseAttendee, participationStatus: "TENTATIVE" },
    { ...baseAttendee, participationStatus: "NEEDS-ACTION" },
    { ...baseAttendee, participationStatus: "NEEDS-ACTION" },
    { ...baseAttendee, participationStatus: "NEEDS-ACTION" },
    baseAttendee,
    baseAttendee,
  ]);

  Assert.equal(
    list.querySelectorAll("li").length,
    8,
    "Should show 8 attendee items"
  );
});

add_task(async function testCalendarDialogAttendeesOverFullList() {
  const summary = attendeesRowElementFull.querySelector(".attendees-summary");
  const list = attendeesRowElementFull.querySelector(".attendees-list");
  attendeesRowElementFull.setAttribute("type", "full");

  const attendees = [];
  for (let i = 0; i < 60; i++) {
    attendees.push(baseAttendee);
  }

  attendeesRowElementFull.setAttendees(attendees);

  Assert.equal(
    document.l10n.getAttributes(summary).id,
    "calendar-dialog-attendees-too-many-guests",
    "Should show too many guests error"
  );

  Assert.ok(BrowserTestUtils.isHidden(list), "List should be hidden");
  Assert.ok(BrowserTestUtils.isVisible(summary), "Summary should be visible");
});
