/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { cancelItemDialog, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { data, newlines } = setupData();

var { dayView } = CalendarTestUtils;

// Test that closing an event dialog with no changes does not prompt for save.
add_task(async function testEventDialogModificationPrompt() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 1);

  let createbox = dayView.getHourBoxAt(controller.window, 8);

  // Create new event.
  await invokeNewEventDialog(window, createbox, async (eventWindow, iframeWindow) => {
    let categories = cal.l10n.getAnyString("calendar", "categories", "categories2").split(",");
    data[0].categories.push(categories[0]);
    data[1].categories.push(categories[1], categories[2]);

    // Enter first set of data.
    await setData(eventWindow, iframeWindow, data[0]);
    await saveAndCloseItemDialog(eventWindow);
  });
  let eventbox = await dayView.waitForEventBoxAt(controller.window, 1);

  // Open, but change nothing.
  await invokeEditingEventDialog(window, eventbox, (eventWindow, iframeWindow) => {
    // Escape the event window, there should be no prompt to save event.
    cancelItemDialog(eventWindow);
    // Wait to see if the prompt appears.
    controller.sleep(2000);
  });

  eventbox = await dayView.waitForEventBoxAt(controller.window, 1);
  // Open, change all values then revert the changes.
  await invokeEditingEventDialog(window, eventbox, async (eventWindow, iframeWindow) => {
    // Change all values.
    await setData(eventWindow, iframeWindow, data[1]);

    // Edit all values back to original.
    await setData(eventWindow, iframeWindow, data[0]);

    // Escape the event window, there should be no prompt to save event.
    cancelItemDialog(eventWindow);
    // Wait to see if the prompt appears.
    controller.sleep(2000);
  });

  // Delete event.
  controller.window.document.getElementById("day-view").focus();
  if (controller.window.currentView().getSelectedItems().length == 0) {
    controller.click(eventbox);
  }
  Assert.equal(eventbox.isEditing, false, "event is not being edited");
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  await dayView.waitForNoEventBoxAt(controller.window, 1);

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testDescriptionWhitespace() {
  for (let i = 0; i < newlines.length; i++) {
    // test set i
    let createbox = dayView.getHourBoxAt(controller.window, 8);
    await invokeNewEventDialog(window, createbox, async (eventWindow, iframeWindow) => {
      await setData(eventWindow, iframeWindow, newlines[i]);
      await saveAndCloseItemDialog(eventWindow);
    });

    let eventbox = await dayView.waitForEventBoxAt(controller.window, 1);

    // Open and close.
    await invokeEditingEventDialog(window, eventbox, async (eventWindow, iframeWindow) => {
      await setData(eventWindow, iframeWindow, newlines[i]);
      cancelItemDialog(eventWindow);
      // Wait to see if the prompt appears.
      controller.sleep(2000);
    });

    // Delete it.
    controller.window.document.getElementById("day-view").focus();
    if (controller.window.currentView().getSelectedItems().length == 0) {
      controller.click(eventbox);
    }
    Assert.equal(eventbox.isEditing, false, "event is not being edited");
    EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
    await dayView.waitForNoEventBoxAt(window, 1);
  }

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});

function setupData() {
  let date1 = cal.createDateTime("20090101T080000Z");
  let date2 = cal.createDateTime("20090102T090000Z");
  let date3 = cal.createDateTime("20090103T100000Z");
  return {
    data: [
      {
        title: "title1",
        location: "location1",
        description: "description1",
        categories: [],
        allday: false,
        startdate: date1,
        starttime: date1,
        enddate: date2,
        endtime: date2,
        repeat: "none",
        reminder: "none",
        priority: "normal",
        privacy: "public",
        status: "confirmed",
        freebusy: "busy",
        timezonedisplay: true,
        attachment: { add: "http://mozilla.org" },
        attendees: { add: "foo@bar.de,foo@bar.com" },
      },
      {
        title: "title2",
        location: "location2",
        description: "description2",
        categories: [],
        allday: true,
        startdate: date2,
        starttime: date2,
        enddate: date3,
        endtime: date3,
        repeat: "daily",
        reminder: "5minutes",
        priority: "high",
        privacy: "private",
        status: "tentative",
        freebusy: "free",
        timezonedisplay: false,
        attachment: { remove: "mozilla.org" },
        attendees: { remove: "foo@bar.de,foo@bar.com" },
      },
    ],
    newlines: [
      { title: "title", description: "  test spaces  " },
      { title: "title", description: "\ntest newline\n" },
      { title: "title", description: "\rtest \\r\r" },
      { title: "title", description: "\r\ntest \\r\\n\r\n" },
      { title: "title", description: "\ttest \\t\t" },
    ],
  };
}
