/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testBasicFunctionality";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

var plan_for_modal_dialog, wait_for_modal_dialog;
var helpersForController, deleteCalendars, handleNewCalendarWizard;
var TIMEOUT_MODAL_DIALOG, CALENDARNAME;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers"));
    ({
        helpersForController,
        deleteCalendars,
        handleNewCalendarWizard,
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));
}

function testSmokeTest() {
    let dateService = Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
                                .getService(Components.interfaces.nsIScriptableDateFormat);
    let path = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")
    `;

    // open calendar view
    controller.click(eid("calendar-tab-button"));

    // check for minimonth
    controller.waitForElement(eid("calMinimonth"));
    // every month has a first
    controller.assertNode(lookup(`
        ${path}/id("ltnSidebar")/id("minimonth-pane")/{"align":"center"}/
        id("calMinimonthBox")/id("calMinimonth")/
        anon({"anonid":"minimonth-calendar"})/[3]/{"aria-label":"1"}
    `));

    // check for calendar list
    controller.assertNode(eid("calendar-list-pane"));
    controller.assertNode(lookup(`
        ${path}/id("ltnSidebar")/id("calendar-panel")/id("calendar-list-pane")/
        id("calendar-listtree-pane")/id("calendar-list-tree-widget")/
        anon({"anonid":"tree"})/anon({"anonid":"treechildren"})
    `));

    // check for event search
    controller.assertNode(eid("bottom-events-box"));
    // there should be search field
    controller.assertNode(eid("unifinder-search-field"));

    // default view is day view which should have 09:00 label and box
    let label = dateService.FormatTime("", dateService.timeFormatNoSeconds, 9, 0, 0);
    controller.assertNode(lookup(`
        ${path}/id("calendarDisplayDeck")/id("calendar-view-box")/
        id("view-deck")/id("day-view")/anon({"anonid":"mainbox"})/
        anon({"anonid":"scrollbox"})/anon({"anonid":"timebar"})/
        anon({"anonid":"topbox"})/[9]/
        {"class":"calendar-time-bar-label","value":"${label}"}
    `));
    controller.assertNode(lookup(`
        ${path}/id("calendarDisplayDeck")/id("calendar-view-box")/
        id("view-deck")/id("day-view")/anon({"anonid":"mainbox"})/
        anon({"anonid":"scrollbox"})/anon({"anonid":"daybox"})/
        [0]/anon({"anonid":"boxstack"})/anon({"anonid":"bgbox"})/[9]
    `));

    // open tasks view
    controller.click(eid("task-tab-button"));
    // should be possible to filter today's tasks
    controller.waitForElement(eid("opt_today_filter"));
    // check for task add button
    controller.assertNode(eid("calendar-add-task-button"));
    // check for filtered tasks list
    controller.assertNode(lookup(`
        ${path}/id("calendarDisplayDeck")/id("calendar-task-box")/[1]/
        id("calendar-task-tree")/anon({"anonid":"calendar-task-tree"})/
        {"tooltip":"taskTreeTooltip"}
    `));

    // create test calendar
    plan_for_modal_dialog("Calendar:NewCalendarWizard", (wizard) => {
        handleNewCalendarWizard(wizard, CALENDARNAME);
    });
    let calendarList = lookup(`
        ${path}/id("ltnSidebar")/id("calendar-panel")/id("calendar-list-pane")/
        id("calendar-listtree-pane")/id("calendar-list-tree-widget")/
        anon({"anonid":"tree"})/anon({"anonid":"treechildren"})
    `);
    // double click on bottom left
    controller.doubleClick(calendarList, 0, calendarList.getNode().boxObject.height);
    wait_for_modal_dialog("Calendar:NewCalendarWizard", TIMEOUT_MODAL_DIALOG);
}

function teardownTest(module) {
    deleteCalendars(controller, "Mozmill");
}
