/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  closeAllEventDialogs,
  createCalendar,
  deleteCalendars,
  goToDate,
  helpersForController,
  invokeEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { setData } = ChromeUtils.import("resource://testing-common/mozmill/ItemEditingHelpers.jsm");

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var controller = mozmill.getMail3PaneController();
var { eid, lookupEventBox } = helpersForController(controller);

var { date1, date2, date3, data, newlines } = setupData();

// If the "do you want to save the event?" prompt appears, this test failed.
// Listen for all windows opening, and if one is the save prompt, fail.
var windowObserver = {
  async observe(win, topic) {
    if (topic == "domwindowopened") {
      await BrowserTestUtils.waitForEvent(win, "load");
      // Make sure this is a prompt window.
      if (win.location.href == "chrome://global/content/commonDialog.xul") {
        let doc = win.document;
        // Adding attachments also shows a prompt, but we can tell which one
        // this is by checking whether the textbox is visible.
        if (doc.querySelector("#loginContainer").hasAttribute("hidden")) {
          Assert.ok(false, "Unexpected save prompt appeared");
          doc.documentElement.getButton("cancel").click();
        }
      }
    }
  },
};
Services.ww.registerNotification(windowObserver);

// Test that closing an event dialog with no changes does not prompt for save.
add_task(function testEventDialogModificationPrompt() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 1);

  let createbox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
  let eventbox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);

  // Create new event.
  invokeEventDialog(controller, createbox, (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    let categories = cal.l10n.getAnyString("calendar", "categories", "categories2").split(",");
    data[0].categories.push(categories[0]);
    data[1].categories.push(categories[1], categories[2]);

    // Enter first set of data.
    setData(event, iframe, data[0]);

    // save
    event.click(eventid("button-saveandclose"));
  });

  // Open, but change nothing.
  invokeEventDialog(controller, eventbox, (event, iframe) => {
    // Escape the event window, there should be no prompt to save event.
    event.keypress(null, "VK_ESCAPE", {});
    // Wait to see if the prompt appears.
    controller.sleep(2000);
  });

  // Open, change all values then revert the changes.
  invokeEventDialog(controller, eventbox, (event, iframe) => {
    // Change all values.
    setData(event, iframe, data[1]);

    // Edit all values back to original.
    setData(event, iframe, data[0]);

    // Escape the event window, there should be no prompt to save event.
    event.keypress(null, "VK_ESCAPE", {});
    // Wait to see if the prompt appears.
    controller.sleep(2000);
  });

  // Delete event.
  controller.click(eventbox);
  controller.keypress(eid("day-view"), "VK_DELETE", {});
  controller.waitForElementNotPresent(eventbox);

  for (let i = 0; i < newlines.length; i++) {
    // test set i
    invokeEventDialog(controller, createbox, (event, iframe) => {
      let { eid: eventid } = helpersForController(event);

      setData(event, iframe, newlines[i]);
      event.click(eventid("button-saveandclose"));
    });

    // Open and close.
    invokeEventDialog(controller, eventbox, (event, iframe) => {
      setData(event, iframe, newlines[i]);
      event.keypress(null, "VK_ESCAPE", {});
      // Wait to see if the prompt appears.
      controller.sleep(2000);
    });

    // Delete it.
    // XXX Somehow the event is selected at this point, this didn't use to
    // be the case and can't be reproduced manually.
    controller.keypress(eid("day-view"), "VK_DELETE", {});
    controller.waitForElementNotPresent(eventbox);
  }

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
  Services.ww.unregisterNotification(windowObserver);
});

function setupData() {
  return {
    date1: new Date(2009, 0, 1, 8, 0),
    date2: new Date(2009, 0, 2, 9, 0),
    date3: new Date(2009, 0, 3, 10, 0),
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
