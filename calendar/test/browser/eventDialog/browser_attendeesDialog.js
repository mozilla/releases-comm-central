/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals createEventWithDialog, openAttendeesWindow, closeAttendeesWindow */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

add_task(async () => {
  const calendar = CalendarTestUtils.createCalendar("Mochitest", "memory");
  calendar.name = "Mochitest";
  calendar.setProperty("organizerId", "mailto:mochitest@example.com");

  cal.freeBusyService.addProvider(freeBusyProvider);

  const book = MailServices.ab.getDirectoryFromId(
    MailServices.ab.newAddressBook("Mochitest", null, 101)
  );
  const contacts = {};
  for (const name of ["Charlie", "Juliet", "Mike", "Oscar", "Romeo", "Victor"]) {
    const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
    card.firstName = name;
    card.lastName = "Mochitest";
    card.displayName = `${name} Mochitest`;
    card.primaryEmail = `${name.toLowerCase()}@example.com`;
    contacts[name.toUpperCase()] = book.addCard(card);
  }
  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(Ci.nsIAbDirectory);
  list.isMailList = true;
  list.dirName = "The Boys";
  list = book.addMailList(list);
  list.addCard(contacts.MIKE);
  list.addCard(contacts.OSCAR);
  list.addCard(contacts.ROMEO);
  list.addCard(contacts.VICTOR);

  const today = new Date();
  const times = {
    ONE: new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 13, 0, 0)
    ),
    TWO_THIRTY: new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 14, 30, 0)
    ),
    THREE_THIRTY: new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 15, 30, 0)
    ),
    FOUR: new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 16, 0, 0)
    ),
  };

  registerCleanupFunction(async () => {
    CalendarTestUtils.removeCalendar(calendar);
    cal.freeBusyService.removeProvider(freeBusyProvider);
    MailServices.ab.deleteAddressBook(book.URI);
  });

  const eventWindow = await openEventWindow(calendar);
  const eventDocument = eventWindow.document;
  const iframeDocument = eventDocument.getElementById("calendar-item-panel-iframe").contentDocument;

  const eventStartTime = iframeDocument.getElementById("event-starttime");
  eventStartTime.value = times.ONE;
  const eventEndTime = iframeDocument.getElementById("event-endtime");
  eventEndTime.value = times.THREE_THIRTY;

  async function checkAttendeesInAttendeesDialog(attendeesDocument, expectedAttendees) {
    const attendeesList = attendeesDocument.getElementById("attendee-list");
    await TestUtils.waitForCondition(
      () => attendeesList.childElementCount == expectedAttendees.length + 1,
      "empty attendee input should have been added"
    );

    function getInputValueFromAttendeeRow(row) {
      const input = row.querySelector("input");
      return input.value;
    }

    Assert.deepEqual(
      Array.from(attendeesList.children, getInputValueFromAttendeeRow),
      [...expectedAttendees, ""],
      "attendees list matches what was expected"
    );
    Assert.equal(
      attendeesDocument.activeElement,
      attendeesList.children[expectedAttendees.length].querySelector("input"),
      "empty attendee input should have focus"
    );
  }

  async function checkFreeBusy(row, count) {
    Assert.equal(row._freeBusyDiv.querySelectorAll(".pending").length, 1);
    Assert.equal(row._freeBusyDiv.querySelectorAll(".busy").length, 0);
    const responsePromise = BrowserTestUtils.waitForEvent(row, "freebusy-update-finished");
    freeBusyProvider.sendNextResponse();
    await responsePromise;
    Assert.equal(row._freeBusyDiv.querySelectorAll(".pending").length, 0);
    Assert.equal(row._freeBusyDiv.querySelectorAll(".busy").length, count);
  }

  {
    info("Opening for the first time");
    const attendeesWindow = await openAttendeesWindow(eventWindow);
    const attendeesDocument = attendeesWindow.document;
    const attendeesList = attendeesDocument.getElementById("attendee-list");

    Assert.equal(attendeesWindow.arguments[0].calendar, calendar);
    Assert.equal(attendeesWindow.arguments[0].organizer, null);
    Assert.equal(calendar.getProperty("organizerId"), "mailto:mochitest@example.com");
    Assert.deepEqual(attendeesWindow.arguments[0].attendees, []);

    await new Promise(resolve => attendeesWindow.setTimeout(resolve));

    const attendeesStartTime = attendeesDocument.getElementById("event-starttime");
    const attendeesEndTime = attendeesDocument.getElementById("event-endtime");
    Assert.equal(attendeesStartTime.value.toISOString(), times.ONE.toISOString());
    Assert.equal(attendeesEndTime.value.toISOString(), times.THREE_THIRTY.toISOString());

    attendeesStartTime.value = times.TWO_THIRTY;
    attendeesEndTime.value = times.FOUR;

    // Check free/busy of organizer.

    await checkAttendeesInAttendeesDialog(attendeesDocument, ["mochitest@example.com"]);

    const organizer = attendeesList.firstElementChild;
    await checkFreeBusy(organizer, 5);

    // Add attendee.

    EventUtils.sendString("test@example.com", attendeesWindow);
    EventUtils.synthesizeKey("VK_TAB", {}, attendeesWindow);

    await checkAttendeesInAttendeesDialog(attendeesDocument, [
      "mochitest@example.com",
      "test@example.com",
    ]);
    await checkFreeBusy(attendeesList.children[1], 0);

    // Add another attendee, from the address book.

    let input = attendeesDocument.activeElement;
    EventUtils.sendString("julie", attendeesWindow);
    await new Promise(resolve => attendeesWindow.setTimeout(resolve, 1000));
    Assert.equal(input.value, "juliet Mochitest <juliet@example.com>");
    Assert.ok(input.popupElement.popupOpen);
    Assert.equal(input.popupElement.richlistbox.childElementCount, 1);
    Assert.equal(input.popupElement._currentIndex, 1);
    EventUtils.synthesizeKey("VK_DOWN", {}, attendeesWindow);
    Assert.equal(input.popupElement._currentIndex, 1);
    EventUtils.synthesizeKey("VK_TAB", {}, attendeesWindow);

    await checkAttendeesInAttendeesDialog(attendeesDocument, [
      "mochitest@example.com",
      "test@example.com",
      "Juliet Mochitest <juliet@example.com>",
    ]);
    await checkFreeBusy(attendeesList.children[2], 1);

    // Add a mailing list which should expand.

    input = attendeesDocument.activeElement;
    EventUtils.sendString("boys", attendeesWindow);
    await new Promise(resolve => attendeesWindow.setTimeout(resolve, 1000));
    Assert.equal(input.value, "boys >> The Boys <The Boys>");
    Assert.ok(input.popupElement.popupOpen);
    Assert.equal(input.popupElement.richlistbox.childElementCount, 1);
    Assert.equal(input.popupElement._currentIndex, 1);
    EventUtils.synthesizeKey("VK_DOWN", {}, attendeesWindow);
    Assert.equal(input.popupElement._currentIndex, 1);
    EventUtils.synthesizeKey("VK_TAB", {}, attendeesWindow);

    await checkAttendeesInAttendeesDialog(attendeesDocument, [
      "mochitest@example.com",
      "test@example.com",
      "Juliet Mochitest <juliet@example.com>",
      "Mike Mochitest <mike@example.com>",
      "Oscar Mochitest <oscar@example.com>",
      "Romeo Mochitest <romeo@example.com>",
      "Victor Mochitest <victor@example.com>",
    ]);
    await checkFreeBusy(attendeesList.children[3], 0);
    await checkFreeBusy(attendeesList.children[4], 0);
    await checkFreeBusy(attendeesList.children[5], 1);
    await checkFreeBusy(attendeesList.children[6], 0);

    await closeAttendeesWindow(attendeesWindow);
    await new Promise(resolve => eventWindow.setTimeout(resolve));
  }

  Assert.equal(eventStartTime.value.toISOString(), times.TWO_THIRTY.toISOString());
  Assert.equal(eventEndTime.value.toISOString(), times.FOUR.toISOString());

  function checkAttendeesInEventDialog(organizer, expectedAttendees) {
    Assert.equal(iframeDocument.getElementById("item-organizer-row").textContent, organizer);

    const attendeeItems = iframeDocument.querySelectorAll(".attendee-list .attendee-label");
    Assert.equal(attendeeItems.length, expectedAttendees.length);
    for (let i = 0; i < expectedAttendees.length; i++) {
      Assert.equal(attendeeItems[i].getAttribute("attendeeid"), expectedAttendees[i]);
    }
  }

  checkAttendeesInEventDialog("mochitest@example.com", [
    "mailto:mochitest@example.com",
    "mailto:test@example.com",
    "mailto:juliet@example.com",
    "mailto:mike@example.com",
    "mailto:oscar@example.com",
    "mailto:romeo@example.com",
    "mailto:victor@example.com",
  ]);

  {
    info("Opening for a second time");
    const attendeesWindow = await openAttendeesWindow(eventWindow);
    const attendeesDocument = attendeesWindow.document;
    const attendeesList = attendeesDocument.getElementById("attendee-list");

    const attendeesStartTime = attendeesDocument.getElementById("event-starttime");
    const attendeesEndTime = attendeesDocument.getElementById("event-endtime");
    Assert.equal(attendeesStartTime.value.toISOString(), times.TWO_THIRTY.toISOString());
    Assert.equal(attendeesEndTime.value.toISOString(), times.FOUR.toISOString());

    await checkAttendeesInAttendeesDialog(attendeesDocument, [
      "mochitest@example.com",
      "test@example.com",
      "Juliet Mochitest <juliet@example.com>",
      "Mike Mochitest <mike@example.com>",
      "Oscar Mochitest <oscar@example.com>",
      "Romeo Mochitest <romeo@example.com>",
      "Victor Mochitest <victor@example.com>",
    ]);

    await checkFreeBusy(attendeesList.children[0], 5);
    await checkFreeBusy(attendeesList.children[1], 0);
    await checkFreeBusy(attendeesList.children[2], 1);
    await checkFreeBusy(attendeesList.children[3], 0);
    await checkFreeBusy(attendeesList.children[4], 0);
    await checkFreeBusy(attendeesList.children[5], 1);
    await checkFreeBusy(attendeesList.children[6], 0);

    await closeAttendeesWindow(attendeesWindow);
    await new Promise(resolve => eventWindow.setTimeout(resolve));
  }

  Assert.equal(eventStartTime.value.toISOString(), times.TWO_THIRTY.toISOString());
  Assert.equal(eventEndTime.value.toISOString(), times.FOUR.toISOString());

  checkAttendeesInEventDialog("mochitest@example.com", [
    "mailto:mochitest@example.com",
    "mailto:test@example.com",
    "mailto:juliet@example.com",
    "mailto:mike@example.com",
    "mailto:oscar@example.com",
    "mailto:romeo@example.com",
    "mailto:victor@example.com",
  ]);

  iframeDocument.getElementById("notify-attendees-checkbox").checked = false;
  await closeEventWindow(eventWindow);
});

add_task(async () => {
  const calendar = CalendarTestUtils.createCalendar("Mochitest", "memory");
  calendar.setProperty("organizerId", "mailto:mochitest@example.com");

  registerCleanupFunction(async () => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  const defaults = {
    displayTimezone: true,
    attendees: [],
    organizer: null,
    calendar,
    onOk: () => {},
  };

  async function testDays(startTime, endTime, expectedFirst, expectedLast) {
    const attendeesWindow = await openAttendeesWindow({ ...defaults, startTime, endTime });
    const attendeesDocument = attendeesWindow.document;

    const days = attendeesDocument.querySelectorAll("calendar-day");
    Assert.equal(days.length, 16);
    Assert.equal(days[0].date.icalString, expectedFirst);
    Assert.equal(days[15].date.icalString, expectedLast);

    await closeAttendeesWindow(attendeesWindow);
  }

  // With the management of the reduced days or not, the format of the dates is different according to the cases.
  // In case of a reduced day, the day format will include the start hour of the day (defined by calendar.view.daystarthour).
  // In the case of a full day, we keep the behavior similar to before.

  //Full day tests
  await testDays(
    cal.createDateTime("20100403T020000"),
    cal.createDateTime("20100403T030000"),
    "20100403",
    "20100418"
  );
  for (let i = -2; i < 0; i++) {
    await testDays(
      fromToday({ days: i, hours: 2 }),
      fromToday({ days: i, hours: 3 }),
      fromToday({ days: i }).icalString.substring(0, 8),
      fromToday({ days: i + 15 }).icalString.substring(0, 8)
    );
  }
  for (let i = 0; i < 3; i++) {
    await testDays(
      fromToday({ days: i, hours: 2 }),
      fromToday({ days: i, hours: 3 }),
      fromToday({ days: 0 }).icalString.substring(0, 8),
      fromToday({ days: 15 }).icalString.substring(0, 8)
    );
  }
  for (let i = 3; i < 5; i++) {
    await testDays(
      fromToday({ days: i, hours: 2 }),
      fromToday({ days: i, hours: 3 }),
      fromToday({ days: i - 2 }).icalString.substring(0, 8),
      fromToday({ days: i + 13 }).icalString.substring(0, 8)
    );
  }
  await testDays(
    cal.createDateTime("20300403T020000"),
    cal.createDateTime("20300403T030000"),
    "20300401",
    "20300416"
  );

  // Reduced day tests
  let dayStartHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8).toString();
  if (dayStartHour.length == 1) {
    dayStartHour = "0" + dayStartHour;
  }

  await testDays(
    cal.createDateTime("20100403T120000"),
    cal.createDateTime("20100403T130000"),
    "20100403T" + dayStartHour + "0000Z",
    "20100418T" + dayStartHour + "0000Z"
  );
  for (let i = -2; i < 0; i++) {
    await testDays(
      fromToday({ days: i, hours: 12 }),
      fromToday({ days: i, hours: 13 }),
      fromToday({ days: i }).icalString.substring(0, 8) + "T" + dayStartHour + "0000Z",
      fromToday({ days: i + 15 }).icalString.substring(0, 8) + "T" + dayStartHour + "0000Z"
    );
  }
  for (let i = 0; i < 3; i++) {
    await testDays(
      fromToday({ days: i, hours: 12 }),
      fromToday({ days: i, hours: 13 }),
      fromToday({ days: 0 }).icalString.substring(0, 8) + "T" + dayStartHour + "0000Z",
      fromToday({ days: 15 }).icalString.substring(0, 8) + "T" + dayStartHour + "0000Z"
    );
  }
  for (let i = 3; i < 5; i++) {
    await testDays(
      fromToday({ days: i, hours: 12 }),
      fromToday({ days: i, hours: 13 }),
      fromToday({ days: i - 2 }).icalString.substring(0, 8) + "T" + dayStartHour + "0000Z",
      fromToday({ days: i + 13 }).icalString.substring(0, 8) + "T" + dayStartHour + "0000Z"
    );
  }
  await testDays(
    cal.createDateTime("20300403T120000"),
    cal.createDateTime("20300403T130000"),
    "20300401T" + dayStartHour + "0000Z",
    "20300416T" + dayStartHour + "0000Z"
  );
});

function openEventWindow(calendar) {
  const eventWindowPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");

    const doc = win.document;
    if (doc.documentURI == "chrome://calendar/content/calendar-event-dialog.xhtml") {
      const iframe = doc.getElementById("calendar-item-panel-iframe");
      await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");
      return true;
    }
    return false;
  });
  createEventWithDialog(calendar, null, null, "Event");
  return eventWindowPromise;
}

async function closeEventWindow(eventWindow) {
  const eventWindowPromise = BrowserTestUtils.domWindowClosed(eventWindow);
  eventWindow.document.getElementById("button-saveandclose").click();
  await eventWindowPromise;
  await new Promise(resolve => setTimeout(resolve));
}

function fromToday({ days = 0, hours = 0 }) {
  if (!fromToday.today) {
    fromToday.today = cal.dtz.now();
    fromToday.today.hour = fromToday.today.minute = fromToday.today.second = 0;
  }

  const duration = cal.createDuration();
  duration.days = days;
  duration.hours = hours;

  const value = fromToday.today.clone();
  value.addDuration(duration);
  return value;
}

var freeBusyProvider = {
  pendingRequests: [],
  sendNextResponse() {
    const next = this.pendingRequests.shift();
    if (next) {
      next();
    }
  },
  getFreeBusyIntervals(aCalId, aStart, aEnd, aTypes, aListener) {
    this.pendingRequests.push(() => {
      info(`Sending free/busy response for ${aCalId}`);
      if (aCalId in this.data) {
        aListener.onResult(
          null,
          this.data[aCalId].map(([startDuration, duration]) => {
            const start = fromToday(startDuration);

            const end = start.clone();
            end.addDuration(cal.createDuration(duration));

            return new cal.provider.FreeBusyInterval(
              aCalId,
              Ci.calIFreeBusyInterval.BUSY,
              start,
              end
            );
          })
        );
      } else {
        aListener.onResult(null, []);
      }
    });
  },
  data: {
    "mailto:mochitest@example.com": [
      [{ days: 1, hours: 4 }, "PT3H"],
      [{ days: 1, hours: 8 }, "PT3H"],
      [{ days: 1, hours: 12 }, "PT3H"],
      [{ days: 1, hours: 16 }, "PT3H"],
      [{ days: 2, hours: 4 }, "PT3H"],
    ],
    "mailto:juliet@example.com": [["P1DT9H", "PT8H"]],
    "mailto:romeo@example.com": [["P1DT14H", "PT5H"]],
  },
};
