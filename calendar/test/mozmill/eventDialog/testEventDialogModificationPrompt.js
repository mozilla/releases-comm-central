/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testEventDialogModificationPrompt";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "calendar-utils",
  "item-editing-helpers",
  "window-helpers",
  "folder-display-helpers",
];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var CALENDARNAME, EVENT_BOX, CANVAS_BOX, EVENTPATH;
var helpersForController, invokeEventDialog, createCalendar, closeAllEventDialogs, deleteCalendars;
var goToDate;
var setData;
var plan_for_modal_dialog, wait_for_modal_dialog;
var mark_failure;

const TIMEOUT_COMMON_DIALOG = 3000;
var savePromptAppeared = false;
var failPoints = {
  first: "no change",
  second: "change all and back",
  third: ["1st pass", "2nd pass", "3rd pass", "4th pass", "5th pass"],
};

var { date1, date2, date3, data, newlines } = setupData();

function setupModule(module) {
  controller = mozmill.getMail3PaneController();
  ({
    CALENDARNAME,
    EVENT_BOX,
    CANVAS_BOX,
    EVENTPATH,
    helpersForController,
    invokeEventDialog,
    createCalendar,
    closeAllEventDialogs,
    deleteCalendars,
    goToDate,
  } = collector.getModule("calendar-utils"));
  collector.getModule("calendar-utils").setupModule(controller);
  Object.assign(module, helpersForController(controller));

  ({ setData } = collector.getModule("item-editing-helpers"));
  collector.getModule("item-editing-helpers").setupModule(module);

  ({ plan_for_modal_dialog, wait_for_modal_dialog } = collector.getModule("window-helpers"));

  ({ mark_failure } = collector.getModule("folder-display-helpers"));

  createCalendar(controller, CALENDARNAME);
}

// Test that closing an event dialog with no changes does not prompt for save.
testEventDialogModificationPrompt.__force_skip__ = true;
function testEventDialogModificationPrompt() {
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

  invokeEventDialog(controller, eventbox, (event, iframe) => {
    // Open, but change nothing.
    plan_for_modal_dialog("commonDialog", handleSavePrompt);

    // Escape the event window, there should be no prompt to save event.
    event.keypress(null, "VK_ESCAPE", {});
    try {
      wait_for_modal_dialog("commonDialog", TIMEOUT_COMMON_DIALOG);
    } catch (e) {
      failPoints.first = "";
    }
  });

  // open
  invokeEventDialog(controller, eventbox, (event, iframe) => {
    // Change all values.
    setData(event, iframe, data[1]);

    // Edit all values back to original.
    setData(event, iframe, data[0]);

    plan_for_modal_dialog("commonDialog", handleSavePrompt);

    // Escape the event window, there should be no prompt to save event.
    event.keypress(null, "VK_ESCAPE", {});
    try {
      wait_for_modal_dialog("commonDialog", TIMEOUT_COMMON_DIALOG);
    } catch (e) {
      failPoints.second = "";
    }
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
      plan_for_modal_dialog("commonDialog", handleSavePrompt);
      event.keypress(null, "VK_ESCAPE", {});
      try {
        wait_for_modal_dialog("commonDialog", TIMEOUT_COMMON_DIALOG);
      } catch (e) {
        failPoints.third[i] = "";
      }
    });

    // Delete it.
    // XXX Somehow the event is selected at this point, this didn't use to
    // be the case and can't be reproduced manually.
    controller.keypress(eid("day-view"), "VK_DELETE", {});
    controller.waitForElementNotPresent(eventbox);
  }
}
testEventDialogModificationPrompt.EXCLUDED_PLATFORMS = ["darwin"];

function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  if (savePromptAppeared) {
    mark_failure([
      "Save Prompt unexpectedly appeared on: ",
      failPoints.first,
      failPoints.second,
      failPoints.third,
    ]);
  }
  closeAllEventDialogs();
}

function handleSavePrompt(controller) {
  let { lookup: cdlglookup } = helpersForController(controller);
  // Unexpected prompt, thus the test has already failed.
  // Can't trigger a failure though, because the following click wouldn't
  // be executed. So remembering it.
  savePromptAppeared = true;

  // application close is blocked without it
  controller.waitThenClick(
    cdlglookup(`
        /id("commonDialog")/shadow/{"class":"dialog-button-box"}/{"dlgtype":"extra1"}
    `)
  );
}

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
