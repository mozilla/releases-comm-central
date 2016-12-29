/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "timezone-utils"];

var helpersForController, invokeEventDialog, switchToView, goToDate, setData;
var CANVAS_BOX;
var switchAppTimezone, TIMEZONES;

var modalDialog = require("../shared-modules/modal-dialog");

var times = [[4, 30], [4, 30], [3, 0], [3, 0], [9, 0], [14, 0], [19, 45], [1, 30]];

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        switchToView,
        goToDate,
        setData,
        CANVAS_BOX
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));
    ({ switchAppTimezone, TIMEZONES } = collector.getModule("timezone-utils"));
    collector.getModule("timezone-utils").setupModule();
}

function testTimezones2_CreateEvents() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 1);

    // create daily recurring events in all TIMEZONES
    let time = new Date();
    for (let i = 0; i < TIMEZONES.length; i++) {
        let eventBox = lookupEventBox(controller, "day", CANVAS_BOX, null, 1, i + 8);
        invokeEventDialog(controller, eventBox, (event, iframe) => {
            time.setHours(times[i][0]);
            time.setMinutes(times[i][1]);

            // set timezone
            setTimezone(event, TIMEZONES[i]);

            // set title and repeat
            setData(event, { title: TIMEZONES[i], repeat: "weekly", starttime: time });

            // save
            event.click(eventid("button-saveandclose"));
        });
    }
}

function teardownTest(module) {
    switchAppTimezone(TIMEZONES[0]);
}

function setTimezone(event, timezone) {
    let { eid: eventid } = helpersForController(event);

    // for some reason setting checked is needed, no other menuitem with checkbox needs it
    let menuitem = eventid("options-TIMEZONES-menuitem");
    event.waitForElement(menuitem);
    menuitem.getNode().setAttribute("checked", "true");
    event.click(menuitem);

    let modal = new modalDialog.modalDialog(event.window);
    modal.start(eventCallback.bind(null, timezone));
    event.waitForElement(eventid("timezone-starttime"));
    event.click(eventid("timezone-starttime"));
}

function eventCallback(zone, tzcontroller) {
    let { lookup: tzlookup, xpath: tzpath } = helpersForController(tzcontroller);

    let item = tzpath(`
        /*[name()='dialog']/*[name()='menulist'][1]/*[name()='menupopup'][1]/
        *[@value='${zone}']
    `);
    tzcontroller.waitForElement(item);
    tzcontroller.click(item);
    tzcontroller.click(tzlookup(`
        /id("calendar-event-dialog-timezone")/anon({"anonid":"buttons"})/
        {"dlgtype":"accept"}
    `));
}
