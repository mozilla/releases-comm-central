/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  helpersForController,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { setData } = ChromeUtils.import("resource://testing-common/mozmill/ItemEditingHelpers.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { eid, lookupEventBox } = helpersForController(controller);

var { data, newlines } = setupData();

// Test that closing an event dialog with no changes does not prompt for save.
add_task(async function testEventDialogModificationPrompt() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 1);

  let createbox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
  let eventbox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);

  // Create new event.
  await invokeNewEventDialog(controller, createbox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    let categories = cal.l10n.getAnyString("calendar", "categories", "categories2").split(",");
    data[0].categories.push(categories[0]);
    data[1].categories.push(categories[1], categories[2]);

    // Enter first set of data.
    await setData(event, iframe, data[0]);

    // save
    event.click(eventid("button-saveandclose"));
  });

  // Open, but change nothing.
  await invokeEditingEventDialog(controller, eventbox, (event, iframe) => {
    // Escape the event window, there should be no prompt to save event.
    EventUtils.synthesizeKey("VK_ESCAPE", {}, event.window);
    // Wait to see if the prompt appears.
    controller.sleep(2000);
  });

  // Open, change all values then revert the changes.
  await invokeEditingEventDialog(controller, eventbox, async (event, iframe) => {
    // Change all values.
    await setData(event, iframe, data[1]);

    // Edit all values back to original.
    await setData(event, iframe, data[0]);

    // Escape the event window, there should be no prompt to save event.
    EventUtils.synthesizeKey("VK_ESCAPE", {}, event.window);
    // Wait to see if the prompt appears.
    controller.sleep(2000);
  });

  // Delete event.
  controller.window.document.getElementById("day-view").focus();
  if (controller.window.currentView().getSelectedItems().length == 0) {
    controller.click(eventbox);
  }
  Assert.equal(eventbox.getNode().isEditing, false, "event is not being edited");
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  controller.waitForElementNotPresent(eventbox);

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testDescriptionWhitespace() {
  let createbox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
  let eventbox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);

  for (let i = 0; i < newlines.length; i++) {
    // test set i
    await invokeNewEventDialog(controller, createbox, async (event, iframe) => {
      let { eid: eventid } = helpersForController(event);

      await setData(event, iframe, newlines[i]);
      event.click(eventid("button-saveandclose"));
    });

    // Open and close.
    await invokeEditingEventDialog(controller, eventbox, async (event, iframe) => {
      await setData(event, iframe, newlines[i]);
      EventUtils.synthesizeKey("VK_ESCAPE", {}, event.window);
      // Wait to see if the prompt appears.
      controller.sleep(2000);
    });

    // Delete it.
    controller.window.document.getElementById("day-view").focus();
    if (controller.window.currentView().getSelectedItems().length == 0) {
      controller.click(eventbox);
    }
    Assert.equal(eventbox.getNode().isEditing, false, "event is not being edited");
    EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
    controller.waitForElementNotPresent(eventbox);
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
