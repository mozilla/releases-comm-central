/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let attendeeElement;
const baseAttendee = {
  commonName: "",
  id: "mailto:john@example.com",
  role: "REQ-PARTICIPANT",
  participationStatus: "ACCEPTED",
  isOrganizer: false,
};

function setAttendee(data) {
  attendeeElement.setAttendee({ ...baseAttendee, ...data });
}

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogAttendee.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialogAttendee.xhtml")
  );
  tab.browser.focus();
  attendeeElement = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-attendee"
  );
});

add_task(async function test_calendarDialogAttendeeName() {
  const commonName = "John Doe";
  const nameElement = attendeeElement.querySelector(".attendee-name");
  setAttendee({ commonName });

  Assert.equal(
    attendeeElement.querySelector(".attendee-name").textContent,
    commonName,
    "Should show name when provided"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(nameElement),
    "Attendee name is visible"
  );

  setAttendee({ commonName: "" });

  Assert.ok(
    BrowserTestUtils.isHidden(nameElement),
    "Attendee name should be hidden when not provided"
  );

  setAttendee({
    commonName: "john@example.com",
    id: "mailto:john@example.com",
  });

  Assert.ok(
    BrowserTestUtils.isHidden(nameElement),
    "Attendee name should be hidden when it is the email address"
  );

  setAttendee({});
});

add_task(async function test_calendarDailogAttendeeEmail() {
  setAttendee({ id: "mailto:john@example.com" });

  Assert.equal(
    attendeeElement.querySelector(".attendee-email").textContent,
    "john@example.com",
    "Should correctly parse out email address"
  );

  setAttendee({});
});

add_task(async function test_calendarDialogAttendeeLabel() {
  setAttendee({ isOrganizer: false, role: "REQ-PARTICIPANT" });

  const labelElement = attendeeElement.querySelector(".attendee-label");

  Assert.equal(
    labelElement.textContent,
    "",
    "Does not show label if not optional or organizer"
  );

  setAttendee({ isOrganizer: false, role: "OPT-PARTICIPANT" });

  Assert.equal(
    labelElement.getAttribute("data-l10n-id"),
    "calendar-dialog-attendee-optional",
    "Should show optional label if optional participent and not organizer"
  );

  setAttendee({ isOrganizer: true, role: "REQ-PARTICIPANT" });

  Assert.equal(
    labelElement.getAttribute("data-l10n-id"),
    "calendar-dialog-attendee-organizer",
    "Should show organizer label if required participent and organizer"
  );

  setAttendee({ isOrganizer: true, role: "OPT-PARTICIPANT" });

  Assert.equal(
    labelElement.getAttribute("data-l10n-id"),
    "calendar-dialog-attendee-organizer",
    "Should show organizer label if required participent and organizer"
  );

  setAttendee({});
});

add_task(async function test_calendarDialogAttendeeIcon() {
  const iconElement = attendeeElement.querySelector("img");

  setAttendee({ participationStatus: "ACCEPTED" });

  Assert.ok(
    iconElement.classList.contains("attending"),
    "Should show attending icon"
  );

  setAttendee({ participationStatus: "TENTATIVE" });

  Assert.ok(iconElement.classList.contains("maybe"), "Should show maybe icon");

  setAttendee({ participationStatus: "DECLINED" });

  Assert.ok(
    iconElement.classList.contains("declined"),
    "Should show declined icon"
  );

  setAttendee({ participationStatus: "NEEDS-ACTION" });

  Assert.ok(iconElement.classList.contains("maybe"), "Should show maybe icon");
});
