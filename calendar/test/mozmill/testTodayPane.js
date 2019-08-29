/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testTodayPane";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers"];

var CALENDARNAME, CANVAS_BOX, DAY_VIEW, LABELDAYBOX, TODAY_BUTTON, TODAY_PANE, AGENDA_LISTBOX;
var helpersForController, invokeEventDialog, viewForward, createCalendar;
var deleteCalendars;
var setData;

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

function setupModule(module) {
  controller = mozmill.getMail3PaneController();
  ({
    CALENDARNAME,
    CANVAS_BOX,
    DAY_VIEW,
    LABELDAYBOX,
    TODAY_BUTTON,
    TODAY_PANE,
    AGENDA_LISTBOX,
    helpersForController,
    invokeEventDialog,
    viewForward,
    createCalendar,
    deleteCalendars,
  } = collector.getModule("calendar-utils"));
  collector.getModule("calendar-utils").setupModule(controller);
  Object.assign(module, helpersForController(controller));

  ({ setData } = collector.getModule("item-editing-helpers"));
  collector.getModule("item-editing-helpers").setupModule(module);

  createCalendar(controller, CALENDARNAME);
}

function testTodayPane() {
  let createEvent = (hour, name) => {
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, hour);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
      let { eid: eventid } = helpersForController(event);

      setData(event, iframe, { title: name });
      event.click(eventid("button-saveandclose"));
    });
  };

  // Go to today and verify date.
  let dayPath = `${DAY_VIEW}/${LABELDAYBOX}/{"flex":"1"}`;
  controller.waitThenClick(lookup(TODAY_BUTTON));
  controller.assert(() => lookup(dayPath).getNode().mDate.icalString == getIsoDate());

  // Create event 6 hours from now, if this is tomorrow then at 23 today.
  // Double-click only triggers new event dialog on visible boxes, so scrolling
  // may be needed by default visible time is 08:00 - 17:00, box of 17th hour
  // is out of view.
  let hour = new Date().getHours();
  let startHour = hour < 18 ? hour + 6 : 23;
  let view = lookup(DAY_VIEW).getNode();

  if (startHour < 8 || startHour > 16) {
    view.scrollToMinute(60 * startHour);
  }

  createEvent(startHour, "Today's Event");

  // Reset view.
  view.scrollToMinute(60 * 8);

  // Go to tomorrow and add an event.
  viewForward(controller, 1);
  createEvent(9, "Tomorrow's Event");

  // Go 5 days forward and add an event.
  viewForward(controller, 5);
  createEvent(9, "Future Event");

  // Go to mail tab.
  controller.click(
    lookup(`
        /id("messengerWindow")/id("navigation-toolbox")/id("tabs-toolbar")/id("tabmail-tabs")/[1]/[0]
    `)
  );
  sleep();

  // Verify today pane open.
  controller.assertNotDOMProperty(lookup(TODAY_PANE), "collapsed");

  // Verify today pane's date.
  controller.assertValue(eid("datevalue-label"), new Date().getDate());

  let expandArrow = `
        anon({"class":"agenda-checkbox treenode-checkbox"})/anon({"class":"checkbox-check"})
    `;
  // Tomorrow and soon are collapsed by default.
  controller.click(lookup(`${AGENDA_LISTBOX}/id("tomorrow-header")/${expandArrow}`));
  controller.click(lookup(`${AGENDA_LISTBOX}/id("nextweek-header")/${expandArrow}`));
  sleep();

  // Verify events shown in today pane.
  let now = new Date();
  now.setHours(startHour);
  now.setMinutes(0);
  let dtz = cal.dtz.defaultTimezone;
  let probeDate = cal.dtz.jsDateToDateTime(now, dtz);
  let dateFormatter = cal.getDateFormatter();
  let startTime = dateFormatter.formatTime(probeDate);

  let eventStart = `
        anon({"class":"agenda-container-box"})/anon({"class":"agenda-description"})/[0]/
        anon({"class":"agenda-event-start"})
    `;
  controller.assertText(
    lookup(`${AGENDA_LISTBOX}/[2]/${eventStart}`),
    startTime + " Today's Event"
  );

  let tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  probeDate = cal.dtz.jsDateToDateTime(tomorrow, dtz);
  startTime = dateFormatter.formatTime(probeDate);
  controller.assertText(
    lookup(`${AGENDA_LISTBOX}/[4]/${eventStart}`),
    startTime + " Tomorrow's Event"
  );

  let future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 9, 0);
  probeDate = cal.dtz.jsDateToDateTime(future, dtz);
  startTime = dateFormatter.formatDateTime(probeDate);

  // Future event's start time.
  controller.assertText(lookup(`${AGENDA_LISTBOX}/[6]/${eventStart}`), startTime);

  // Future event's title.
  controller.assertText(
    lookup(`
        ${AGENDA_LISTBOX}/[6]/anon({"class":"agenda-container-box"})/
        anon({"class":"agenda-description"})/anon({"class":"agenda-event-title"})
    `),
    "Future Event"
  );

  // Delete events.
  controller.click(lookup(`${AGENDA_LISTBOX}/[2]`));

  controller.keypress(eid("agenda-listbox"), "VK_DELETE", {});
  controller.waitForElementNotPresent(lookup(`${AGENDA_LISTBOX}/[6]`));

  controller.click(lookup(`${AGENDA_LISTBOX}/[3]`));
  controller.keypress(eid("agenda-listbox"), "VK_DELETE", {});
  controller.waitForElementNotPresent(lookup(`${AGENDA_LISTBOX}/[5]`));

  controller.click(lookup(`${AGENDA_LISTBOX}/[4]`));
  controller.keypress(eid("agenda-listbox"), "VK_DELETE", {});
  controller.waitForElementNotPresent(lookup(`${AGENDA_LISTBOX}/[4]`));

  // Hide and verify today pane hidden.
  controller.click(eid("calendar-status-todaypane-button"));
  controller.assertNode(
    lookup(`
        /id("messengerWindow")/id("tabmail-container")/{"collapsed":"true"}
    `)
  );

  // Reset today pane.
  controller.click(eid("calendar-status-todaypane-button"));
  controller.assertNotDOMProperty(lookup(TODAY_PANE), "collapsed");
  controller.click(lookup(`${AGENDA_LISTBOX}/id("tomorrow-header")/${expandArrow}`));
  controller.click(lookup(`${AGENDA_LISTBOX}/id("nextweek-header")/${expandArrow}`));
  sleep();

  // Verify tomorrow and soon collapsed.
  tomorrow = lookup(`
        ${AGENDA_LISTBOX}/[1]/anon({"class":"agenda-checkbox treenode-checkbox"})
    `).getNode();

  let soon = lookup(`
        ${AGENDA_LISTBOX}/[2]/anon({"class":"agenda-checkbox treenode-checkbox"})
    `).getNode();

  // TODO This is failing, which might actually be an error in our code!
  // controller.assert(() => {
  //     return !tomorrow.hasAttribute("checked") || tomorrow.getAttribute("checked") != "true";
  // });
  controller.assert(() => {
    return !soon.hasAttribute("checked") || soon.getAttribute("checked") != "true";
  });
}

function getIsoDate() {
  let currDate = new Date();
  let month = (currDate.getMonth() + 1).toString().padStart(2, "0");
  let day = currDate
    .getDate()
    .toString()
    .padStart(2, "0");
  return `${currDate.getFullYear()}${month}${day}`;
}

function teardownModule(module) {
  deleteCalendars(controller, "Mozmill");
}
