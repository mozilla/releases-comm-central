/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar;
var deleteCalendars, switchToView, setData;
var EVENT_BOX, CANVAS_BOX;

ChromeUtils.import("resource://gre/modules/Preferences.jsm");

var UTF8STRING = " 💣 💥  ☣  ";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        switchToView,
        setData,
        EVENT_BOX,
        CANVAS_BOX
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, UTF8STRING);
    Preferences.set("calendar.categories.names", UTF8STRING);
}

function testUTF8() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");

    // create new event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { lookup: iframeLookup, eid: iframeId } = helpersForController(iframe);

        // fill in name, location, description
        setData(event, iframe, { title: UTF8STRING, location: UTF8STRING, description: UTF8STRING });

        let menuitem = iframeLookup(`
            /id("calendar-event-dialog-inner")/id("event-grid")/
            id("event-grid-rows")/id("event-grid-category-color-row")/
            id("event-grid-category-box")/id("item-categories")/
            id("item-categories-popup")/[2]
        `);

        event.click(iframeId("item-categories"));
        menuitem.getNode().click();
        menuitem.getNode().setAttribute("checked", "true"); // When in doubt, cheat.
        event.waitFor(() => iframeId("item-categories").getNode().label == UTF8STRING);
        iframeId("item-categories-popup").getNode().hidePopup();

        // save
        event.click(eventid("button-saveandclose"));
    });

    // open
    let eventPath = `/{"tooltip":"itemTooltip","calendar":"${UTF8STRING.toLowerCase()}"}`;
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, 8, eventPath);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: iframeId } = helpersForController(iframe);

        // check values
        event.assertValue(iframeId("item-title"), UTF8STRING);
        event.assertValue(iframeId("item-location"), UTF8STRING);
        event.assertValue(iframeId("item-description"), UTF8STRING);
        event.assert(() => iframeId("item-categories").getNode().querySelector(`menuitem[label="${UTF8STRING}"][checked]`));

        // escape the event window
        event.keypress(null, "VK_ESCAPE", {});
    });
}

function teardownTest(module) {
    deleteCalendars(controller, UTF8STRING);
    Preferences.reset("calendar.categories.names");
}
