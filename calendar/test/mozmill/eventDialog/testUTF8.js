/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar;
var deleteCalendars, switchToView;
var EVENT_BOX, CANVAS_BOX;

Cu.import("resource://gre/modules/Preferences.jsm");

var UTF8STRING = " 💣 💥  ☣  ";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        switchToView,
        EVENT_BOX,
        CANVAS_BOX
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, UTF8STRING);
    Preferences.set("calendar.categories.names", UTF8STRING);
}

function testUTF8() {
    let eventDialog = '/id("calendar-event-dialog-inner")/id("event-grid")/id("event-grid-rows")';

    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");

    // create new event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { lookup: eventlookup, eid: eventid } = helpersForController(event);

        // fill in name, location, description
        let titleTextBox = eventlookup(`
            ${eventDialog}/id("event-grid-title-row")/id("item-title")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `);
        event.waitForElement(titleTextBox);
        event.type(titleTextBox, UTF8STRING);
        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-location-row")/id("item-location")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), UTF8STRING);
        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-description-row")/id("item-description")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), UTF8STRING);

        // select category
        event.select(eventid("item-categories"), null, UTF8STRING);

        // save
        event.click(eventid("button-saveandclose"));
    });

    // open
    let eventPath = `/{"tooltip":"itemTooltip","calendar":"${UTF8STRING.toLowerCase()}"}`;
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, 8, eventPath);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { lookup: eventlookup, eid: eventid } = helpersForController(event);

        // check values
        titleTextBox = eventlookup(`
            ${eventDialog}/id("event-grid-title-row")/id("item-title")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `);
        event.waitForElement(titleTextBox);
        event.assertValue(titleTextBox, UTF8STRING);
        event.assertValue(eventlookup(`
            ${eventDialog}/id("event-grid-location-row")/id("item-location")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), UTF8STRING);
        event.assertValue(eventlookup(`
            ${eventDialog}/id("event-grid-description-row")/id("item-description")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), UTF8STRING);
        event.assertValue(eventid("item-categories"), UTF8STRING);

        // escape the event window
        event.keypress(null, "VK_ESCAPE", {});
    });
}

function teardownTest(module) {
    deleteCalendars(controller, UTF8STRING);
    Preferences.reset("calendar.categories.names");
}
