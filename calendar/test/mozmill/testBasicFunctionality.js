/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testBasicFunctionality";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, CALENDAR_PANEL, DAY_VIEW, DAYBOX, MINIMONTH, CALENDARLIST;
var helpersForController, switchToView, deleteCalendars, handleNewCalendarWizard;
var plan_for_modal_dialog, wait_for_modal_dialog;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME,
        CALENDAR_PANEL,
        DAY_VIEW,
        DAYBOX,
        MINIMONTH,
        CALENDARLIST,
        helpersForController,
        switchToView,
        deleteCalendars,
        handleNewCalendarWizard
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({ plan_for_modal_dialog, wait_for_modal_dialog } = collector.getModule("window-helpers"));
}

function testSmokeTest() {
    let dateFormatter = cal.getDateFormatter();

    // Check for minimonth.
    controller.waitForElement(eid("calMinimonth"));
    // Every month has a first.
    controller.assertNode(lookup(`
        ${MINIMONTH}/{"class":"minimonth-calendar minimonth-cal-box"}/[1]/{"aria-label":"1"}
    `));

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
    let label = dateFormatter.formatTime(someTime);
    controller.assertNode(lookup(`
        ${DAY_VIEW}/{"class":"mainbox"}/{"class":"scrollbox"}/
        {"class":"timebar"}/{"class":"timebarboxstack"}/{"class":"topbox"}/[9]/
        {"class":"calendar-time-bar-label","value":"${label}"}
    `));
    controller.assertNode(lookup(`
        ${DAY_VIEW}/${DAYBOX}/[0]/anon({"class":"multiday-column-box-stack"})/anon({"class":"multiday-column-bg-box"})/[9]
    `));

    // Open tasks view.
    controller.click(eid("task-tab-button"));
    // Should be possible to filter today's tasks.
    controller.waitForElement(eid("opt_today_filter"));
    // Check for task add button.
    controller.assertNode(eid("calendar-add-task-button"));
    // Check for filtered tasks list.
    controller.assertNode(lookup(`
        ${CALENDAR_PANEL}/id("calendarDisplayDeck")/id("calendar-task-box")/[1]/
        id("calendar-task-tree")/{"class":"calendar-task-treechildren"}
    `));

    // Create test calendar.
    plan_for_modal_dialog("Calendar:NewCalendarWizard", (wizard) => {
        handleNewCalendarWizard(wizard, CALENDARNAME);
    });
    let calendarList = lookup(CALENDARLIST);
    // Double click on bottom left.
    controller.doubleClick(calendarList, 0, calendarList.getNode().height);
    wait_for_modal_dialog("Calendar:NewCalendarWizard", TIMEOUT_MODAL_DIALOG);
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
