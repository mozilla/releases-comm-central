/* globals createEventWithDialog */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

add_task(async () => {
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  calendar.name = "Mochitest";
  calendar.setProperty("organizerId", "mailto:mochitest@invalid");
  manager.registerCalendar(calendar);

  let freeBusyService = cal.getFreeBusyService();
  freeBusyService.addProvider(freeBusyProvider);

  let book = MailServices.ab.getDirectoryFromId(
    MailServices.ab.newAddressBook("Mochitest", null, 101)
  );
  let contacts = {};
  for (let name of ["Charlie", "Juliet", "Mike", "Oscar", "Romeo", "Victor"]) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
    card.firstName = name;
    card.lastName = "Mochitest";
    card.displayName = `${name} Mochitest`;
    card.primaryEmail = `${name.toLowerCase()}@invalid`;
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

  let today = new Date();
  let times = {
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
    manager.unregisterCalendar(calendar);
    freeBusyService.removeProvider(freeBusyProvider);
    MailServices.ab.deleteAddressBook(book.URI);
  });

  let eventWindow = await openEventWindow(calendar);
  let eventDocument = eventWindow.document;
  let iframeDocument = eventDocument.getElementById("calendar-item-panel-iframe").contentDocument;

  let eventStartTime = iframeDocument.getElementById("event-starttime");
  eventStartTime.value = times.ONE;
  let eventEndTime = iframeDocument.getElementById("event-endtime");
  eventEndTime.value = times.THREE_THIRTY;

  async function checkListOfAttendees(attendeesDocument, ...expected) {
    let attendeesList = attendeesDocument.getElementById("attendee-list");
    await TestUtils.waitForCondition(
      () => attendeesList.childElementCount == expected.length + 1,
      "empty attendee input should have been added"
    );
    Assert.deepEqual(
      Array.from(attendeesList.children, c => c.input.value),
      [...expected, ""],
      "attendees list matches what was expected"
    );
    Assert.equal(
      attendeesDocument.activeElement,
      attendeesList.children[expected.length].input,
      "empty attendee input should have focus"
    );
  }

  async function checkFreeBusy(row, count) {
    Assert.equal(row.freeBusyDiv.querySelectorAll(".pending").length, 1);
    Assert.equal(row.freeBusyDiv.querySelectorAll(".busy").length, 0);
    let responsePromise = BrowserTestUtils.waitForEvent(row, "freebusy-update-finished");
    freeBusyProvider.sendNextResponse();
    await responsePromise;
    Assert.equal(row.freeBusyDiv.querySelectorAll(".pending").length, 0);
    Assert.equal(row.freeBusyDiv.querySelectorAll(".busy").length, count);
  }

  {
    info("Opening for the first time");
    let attendeesWindow = await openAttendeesWindow(eventWindow);
    let attendeesDocument = attendeesWindow.document;
    let attendeesList = attendeesDocument.getElementById("attendee-list");

    Assert.equal(attendeesWindow.arguments[0].calendar, calendar);
    Assert.equal(attendeesWindow.arguments[0].organizer, null);
    Assert.equal(calendar.getProperty("organizerId"), "mailto:mochitest@invalid");
    Assert.deepEqual(attendeesWindow.arguments[0].attendees, []);

    await new Promise(resolve => attendeesWindow.setTimeout(resolve));

    let attendeesStartTime = attendeesDocument.getElementById("event-starttime");
    let attendeesEndTime = attendeesDocument.getElementById("event-endtime");
    Assert.equal(attendeesStartTime.value.toISOString(), times.ONE.toISOString());
    Assert.equal(attendeesEndTime.value.toISOString(), times.THREE_THIRTY.toISOString());

    attendeesStartTime.value = times.TWO_THIRTY;
    attendeesEndTime.value = times.FOUR;

    // Check free/busy of organizer.

    await checkListOfAttendees(attendeesDocument, "mochitest@invalid");

    let organizer = attendeesList.firstElementChild;
    await checkFreeBusy(organizer, 5);

    // Add attendee.

    let input = attendeesDocument.activeElement;
    let attendee = input.closest("event-attendee");
    EventUtils.sendString("test@invalid", attendeesWindow);
    EventUtils.synthesizeKey("VK_TAB", {}, attendeesWindow);

    await checkListOfAttendees(attendeesDocument, "mochitest@invalid", "test@invalid");
    await checkFreeBusy(attendee, 0);

    // Add another attendee, from the address book.

    input = attendeesDocument.activeElement;
    attendee = input.closest("event-attendee");
    EventUtils.sendString("julie", attendeesWindow);
    await new Promise(resolve => attendeesWindow.setTimeout(resolve, 1000));
    Assert.equal(input.value, "juliet Mochitest <juliet@invalid>");
    Assert.ok(input.popupElement.popupOpen);
    Assert.equal(input.popupElement.richlistbox.childElementCount, 1);
    Assert.equal(input.popupElement._currentIndex, 1);
    EventUtils.synthesizeKey("VK_DOWN", {}, attendeesWindow);
    Assert.equal(input.popupElement._currentIndex, 1);
    EventUtils.synthesizeKey("VK_TAB", {}, attendeesWindow);

    await checkListOfAttendees(
      attendeesDocument,
      "mochitest@invalid",
      "test@invalid",
      "Juliet Mochitest <juliet@invalid>"
    );
    await checkFreeBusy(attendee, 1);

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

    await checkListOfAttendees(
      attendeesDocument,
      "mochitest@invalid",
      "test@invalid",
      "Juliet Mochitest <juliet@invalid>",
      "Mike Mochitest <mike@invalid>",
      "Oscar Mochitest <oscar@invalid>",
      "Romeo Mochitest <romeo@invalid>",
      "Victor Mochitest <victor@invalid>"
    );
    await checkFreeBusy(attendeesList.children[3], 0);
    await checkFreeBusy(attendeesList.children[4], 0);
    await checkFreeBusy(attendeesList.children[5], 1);
    await checkFreeBusy(attendeesList.children[6], 0);

    await closeAttendeesWindow(attendeesWindow);
    await new Promise(resolve => eventWindow.setTimeout(resolve));
  }

  Assert.equal(eventStartTime.value.toISOString(), times.TWO_THIRTY.toISOString());
  Assert.equal(eventEndTime.value.toISOString(), times.FOUR.toISOString());

  function checkAttendeeCells(organizer, ...expected) {
    Assert.equal(iframeDocument.getElementById("item-organizer-row").textContent, organizer);

    let attendeeItems = iframeDocument.querySelectorAll(".attendee-list .attendee-label");
    Assert.equal(attendeeItems.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      Assert.equal(attendeeItems[i].getAttribute("attendeeid"), expected[i]);
    }
  }

  checkAttendeeCells(
    "mochitest@invalid",
    "mailto:test@invalid",
    "mailto:juliet@invalid",
    "mailto:mike@invalid",
    "mailto:oscar@invalid",
    "mailto:romeo@invalid",
    "mailto:victor@invalid"
  );

  {
    info("Opening for a second time");
    let attendeesWindow = await openAttendeesWindow(eventWindow);
    let attendeesDocument = attendeesWindow.document;
    let attendeesList = attendeesDocument.getElementById("attendee-list");

    let attendeesStartTime = attendeesDocument.getElementById("event-starttime");
    let attendeesEndTime = attendeesDocument.getElementById("event-endtime");
    Assert.equal(attendeesStartTime.value.toISOString(), times.TWO_THIRTY.toISOString());
    Assert.equal(attendeesEndTime.value.toISOString(), times.FOUR.toISOString());

    await checkListOfAttendees(
      attendeesDocument,
      "mochitest@invalid",
      "test@invalid",
      "Juliet Mochitest <juliet@invalid>",
      "Mike Mochitest <mike@invalid>",
      "Oscar Mochitest <oscar@invalid>",
      "Romeo Mochitest <romeo@invalid>",
      "Victor Mochitest <victor@invalid>"
    );

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

  checkAttendeeCells(
    "mochitest@invalid",
    "mailto:test@invalid",
    "mailto:juliet@invalid",
    "mailto:mike@invalid",
    "mailto:oscar@invalid",
    "mailto:romeo@invalid",
    "mailto:victor@invalid"
  );

  iframeDocument.getElementById("notify-attendees-checkbox").checked = false;
  await closeEventWindow(eventWindow);
});

add_task(async () => {
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  calendar.name = "Mochitest";
  calendar.setProperty("organizerId", "mailto:mochitest@invalid");
  manager.registerCalendar(calendar);

  registerCleanupFunction(async () => {
    manager.unregisterCalendar(calendar);
  });

  let defaults = {
    displayTimezone: true,
    attendees: [],
    organizer: null,
    calendar,
    onOk: () => {},
  };

  async function testDays(startTime, endTime, expectedFirst, expectedLast) {
    let attendeesWindow = await openAttendeesWindow({ ...defaults, startTime, endTime });
    let attendeesDocument = attendeesWindow.document;

    let days = attendeesDocument.querySelectorAll("calendar-day");
    Assert.equal(days.length, 5);
    Assert.equal(days[0].date.icalString, expectedFirst);
    Assert.equal(days[4].date.icalString, expectedLast);

    await closeAttendeesWindow(attendeesWindow);
  }

  await testDays(
    cal.createDateTime("20100403T120000"),
    cal.createDateTime("20100403T130000"),
    "20100403",
    "20100407"
  );
  for (let i = -2; i < 0; i++) {
    await testDays(
      fromToday({ days: i, hours: 12 }),
      fromToday({ days: i, hours: 13 }),
      fromToday({ days: i }).icalString.substring(0, 8),
      fromToday({ days: i + 4 }).icalString.substring(0, 8)
    );
  }
  for (let i = 0; i < 3; i++) {
    await testDays(
      fromToday({ days: i, hours: 12 }),
      fromToday({ days: i, hours: 13 }),
      fromToday({ days: 0 }).icalString.substring(0, 8),
      fromToday({ days: 4 }).icalString.substring(0, 8)
    );
  }
  for (let i = 3; i < 5; i++) {
    await testDays(
      fromToday({ days: i, hours: 12 }),
      fromToday({ days: i, hours: 13 }),
      fromToday({ days: i - 2 }).icalString.substring(0, 8),
      fromToday({ days: i + 2 }).icalString.substring(0, 8)
    );
  }
  await testDays(
    cal.createDateTime("20300403T120000"),
    cal.createDateTime("20300403T130000"),
    "20300401",
    "20300405"
  );
});

function openEventWindow(calendar) {
  let eventWindowPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");

    let doc = win.document;
    if (doc.documentURI == "chrome://calendar/content/calendar-event-dialog.xhtml") {
      let iframe = doc.getElementById("calendar-item-panel-iframe");
      await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");
      return true;
    }
    return false;
  });
  createEventWithDialog(calendar, null, null, "Event");
  return eventWindowPromise;
}

async function closeEventWindow(eventWindow) {
  let eventWindowPromise = BrowserTestUtils.domWindowClosed(eventWindow);
  eventWindow.document.getElementById("button-saveandclose").click();
  await eventWindowPromise;
  await new Promise(resolve => setTimeout(resolve));
}

function openAttendeesWindow(eventWindowOrArgs) {
  let attendeesWindowPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    "chrome://calendar/content/calendar-event-dialog-attendees.xhtml",
    {
      async callback(win) {
        await new Promise(resolve => win.setTimeout(resolve));
      },
    }
  );

  if (eventWindowOrArgs instanceof Window) {
    EventUtils.synthesizeMouseAtCenter(
      eventWindowOrArgs.document.getElementById("button-attendees"),
      {},
      eventWindowOrArgs
    );
  } else {
    openDialog(
      "chrome://calendar/content/calendar-event-dialog-attendees.xhtml",
      "_blank",
      "chrome,titlebar,resizable",
      eventWindowOrArgs
    );
  }
  return attendeesWindowPromise;
}

function closeAttendeesWindow(attendeesWindow, buttonAction = "accept") {
  let closedPromise = BrowserTestUtils.domWindowClosed(attendeesWindow);
  let dialog = attendeesWindow.document.querySelector("dialog");
  dialog.getButton(buttonAction).click();
  return closedPromise;
}

function fromToday({ days = 0, hours = 0 }) {
  if (!fromToday.today) {
    fromToday.today = cal.dtz.now();
    fromToday.today.hour = fromToday.today.minute = fromToday.today.second = 0;
  }

  let duration = cal.createDuration();
  duration.days = days;
  duration.hours = hours;

  let value = fromToday.today.clone();
  value.addDuration(duration);
  return value;
}

var freeBusyProvider = {
  pendingRequests: [],
  sendNextResponse() {
    let next = this.pendingRequests.shift();
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
            let start = fromToday(startDuration);

            let end = start.clone();
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
    "mailto:mochitest@invalid": [
      [{ days: 1, hours: 4 }, "PT3H"],
      [{ days: 1, hours: 8 }, "PT3H"],
      [{ days: 1, hours: 12 }, "PT3H"],
      [{ days: 1, hours: 16 }, "PT3H"],
      [{ days: 2, hours: 4 }, "PT3H"],
    ],
    "mailto:juliet@invalid": [["P1DT9H", "PT8H"]],
    "mailto:romeo@invalid": [["P1DT14H", "PT5H"]],
  },
};
