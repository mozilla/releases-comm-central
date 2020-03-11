/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARLIST,
  CALENDARNAME,
  CALENDAR_PANEL,
  DAYBOX,
  DAY_VIEW,
  MINIMONTH,
  TIMEOUT_MODAL_DIALOG,
  deleteCalendars,
  handleNewCalendarWizard,
  helpersForController,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var controller = mozmill.getMail3PaneController();
var { eid, lookup } = helpersForController(controller);

add_task(function testBasicFunctionality() {
  // Create test calendar.
  plan_for_modal_dialog("Calendar:NewCalendarWizard", wizard => {
    handleNewCalendarWizard(wizard, CALENDARNAME);
  });
  let calendarList = lookup(CALENDARLIST);
  // This double-click must be inside the list but below the list items.
  controller.doubleClick(calendarList);
  wait_for_modal_dialog("Calendar:NewCalendarWizard", TIMEOUT_MODAL_DIALOG);

  // Check for minimonth.
  controller.waitForElement(eid("calMinimonth"));
  // Every month has a first.
  controller.assertNode(
    lookup(`
        ${MINIMONTH}/{"class":"minimonth-calendar minimonth-cal-box"}/[1]/{"aria-label":"1"}
    `)
  );

  // Check for calendar list.
  controller.assertNode(eid("calendar-list-pane"));
  controller.assertNode(lookup(CALENDARLIST));

  // Check for event search.
  controller.assertNode(eid("bottom-events-box"));
  // There should be search field.
  controller.assertNode(eid("unifinder-search-field"));

  switchToView(controller, "day");

  // Default view is day view which should have 09:00 label and box.
  let someTime = cal.createDateTime();
  someTime.resetTo(someTime.year, someTime.month, someTime.day, 9, 0, 0, someTime.timezone);
  let label = cal.getDateFormatter().formatTime(someTime);
  controller.assertNode(
    lookup(`
        ${DAY_VIEW}/{"class":"mainbox"}/{"class":"scrollbox"}/
        {"class":"timebar"}/{"class":"timebarboxstack"}/{"class":"topbox"}/[9]/
        {"class":"calendar-time-bar-label","value":"${label}"}
    `)
  );
  controller.assertNode(
    lookup(`
        ${DAY_VIEW}/${DAYBOX}/[0]/{"class":"multiday-column-box-stack"}/{"class":"multiday-column-bg-box"}/[9]
    `)
  );

  // Open tasks view.
  controller.click(eid("task-tab-button"));
  // Should be possible to filter today's tasks.
  controller.waitForElement(eid("opt_today_filter"));
  // Check for task add button.
  controller.assertNode(eid("calendar-add-task-button"));
  // Check for filtered tasks list.
  controller.assertNode(
    lookup(`
        ${CALENDAR_PANEL}/id("calendarDisplayDeck")/id("calendar-task-box")/[2]/
        id("calendar-task-tree")/{"class":"calendar-task-treechildren"}
    `)
  );
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
});
