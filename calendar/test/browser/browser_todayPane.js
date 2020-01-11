/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  AGENDA_LISTBOX,
  CALENDARNAME,
  CANVAS_BOX,
  DAY_VIEW,
  LABELDAYBOX,
  TODAY_BUTTON,
  TODAY_PANE,
  createCalendar,
  deleteCalendars,
  helpersForController,
  invokeEventDialog,
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { setData } = ChromeUtils.import("resource://testing-common/mozmill/ItemEditingHelpers.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var controller = mozmill.getMail3PaneController();
var { eid, lookup, lookupEventBox, sleep } = helpersForController(controller);

add_task(async function testTodayPane() {
  createCalendar(controller, CALENDARNAME);
  await setCalendarView("day");

  let createEvent = async (hour, name) => {
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, hour);
    await invokeEventDialog(controller, eventBox, async (event, iframe) => {
      let { eid: eventid } = helpersForController(event);

      await setData(event, iframe, { title: name });
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

  await createEvent(startHour, "Today's Event");

  // Reset view.
  view.scrollToMinute(60 * 8);

  // Go to tomorrow and add an event.
  viewForward(controller, 1);
  await createEvent(9, "Tomorrow's Event");

  // Go 5 days forward and add an event.
  viewForward(controller, 5);
  await createEvent(9, "Future Event");

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
        {"class":"agenda-checkbox treenode-checkbox"}/{"class":"checkbox-check"}
    `;
  // Tomorrow and soon are collapsed by default.
  controller.click(lookup(`${AGENDA_LISTBOX}/id("tomorrow-header")/${expandArrow}`));
  sleep();
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
        {"class":"agenda-container-box"}/{"class":"agenda-description"}/[0]/
        {"class":"agenda-event-start"}
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
        ${AGENDA_LISTBOX}/[6]/{"class":"agenda-container-box"}/
        {"class":"agenda-description"}/{"class":"agenda-event-title"}
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
        ${AGENDA_LISTBOX}/[1]/{"class":"agenda-checkbox treenode-checkbox"}
    `).getNode();

  let soon = lookup(`
        ${AGENDA_LISTBOX}/[2]/{"class":"agenda-checkbox treenode-checkbox"}
    `).getNode();

  // TODO This is failing, which might actually be an error in our code!
  // controller.assert(() => {
  //     return !tomorrow.hasAttribute("checked") || tomorrow.getAttribute("checked") != "true";
  // });
  controller.assert(() => {
    return !soon.hasAttribute("checked") || soon.getAttribute("checked") != "true";
  });
});

function getIsoDate() {
  let currDate = new Date();
  let month = (currDate.getMonth() + 1).toString().padStart(2, "0");
  let day = currDate
    .getDate()
    .toString()
    .padStart(2, "0");
  return `${currDate.getFullYear()}${month}${day}`;
}

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, "Mozmill");
});
