/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testUTF8";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers"];

ChromeUtils.import("resource://gre/modules/Preferences.jsm");

var EVENT_BOX, CANVAS_BOX;
var helpersForController, invokeEventDialog, closeAllEventDialogs, createCalendar, deleteCalendars;
var setData;

var UTF8STRING = " 💣 💥  ☣  ";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        EVENT_BOX,
        CANVAS_BOX,
        helpersForController,
        invokeEventDialog,
        closeAllEventDialogs,
        createCalendar,
        deleteCalendars
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({ setData } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    createCalendar(controller, UTF8STRING);
    Preferences.set("calendar.categories.names", UTF8STRING);
}

function testUTF8() {
    // Create new event.
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        // Fill in name, location, description.
        setData(event, iframe, {
            title: UTF8STRING,
            location: UTF8STRING,
            description: UTF8STRING,
            categories: [UTF8STRING]
        });

        // save
        event.click(eventid("button-saveandclose"));
    });

    // open
    let eventPath = `/{"tooltip":"itemTooltip","calendar":"${UTF8STRING.toLowerCase()}"}`;
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, eventPath);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: iframeId } = helpersForController(iframe);

        // Check values.
        event.assertValue(iframeId("item-title"), UTF8STRING);
        event.assertValue(iframeId("item-location"), UTF8STRING);
        event.assertValue(iframeId("item-description"), UTF8STRING);
        event.assert(() => iframeId("item-categories").getNode().querySelector(`
            menuitem[label="${UTF8STRING}"][checked]
        `));

        // Escape the event window.
        event.keypress(null, "VK_ESCAPE", {});
    });
}
testUTF8.EXCLUDED_PLATFORMS = ["darwin"];

function teardownTest(module) {
    deleteCalendars(controller, UTF8STRING);
    Preferences.reset("calendar.categories.names");
    closeAllEventDialogs();
}
